import { applyPayment } from './payment-schedule';
import type { PaymentScheduleInline, ScheduleStatus } from './types/banking';

export type ManualReceiptAllocation = {
  seq: number;
  amount: number;
  dueDate: string;
  status: ScheduleStatus;
};

export type ManualReceiptPlan = {
  amount: number;
  allocatedAmount: number;
  allocations: ManualReceiptAllocation[];
  unappliedAmount: number;
};

export type ManualReceiptEntry = {
  seq?: number;
  date: string;
  amount: number;
  source: '계좌';
  txId: string;
  manual: true;
  at: string;
  unapplied?: true;
  memo?: string;
};

/**
 * 한 계좌 입금을 계약 회차에 어떻게 배분할지 저장 전에 계산한다.
 * 연체 → 부분납 → 예정 순서와 회차 오름차순은 수납 스케줄 엔진의 SSOT를 그대로 따른다.
 */
export function planManualReceiptAllocation(
  schedules: PaymentScheduleInline[],
  amount: number,
  txDate: string,
): ManualReceiptPlan {
  const normalized = Math.max(0, Math.round(Number(amount) || 0));
  const scheduleBySeq = new Map(schedules.map((schedule) => [schedule.seq, schedule]));
  const { consumed, leftover } = applyPayment(schedules, normalized, txDate, '계좌');
  const allocations = consumed.map(({ seq, amount: applied }) => {
    const schedule = scheduleBySeq.get(seq);
    return {
      seq,
      amount: applied,
      dueDate: String(schedule?.dueDate || ''),
      status: schedule?.status || '예정',
    };
  });
  return {
    amount: normalized,
    allocatedAmount: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    allocations,
    unappliedAmount: Math.max(0, leftover),
  };
}

export function manualReceiptPlanLabel(plan: ManualReceiptPlan): string {
  const rounds = plan.allocations.map((allocation) => `${allocation.seq}회차 ${allocation.amount.toLocaleString('ko-KR')}원`);
  if (plan.unappliedAmount > 0) rounds.push(`과오납·미배분 ${plan.unappliedAmount.toLocaleString('ko-KR')}원`);
  return rounds.join(' + ') || '배분 가능한 회차 없음';
}

/** 계약 _payments에 저장할 원자 목록. 배분합 + 미배분합은 반드시 원거래 금액과 같다. */
export function buildManualReceiptEntries(
  plan: ManualReceiptPlan,
  input: { txId: string; txDate: string; matchedAt: string },
): ManualReceiptEntry[] {
  const entries: ManualReceiptEntry[] = plan.allocations.map((allocation) => ({
    seq: allocation.seq,
    date: input.txDate,
    amount: allocation.amount,
    source: '계좌',
    txId: input.txId,
    manual: true,
    at: input.matchedAt,
  }));
  if (plan.unappliedAmount > 0) {
    entries.push({
      date: input.txDate,
      amount: plan.unappliedAmount,
      source: '계좌',
      txId: input.txId,
      manual: true,
      at: input.matchedAt,
      unapplied: true,
      memo: '과오납·미배분',
    });
  }
  return entries;
}
