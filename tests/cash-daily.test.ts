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

  it("미분류·증빙누락·잔액차이는 마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ outAmt: 10_000, category: "" })],
      "2026-07-26",
      100_000,
      80_000,
    );
    expect(validateCashDailyClose(daily)).toHaveLength(3);
    expect(() => closeCashDaily(daily)).toThrow();
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

  it("일반 묶음 분해가 미완료면 일마감을 막는다", () => {
    const daily = calculateCashDaily(
      [row({ category: '', outAmt: 120_000, nest: 'bundle-parent', raw: { bundleReviewStatus: '미완료', evidenceUrl: 'evidence' } })],
      "2026-07-26",
      1_000_000,
      880_000,
    );
    expect(daily.unclassifiedCount).toBe(0);
    expect(daily.bundleIncompleteCount).toBe(1);
    expect(validateCashDailyClose(daily)).toContain("묶음 분해 미완료 1건을 자금관리에서 마쳐야 합니다.");
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
    expect(validateCashDailyClose(daily)).toContain("묶음 분해 미완료 1건을 자금관리에서 마쳐야 합니다.");
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
