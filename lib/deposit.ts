// 보증금 원장/정산 — v5 deposit 이식(v6 flat record에 맞게 단순화).
//   예치 보증금에서 미납 대여료(일할 반영)를 충당 → 반환액 or 추가청구. 종료됐는데 미정산이면 "미반환" 대상.
//   정산 사실은 depositSettledDate 로 표시(반환/충당 완료 도장). SettlementDoc(반납 정산서)과 같은 셈.
//
// ★보증금 충당 순서(고정 — 변경 금지): 미납 대여료 → 초과주행 → 위약금.
import type { EntityRecord } from './intake/entities';
import { buildMatchContract, computeContractView, computeReturnSettlement, earlyTerminationFee } from './contract-ops';
import { applyPayment } from './payments/payment-schedule';
import { computeOverMileage } from './domain/over-mileage';
import { ymd } from './contracts/dates';
import { DEPOSIT_OFFSET_KIND, DEPOSIT_OFFSET_MEMO, hasDepositOffsetPayment, recordedDepositOffsetAmount } from './contracts/deposit-offset';
import {
  CHARGE_KIND_EARLY_TERM,
  CHARGE_KIND_OVER_MILEAGE,
  DEPOSIT_OFFSET_CHARGE_ORDER,
  hasChargeKind,
  listCharges,
  openChargeForKind,
  type ChargeEntry,
} from './contracts/charges';

export type DepositView = {
  deposit: number;
  unpaid: number;
  offset: number;
  refund: number;
  addCharge: number;
  overMileageFee: number;
  ended: boolean;
  settled: boolean;
  pendingRefund: boolean;
};

export function depositView(c: EntityRecord, today: string): DepositView {
  const deposit = Number(c.deposit) || 0;
  const v = computeContractView(c, today);
  const { unpaid, offset, refund, addCharge, overMileageFee } = computeReturnSettlement(deposit, v, { contract: c, asOf: today });
  const ended = !!c.returnedDate;
  const settled = !!c.depositSettledDate;
  return {
    deposit, unpaid, offset, refund, addCharge, overMileageFee,
    ended, settled, pendingRefund: ended && deposit > 0 && !settled,
  };
}

/** 회차(대여료) 미수만 — _charges 제외 프로브. */
export function rentUnpaidOnly(rec: EntityRecord, today: string): number {
  return computeContractView({ ...rec, _charges: [] } as EntityRecord, today).net;
}

function offsetPaymentBase(today: string) {
  return {
    date: today,
    source: '정산' as const,
    kind: DEPOSIT_OFFSET_KIND,
    memo: DEPOSIT_OFFSET_MEMO,
    subject: DEPOSIT_OFFSET_MEMO,
    synthetic: true,
  };
}

/** 대여료 충당 entry — 씨앗=금액만 · 일반=회차 분배. */
function buildRentOffsetPayments(rec: EntityRecord, today: string, amount: number): Array<Record<string, unknown>> {
  if (amount <= 0) return [];
  const base = offsetPaymentBase(today);
  const seedCarry = rec._carryUnpaid !== undefined && rec._carryUnpaid !== null;
  if (seedCarry) return [{ ...base, amount }];

  const c = buildMatchContract(rec, today);
  const schedules = c.schedules || [];
  if (!schedules.length) return [{ ...base, amount }];

  const { consumed } = applyPayment(schedules, amount, today, '정산', { memo: DEPOSIT_OFFSET_MEMO });
  if (!consumed.length) return [{ ...base, amount }];
  return consumed.map((x) => ({ ...base, seq: x.seq, amount: x.amount }));
}

/** 정산 시 새로 붙일 청구 entry(멱등: kind 있으면 skip). */
export function buildSettlementCharges(rec: EntityRecord, today: string): ChargeEntry[] {
  const out: ChargeEntry[] = [];
  const asOf = ymd(rec.returnedDate) || today;
  const om = computeOverMileage(rec, asOf);
  if (om.fee > 0 && !hasChargeKind(rec, CHARGE_KIND_OVER_MILEAGE)) {
    out.push({
      date: today,
      amount: om.fee,
      kind: CHARGE_KIND_OVER_MILEAGE,
      memo: `초과주행 ${om.excessKm}km`,
      synthetic: true,
    });
  }
  const et = earlyTerminationFee(rec, asOf);
  if (et.fee > 0 && !hasChargeKind(rec, CHARGE_KIND_EARLY_TERM)) {
    out.push({
      date: today,
      amount: et.fee,
      kind: CHARGE_KIND_EARLY_TERM,
      memo: `중도해지 위약금 ${et.rate}%`,
      synthetic: true,
    });
  }
  return out;
}

export type DepositSettlementBundle = {
  charges: ChargeEntry[];
  payments: Array<Record<string, unknown>>;
};

/**
 * 보증금 정산 확정 패치 묶음.
 * 충당 순서: 미납 대여료 → 초과주행 → 위약금.
 * 이미 기록된 충당/청구는 멱등 skip.
 */
export function buildDepositSettlement(rec: EntityRecord, today: string): DepositSettlementBundle {
  const charges = buildSettlementCharges(rec, today);
  const mergedCharges = [...listCharges(rec), ...charges];

  const deposit = Number(rec.deposit) || 0;
  let remain = Math.max(0, deposit - recordedDepositOffsetAmount(rec));
  const payments: Array<Record<string, unknown>> = [];
  const paysAcc = Array.isArray(rec._payments)
    ? [...(rec._payments as Array<Record<string, unknown>>)]
    : [];

  // 1) 미납 대여료
  const rentDue = rentUnpaidOnly(rec, today);
  const hasRentOffset = paysAcc.some((p) => {
    if (String(p.chargeKind || '')) return false;
    return String(p.kind || '') === DEPOSIT_OFFSET_KIND
      || `${String(p.memo || '')}${String(p.subject || '')}`.replace(/\s/g, '').includes('보증금충당');
  });
  if (!hasRentOffset && rentDue > 0 && remain > 0) {
    const take = Math.min(remain, rentDue);
    const rentPays = buildRentOffsetPayments(rec, today, take);
    payments.push(...rentPays);
    paysAcc.push(...rentPays);
    remain -= take;
  }

  // 2·3) 초과주행 → 위약금
  for (const kind of DEPOSIT_OFFSET_CHARGE_ORDER) {
    if (remain <= 0) break;
    const due = openChargeForKind(
      { ...rec, _charges: mergedCharges, _payments: paysAcc } as EntityRecord,
      kind,
    );
    if (due <= 0) continue;
    const take = Math.min(remain, due);
    const pay = { ...offsetPaymentBase(today), amount: take, chargeKind: kind };
    payments.push(pay);
    paysAcc.push(pay);
    remain -= take;
  }

  return { charges, payments };
}

/** @deprecated → buildDepositSettlement.payments (대여료분만) */
export function buildDepositOffsetPayments(
  rec: EntityRecord,
  today: string,
): Array<Record<string, unknown>> {
  if (hasDepositOffsetPayment(rec)) return [];
  return buildDepositSettlement(rec, today).payments.filter((p) => !p.chargeKind);
}

export function depositOffsetAmount(rec: EntityRecord, today: string): number {
  const d = depositView(rec, today);
  return Math.min(d.offset, d.unpaid);
}

export { DEPOSIT_OFFSET_KIND, DEPOSIT_OFFSET_MEMO, hasDepositOffsetPayment } from './contracts/deposit-offset';
