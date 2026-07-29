/**
 * 업무 원장 행 rail — status/priority 축.
 * fleetRail/statusRank는 함대 전용(재사용 금지). 원자 RailTone만 공용.
 * 정상(진행·완료)=무색. rail 색은 예외(지연·미배정·긴급)만.
 */
import type { CSSProperties } from 'react';
import type { RailTone } from '@/components/ui';

export function workRail(r: {
  status?: string;
  priority?: string;
  nest?: string;
  plate?: string;
  contractKey?: string;
}): RailTone {
  if (r.nest === 'penalty-bucket') return 'brand';
  const st = String(r.status || '');
  const pri = String(r.priority || '');
  if (/지연|미매칭|경과|미처리/.test(st)) return 'danger';
  if (/긴급/.test(pri)) return 'danger';
  if (st === '미배정' || (!r.plate && !/완료|종결/.test(st))) return 'warn';
  if (/대기|보류/.test(st)) return 'warn';
  if (/진행|완료|종결|completed/.test(st)) return 'none';
  if (/높음/.test(pri)) return 'violet';
  return 'mute';
}

/** ExcelSheet rowStyle용 — RailTone → 좌측 3px (토큰만). 정상(none)=무레일. */
export function workRailStyle(tone: RailTone): CSSProperties | undefined {
  if (tone === 'none') return undefined;
  const color =
    tone === 'brand' ? 'var(--brand)'
    : tone === 'danger' ? 'var(--red-text)'
    : tone === 'warn' ? 'var(--amber-text)'
    : tone === 'violet' ? 'var(--purple-text)'
    : tone === 'ok' ? 'var(--green-text)'
    : 'var(--text-weak)';
  return { boxShadow: `inset 3px 0 0 ${color}` };
}
