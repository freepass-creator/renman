/**
 * 보증금 충당 수납 식별 · 레거시 net 보정.
 * contract-ops가 import하므로 여기서 contract-ops를 다시 import하지 말 것(순환 금지).
 */
import type { EntityRecord } from '@/lib/intake/entities';

export const DEPOSIT_OFFSET_MEMO = '보증금충당';

export function hasDepositOffsetPayment(rec: EntityRecord): boolean {
  const pays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  return pays.some((p) => {
    const m = String(p.memo || '');
    const s = String(p.subject || '');
    return m === DEPOSIT_OFFSET_MEMO || s === DEPOSIT_OFFSET_MEMO;
  });
}

/**
 * 레거시: depositSettledDate만 있고 보증금충당 수납이 없을 때 net에서 충당액 차감.
 * 실수납이 있으면 buildContract가 이미 반영 → 이중차감 금지.
 */
export function legacyDepositOffsetNet(rec: EntityRecord, net: number): number {
  if (!rec.depositSettledDate || net <= 0) return net;
  if (hasDepositOffsetPayment(rec)) return net;
  const deposit = Number(rec.deposit) || 0;
  if (deposit <= 0) return net;
  return Math.max(0, net - Math.min(deposit, net));
}
