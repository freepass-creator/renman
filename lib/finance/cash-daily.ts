import type { CashRow } from "./cash-ledger";
import { isUnclassified } from "@/lib/payments/ledger-subjects";

export type CashDailyStatus = "open" | "reviewing" | "closed" | "corrected";
export type CashDaily = {
  date: string;
  opening: number;
  inflow: number;
  outflow: number;
  expectedClosing: number;
  actualClosing?: number;
  difference: number;
  transactionCount: number;
  unclassifiedCount: number;
  missingEvidenceCount: number;
  status: CashDailyStatus;
};

export function calculateCashDaily(
  rows: CashRow[],
  date: string,
  opening: number,
  actualClosing?: number,
): CashDaily {
  const selected = rows.filter(
    (r) =>
      r.date.slice(0, 10) === date &&
      r.nest !== "cms-item" &&
      r.nest !== "cms-pending",
  );
  const inflow = selected.reduce((sum, r) => sum + r.inAmt, 0);
  const outflow = selected.reduce((sum, r) => sum + r.outAmt, 0);
  const expectedClosing = opening + inflow - outflow;
  return {
    date,
    opening,
    inflow,
    outflow,
    expectedClosing,
    actualClosing,
    difference: actualClosing == null ? 0 : actualClosing - expectedClosing,
    transactionCount: selected.length,
    unclassifiedCount: selected.filter((r) => isUnclassified(r.category))
      .length,
    missingEvidenceCount: selected.filter(
      (r) => r.outAmt > 0 && !r.raw.documentId && !r.raw.evidenceUrl,
    ).length,
    status: "open",
  };
}

export function validateCashDailyClose(daily: CashDaily): string[] {
  const errors: string[] = [];
  if (daily.actualClosing == null) errors.push("실제 마감잔액이 필요합니다.");
  if (Math.abs(daily.difference) > 0.99)
    errors.push(
      `장부와 실제 잔액이 ${daily.difference.toLocaleString("ko-KR")}원 차이납니다.`,
    );
  if (daily.unclassifiedCount)
    errors.push(`미분류 거래 ${daily.unclassifiedCount}건을 분류해야 합니다.`);
  if (daily.missingEvidenceCount)
    errors.push(
      `지출 증빙 누락 ${daily.missingEvidenceCount}건을 확인해야 합니다.`,
    );
  return errors;
}

export function closeCashDaily(daily: CashDaily): CashDaily {
  const errors = validateCashDailyClose(daily);
  if (errors.length) throw new Error(errors.join(" "));
  return { ...daily, status: "closed" };
}
