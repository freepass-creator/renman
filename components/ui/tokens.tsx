import type { CSSProperties } from 'react';

/* 공용 UI 토큰 — 최하위 레이어(런타임 import 0). 다른 UI 원자들이 여기서 색·스케일·표스타일을 가져간다.
 * 컨트롤 높이·폰트 = freepass ERP4 와 동기 (CTRL / ctrlH / ctrlFs). */

/* 색은 jpkerp5와 "동일한" globals.css 토큰을 브릿지 — v6에서 검증한 UI를 jpkerp5에 그대로 따다 쓰기 위함. */
export const C = {
  ink: 'var(--text-main)', mute: 'var(--text-sub)', sub: 'var(--text-sub)', faint: 'var(--text-weak)',
  line: 'var(--border)', line2: 'var(--border-soft)', lineStrong: 'var(--border-strong)',
  inverse: 'var(--text-inverse)', card: 'var(--bg-card)',
  bg: 'var(--bg-page)', zebra: 'var(--bg-stripe)', head: 'var(--bg-header)', hover: 'var(--bg-hover)',
  danger: 'var(--red-text)', ok: 'var(--green-text)', warn: 'var(--orange-text)', accent: 'var(--text-link)',
  brand: 'var(--brand)', taupe: 'var(--text-sub)', taupeBg: 'var(--bg-card)', taupeLine: 'var(--border)',
};
export const R = 4; // = --radius (jpkerp5 표준 4px)
export const NUM = "var(--font-mono)";

/* 그림자 SSOT — globals.css --shadow-* 만 씀. rgba 하드코딩 금지. */
export const SH = {
  rest: 'var(--shadow-sm)',
  card: 'var(--shadow)',
  hover: 'var(--shadow-md)',
  pop: 'var(--shadow-lg)',
} as const;

/* 지표 숫자 크기 SSOT — Metric 동일. */
export const METRIC_FS = 18;

/* 스크림(오버레이 배경) SSOT — Modal·Drawer·시트·팔레트·로딩오버레이 전부 이것 하나.
 *   테마 토큰 금지: 스크림은 "뒤를 가리는 어둠"이라 라이트/다크 양쪽에서 어두워야 한다.
 *   위에 올라가는 글자도 항상 흰색(`SCRIM_FG`) — var(--text-inverse)는 다크에서 뒤집혀 안 보인다. */
export const SCRIM = 'rgba(15,23,42,0.40)';
export const SCRIM_FG = '#fff';

/**
 * 컨트롤 높이·폰트 SSOT (= freepass ERP4). 페이지/컴포넌트는 height 숫자 금지 → size·헬퍼만.
 *
 *  웹  md=32 / sm=28
 *  모바일 md=40 / sm=36
 *  입력·독 컨트롤 폰트 모바일=16 고정 (iOS 줌 방지)
 *  칩 = 웹 sm(28) · 모바일 md(40)
 */
export type CtrlSize = 'md' | 'sm';

export const CTRL = {
  md: { web: 32, mobile: 40, fsWeb: 12.5, fsMobile: 16 },
  sm: { web: 28, mobile: 36, fsWeb: 12, fsMobile: 16 },
} as const;

export function ctrlH(mobile: boolean, size: CtrlSize = 'md'): number {
  return mobile ? CTRL[size].mobile : CTRL[size].web;
}

/** 버튼·칩·탭 글자 — 모바일은 검색/입력과 같이 16 */
export function ctrlFs(mobile: boolean, size: CtrlSize = 'md'): number {
  if (mobile) return 16;
  return size === 'sm' ? CTRL.sm.fsWeb : CTRL.md.fsWeb;
}

/** Input/Select/Search — 모바일 16 · 웹 md=13 / sm=12.5 */
export function ctrlInputFs(mobile: boolean, size: CtrlSize = 'md'): number {
  if (mobile) return 16;
  return size === 'sm' ? 12.5 : 13;
}

/** 필터칩 높이 — 웹 sm · 모바일 md */
export function ctrlChipH(mobile: boolean): number {
  return mobile ? CTRL.md.mobile : CTRL.sm.web;
}

/** @deprecated CTRL.md.mobile — ctrlH(true) 사용 */
export const CTRL_M = CTRL.md.mobile;
/** 모바일 터치 최소(시트 행·히트). 셸 컨트롤 높이와 별개. */
export const TOUCH = 44;
/** 모바일 간격 SSOT — 2단만. 손롤 금지.
 *   SPACE_M(12) = 무리 안(버튼·카드·칩·제목↔본문)
 *   SPACE_GROUP_M(20) = 무리끼리(섹션·업로드↔탭↔본문·툴바 큰 덩어리) */
export const SPACE_M = 12;
export const SPACE_GROUP_M = 20;
/** @deprecated 별칭 — SPACE_M / SPACE_GROUP_M */
export const GAP_M = SPACE_M;
export const SEC_MT_M = SPACE_GROUP_M;
export const SEC_MB_M = SPACE_M;
export const PAGE_PAD_M = '12px 14px 48px';
export const PAGE_HEAD_PB_M = 0;

