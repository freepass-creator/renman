/** 계약 날짜 헬퍼 SSOT — contract-ops 코어와 patches·settlement·filters 공용(순환참조 방지). */

/** 오늘(KST, yyyy-mm-dd) — 서버/브라우저 로컬 TZ 무관. `new Date().toISOString()`(UTC)은
 *  KST 00:00~09:00 구간에 하루 이르므로(미수 도래·D-day·기록일 오작동) 반드시 이 함수로. */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD…' → 'YYYY-MM-DD'(형식 아니면 ''). */
export function ymd(d: unknown): string {
  const s = String(d || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

/** target까지 남은 일수(음수=경과). target 없으면 null. */
export function ddayFrom(today: string, target: string): number | null {
  if (!target) return null;
  return Math.round((new Date(target).getTime() - new Date(today).getTime()) / 86400000);
}

/** date + months (손상 날짜=Invalid → ''로 방어, RangeError 방지). */
export function addMonthsIso(date: string, months: number): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** from~to 사이 개월수(b−a, to≤from이면 0). 중도해지 잔여개월 계산용. */
export function monthsBetweenIso(from: string, to: string): number {
  if (!from || !to || to <= from) return 0;
  const a = new Date(from), b = new Date(to);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * 두 계약의 대여기간이 겹치는가 — 같은 차량 이중배차 판정 SSOT.
 * 시작일은 `startDate` 없으면 `deliveredDate`, 종료일 없으면 무기한(9999-12-31).
 * ★운영 스냅샷(doubleBooking)과 계약서 투입 검사가 같은 규칙을 써야 한다 —
 *   한쪽만 고치면 「투입 때는 통과, 대시보드에선 충돌」이 된다.
 */
export function contractPeriodOverlaps(a: ContractPeriodLike, b: ContractPeriodLike): boolean {
  const as = String(a.startDate || a.deliveredDate || '');
  const ae = String(a.endDate || '9999-12-31');
  const bs = String(b.startDate || b.deliveredDate || '');
  const be = String(b.endDate || '9999-12-31');
  if (!as || !bs) return false;
  return as <= be && bs <= ae;
}

export type ContractPeriodLike = {
  startDate?: unknown;
  deliveredDate?: unknown;
  endDate?: unknown;
};
