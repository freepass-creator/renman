/**
 * 원장 행 rail 판정 — status/priority·도메인 축.
 * fleetRail/statusRank는 함대 전용(재사용 금지). 원자 RailTone만 공용.
 * 정상(진행·완료)=무색. 시각 = danger만 `--danger-tint` 배경(좌측 점·세로선 금지).
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

/**
 * ExcelSheet rowStyle용 — danger만 `--danger-tint` 배경.
 * warn/mute/none = 배지만(배경 없음). 좌측 점·inset 선 금지.
 */
export function workRailStyle(tone: RailTone): CSSProperties | undefined {
  if (tone !== 'danger') return undefined;
  return { background: 'var(--danger-tint)' };
}
