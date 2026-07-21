'use client';
/**
 * 엔티티 목록 로드 SSOT — 모든 목록 페이지가 이 훅 하나로 통일한다.
 *   · companyId를 세션에서 자체 해결 → 페이지가 배선하지 않음(합본 분기는 store가 투명 처리).
 *   · opts.companyId 로 세션과 다른 법인 조회 가능(IngestDialog 합본 선택 등).
 *   · listsCached(warm)면 스피너를 건너뜀 → **페이지 전환 시 스피너 한 프레임 번쩍(튐) 제거**.
 *   · 재조회 시 이전 데이터 유지(keep-content) → 저장 후 화면이 비었다 다시 뜨지 않음.
 *   · 'jpk:saved' 구독 내장(useReloadOnSaved) → 페이지별 손롤 리스너 금지, 저장반영 누락 방지.
 * 페이지 규칙: useState(loading)+useEffect(load)+getStore().list 보일러플레이트를 직접 쓰지 말 것.
 *   const { data: [cs, hs], loading } = useEntityLists(['contract', 'history']);
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';
import { getStore, listsCached } from './store';
import { useReloadOnSaved } from './use-reload-on-saved';
import { type EntityRecord } from './intake/entities';

export function useEntityLists(keys: readonly string[], opts?: { companyId?: string }): {
  data: EntityRecord[][];
  loading: boolean;
  reload: () => void;
} {
  const { companyId: sessionCo } = useSession();
  const companyId = opts?.companyId || sessionCo;
  const keyStr = keys.join(',');                                  // 배열 리터럴 identity 변동 방지(deps 안정화)
  const ks = useMemo(() => keyStr.split(',').filter(Boolean), [keyStr]);
  const [data, setData] = useState<EntityRecord[][]>(() => ks.map(() => []));
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!ks.length) { setData([]); setLoading(false); return; }
    if (!silent && !listsCached(ks, companyId)) setLoading(true);  // 캐시 있으면 스피너 없이 즉시 렌더
    Promise.all(ks.map((k) => getStore().list(k, companyId)))
      .then((res) => { setData(res); setLoading(false); })         // 이전 데이터는 교체 시점까지 유지
      .catch(() => setLoading(false));
  }, [ks, companyId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  return { data, loading, reload: useCallback(() => load(false), [load]) };
}

/** 단일 엔티티용 축약 — const { rows, loading } = useEntityList('contract') */
export function useEntityList(key: string, opts?: { companyId?: string }): { rows: EntityRecord[]; loading: boolean; reload: () => void } {
  const keys = useMemo(() => [key], [key]);
  const { data, loading, reload } = useEntityLists(keys, opts);
  return { rows: data[0] ?? [], loading, reload };
}
