/**
 * 선/후불 1회차 미수 규칙 프로브 — 현재 엔진 동작 관찰용.
 *   규칙(사장님): 선불=1회차 인도 시 결제(미수 없음), 2회차부터 미수 가능 / 후불=1회차부터 미수 가능.
 */
import { describe, it, expect } from 'vitest';
import { contractSchedules, computeContractView } from '@/lib/contract-ops';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-07-22';
// 시작 2026-01-01·월50만·paymentDay 1·인도완료·앱수납/carry 없음(일반 계약).
const base = { _key: 'c', monthlyRent: 500_000, rentalMonths: 12, startDate: '2026-01-01', endDate: '2027-01-01', contractDate: '2026-01-01', deliveredDate: '2026-01-01', status: '운행', paymentDay: 1 };

describe('선/후불 1회차 미수 규칙', () => {
  it('선불 — 1회차(인도 시 납부)는 연체가 아니어야 함', () => {
    const sch = contractSchedules({ ...base, paymentTiming: '선불' } as EntityRecord, TODAY);
    const r1 = sch.find((s) => s.seq === 1);
    expect(r1?.status).not.toBe('연체');
  });

  it('후불 — 1회차는 미납이면 연체 가능', () => {
    const sch = contractSchedules({ ...base, paymentTiming: '후불' } as EntityRecord, TODAY);
    const r1 = sch.find((s) => s.seq === 1);
    expect(r1?.status).toBe('연체');
  });

  it('선불·후불 모두 1회차 제외 6회차분 = 3.0M (선불=인도납부 제외 / 후불=1회차 미도래분 없음)', () => {
    // start 2026-01-01·paymentDay 1·TODAY 07-22. 선불: 회차1(01-01)~회차7(07-01) 도래, 1회차 제외→6. 후불: 회차1(02-01)~회차6(07-01) 도래→6.
    const preNet = computeContractView({ ...base, paymentTiming: '선불' } as EntityRecord, TODAY).net;
    const postNet = computeContractView({ ...base, paymentTiming: '후불' } as EntityRecord, TODAY).net;
    expect(preNet).toBe(3_000_000);
    expect(postNet).toBe(3_000_000);
  });
});
