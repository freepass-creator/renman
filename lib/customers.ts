// 손님(고객) 2차축 — 계약을 고객(연락처/이름) 단위로 집계. 재계약·추심·고객이력이 여기서.
// 순수 primitive. 고객 마스터가 따로 없어도 계약에서 파생(연락처 우선 식별).
import type { EntityRecord } from './intake/entities';
import { computeContractView } from './contract-ops';

export interface CustomerAgg {
  key: string;          // 식별키(연락처 우선, 없으면 이름)
  name: string;
  phone: string;
  companyId: string;
  contracts: EntityRecord[];
  activeCount: number;  // 진행 중 계약 수
  totalUnpaid: number;  // 순미수 합
  vehicles: string[];   // 이용 차량번호들
  lastEnd: string;      // 최근 계약 종료/반납일(재계약 판단)
  licenseNo: string;
}

/** 손님 식별키 SSOT — phone 우선, 없으면 name. openCustomer·집계·360이 동일 규칙. */
export function customerKey(name: unknown, phone: unknown): string {
  const p = String(phone || '').trim();
  const n = String(name || '').trim();
  return p || n;
}

export function aggregateCustomers(contracts: EntityRecord[], today: string): CustomerAgg[] {
  const map = new Map<string, CustomerAgg>();
  for (const c of contracts) {
    const name = String(c.contractorName || '').trim();
    const phone = String(c.contractorPhone || '').trim();
    if (!name && !phone) continue;
    const key = customerKey(name, phone);
    let agg = map.get(key);
    if (!agg) {
      agg = { key, name, phone, companyId: String(c.companyId || ''), contracts: [], activeCount: 0, totalUnpaid: 0, vehicles: [], lastEnd: '', licenseNo: String(c.contractorLicenseNo || '') };
      map.set(key, agg);
    }
    agg.contracts.push(c);
    if (!agg.name && name) agg.name = name;
    if (!agg.licenseNo && c.contractorLicenseNo) agg.licenseNo = String(c.contractorLicenseNo);
    const v = computeContractView(c, today);
    if (v.status === '운행') agg.activeCount++;
    agg.totalUnpaid += v.net;
    const plate = String(c.plate || '');
    if (plate && !agg.vehicles.includes(plate)) agg.vehicles.push(plate);
    const end = String(c.returnedDate || c.endDate || '').slice(0, 10);
    if (end > agg.lastEnd) agg.lastEnd = end;
  }
  return Array.from(map.values());
}

/** 한 손님만 — 전 계약 aggregate 후 find 금지. 매칭 계약만 집계. */
export function findCustomer(contracts: EntityRecord[], key: string, today: string): CustomerAgg | null {
  if (!key) return null;
  const matched: EntityRecord[] = [];
  for (const c of contracts) {
    if (customerKey(c.contractorName, c.contractorPhone) === key) matched.push(c);
  }
  if (!matched.length) return null;
  return aggregateCustomers(matched, today)[0] || null;
}
