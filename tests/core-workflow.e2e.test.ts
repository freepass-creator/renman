import { describe, expect, it } from 'vitest';
import { computeContractView, patchDeliver, patchReturn } from '@/lib/contract-ops';
import type { EntityRecord } from '@/lib/intake/entities';

describe('핵심 운영 수명주기', () => {
  it('계약 인도 → 입금 반영 → 반납까지 미수와 상태 데이터가 일관된다', () => {
    const draft: EntityRecord = {
      _key: 'CTR-E2E-1', contractNo: 'CTR-E2E-1', plate: '12가3456',
      contractorName: '테스트 고객', contractDate: '2026-01-01',
      startDate: '2026-01-01', endDate: '2027-01-01', rentalMonths: 12,
      monthlyRent: 500_000, paymentDay: 25, paymentTiming: '선불',
      _carryUnpaid: 1_200_000,
    };

    const delivered: EntityRecord = { ...draft, ...patchDeliver(draft, '2026-01-02', { mileageOut: 100 }) };
    expect(delivered.deliveredDate).toBe('2026-01-02');

    const beforePayment = computeContractView(delivered, '2026-07-26').net;
    const paid: EntityRecord = {
      ...delivered,
      _payments: [{ seq: 1, date: '2026-07-20', amount: 500_000, source: '계좌' }],
    };
    const afterPayment = computeContractView(paid, '2026-07-26').net;
    expect(afterPayment).toBe(beforePayment - 500_000);

    const returned: EntityRecord = { ...paid, ...patchReturn(paid, '2026-07-26', { returnMileage: 12_000 }) };
    expect(returned.returnedDate).toBe('2026-07-26');
    expect(computeContractView(returned, '2026-07-26').net).toBe(afterPayment);
  });
});
