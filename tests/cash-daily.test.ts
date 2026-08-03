import { describe, expect, it } from "vitest";
import {
  calculateCashDaily,
  cashDailyCloseSnapshotMatches,
  closeCashDaily,
  validateCashDailyClose,
  validateCashDailyCloseInput,
} from "@/lib/finance/cash-daily";
import type { CashRow } from "@/lib/finance/cash-ledger";

function row(patch: Partial<CashRow>): CashRow {
  return {
    id: "1",
    entity: "bank_tx",
    recKey: "1",
    companyId: "prime",
    date: "2026-07-26",
    source: "계좌",
    account: "A",
    party: "상대",
    memo: "",
    inAmt: 0,
    outAmt: 0,
    category: "기타수입",
    raw: {},
    ...patch,
  };
}

describe("자금일보 마감", () => {
  it("기초+입금-출금으로 예상 잔액을 계산하고 정합하면 마감한다", () => {
    const daily = calculateCashDaily(
      [
        row({ inAmt: 100_000 }),
        row({
          id: "2",
          recKey: "2",
          outAmt: 30_000,
          category: "수선비",
          raw: { documentId: "doc-1" },
        }),
      ],
      "2026-07-26",
      1_000_000,
      1_070_000,
    );
    expect(daily.expectedClosing).toBe(1_070_000);
    expect(closeCashDaily(daily).status).toBe("closed");
  });

  it("미분류 출금은 먼저 분류하도록 하고 증빙 누락을 중복 집계하지 않는다", () => {
    const daily = calculateCashDaily(
      [row({ outAmt: 10_000, category: "" })],
      "2026-07-26",
      100_000,
      80_000,
    );
    expect(daily.unclassifiedCount).toBe(1);
    expect(daily.missingEvidenceCount).toBe(0);
    expect(validateCashDailyClose(daily)).toHaveLength(2);
    expect(() => closeCashDaily(daily)).toThrow();
  });

  it("내부 계좌 이동은 비용 증빙 대상이 아니지만 실제 지출은 증빙이 필요하다", () => {
    const transfer = calculateCashDaily(
      [
        row({ id: 'transfer-out', recKey: 'transfer-out', account: '6616', accountName: '영업계좌', outAmt: 100_000, category: "계좌간이체" }),
        row({ id: 'transfer-in', recKey: 'transfer-in', account: '1868', accountName: '운영계좌', inAmt: 100_000, category: "자금이동" }),
      ],
      "2026-07-26",
      1_000_000,
      1_000_000,
    );
    const expense = calculateCashDaily(
      [row({ outAmt: 100_000, category: "정비·수리비" })],
      "2026-07-26",
      1_000_000,
      900_000,
    );

    expect(transfer.missingEvidenceCount).toBe(0);
    expect(transfer.unpairedTransferCount).toBe(0);
    expect(validateCashDailyClose(transfer)).toEqual([]);
    expect(expense.missingEvidenceCount).toBe(1);
    expect(validateCashDailyClose(expense)).toContain("지출 증빙 누락 1건을 확인해야 합니다.");
  });

  it("내부이체 반대편 원장이 없으면 증빙 대신 짝 미확인으로 일마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ outAmt: 100_000, category: "자금이동", accountName: '영업계좌' })],
      "2026-07-26",
      1_000_000,
      900_000,
    );

    expect(daily.missingEvidenceCount).toBe(0);
    expect(daily.unpairedTransferCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("내부이체 짝 미확인 1건을 확인해야 합니다.");
  });

  it("계약성 입금이 계약·회차에 연결되지 않으면 마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ inAmt: 550_000, category: "대여료수입" })],
      "2026-07-26",
      1_000_000,
      1_550_000,
    );
    expect(daily.unmatchedContractCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("계약 미연결 입금 1건을 연결해야 합니다.");
  });

  it("계약에 연결됐어도 과오납·미배분 금액이 남으면 일마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({
        inAmt: 1_500_000,
        category: "대여료수입",
        raw: {
          matchedContractId: "contract-1",
          matchedScheduleSeq: 1,
          matchedUnappliedAmount: 100_000,
        },
      })],
      "2026-07-26",
      1_000_000,
      2_500_000,
    );

    expect(daily.unmatchedContractCount).toBe(0);
    expect(daily.unappliedReceiptCount).toBe(1);
    expect(daily.unappliedReceiptAmount).toBe(100_000);
    expect(validateCashDailyClose(daily))
      .toContain("과오납·미배분 입금 1건 100,000원을 확인해야 합니다.");
  });

  it("일반 묶음 분해가 미완료면 일마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ category: '', outAmt: 120_000, nest: 'bundle-parent', raw: { bundleReviewStatus: '미완료', evidenceUrl: 'evidence' } })],
      "2026-07-26",
      1_000_000,
      880_000,
    );
    expect(daily.unclassifiedCount).toBe(0);
    expect(daily.bundleIncompleteCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("입출금 분해 미완료 1건을 자금관리에서 마쳐야 합니다.");
  });

  it("과거에 대사완료로 저장됐어도 계약성 구성건의 연결이 없으면 현재 규칙으로 다시 막는다", () => {
    const daily = calculateCashDaily(
      [row({
        category: '', inAmt: 100_000, nest: 'bundle-parent',
        raw: {
          bundleReviewStatus: '대사완료', bundleFeeAmount: 0,
          bundleItems: [{ id: '1', party: '고객', amount: 100_000, category: '대여료수입', referenceId: '' }],
        },
      })],
      "2026-07-26",
      1_000_000,
      1_100_000,
    );

    expect(daily.bundleIncompleteCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("입출금 분해 미완료 1건을 자금관리에서 마쳐야 합니다.");
  });

  it("할부금으로 분류만 하고 원금·이자 분해를 시작하지 않은 거래도 일마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ category: '할부금', outAmt: 412_438, raw: { evidenceUrl: 'evidence' } })],
      "2026-07-26",
      1_000_000,
      587_562,
    );

    expect(daily.unclassifiedCount).toBe(0);
    expect(daily.bundleIncompleteCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("입출금 분해 미완료 1건을 자금관리에서 마쳐야 합니다.");
  });

  it("기초잔액 입력이 없으면 잔액이 우연히 맞아도 마감을 막는다", () => {
    const daily = calculateCashDaily([], "2026-07-26", 0, 0);
    expect(validateCashDailyClose(daily)).toEqual([]);
    expect(validateCashDailyCloseInput(daily, { openingProvided: false }))
      .toContain("기초잔액이 필요합니다.");
  });

  it("동일 마감 결과는 중복 저장 대상으로 보지 않고 변경된 결과만 정정 대상으로 본다", () => {
    const daily = calculateCashDaily([row({ inAmt: 100_000 })], "2026-07-26", 1_000_000, 1_100_000);
    expect(cashDailyCloseSnapshotMatches({ ...daily, status: "closed" }, daily)).toBe(true);
    expect(cashDailyCloseSnapshotMatches({ ...daily, inflow: 90_000, status: "closed" }, daily)).toBe(false);
  });
});