/* 토글/탭/칩 활성 룩 SSOT — PillTabs·FilterChips·설정 선택 등.
 *   size sm|md = CTRL. lg = 현장 CTA(48)만.
 *   mobile=true 이면 ERP4 높이·16px 폰트. */
export function toggleStyle(active: boolean, size: 'sm' | 'md' | 'lg' = 'md', mobile = false): CSSProperties {
  if (size === 'lg') {
    return {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
      height: 48, boxSizing: 'border-box', padding: '0 18px',
      fontSize: 15, fontWeight: active ? 700 : 500, lineHeight: 1,
      cursor: 'pointer', borderRadius: R, whiteSpace: 'nowrap', flexShrink: 0,
      border: `1px solid ${active ? C.brand : C.taupeLine}`,
      background: active ? C.brand : C.taupeBg,
      color: active ? C.inverse : C.mute,
      transition: 'background .1s, border-color .1s, color .1s',
      WebkitTapHighlightColor: 'transparent',
    };
  }
  const cs: CtrlSize = size === 'sm' ? 'sm' : 'md';
  // 칩(sm): 웹28 · 모바일40(칩=md 높이)
  const h = size === 'sm' ? ctrlChipH(mobile) : ctrlH(mobile, cs);
  const fs = ctrlFs(mobile, cs);
  const pad = mobile ? '0 18px' : (size === 'sm' ? '0 11px' : '0 12px');
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: h, boxSizing: 'border-box', padding: pad,
    fontSize: fs, fontWeight: active ? 700 : 500, lineHeight: 1,
    cursor: 'pointer', borderRadius: R, whiteSpace: 'nowrap', flexShrink: 0,
    border: `1px solid ${active ? C.brand : C.taupeLine}`,
    background: active ? C.brand : C.taupeBg,
    color: active ? C.inverse : C.mute,
    transition: 'background .1s, border-color .1s, color .1s',
    WebkitTapHighlightColor: 'transparent',
  };
}

/* ── 입력 컨트롤 SSOT — Btn과 같은 CTRL 스케일. ── */
export const fieldStyle = (sm = false, mobile = false): CSSProperties => {
  const size: CtrlSize = sm ? 'sm' : 'md';
  return {
    height: ctrlH(mobile, size), boxSizing: 'border-box',
    padding: mobile ? '0 12px' : (sm ? '0 9px' : '0 10px'),
    border: `1px solid ${C.line}`, borderRadius: R,
    fontSize: ctrlInputFs(mobile, size), color: C.ink,
    background: C.card, fontFamily: 'inherit', outline: 'none',
  };
};
const CARET = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";
export const selectStyle = (sm = false, mobile = false): CSSProperties => ({
  ...fieldStyle(sm, mobile),
  padding: mobile ? '0 28px 0 12px' : (sm ? '0 24px 0 9px' : '0 28px 0 10px'),
  cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  backgroundImage: CARET, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
});

/* 표 — 기업형 데이터 그리드. 헤더 sticky · 세로 격자라인 · 숫자 모노. */
export const th: CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 11.5, color: C.ink, fontWeight: 700, background: C.head, borderBottom: `2px solid ${C.lineStrong}`, borderRight: `1px solid ${C.line}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
export const thR: CSSProperties = { ...th, textAlign: 'right' };
export const td: CSSProperties = { padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap', color: C.ink, borderRight: `1px solid ${C.line2}` };
export const tdR: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: NUM, fontWeight: 600 };

/* 엑셀 시트(프리패스 ERP4 이식) — sticky 헤더·좌측 핀 · 행고 고정. DataTable과 별도(현황 한눈). */
const EXCEL_PAD_Y = 5;
const EXCEL_PAD_X = 8;
const EXCEL_ROW_H = 36;
export const thX: CSSProperties = {
  padding: `${EXCEL_PAD_Y}px ${EXCEL_PAD_X}px`, textAlign: 'left', fontSize: 12, color: C.mute, fontWeight: 700,
  background: C.head, borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 2,
};
export const thXR: CSSProperties = { ...thX, textAlign: 'right', fontFamily: NUM, fontVariantNumeric: 'tabular-nums' };
export const thXPin: CSSProperties = { ...thX, left: 0, zIndex: 5, boxShadow: `1px 0 0 ${C.line}` };
export const tdX: CSSProperties = {
  padding: `${EXCEL_PAD_Y}px ${EXCEL_PAD_X}px`, fontSize: 12, whiteSpace: 'nowrap', color: C.ink,
  verticalAlign: 'middle', height: EXCEL_ROW_H, maxHeight: EXCEL_ROW_H, boxSizing: 'border-box', overflow: 'hidden',
};
export const tdXR: CSSProperties = { ...tdX, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: NUM, fontWeight: 600 };
export const tdXPin: CSSProperties = { ...tdX, position: 'sticky', left: 0, zIndex: 1, boxShadow: `1px 0 0 ${C.line}`, fontFamily: NUM, fontWeight: 700 };
