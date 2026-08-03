import { describe, expect, it } from 'vitest';
import { buildManualReceiptEntries, manualReceiptPlanLabel, planManualReceiptAllocation } from '../lib/payments/manual-receipt-allocation';
import type { PaymentScheduleInline } from '../lib/payments/types/banking';

function schedule(seq: number, amount: number, status: PaymentScheduleInline['status'], paidAmount = 0): PaymentScheduleInline {
  return {
    seq,
    dueDate: `2026-0${seq}-05`,
    amount,
    status,
    paidAmount,
    payments: paidAmount ? [{ date: '2026-01-01', amount: paidAmount, source: '계좌' }] : [],
  };
}

describe('수동 입금 회차 배분', () => {
  it('뭉텅이 입금을 오래된 미납부터 여러 회차에 나눈다', () => {
    const plan = planManualReceiptAllocation([
      schedule(1, 700_000, '연체'),
      schedule(2, 700_000, '연체'),
      schedule(3, 700_000, '예정'),
    ], 1_500_000, '2026-04-22');

    expect(plan.allocations).toEqual([
      expect.objectContaining({ seq: 1, amount: 700_000 }),
      expect.objectContaining({ seq: 2, amount: 700_000 }),
      expect.objectContaining({ seq: 3, amount: 100_000 }),
    ]);
    expect(plan.allocatedAmount).toBe(1_500_000);
    expect(plan.unappliedAmount).toBe(0);
  });

  it('부분납 잔액만 채운 뒤 다음 회차로 넘긴다', () => {
    const plan = planManualReceiptAllocation([
      schedule(1, 700_000, '부분납', 500_000),
      schedule(2, 700_000, '연체'),
    ], 600_000, '2026-04-22');

    expect(plan.allocations.map(({ seq, amount }) => ({ seq, amount }))).toEqual([
      { seq: 1, amount: 200_000 },
      { seq: 2, amount: 400_000 },
    ]);
  });

  it('모든 회차를 충당하고 남은 금액을 과오납·미배분으로 보존한다', () => {
    const plan = planManualReceiptAllocation([
      schedule(1, 700_000, '연체'),
      schedule(2, 700_000, '연체'),
    ], 1_500_000, '2026-04-22');

    expect(plan.allocatedAmount).toBe(1_400_000);
    expect(plan.unappliedAmount).toBe(100_000);
    expect(manualReceiptPlanLabel(plan)).toContain('과오납·미배분 100,000원');

    const entries = buildManualReceiptEntries(plan, {
      txId: 'tx-1', txDate: '2026-04-22', matchedAt: '2026-04-22T01:02:03.000Z',
    });
    expect(entries).toHaveLength(3);
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(1_500_000);
    expect(entries.at(-1)).toEqual(expect.objectContaining({
      amount: 100_000,
      txId: 'tx-1',
      unapplied: true,
      memo: '과오납·미배분',
    }));
  });
});
