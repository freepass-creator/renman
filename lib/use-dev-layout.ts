'use client';
/**
 * 개발용 레이아웃 강제 — 웹/모바일을 번갈아 보기 위한 스위치.
 * localStorage 'renman:dev:layout' = 'auto' | 'mobile' | 'web'. 기본 auto(= useIsMobile 판정).
 * 화면은 `useDevLayout()` 값이 auto 가 아니면 그것을 우선한다.
 */
import { useSyncExternalStore } from 'react';

export type DevLayout = 'auto' | 'mobile' | 'web';
const KEY = 'renman:dev:layout';
const EVT = 'renman:dev-layout';

function read(): DevLayout {
  if (typeof window === 'undefined') return 'auto';
  const v = window.localStorage.getItem(KEY);
  return v === 'mobile' || v === 'web' ? v : 'auto';
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb); };
}

export function useDevLayout(): DevLayout {
  return useSyncExternalStore(subscribe, read, () => 'auto');
}

export function setDevLayout(v: DevLayout) {
  if (typeof window === 'undefined') return;
  if (v === 'auto') window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, v);
  window.dispatchEvent(new Event(EVT));
}

export function nextDevLayout(v: DevLayout): DevLayout {
  return v === 'auto' ? 'mobile' : v === 'mobile' ? 'web' : 'auto';
}
