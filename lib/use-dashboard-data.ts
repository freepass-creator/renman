'use client';
/**
 * 대시보드 공용 데이터 훅 — 홈(app/page.tsx)과 담당자 워크벤치(app/ops)가 같은 로딩 + 같은 `D` 계산을 재사용.
 * 회사 스코프(companyId)로 6종 엔티티를 로드하고, 'jpk:saved' 이벤트에 자동 갱신.
 *   soft-load: listsCached면 스피너 생략.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from './session';
import { getStore, listErrorFor, listsCached, subscribeListErrors } from './store';
import { withTimeout } from './async';
import { type EntityRecord } from './intake/entities';
import { computeDashboard } from './operating-snapshot';
import { TODAY } from './dashboard-consts';
import { ALL_COMPANIES } from './companies';

export type DashboardData = ReturnType<typeof useDashboardData>;

const DASH_KEYS = ['contract', 'vehicle', 'insurance', 'bank_tx', 'history', 'penalty', 'inbox', 'work_item'] as const;

export function useDashboardData(allScopeCompanies?: readonly string[]) {
  const { companyId } = useSession();
  const scopedCompanyKey = companyId === ALL_COMPANIES && allScopeCompanies?.length
    ? [...new Set(allScopeCompanies)].sort().join('|')
    : companyId;
  const scopedCompanyIds = useMemo(
    () => scopedCompanyKey.includes('|') ? scopedCompanyKey.split('|') : [scopedCompanyKey],
    [scopedCompanyKey],
  );
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [insurances, setInsurances] = useState<EntityRecord[]>([]);
  const [bankTx, setBankTx] = useState<EntityRecord[]>([]);
  const [history, setHistory] = useState<EntityRecord[]>([]);
  const [penalties, setPenalties] = useState<EntityRecord[]>([]);
  const [inbox, setInbox] = useState<EntityRecord[]>([]);
  const [workItems, setWorkItems] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const loadedCompany = useRef<string | null>(null);

  useEffect(() => {
    const store = getStore();
    const isInitial = loadedCompany.current !== scopedCompanyKey;
    const warm = scopedCompanyIds.every((id) => listsCached(DASH_KEYS, id));
    if (isInitial && !warm) setLoading(true);
    let cancelled = false;
    const listScoped = async (entity: typeof DASH_KEYS[number]) => (await Promise.all(
      scopedCompanyIds.map((id) => store.list(entity, id)),
    )).flat();
    withTimeout(Promise.all([
      listScoped('contract'), listScoped('vehicle'), listScoped('insurance'),
      listScoped('bank_tx'), listScoped('history'), listScoped('penalty'),
      listScoped('inbox').catch(() => [] as EntityRecord[]),
      listScoped('work_item').catch(() => [] as EntityRecord[]),
    ]), 15_000, '대시보드 로드')
      .then(([cs, vs, ins, bt, hs, ps, ib, wi]) => {
        if (cancelled) return;
        setContracts(cs); setVehicles(vs); setInsurances(ins); setBankTx(bt); setHistory(hs); setPenalties(ps); setInbox(ib); setWorkItems(wi);
        // store.list는 실패해도 빈 배열로 resolve → 지표 0이 «문제 없음»으로 위장되지 않게 실패를 표면화.
        setError(scopedCompanyIds.map((id) => listErrorFor(DASH_KEYS, id)).filter(Boolean).join(' · ') || null);
        setLoading(false); loadedCompany.current = scopedCompanyKey;
      })
      .catch((e) => { if (!cancelled) { setError((e as Error).message || '조회 실패'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scopedCompanyIds, scopedCompanyKey, tick]);

  useEffect(() => subscribeListErrors(() => setError(
    scopedCompanyIds.map((id) => listErrorFor(DASH_KEYS, id)).filter(Boolean).join(' · ') || null,
  )), [scopedCompanyIds]);

  useEffect(() => {
    function onSaved() { setTick((t) => t + 1); }
    window.addEventListener('jpk:saved', onSaved);
    return () => window.removeEventListener('jpk:saved', onSaved);
  }, []);

  const D = useMemo(() => computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY), [contracts, vehicles, insurances, penalties, bankTx]);

  return { D, contracts, vehicles, insurances, bankTx, history, penalties, inbox, workItems, loading, error };
}
