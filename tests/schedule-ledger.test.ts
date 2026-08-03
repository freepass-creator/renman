/**
 * 회차 청구 스케줄 원장 — buildScheduleLedger / notifyRecipient 불변식.
 */
import { describe, it, expect } from 'vitest';
import { computeContractView, buildScheduleLedger, summarizeScheduleLedger } from '@/lib/contract-ops';
import { notifyRecipient } from '@/lib/notify/recipients';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-07-22';

function c(over: Record<string, unknown>): EntityRecord {
  return {
    _key: 'c', monthlyRent: 500_000, rentalMonths: 12,
    startDate: '2025-01-01', endDate: '2026-01-01', contractDate: '2025-01-01',
    deliveredDate: '2025-01-01', status: '운행', paymentDay: 25, paymentTiming: '선불',
    ...over,
  } as EntityRecord;
}

describe('buildScheduleLedger', () => {
  it('12개월 계약 → 12행 · dueDate 오름차순 · id = c#1…c#12', () => {
    const rows = buildScheduleLedger([c({})], TODAY);
    expect(rows).toHaveLength(12);
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `c#${i + 1}`));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].dueDate >= rows[i - 1].dueDate).toBe(true);
    }
  });

  it('선불 계약 → seq1 = 선납개시·완료', () => {
    const rows = buildScheduleLedger([c({})], TODAY);
    const first = rows.find((r) => r.seq === 1);
    expect(first?.kind).toBe('선납개시');
    expect(first?.status).toBe('완료');
  });

  it('_carryUnpaid 씨앗 → 도래 회차 이월승계 · 잔액합 = net', () => {
    const rec = c({ _carryUnpaid: 1_200_000 });
    const rows = buildScheduleLedger([rec], TODAY);
    const due = rows.filter((r) => r.dueDate <= TODAY);
    expect(due.filter((r) => r.seq > 1).every((r) => r.kind === '이월승계')).toBe(true);
    const v = computeContractView(rec, TODAY);
    expect(summarizeScheduleLedger(due).balance).toBe(v.net);
  });

  it('반납 계약 → 반납월 회차 일할정산·discount > 0', () => {
    const rec = c({
      status: '반납',
      returnedDate: '2025-06-15',
      endDate: '2026-01-01',
      // carry 없음 → applyReturnedProration 적용
    });
    const rows = buildScheduleLedger([rec], TODAY);
    const prorated = rows.filter((r) => r.kind === '일할정산');
    expect(prorated.length).toBeGreaterThan(0);
    expect(prorated.some((r) => r.discount > 0)).toBe(true);
  });

  it('_charges만 있는 계약 → 회차 행 수 불변', () => {
    const base = buildScheduleLedger([c({})], TODAY);
    const withCharges = buildScheduleLedger([c({
      _charges: [{ kind: '과태료', amount: 80_000, paid: 0 }],
    })], TODAY);
    expect(withCharges).toHaveLength(base.length);
  });
});

describe('notifyRecipient 보증금', () => {
  const money = { net: 0, unpaidCount: 0, currentSeq: 1, monthlyRent: 500_000, refund: 0 };

  it('depositReceived undefined/null/\'\'/비수치 → null · 0 → 0 · 숫자 → 숫자', () => {
    expect(notifyRecipient(c({ depositReceived: undefined }), money).depositReceived).toBeNull();
    expect(notifyRecipient(c({ depositReceived: null }), money).depositReceived).toBeNull();
    expect(notifyRecipient(c({ depositReceived: '' }), money).depositReceived).toBeNull();
    expect(notifyRecipient(c({ depositReceived: 'abc' }), money).depositReceived).toBeNull();
    expect(notifyRecipient(c({ depositReceived: 0 }), money).depositReceived).toBe(0);
    expect(notifyRecipient(c({ depositReceived: 500_000 }), money).depositReceived).toBe(500_000);
  });
});
