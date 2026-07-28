/** 원장 통계 배지 SSOT — 페이지 `.filter().length` / `.reduce()` 손롤 금지. */
import { type Fleet } from '@/lib/domain/model';
import { type AssetMasterRow, type ContractMasterRow } from '@/lib/master-ledgers';
import { normPlate } from '@/lib/plate';
import { selectReceivables } from '@/lib/snapshot/selectors';

export type AssetLedgerStats = {
  held: number;
  disposed: number;
  contracted: number;
  idle: number;
  salePending: number;
};

/** 자산 배지 = linkFleet ownership·utilization (status 원장과 동일 축). */
export function summarizeAssetLedgerStats(rows: AssetMasterRow[], fleet: Fleet): AssetLedgerStats {
  let held = 0, disposed = 0, contracted = 0, idle = 0, salePending = 0;
  for (const r of rows) {
    if (r.disposed) disposed++; else held++;
    const n = fleet.byPlate.get(normPlate(r.plate));
    if (!n) continue;
    if (n.ownership === '보유중' && n.utilization === '운행') contracted++;
    else if (n.ownership === '보유중' && n.utilization === '휴차') idle++;
    if (n.ownership === '처분예정') salePending++;
  }
  return { held, disposed, contracted, idle, salePending };
}

export type ContractLedgerStats = {
  active: number;
  riskCount: number;
  riskDebtSum: number;
  endedRiskCount: number;
  endedRiskDebtSum: number;
};

/** 계약 배지 — 건수는 원장 atRisk, 미수합은 selectReceivables SSOT. */
export function summarizeContractLedgerStats(rows: ContractMasterRow[], today: string): ContractLedgerStats {
  let active = 0, riskCount = 0, endedRiskCount = 0;
  for (const r of rows) {
    if (!r.ended) active++;
    if (!r.atRisk) continue;
    if (r.ended) endedRiskCount++;
    else riskCount++;
  }
  const recv = selectReceivables(rows.map((r) => r.raw), today);
  return {
    active,
    riskCount,
    riskDebtSum: recv.misuActive,
    endedRiskCount,
    endedRiskDebtSum: recv.misuReturned,
  };
}
