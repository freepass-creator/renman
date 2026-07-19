/**
 * 시드 — 적용 3사(스위치플랜·프라임구독·손오공렌터카).
 *   switchplan 팩 = lib/migrate/pack (단일 진입). 모드는 NEXT_PUBLIC_MIGRATE_MODE.
 *   prime·sonogong = 데모 샘플.
 */
import { getStore } from './store';
import { ENTITY_LIST, type EntityRecord } from './intake/entities';
import { COMPANIES } from './companies';
import { buildCompanyPack } from './migrate/pack';
import { buildDemoPack } from './seed-demo';

type Pack = Record<string, EntityRecord[]>;

export async function seedSampleData(companyId: string): Promise<{ total: number; perEntity: Record<string, number> }> {
  const store = getStore();
  const pack = await buildCompanyPack(companyId);
  const perEntity: Record<string, number> = {};
  let total = 0;
  const jobs = ENTITY_LIST.map((e) => ({ key: e.key, recs: pack[e.key] || [] })).filter((j) => j.recs.length);
  const results = await Promise.all(jobs.map((j) => store.save(j.key, companyId, j.recs).then((r) => ({ key: j.key, saved: r.saved }))));
  for (const r of results) { perEntity[r.key] = r.saved; total += r.saved; }
  return { total, perEntity };
}

/** 데모만 빠르게 넣기 — 실데이터 없이 UI 채울 때. */
export async function seedDemoData(companyId: string): Promise<{ total: number; perEntity: Record<string, number> }> {
  const store = getStore();
  const pack = buildDemoPack(companyId);
  const perEntity: Record<string, number> = {};
  let total = 0;
  const jobs = ENTITY_LIST.map((e) => ({ key: e.key, recs: pack[e.key] || [] })).filter((j) => j.recs.length);
  const results = await Promise.all(jobs.map((j) => store.save(j.key, companyId, j.recs).then((r) => ({ key: j.key, saved: r.saved }))));
  for (const r of results) { perEntity[r.key] = r.saved; total += r.saved; }
  return { total, perEntity };
}

/** 현재 보기 스코프에 시드 — 합본이면 전 회사, 아니면 현재 회사. */
export async function seedForScope(companyId: string, scopeAll: boolean): Promise<{ total: number; targets: string[] }> {
  const targets = scopeAll ? COMPANIES : [companyId].filter(Boolean);
  let total = 0;
  for (const c of targets) total += (await seedSampleData(c)).total;
  return { total, targets };
}

/** 시드(및 이후 추가분) 전체 비우기 — 로컬 키 제거. */
export function clearSampleData(companyId: string): void {
  if (typeof window === 'undefined') return;
  for (const e of ENTITY_LIST) localStorage.removeItem(`jpkerp6:${companyId}:${e.key}`);
}
