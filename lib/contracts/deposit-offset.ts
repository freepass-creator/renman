/**
 * 보증금 충당 수납 식별 · 레거시 net 보정.
 * contract-ops가 import하므로 여기서 contract-ops를 다시 import하지 말 것(순환 금지).
 */
import type { EntityRecord } from '@/lib/intake/entities';

export const DEPOSIT_OFFSET_MEMO = '보증금충당';

/** 구조적 식별키 — 자유서술 memo 문자열에 의존하면 손수납('보증금 충당'·'보증금상계')을 놓쳐 이중차감된다. */
export const DEPOSIT_OFFSET_KIND = 'deposit-offset';

export function hasDepositOffsetPayment(rec: EntityRecord): boolean {
  const pays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  return pays.some((p) => {
    if (String(p.kind || '') === DEPOSIT_OFFSET_KIND) return true;
    // 손수납·구버전 호환: 공백·표기 차이를 흡수(보증금 충당 / 보증금상계 / 보증금 상계 …)
    const text = `${String(p.memo || '')} ${String(p.subject || '')}`.replace(/\s/g, '');
    return text.includes('보증금충당') || text.includes('보증금상계');
  });
}

/**
 * ⚠ legacyDepositOffsetNet 폐기(2026-07-31) — view-time 차감은 미수를 기록 없이 소멸시킨다.
 *   레거시(날짜만 찍힌) 계약은 «충당 수납 entry를 실제로 write하는 백필»로 처리한다.
 */

/** 이미 «보증금에서 빠져나간» 충당액 합계 — 정산 재계산 시 보증금을 다시 전액으로 취급하지 않기 위해. */
export function recordedDepositOffsetAmount(rec: EntityRecord): number {
  const pays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  let sum = 0;
  for (const p of pays) {
    const isOffset = String(p.kind || '') === DEPOSIT_OFFSET_KIND
      || `${String(p.memo || '')} ${String(p.subject || '')}`.replace(/\s/g, '').includes('보증금충당')
      || `${String(p.memo || '')} ${String(p.subject || '')}`.replace(/\s/g, '').includes('보증금상계');
    if (isOffset) sum += Number(p.amount) || 0;
  }
  return Math.max(0, Math.round(sum));
}
