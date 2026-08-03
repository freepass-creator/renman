import type { CashRow } from "./cash-ledger";
import { isUnclassified } from "@/lib/payments/ledger-subjects";
import { requiresContractLink, requiresExpenseEvidence } from "./cash-rules";
import { cashBundleReviewStatus } from "./cash-bundle";
import { reviewInternalTransfers } from "./internal-transfer";

export { requiresContractLink } from "./cash-rules";

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
  bundleIncompleteCount: number;
  missingEvidenceCount: number;
  unmatchedContractCount: number;
  unappliedReceiptCount: number;
  unappliedReceiptAmount: number;
  unpairedTransferCount: number;
  status: CashDailyStatus;
};

export function calculateCashDaily(
  rows: CashRow[],
  date: string,
  opening: number,
  actualClosing?: number,
): CashDaily {
  const transferReview = reviewInternalTransfers(rows);
  const unpairedTransferIds = new Set(transferReview.unpairedRows.map((row) => row.id));
  const selected = rows.filter(
    (r) =>
      r.date.slice(0, 10) === date &&
      r.nest !== "cms-item" &&
      r.nest !== "cms-pending" &&
      r.nest !== "card-item",
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
    unclassifiedCount: selected.filter((r) => r.nest !== 'bundle-parent' && isUnclassified(r.category))
      .length,
    bundleIncompleteCount: selected.filter((r) => cashBundleReviewStatus(r) === '미완료').length,
    missingEvidenceCount: selected.filter(
      (r) => r.outAmt > 0 && requiresExpenseEvidence(r.category) && !r.raw.documentId && !r.raw.evidenceUrl,
    ).length,
    unmatchedContractCount: selected.filter((r) =>
      r.inAmt > 0
      && r.nest !== 'cms-dep' && r.nest !== 'card-dep'
      && requiresContractLink(r.category)
      && !r.raw.matchedContractId && !r.raw.matchedScheduleSeq,
    ).length,
    unappliedReceiptCount: selected.filter((r) => Number(r.raw.matchedUnappliedAmount) > 0).length,
    unappliedReceiptAmount: selected.reduce((sum, r) => sum + Math.max(0, Number(r.raw.matchedUnappliedAmount) || 0), 0),
    unpairedTransferCount: selected.filter((r) => unpairedTransferIds.has(r.id)).length,
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
  if (daily.bundleIncompleteCount)
    errors.push(`입출금 분해 미완료 ${daily.bundleIncompleteCount}건을 자금관리에서 마쳐야 합니다.`);
  if (daily.missingEvidenceCount)
    errors.push(
      `지출 증빙 누락 ${daily.missingEvidenceCount}건을 확인해야 합니다.`,
    );
  if (daily.unmatchedContractCount)
    errors.push(`계약 미연결 입금 ${daily.unmatchedContractCount}건을 연결해야 합니다.`);
  if (daily.unappliedReceiptCount)
    errors.push(`과오납·미배분 입금 ${daily.unappliedReceiptCount}건 ${daily.unappliedReceiptAmount.toLocaleString("ko-KR")}원을 확인해야 합니다.`);
  if (daily.unpairedTransferCount)
    errors.push(`내부이체 짝 미확인 ${daily.unpairedTransferCount}건을 확인해야 합니다.`);
  return errors;
}

/** 입력 UI와 배치 마감이 같은 필수값 규칙을 쓰도록 분리한 최종 마감 검증. */
export function validateCashDailyCloseInput(
  daily: CashDaily,
  options: { openingProvided: boolean },
): string[] {
  return [
    ...(options.openingProvided ? [] : ['기초잔액이 필요합니다.']),
    ...validateCashDailyClose(daily),
  ];
}

const CLOSE_SNAPSHOT_FIELDS = [
  'opening', 'inflow', 'outflow', 'expectedClosing', 'actualClosing', 'difference',
  'transactionCount', 'unclassifiedCount', 'bundleIncompleteCount',
  'missingEvidenceCount', 'unmatchedContractCount', 'unappliedReceiptCount', 'unappliedReceiptAmount', 'unpairedTransferCount',
] as const;

/** 같은 회사·일자의 동일 마감 결과를 다시 저장하지 않기 위한 멱등성 판정. */
export function cashDailyCloseSnapshotMatches(
  saved: Partial<CashDaily>,
  next: CashDaily,
): boolean {
  return CLOSE_SNAPSHOT_FIELDS.every((key) => Number(saved[key]) === Number(next[key]));
}

export function closeCashDaily(daily: CashDaily): CashDaily {
  const errors = validateCashDailyClose(daily);
  if (errors.length) throw new Error(errors.join(" "));
  return { ...daily, status: "closed" };
}
