/**
 * 차량 "위치"(현재 소재) 통일 도출 — 누가/어디에 지금 그 차를 가지고 있나.
 *   · 대여중(활성계약 있음): 위치 = 계약자명, work = '대여중'
 *   · 유휴: 위치 = 최근 '이동' 활동로그(history, category '이동') title, 없으면 '차고지'
 *           work = 차상태(정비·사고·검사·매각대기)면 그 상태, 아니면 '대기'
 * /asset(휴차 워크벤치)의 위치 표기(최근 '이동' 로그 title)와 동일한 규칙.
 */
import type { EntityRecord } from './intake/entities';

export type VehicleLocation = { location: string; work?: string };

const WORK_STATUSES = ['정비', '사고', '검사', '매각대기'];

/** 활성계약 = 미반납 && 시작 ≤ 오늘 && (만기 없음 || 만기 ≥ 오늘). */
function activeContract(contracts: EntityRecord[], today: string): EntityRecord | null {
  return contracts.find((c) => !c.returnedDate && String(c.startDate || '') <= today && (!c.endDate || String(c.endDate) >= today)) || null;
}

export function deriveLocation(
  v: EntityRecord | null | undefined,
  contracts: EntityRecord[],
  history: EntityRecord[],
  today: string,
): VehicleLocation {
  const active = activeContract(contracts, today);
  if (active) return { location: String(active.contractorName || '—'), work: '대여중' };
  const move = history
    .filter((h) => String(h.category) === '이동')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
  const location = move && move.title ? String(move.title) : '차고지';
  const status = String(v?.status || '');
  const work = WORK_STATUSES.includes(status) ? status : '대기';
  return { location, work };
}

/** 위치 표시 문자열 — "홍길동 · 대여중" / "OO정비소 · 정비 중" / "차고지 · 대기". */
export function locationLabel(loc: VehicleLocation): string {
  const w = loc.work;
  if (!w) return loc.location;
  const suffix = w === '대여중' || w === '대기' ? w : w === '매각대기' ? '매각 대기' : `${w} 중`;
  return `${loc.location} · ${suffix}`;
}
