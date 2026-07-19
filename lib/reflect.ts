'use client';
// 반영 엔진(분자) — 회사 실데이터를 깨끗이 적재하고 운영 스냅샷을 산출. jpkerp5 commitAll 대응.
//   페이지 버튼 로직 아님 — 개발도구·홈·어디서든 이 하나를 호출(원자·분자 원칙).
import { getStore } from './store';
import { wipeCompany } from './reset';
import { computeDashboard, type OperatingSummary } from './operating-snapshot';
import { TODAY } from './dashboard-consts';

export type ReflectResult = {
  loaded: { total: number; perEntity: Record<string, number> };
  summary: OperatingSummary;
};

/** 회사 실데이터 반영 — 기존 비우고 최신 적재 → 적재본으로 운영 스냅샷 산출. clean=false면 비우지 않고 추가만. */
export async function reflectCompany(companyId: string, opts: { clean?: boolean } = {}): Promise<ReflectResult> {
  const store = getStore();
  if (opts.clean !== false) await wipeCompany(companyId);
  const { seedSampleData } = await import('./seed');
  const loaded = await seedSampleData(companyId);
  // 적재 직후 다시 읽어(캐시 무효화됨) 같은 집계 엔진으로 스냅샷 산출 — 홈과 동일 계산.
  const [contracts, vehicles, insurances, penalties, bankTx] = await Promise.all([
    store.list('contract', companyId), store.list('vehicle', companyId), store.list('insurance', companyId),
    store.list('penalty', companyId), store.list('bank_tx', companyId),
  ]);
  const D = computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY);
  return { loaded, summary: D.summary };
}
