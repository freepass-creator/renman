'use client';
/**
 * 대시보드 공용 데이터 훅 — 홈(app/page.tsx)과 담당자 워크벤치(app/ops)가 같은 로딩 + 같은 `D` 계산을 재사용.
 * 회사 스코프(companyId)로 6종 엔티티를 로드하고, 'jpk:saved' 이벤트에 자동 갱신.
 *   soft-load: listsCached면 스피너 생략.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from './session';
import { getStore, listsCached } from './store';
import { withTimeout } from './async';
import { type EntityRecord } from './intake/entities';
import { computeDashboard } from './operating-snapshot';
import { TODAY } from './dashboard-consts';

export type DashboardData = ReturnType<typeof useDashboardData>;

const DASH_KEYS = ['contract', 'vehicle', 'insurance', 'bank_tx', 'history', 'penalty', 'inbox'] as const;

export function useDashboardData() {
  const { companyId } = useSession();
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [insurances, setInsurances] = useState<EntityRecord[]>([]);
  const [bankTx, setBankTx] = useState<EntityRecord[]>([]);
  const [history, setHistory] = useState<EntityRecord[]>([]);
  const [penalties, setPenalties] = useState<EntityRecord[]>([]);
  const [inbox, setInbox] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadedCompany = useRef<string | null>(null);

  useEffect(() => {
    const store = getStore();
    const isInitial = loadedCompany.current !== companyId;
    const warm = listsCached(DASH_KEYS, companyId);
    if (isInitial && !warm) setLoading(true);
    let cancelled = false;
    withTimeout(Promise.all([
      store.list('contract', companyId), store.list('vehicle', companyId), store.list('insurance', companyId),
      store.list('bank_tx', companyId), store.list('history', companyId), store.list('penalty', companyId),
      store.list('inbox', companyId).catch(() => [] as EntityRecord[]),
    ]), 15_000, '대시보드 로드')
      .then(([cs, vs, ins, bt, hs, ps, ib]) => {
        if (cancelled) return;
        setContracts(cs); setVehicles(vs); setInsurances(ins); setBankTx(bt); setHistory(hs); setPenalties(ps); setInbox(ib);
        setLoading(false); loadedCompany.current = companyId;
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, tick]);

  useEffect(() => {
    function onSaved() { setTick((t) => t + 1); }
    window.addEventListener('jpk:saved', onSaved);
    return () => window.removeEventListener('jpk:saved', onSaved);
  }, []);

  const D = useMemo(() => computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY), [contracts, vehicles, insurances, penalties, bankTx]);

  return { D, contracts, vehicles, insurances, bankTx, history, penalties, inbox, loading };
}
