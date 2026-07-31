/**
 * 계약 추가청구(_charges) — 초과주행·위약금 등 회차표 밖 채권.
 * 보증금 충당 순서(고정): 미납 대여료 → 초과주행 → 위약금. 주석·할당 코드 동기.
 */
import type { EntityRecord } from '@/lib/intake/entities';

export const CHARGE_KIND_OVER_MILEAGE = 'over-mileage';
export const CHARGE_KIND_EARLY_TERM = 'early-termination';

/** 충당·표시 우선순위 — 이 배열 순서로 보증금 잔액을 깐다. */
export const DEPOSIT_OFFSET_CHARGE_ORDER = [
  CHARGE_KIND_OVER_MILEAGE,
  CHARGE_KIND_EARLY_TERM,
] as const;

export type ChargeEntry = {
  date: string;
  amount: number;
  kind: string;
  memo?: string;
  synthetic?: boolean;
};

export function listCharges(rec: EntityRecord): ChargeEntry[] {
  if (!Array.isArray(rec._charges)) return [];
  return (rec._charges as ChargeEntry[]).filter((c) => (Number(c.amount) || 0) > 0 && c.kind);
}

export function hasChargeKind(rec: EntityRecord, kind: string): boolean {
  return listCharges(rec).some((c) => c.kind === kind);
}

export function sumChargesByKind(rec: EntityRecord, kind: string): number {
  return listCharges(rec)
    .filter((c) => c.kind === kind)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
}

/** 청구 kind를 겨냥한 수납(보증금충당 등) 합. */
export function sumPaymentsToChargeKind(rec: EntityRecord, kind: string): number {
  const pays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  let s = 0;
  for (const p of pays) {
    if (String(p.chargeKind || '') === kind) s += Number(p.amount) || 0;
  }
  return Math.max(0, Math.round(s));
}

/** 미결제 추가청구 = Σ charge − Σ(해당 kind 수납). */
export function openChargesTotal(rec: EntityRecord): number {
  let open = 0;
  const kinds = new Set(listCharges(rec).map((c) => c.kind));
  for (const kind of kinds) {
    const due = sumChargesByKind(rec, kind);
    const paid = sumPaymentsToChargeKind(rec, kind);
    open += Math.max(0, due - paid);
  }
  return Math.max(0, Math.round(open));
}

export function openChargeForKind(rec: EntityRecord, kind: string): number {
  return Math.max(0, sumChargesByKind(rec, kind) - sumPaymentsToChargeKind(rec, kind));
}
