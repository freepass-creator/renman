/**
 * 반납 시 마지막 회차 일할계산 — 자동 차감 entry 추가.
 *
 * 사용자 정책: 입금은 거의 자동(계좌 업로드·자동이체)이라 반납 일할도 자동.
 * 반납 처리 시점에 호출하면 마지막 회차에 '반납 일할' 할인 entry 자동 삽입 → recalcContract 거치며
 * unpaidAmount 자동 차감. idempotent (이미 entry 있으면 skip).
 *
 * 회차 기간 계산:
 *  · 시작 = 회차 dueDate
 *  · 종료 = 다음 회차 dueDate (없으면 dueDate + 30일)
 *  · 사용일 = returnedDate - 시작
 *  · 환불액 = amount × (총일 - 사용일) / 총일
 */

import type { Contract, DiscountEntry } from './types';

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400_000);
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function applyReturnedProration(contract: Contract, returnedDate: string): Contract {
  if (!contract.schedules || contract.schedules.length === 0) return contract;
  if (!returnedDate) return contract;

  const sorted = [...contract.schedules].sort((a, b) => a.seq - b.seq);
  // 반납일이 속한 회차 — dueDate ≤ returnedDate < 다음 dueDate
  const last = sorted.find((s, i) => {
    if (s.dueDate > returnedDate) return false;
    const next = sorted[i + 1];
    const nextDue = next?.dueDate ?? addDaysIso(s.dueDate, 30);
    return returnedDate < nextDue;
  });
  if (!last) return contract;

  // 이미 자동 일할 entry 있으면 skip (idempotent)
  if ((last.discounts ?? []).some((d) => d.reason === '반납 일할')) return contract;

  const nextIdx = sorted.findIndex((s) => s.seq === last.seq) + 1;
  const next = sorted[nextIdx];
  const endDate = next?.dueDate ?? addDaysIso(last.dueDate, 30);
  const totalDays = daysBetween(last.dueDate, endDate);
  const usedDays = Math.max(0, daysBetween(last.dueDate, returnedDate));
  if (totalDays <= 0 || usedDays >= totalDays) return contract;

  const refund = Math.round(last.amount * (totalDays - usedDays) / totalDays);
  if (refund <= 0) return contract;

  const entry: DiscountEntry = {
    date: returnedDate,
    amount: refund,
    reason: '반납 일할',
    memo: `반납일 ${returnedDate} · 사용 ${usedDays}/${totalDays}일`,
    at: new Date().toISOString(),
  };

  const updated = contract.schedules.map((s) => {
    if (s.seq !== last.seq) return s;
    return { ...s, discounts: [...(s.discounts ?? []), entry] };
  });

  return { ...contract, schedules: updated };
}
