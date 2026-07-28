/**
 * 홈 관제 대시보드 — 표시 헬퍼만.
 * 집계 SSOT = computeDashboard · buildAgenda · selectPendingWork. 여기서 재집계 금지.
 */
import type { AgendaItem } from './agenda';

export const HOME_AGENDA_PREVIEW = 5;

export function softVal(loading: boolean, n: number | string): number | string {
  return loading ? '…' : n;
}

export function ddayLabel(d: number): string {
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

/** 어김 → 임박 우선, dday·날짜순. 관제 미리보기용. */
export function agendaPreview(items: AgendaItem[], cap = HOME_AGENDA_PREVIEW): AgendaItem[] {
  const rank = (s: AgendaItem['status']) => (s === '어김' ? 0 : s === '임박' ? 1 : 2);
  return items
    .filter((a) => a.status === '어김' || a.status === '임박')
    .sort((a, b) => rank(a.status) - rank(b.status) || a.dday - b.dday || a.date.localeCompare(b.date))
    .slice(0, cap);
}
