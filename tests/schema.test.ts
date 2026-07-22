/**
 * Zod 스키마 검증 (B: 강타입). 고스트필드 선언·오타/타입오류 방어를 고정.
 *   실행: npm test
 */
import { describe, it, expect } from 'vitest';
import { ContractSchema, parseContract } from '@/lib/schema/contract';
import { PaymentEntrySchema } from '@/lib/schema/payment';

describe('PaymentEntry 스키마', () => {
  it('정상 entry 통과', () => {
    expect(PaymentEntrySchema.safeParse({ date: '2026-07-01', amount: 500_000, source: '계좌' }).success).toBe(true);
  });
  it('실데이터 source=CMS 허용 (hand-written enum 누락 보정)', () => {
    expect(PaymentEntrySchema.safeParse({ date: '2026-07-01', amount: 500_000, source: 'CMS' }).success).toBe(true);
  });
  it('amount가 숫자가 아니면 실패', () => {
    expect(PaymentEntrySchema.safeParse({ date: '2026-07-01', amount: '50만', source: '계좌' }).success).toBe(false);
  });
  it('알 수 없는 source는 실패 (오타 방어)', () => {
    expect(PaymentEntrySchema.safeParse({ date: '2026-07-01', amount: 1, source: '통장' }).success).toBe(false);
  });
});

describe('Contract 스키마 — 고스트필드 선언·검증', () => {
  const base = {
    _key: 'c1', contractNo: 'SP-2601-0001', contractorName: '홍길동', plate: '123가4567',
    monthlyRent: 500_000, rentalMonths: 12, startDate: '2025-01-01', status: '운행',
    _carryUnpaid: 1_200_000, _paidTotal: 0,
    _payments: [{ date: '2026-07-01', amount: 500_000, source: '계좌' }],
  };

  it('정본 계약 + 고스트필드 통과 → 파생 타입에 잡힘', () => {
    const r = parseContract(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data._carryUnpaid).toBe(1_200_000);
      expect(r.data._payments?.[0].amount).toBe(500_000);
    }
  });

  it('선언 안 된 필드는 허용 (.loose 점진 이행)', () => {
    expect(parseContract({ ...base, cdw: '완전자차', mileageOut: 12000 }).success).toBe(true);
  });

  it('_carryUnpaid에 문자열 → 실패 (타입오류 방어)', () => {
    expect(parseContract({ ...base, _carryUnpaid: '백이십만' }).success).toBe(false);
  });

  it('_payments 내부 entry가 깨지면 → 실패 (중첩 검증)', () => {
    expect(parseContract({ ...base, _payments: [{ date: '2026-07-01', amount: 'x', source: '계좌' }] }).success).toBe(false);
  });

  it('ContractSchema는 고스트필드 4종을 선언한다', () => {
    const keys = Object.keys(ContractSchema.shape);
    for (const g of ['_carryUnpaid', '_paidTotal', '_payments', '_discounts']) expect(keys).toContain(g);
  });
});
