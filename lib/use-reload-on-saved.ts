'use client';
// 저장 반영 구독 표준 — 목록/현황 페이지는 이 훅 하나로 'jpk:saved'에 재조회. 페이지별 손롤 구독 금지.
//   reload 는 안정 참조(useCallback([deps]))로 넘길 것.
import { useEffect } from 'react';

export function useReloadOnSaved(reload: () => void) {
  useEffect(() => {
    const on = () => reload();
    window.addEventListener('jpk:saved', on);
    return () => window.removeEventListener('jpk:saved', on);
  }, [reload]);
}
