'use client';
import { useSyncExternalStore } from 'react';

// 모바일 여부 — 2열→1열, 상단바→하단바 등 반응형 스위치. 웹·모바일 양립.
// useSyncExternalStore: 첫 렌더에서 실제 폭을 동기 확정 → 마운트 후 setState 재렌더로 인한
// 데스크톱→모바일 레이아웃 점프/깜빡임(FOUC) 제거.
// 서버 스냅샷 = 데스크톱/와이드 가정 — 직원은 통상 와이드 모니터가 기본.
function subscribe(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

export function useIsMobile(bp = 760): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' ? window.innerWidth < bp : false),
    () => false,
  );
}

/** 최소 폭 이상 = true. SSR·첫 페인트는 true(와이드 모니터 기본). */
export function useMinWidth(bp: number): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' ? window.innerWidth >= bp : true),
    () => true,
  );
}

/** 자산상세 등 ERP 작업면 폭 티어 — 직원 와이드 모니터 기본. */
export type DeskTier = 'phone' | 'desk' | 'wide' | 'ultra';
export function useDeskTier(): DeskTier {
  const phone = useIsMobile(760);
  const wide = useMinWidth(1200);
  const ultra = useMinWidth(1600);
  if (phone) return 'phone';
  if (ultra) return 'ultra';
  if (wide) return 'wide';
  return 'desk'; // 760~1199 — 열 축소 · 세로 스크롤
}
