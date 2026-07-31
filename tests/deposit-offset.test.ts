/**
 * 보증금 충당 → 미수 net before/after (3건 fixture).
 * 실행: npx vitest run tests/deposit-offset.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeContractView } from '@/lib/contract-ops';
import { buildDepositOffsetPayments, depositView } from '@/lib/deposit';
import { buildReceivableRows } from '@/lib/receivables-ledger';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-07-22';

function returned(over: Record<string, unknown>): EntityRecord {
  return {
    _key: 'c',
    monthlyRent: 500_000,
    rentalMonths: 12,
    startDate: '2025-01-01',
    endDate: '2026-01-01',
    contractDate: '2025-01-01',
    deliveredDate: '2025-01-01',
    returnedDate: '2026-06-01',
    status: '반납',
    paymentDay: 25,
    paymentTiming: '선불',
    deposit: 1_000_000,
    ...over,
  } as EntityRecord;
}

describe('보증금 충당 → 미수 반영', () => {
  it('3건 before/after net · 미수 총액', () => {
    const cases: { label: string; before: EntityRecord; expectBefore: number; expectAfter: number }[] = [
      {
        label: 'A 전액충당(carry 80만 · 보증 100만)',
        before: returned({ _key: 'a', _carryUnpaid: 800_000, plate: 'A' }),
        expectBefore: 800_000,
        expectAfter: 0,
      },
      {
        label: 'B 부분충당(carry 150만 · 보증 100만 → 잔여 50만)',
        before: returned({ _key: 'b', _carryUnpaid: 1_500_000, plate: 'B' }),
        expectBefore: 1_500_000,
        expectAfter: 500_000,
      },
      {
        label: 'C 레거시(날짜만·수납없음) → legacy net 보정',
        before: returned({
          _key: 'c',
          _carryUnpaid: 700_000,
          plate: 'C',
          depositSettledDate: '2026-07-01',
        }),
        expectBefore: 0, // 이미 settled → legacy 보정으로 0
        expectAfter: 0,
      },
    ];

    const report: string[] = [];
    let totalBefore = 0;
    let totalAfter = 0;

    for (const c of cases) {
      const netBefore = computeContractView(c.before, TODAY).net;
      expect(netBefore).toBe(c.expectBefore);
      totalBefore += netBefore;

      if (c.before.depositSettledDate) {
        // 레거시: 수납 없이 이미 보정됨
        expect(netBefore).toBe(c.expectAfter);
        totalAfter += netBefore;
        report.push(`${c.label}: net ${netBefore} (legacy settled)`);
        continue;
      }

      const pays = buildDepositOffsetPayments(c.before, TODAY);
      const afterRec = {
        ...c.before,
        depositSettledDate: TODAY,
        _payments: [...(Array.isArray(c.before._payments) ? c.before._payments as unknown[] : []), ...pays],
      } as EntityRecord;
      const netAfter = computeContractView(afterRec, TODAY).net;
      expect(netAfter).toBe(c.expectAfter);
      totalAfter += netAfter;
      report.push(`${c.label}: net ${netBefore} → ${netAfter} (충당 ${pays.reduce((s, p) => s + (Number(p.amount) || 0), 0)})`);
    }

    const rowsBefore = buildReceivableRows(cases.map((c) => c.before), [], TODAY);
    const settled = cases.map((c) => {
      if (c.before.depositSettledDate) return c.before;
      const pays = buildDepositOffsetPayments(c.before, TODAY);
      return {
        ...c.before,
        depositSettledDate: TODAY,
        _payments: [...(Array.isArray(c.before._payments) ? c.before._payments as unknown[] : []), ...pays],
      } as EntityRecord;
    });
    const rowsAfter = buildReceivableRows(settled, [], TODAY);

    report.push(`미수총액(행합) ${rowsBefore.reduce((s, r) => s + r.v.net, 0)} → ${rowsAfter.reduce((s, r) => s + r.v.net, 0)}`);
    report.push(`fixture net합 ${totalBefore} → ${totalAfter}`);
    // eslint-disable-next-line no-console
    console.log(report.join('\n'));

    expect(totalBefore).toBe(800_000 + 1_500_000 + 0);
    expect(totalAfter).toBe(0 + 500_000 + 0);
    expect(rowsAfter.every((r) => r.v.net > 0)).toBe(true);
    expect(rowsAfter.find((r) => r.rec._key === 'a')).toBeUndefined();
    expect(rowsAfter.find((r) => r.rec._key === 'b')?.v.net).toBe(500_000);
  });

  it('depositView pending → settled 후 unpaid 감소', () => {
    const rec = returned({ _carryUnpaid: 800_000 });
    const before = depositView(rec, TODAY);
    expect(before.pendingRefund).toBe(true);
    expect(before.offset).toBe(800_000);
    const pays = buildDepositOffsetPayments(rec, TODAY);
    const after = depositView({
      ...rec,
      depositSettledDate: TODAY,
      _payments: pays,
    }, TODAY);
    expect(after.settled).toBe(true);
    expect(after.unpaid).toBe(0);
    expect(after.pendingRefund).toBe(false);
  });
});
