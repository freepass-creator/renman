// 경영 지표(KPI) — 가동률·미수 aging·부채·자산·월청구. 멀티법인 비교.
//   가동 = linkFleet/classifyVehicle SSOT. 미수 = 운행중/반납/합계 (dashboard summary와 동일).
import type { EntityRecord } from './intake/entities';
import { computeContractView } from './contract-ops';
import { linkFleet } from './domain/model';
import { selectReceivables } from './snapshot/selectors';

export interface KPI {
  companyId: string;
  totalVehicles: number; running: number; idle: number; util: number;
  totalUnpaid: number; unpaidCount: number;
  misuActive: number; misuReturned: number;
  aging: [number, number, number, number]; // 0-30 / 31-60 / 61-90 / 90+ (운행중 미수)
  loanRemaining: number; assetValue: number;
  monthlyBilled: number; activeContracts: number; expiring30: number;
  debtRatio: number; // 부채(할부잔여)/자산(매입가) %
}

export function computeKPI(contracts: EntityRecord[], vehicles: EntityRecord[], today: string, companyId = ''): KPI {
  const views = contracts.map((c) => computeContractView(c, today));
  const fleet = linkFleet(vehicles, contracts, today, views);
  const held = fleet.vehicles.filter((n) => n.ownership !== '처분완료');
  const running = held.filter((n) => n.utilization === '운행');
  const idle = held.filter((n) => n.utilization === '유휴');
  const util = held.length ? Math.round((running.length / held.length) * 100) : 0;
  const active = views.filter((v) => v.status === '운행');
  const recv = selectReceivables(contracts, today);
  const aging: [number, number, number, number] = [0, 0, 0, 0];
  for (const v of views) {
    if (v.net <= 0 || v.ended) continue;
    const d = v.overdueDays;
    if (d <= 30) aging[0] += v.net; else if (d <= 60) aging[1] += v.net; else if (d <= 90) aging[2] += v.net; else aging[3] += v.net;
  }
  let monthlyBilled = 0;
  for (const v of active) monthlyBilled += v.monthlyRent;
  const loanRemaining = held.reduce((s, n) => s + (Number(n.veh.loanRemainingPrincipal) || 0), 0);
  const assetValue = held.reduce((s, n) => s + (Number(n.veh.acquisitionPrice) || 0), 0);
  const expiring30 = active.filter((v) => v.dday != null && v.dday >= 0 && v.dday <= 30).length;
  return {
    companyId, totalVehicles: held.length, running: running.length, idle: idle.length, util,
    totalUnpaid: recv.total, unpaidCount: recv.unpaidCount, misuActive: recv.misuActive, misuReturned: recv.misuReturned, aging,
    loanRemaining, assetValue, monthlyBilled,
    activeContracts: active.length, expiring30,
    debtRatio: assetValue > 0 ? Math.round((loanRemaining / assetValue) * 100) : 0,
  };
}

export function kpiByCompany(contracts: EntityRecord[], vehicles: EntityRecord[], today: string, companies: string[]): KPI[] {
  return companies
    .map((co) => computeKPI(contracts.filter((c) => String(c.companyId) === co), vehicles.filter((v) => String(v.companyId) === co), today, co))
    .filter((k) => k.totalVehicles > 0 || k.activeContracts > 0);
}
