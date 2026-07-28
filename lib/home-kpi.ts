/**
 * 대시보드(관제 콕핏) — 표시·합성 헬퍼.
 * 집계 SSOT = computeDashboard · computeKPI/kpiByCompany · buildCashLedger · selectReceivables.
 * 페이지에서 filter/reduce 손롤 금지.
 */
import type { EntityRecord } from './intake/entities';
import { COMPANIES, companyDisplay } from './companies';
import { computeKPI, kpiByCompany, type KPI } from './kpi';
import { buildCashLedger } from './finance/cash-ledger';
import { groupOfLabel } from './payments/ledger-subjects';
import { won, type SheetCol } from '@/components/ui';

export function softVal(loading: boolean, n: number | string): number | string {
  return loading ? '…' : n;
}

/** 이번 달(YYYY-MM) 영업손익 = 영업수입 − 영업비용. cash-ledger + ledger-subjects SSOT. */
export function thisMonthOperatingProfit(
  bank: EntityRecord[],
  card: EntityRecord[],
  today: string,
): number {
  const ym = today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(ym)) return 0;
  let inc = 0;
  let exp = 0;
  for (const r of buildCashLedger(bank, card)) {
    if (String(r.date || '').slice(0, 7) !== ym) continue;
    if (groupOfLabel(r.category) !== '영업') continue;
    inc += r.inAmt;
    exp += r.outAmt;
  }
  return inc - exp;
}

export function dashboardCompanyRows(
  contracts: EntityRecord[],
  vehicles: EntityRecord[],
  today: string,
): KPI[] {
  return kpiByCompany(contracts, vehicles, today, COMPANIES);
}

export function dashboardTotalKpi(
  contracts: EntityRecord[],
  vehicles: EntityRecord[],
  today: string,
): KPI {
  return computeKPI(contracts, vehicles, today);
}

export const DASHBOARD_CO_COLS: SheetCol<KPI>[] = [
  { key: 'co', label: '법인', render: (k) => companyDisplay(k.companyId), text: (k) => companyDisplay(k.companyId) },
  { key: 'held', label: '보유', align: 'r', sortNum: true, render: (k) => k.totalVehicles, text: (k) => k.totalVehicles },
  { key: 'run', label: '운행', align: 'r', sortNum: true, render: (k) => k.running, text: (k) => k.running },
  { key: 'idle', label: '휴차', align: 'r', sortNum: true, render: (k) => k.idle, text: (k) => k.idle },
  { key: 'util', label: '가동률', align: 'r', sortNum: true, render: (k) => `${k.util}%`, text: (k) => k.util },
  {
    key: 'misu', label: '운행중 미수', align: 'r', sortNum: true,
    render: (k) => (k.misuActive > 0 ? won(k.misuActive) : '—'),
    text: (k) => k.misuActive,
  },
  {
    key: 'total', label: '총 미수', align: 'r', sortNum: true,
    render: (k) => (k.totalUnpaid > 0 ? won(k.totalUnpaid) : '—'),
    text: (k) => k.totalUnpaid,
  },
];
