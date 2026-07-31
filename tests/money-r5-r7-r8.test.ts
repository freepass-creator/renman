/**
 * R5·R7·R8 — 초과주행 청구·synthetic 입금누계·과오납.
 * 단정: net · paid · overpay · addCharge · 미수 행수 · 청구액 안정성.
 */
import { describe, it, expect } from 'vitest';
import { computeContractView } from '@/lib/contract-ops';
import { buildDepositSettlement, depositView } from '@/lib/deposit';
import { buildReceivableRows } from '@/lib/receivables-ledger';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { CHARGE_KIND_OVER_MILEAGE } from '@/lib/contracts/charges';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-07-22';

/** 초과주행 fee = 3,170,000 (excess 31700km × 100원). */
function omReturned(over: Record<string, unknown> = {}): EntityRecord {
  return {
    _key: 'om',
    monthlyRent: 300_000,
    rentalMonths: 12,
    startDate: '2025-07-22',
    endDate: '2026-07-22',
    contractDate: '2025-07-22',
    deliveredDate: '2025-07-22',
    returnedDate: '2026-07-22',
    status: '반납',
    paymentDay: 25,
    paymentTiming: '선불',
    deposit: 300_000,
    _carryUnpaid: 300_000,
    mileageOut: 0,
    returnMileage: 41_700,
    annualMileageLimit: 10_000,
    overMileageRate: 100,
    plate: 'OM1234',
    ...over,
  } as EntityRecord;
}

function applySettlement(rec: EntityRecord): EntityRecord {
  const { charges, payments } = buildDepositSettlement(rec, TODAY);
  return {
    ...rec,
    depositSettledDate: TODAY,
    _charges: [...(Array.isArray(rec._charges) ? rec._charges as unknown[] : []), ...charges],
    _payments: [...(Array.isArray(rec._payments) ? rec._payments as unknown[] : []), ...payments],
  } as EntityRecord;
}

describe('R5 초과주행 잔액이 미수 원장에 남음', () => {
  it('미납30만·OM317만·보증30만 → 확정 후 net=317만 · 행 1 · addCharge 안정', () => {
    const before = omReturned();
    const v0 = computeContractView(before, TODAY);
    const d0 = depositView(before, TODAY);
    expect(v0.net).toBe(300_000);
    expect(d0.overMileageFee).toBe(3_170_000);
    expect(d0.addCharge).toBe(3_170_000);
    expect(buildReceivableRows([before], [], TODAY)).toHaveLength(1);

    const after = applySettlement(before);
    const v1 = computeContractView(after, TODAY);
    const d1 = depositView(after, TODAY);
    const d2 = depositView(after, TODAY); // 재조회

    const charges = Array.isArray(after._charges) ? (after._charges as Array<{ kind?: string }>) : [];
    expect(charges.some((c) => c.kind === CHARGE_KIND_OVER_MILEAGE)).toBe(true);
    expect(v1.net).toBe(3_170_000);
    expect(v1.paid).toBe(0); // synthetic 제외
    expect(v1.overpay).toBe(0);
    expect(d1.addCharge).toBe(3_170_000);
    expect(d2.addCharge).toBe(d1.addCharge); // 청구액 볼 때마다 안 변함
    expect(d1.overMileageFee).toBe(3_170_000);
    expect(buildReceivableRows([after], [], TODAY)).toHaveLength(1);
    expect(buildReceivableRows([after], [], TODAY)[0].v.net).toBe(3_170_000);

    // eslint-disable-next-line no-console
    console.log(`R5 before net=${v0.net} addCharge=${d0.addCharge} rows=1 → after net=${v1.net} paid=${v1.paid} addCharge=${d1.addCharge} rows=1`);
  });
});

describe('R7 synthetic이 입금누계에 안 섞임', () => {
  it('충당 후 paid=0 · 실입금만 paid에 가산', () => {
    const settled = applySettlement(omReturned({ _key: 'r7', _carryUnpaid: 800_000, deposit: 1_000_000, returnMileage: 10_000 }));
    // OM fee 0 (no excess if returnMileage=limit). rent offset 800k.
    const v0 = computeContractView(settled, TODAY);
    expect(v0.paid).toBe(0);

    const withCash = {
      ...settled,
      _payments: [
        ...(settled._payments as unknown[]),
        { date: TODAY, amount: 200_000, source: '계좌' },
      ],
    } as EntityRecord;
    const v1 = computeContractView(withCash, TODAY);
    expect(v1.paid).toBe(200_000);
    // eslint-disable-next-line no-console
    console.log(`R7 paid after offset=${v0.paid} · after cash 20만 paid=${v1.paid}`);
  });
});

describe('R8 충당 후 실입금 → 과오납(환불의무)', () => {
  it('충당으로 net0 후 실입금 80만 → overpay 80만', () => {
    const base = {
      _key: 'r8',
      monthlyRent: 500_000,
      rentalMonths: 12,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      deliveredDate: '2025-01-01',
      returnedDate: '2026-06-01',
      status: '반납',
      paymentDay: 25,
      paymentTiming: '선불',
      deposit: 800_000,
      _carryUnpaid: 800_000,
      plate: 'R8',
    } as EntityRecord;
    const settled = applySettlement(base);
    const v0 = computeContractView(settled, TODAY);
    expect(v0.net).toBe(0);
    expect(v0.overpay).toBe(0);
    expect(v0.paid).toBe(0);

    const afterCash = {
      ...settled,
      _payments: [
        ...(settled._payments as unknown[]),
        { date: TODAY, amount: 800_000, source: '계좌' },
      ],
    } as EntityRecord;
    const v1 = computeContractView(afterCash, TODAY);
    expect(v1.net).toBe(0);
    expect(v1.overpay).toBe(800_000);
    expect(v1.paid).toBe(800_000);
    const snap = selectReceivables([afterCash], TODAY);
    expect(snap.overpayTotal).toBe(800_000);
    expect(snap.unpaidCount).toBe(0);
    // eslint-disable-next-line no-console
    console.log(`R8 net=${v1.net} overpay=${v1.overpay} paid=${v1.paid} · snapshot overpayTotal=${snap.overpayTotal}`);
  });
});
