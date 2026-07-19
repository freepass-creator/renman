// 빠른 차량 검색 매칭 SSOT — SearchBox·CommandPalette 공통.
//   plate는 normPlate로 비교(공백·O/0·I/1). 번호변경(plateHistory)은 vehicleMatchesPlate.
import type { EntityRecord } from './intake/entities';
import { ENTITIES } from './intake/entities';
import { normPlate, vehicleMatchesPlate } from './plate';

/** 통합 검색 핵심 — 차·계약·손님·보험·과태료·이력 (전 엔티티 fan-out 금지). */
export const SEARCH_CORE_KEYS = ['vehicle', 'contract', 'customer', 'insurance', 'penalty', 'history'] as const;
/** 통합 검색 확장 — 쿼리 3자 이상일 때만(자금·수신함은 대량). */
export const SEARCH_EXTRA_KEYS = ['bank_tx', 'card_tx', 'inbox'] as const;

/** q 길이에 따라 검색 대상 엔티티. */
export function searchEntityKeys(q: string): string[] {
  const keys: string[] = [...SEARCH_CORE_KEYS];
  if (q.trim().length >= 3) keys.push(...SEARCH_EXTRA_KEYS);
  return keys.filter((k) => ENTITIES[k]);
}

export type VehicleSearchHit = { plate: string; label: string; sub: string; veh: EntityRecord };

/** 목록 인페이지 필터 — 공백·대소문자·plate(O/0·I/1) 관대 매칭. q 비면 true. */
export function textMatch(q: string, ...parts: unknown[]): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const nq = normPlate(q);
  return parts.some((p) => {
    const t = String(p ?? '');
    if (!t) return false;
    if (t.toLowerCase().includes(s)) return true;
    return !!(nq && normPlate(t).includes(nq));
  });
}

/** q로 차량·차명·운행중 손님 매칭. 최대 limit건. */
export function matchVehicles(
  q: string,
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  limit = 8,
): VehicleSearchHit[] {
  const s = q.trim();
  if (!s) return [];
  const nq = normPlate(s);
  const nameByPlate = new Map<string, string>();
  for (const c of contracts) {
    if (c.returnedDate) continue;
    const p = normPlate(c.plate);
    if (p && !nameByPlate.has(p)) nameByPlate.set(p, String(c.contractorName || ''));
  }
  const out: VehicleSearchHit[] = [];
  for (const v of vehicles) {
    const plate = String(v.plate || '');
    const np = normPlate(plate);
    const name = nameByPlate.get(np) || '';
    const car = String(v.carName || '');
    const hitPlate = nq ? vehicleMatchesPlate(v, s) || np.includes(nq) : plate.includes(s);
    const hitText = car.includes(s) || name.includes(s);
    if (!hitPlate && !hitText) continue;
    out.push({
      plate,
      label: `${plate}${car ? ` · ${car}` : ''}`,
      sub: name || String(v.status || ''),
      veh: v,
    });
    if (out.length >= limit) break;
  }
  return out;
}
