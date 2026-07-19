'use client';
/**
 * 모바일 필터 버튼 ↔ FacetRail 연결 SSOT.
 *   모바일: 빠른필터(칩바) 없음 · 섹션을 죽죽 스크롤 · 필터는 검색 옆 버튼→Drawer.
 *   FacetRail이 마운트되면 여기 등록 → WorkbenchBar가 검색 옆에 버튼 표시.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FacetGroup } from '@/lib/lens-filters';

export type FacetFilterApi = {
  groups: FacetGroup[];
  facets: Set<string>;
  onToggle: (label: string) => void;
  onReset: () => void;
};

type Ctx = {
  api: FacetFilterApi | null;
  setApi: (api: FacetFilterApi | null) => void;
};

const FacetFilterCtx = createContext<Ctx>({ api: null, setApi: () => {} });

export function FacetFilterProvider({ children }: { children: ReactNode }) {
  const [api, setApiState] = useState<FacetFilterApi | null>(null);
  const setApi = useCallback((next: FacetFilterApi | null) => setApiState(next), []);
  const value = useMemo(() => ({ api, setApi }), [api, setApi]);
  return <FacetFilterCtx.Provider value={value}>{children}</FacetFilterCtx.Provider>;
}

export function useFacetFilterApi() {
  return useContext(FacetFilterCtx).api;
}

/** FacetRail 마운트 시 등록. 언마운트·그룹 없으면 해제. */
export function useRegisterFacetFilter(api: FacetFilterApi | null) {
  const { setApi } = useContext(FacetFilterCtx);
  const groups = api?.groups;
  const facets = api?.facets;
  const onToggle = api?.onToggle;
  const onReset = api?.onReset;
  useEffect(() => {
    if (!api || !groups?.length || !onToggle || !onReset) {
      setApi(null);
      return () => setApi(null);
    }
    setApi({ groups, facets: facets ?? new Set(), onToggle, onReset });
    return () => setApi(null);
  }, [api, groups, facets, onToggle, onReset, setApi]);
}
