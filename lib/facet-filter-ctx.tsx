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
  counts?: Record<string, number>;   // 칩별 매칭 건수(라벨→건수) — erp3식 '라벨(N)'. 없으면 숫자 미표시.
};

type Ctx = {
  api: FacetFilterApi | null;
  setApi: (api: FacetFilterApi | null) => void;
  open: boolean;                                   // 필터 인-플로우 패널 열림(오버레이 아님 — 콘텐츠를 민다)
  setOpen: (o: boolean | ((p: boolean) => boolean)) => void;
};

const FacetFilterCtx = createContext<Ctx>({ api: null, setApi: () => {}, open: true, setOpen: () => {} });

export function FacetFilterProvider({ children }: { children: ReactNode }) {
  const [api, setApiState] = useState<FacetFilterApi | null>(null);
  const setApi = useCallback((next: FacetFilterApi | null) => setApiState(next), []);
  const [open, setOpen] = useState(true);   // 기본 열림(기존 좌측 레일처럼). 검색창 옆 버튼으로 토글.
  const value = useMemo(() => ({ api, setApi, open, setOpen }), [api, setApi, open]);
  return <FacetFilterCtx.Provider value={value}>{children}</FacetFilterCtx.Provider>;
}

export function useFacetFilterApi() {
  return useContext(FacetFilterCtx).api;
}
/** 필터 패널 열림 상태 — 검색창 옆 버튼(토글) ↔ FacetRail(인-플로우 패널) 공유. */
export function useFacetFilterOpen() {
  const c = useContext(FacetFilterCtx);
  return { open: c.open, setOpen: c.setOpen };
}

/** FacetRail 마운트 시 등록. 언마운트·그룹 없으면 해제. */
export function useRegisterFacetFilter(api: FacetFilterApi | null) {
  const { setApi } = useContext(FacetFilterCtx);
  const groups = api?.groups;
  const facets = api?.facets;
  const onToggle = api?.onToggle;
  const onReset = api?.onReset;
  const counts = api?.counts;
  useEffect(() => {
    if (!api || !groups?.length || !onToggle || !onReset) {
      setApi(null);
      return () => setApi(null);
    }
    setApi({ groups, facets: facets ?? new Set(), onToggle, onReset, counts });
    return () => setApi(null);
  }, [api, groups, facets, onToggle, onReset, counts, setApi]);
}
