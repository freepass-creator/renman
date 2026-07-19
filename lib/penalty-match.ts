/** 과태료 → 계약 자동매칭 — matchDriver SSOT 위 얇은 래퍼.
 *   위반 차량(plate) + 위반시점에 운행 중이던 계약 → 책임자(임차인).
 *   기간 판정·최신 계약 우선은 penalty-reassign.matchDriver 한곳만. */
import { type EntityRecord } from './intake/entities';
import { matchDriver } from './penalty-reassign';

export type PenaltyMatch = { contract: EntityRecord; renter: string } | null;

export function matchPenalty(penalty: EntityRecord, contracts: EntityRecord[]): PenaltyMatch {
  const hit = matchDriver(penalty, contracts);
  if (!hit) return null;
  return { contract: hit, renter: String(hit.contractorName || '') };
}
