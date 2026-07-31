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
 * ExcelSheet rowStyle용 — 2026-07-31 사장님 확정: 상태 신호는 «배지 색으로만».
 * 행 배경 틴트·좌측 점·inset 선 전부 금지 → 항상 undefined.
 * (분류/상태 컬럼+배지가 신호를 담당. 시그니처는 유지 — 원장 배선 무변경.)
 */
export function workRailStyle(_tone: RailTone): CSSProperties | undefined {
  return undefined;
}
