/** 계약 날짜 헬퍼 SSOT — contract-ops 코어와 patches·settlement·filters 공용(순환참조 방지). */

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
