/**
 * 홈(업무) 화면 문법 — 목록·수행창이 같은 숫자를 쓴다. (design/home-inbox/SPEC.md §4·§8)
 * 색은 토큰(C)만, 크기는 여기 상수만. 페이지에 숫자 하드코딩 금지.
 */
import type { CSSProperties } from 'react';
import { C, SP } from '@/components/ui';

/** 목록 그리드 — 조치 · 대상 · 계약자·차명 · 금액 · 기한 · 담당 */
export const ROW_GRID = '104px 80px minmax(0,1fr) 92px 44px 56px';
export const ROW_GAP = SP[2];
export const ROW_H = 36;
export const ROW_H_M = 54;
export const SEC_H = 26;
export const COLS_H = 26;
export const LIST_W = 660;
export const TOPBAR_H = 44;
export const TOPBAR_H_M = 52;
export const PANE_MAX_W = 760;
export const PAD_X = SP[5] - SP[1]; // 20
export const PAD_X_M = SP[4];       // 16

/** 라벨(열 헤더·섹션·칸 라벨) — 10.5px · 자간 .04em */
export const capStyle: CSSProperties = {
  fontSize: 10.5, letterSpacing: '.04em', fontWeight: 600, color: C.faint, whiteSpace: 'nowrap',
};
export const hairline = `1px solid ${C.line}`;
export const hairlineSoft = `1px solid ${C.line2}`;
export const tabular: CSSProperties = { fontVariantNumeric: 'tabular-nums' };
export const ellipsis: CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** 회사 태그 — 아웃라인 회색(색은 신호에만). */
export const coTagStyle: CSSProperties = {
  display: 'inline-block', flex: 'none', fontSize: 10, lineHeight: '14px', padding: '0 4px', borderRadius: 3,
  border: hairline, color: C.sub, fontStyle: 'normal', fontWeight: 600, letterSpacing: '.02em',
};

/** 키보드 힌트 */
export const kbdStyle: CSSProperties = {
  fontSize: 10, border: hairline, borderRadius: 3, padding: '0 4px', color: C.faint, background: C.card,
  lineHeight: '15px', display: 'inline-block', minWidth: 16, textAlign: 'center', ...tabular,
};

export function dueColor(tone: 'late' | 'today' | 'week' | 'later' | 'done' | 'none'): string {
  if (tone === 'late') return C.danger;
  if (tone === 'today') return C.warn;
  if (tone === 'done') return C.ok;
  if (tone === 'later') return C.faint;
  return C.sub;
}
