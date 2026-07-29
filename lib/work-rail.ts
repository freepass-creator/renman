/**
 * 원장 행 rail 판정 — status/priority·도메인 축.
 * fleetRail/statusRank는 함대 전용(재사용 금지). 원자 RailTone만 공용.
 * 정상(진행·완료)=무색. 시각 = 좌측 RailDot(6px). 세로선·행 틴트 금지.
 */
import type { CSSProperties } from 'react';
import { ROW_RAIL_TONE_VAR, ROW_RAIL_VAR, railToneColor, type RailTone } from '@/components/ui';

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

/**
 * ExcelSheet rowStyle용 — RailTone → CSS 변수(색·톤명).
 * ExcelSheet가 첫 칸에 RailDot을 찍는다. none=undefined.
 */
export function workRailStyle(tone: RailTone): CSSProperties | undefined {
  if (tone === 'none') return undefined;
  return {
    [ROW_RAIL_VAR]: railToneColor(tone),
    [ROW_RAIL_TONE_VAR]: tone,
  } as CSSProperties;
}
