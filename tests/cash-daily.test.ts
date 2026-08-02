import { describe, expect, it } from "vitest";
import {
  calculateCashDaily,
  closeCashDaily,
  validateCashDailyClose,
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
});
