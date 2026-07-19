'use client';
/** 전역 토스트 — 어디서든 toast('저장 완료') 호출. ToastHost가 렌더. (완료·실패 피드백 일관화) */
import { haptic } from './haptics';
export type ToastKind = 'success' | 'error' | 'info';

export function toast(message: string, kind: ToastKind = 'success'): void {
  if (typeof window === 'undefined' || !message) return;
  if (kind === 'error') haptic.error(); else if (kind === 'success') haptic.success(); // 완료·실패 촉감
  window.dispatchEvent(new CustomEvent('jpk:toast', { detail: { message, kind, id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}` } }));
}
export const toastError = (m: string) => toast(m, 'error');
export const toastInfo = (m: string) => toast(m, 'info');
