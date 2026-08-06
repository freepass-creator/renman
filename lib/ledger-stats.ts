/** 원장 통계 배지 SSOT — 페이지 `.filter().length` / `.reduce()` 손롤 금지. */
import { isVehicleHeld, type Fleet } from '@/lib/domain/model';
import { type AssetMasterRow, type ContractMasterRow } from '@/lib/master-ledgers';
import { normPlate } from '@/lib/plate';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { dday } from '@/lib/dashboard-consts';
import type { FleetRow } from '@/lib/sheet-rows';
import type { BankAccountRow, CashRow } from '@/lib/finance/cash-ledger';
import { isUnclassified } from '@/lib/payments/ledger-subjects';

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

export type FleetStatusStats = {
  heldN: number;
  runN: number;
  utilPct: number;
  /** @deprecated 운영현황은 계약유지 미수만 — maintainedNetSum 사용 */
  netSum: number;
  maintainedNetSum: number;
  inspSoon: number;
};

/**
 * 운영현황 배지.
 *   held/run = 검색 스코프(`searched`) 중 `isVehicleHeld` · 미수합·검사임박 = 표에 보이는 행(`rows`).
 *   미수 = 계약유지분만(종료 미수는 /risk·계약).
 */
export function summarizeFleetStatusStats(searched: FleetRow[], rows: FleetRow[]): FleetStatusStats {
  let heldN = 0, runN = 0;
  for (const r of searched) {
    if (!isVehicleHeld(r)) continue;
    heldN++;
    if (r.util === '운행') runN++;
  }
  let maintainedNetSum = 0, inspSoon = 0;
  for (const r of rows) {
    maintainedNetSum += Math.max(0, r.maintainedNet);
    const d = dday(r.inspectionTo);
    if (d != null && d <= 30) inspSoon++;
  }
  return {
    heldN,
    runN,
    utilPct: heldN ? Math.round((runN / heldN) * 100) : 0,
    netSum: maintainedNetSum,
    maintainedNetSum,
    inspSoon,
  };
}

export type CashTxStats = {
  inSum: number;
  outSum: number;
  cmsPendingCount: number;
  cmsPendingSum: number;
  alertN: number;
  unclN: number;
};

/** 자금 입출금/CMS/카드 표 배지 — nest 규칙 포함. */
export function summarizeCashTxStats(rows: CashRow[]): CashTxStats {
  let inSum = 0, outSum = 0, cmsPendingCount = 0, cmsPendingSum = 0, alertN = 0, unclN = 0;
  for (const r of rows) {
    if (r.raw.dataAlert || r.nest === 'cms-pending') alertN++;
    if (r.nest === 'cms-pending') {
      cmsPendingCount++;
      cmsPendingSum += r.inAmt;
      continue;
    }
    if (r.nest === 'cms-item') continue;
    inSum += r.inAmt;
    outSum += r.outAmt;
    if (isUnclassified(r.category)) unclN++;
  }
  return { inSum, outSum, cmsPendingCount, cmsPendingSum, alertN, unclN };
}

export type AccountLedgerStats = {
  total: number;
  active: number;
};

export function summarizeAccountLedgerStats(rows: BankAccountRow[]): AccountLedgerStats {
  let active = 0;
  for (const r of rows) {
    if (r.status === '사용중') active++;
  }
  return { total: rows.length, active };
}

/**
 * PeriodBar `latest` — 행에서 날짜 필드 max.
 * 페이지 `reduce` 손롤 금지. pick이 빈 문자열이면 스킵.
 */
export function latestDateOf<T>(
  rows: readonly T[],
  pick: (row: T) => string | null | undefined,
  fallback: string,
): string {
  let latest = fallback;
  for (const row of rows) {
    const date = pick(row);
    if (date && date > latest) latest = date;
  }
  return latest;
}
