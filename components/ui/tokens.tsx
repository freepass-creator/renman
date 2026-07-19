import type { CSSProperties } from 'react';

/* 공용 UI 토큰 — 최하위 레이어(런타임 import 0). 다른 UI 원자들이 여기서 색·스케일·표스타일을 가져간다. */

/* 색은 jpkerp5와 "동일한" globals.css 토큰을 브릿지 — v6에서 검증한 UI를 jpkerp5에 그대로 따다 쓰기 위함. */
export const C = {
  ink: 'var(--text-main)', mute: 'var(--text-sub)', sub: 'var(--text-sub)', faint: 'var(--text-weak)',
  line: 'var(--border)', line2: 'var(--border-soft)',
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

/** 모바일 터치 SSOT — Apple HIG ≈44. 한 툴바 안에서는 이 높이만(섞지 말 것). */
export const TOUCH = 44;
/** 모바일 셸 컨트롤(회사·검색·필터·렌즈탭) — 44에 가깝게, 한 줄 밀도 맞춤. */
export const CTRL_M = 40;
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
export const PAGE_HEAD_PB_M = 0; // 렌즈탭↔첫 섹션 = SPACE_GROUP_M(Sec mt)

/* 토글/탭/칩 활성 룩 SSOT — PillTabs·FilterChips·설정 선택 등.
 *   sm=28/12(칩·웹) · md=32/13(웹 기본) · lg=40/14(모바일 주요 탭·칩).
 * 호버 역할: data-ui="toggle"(선택) vs Btn data-ui="action"(실행) — globals.css SSOT. */
export function toggleStyle(active: boolean, size: 'sm' | 'md' | 'lg' = 'md'): CSSProperties {
  const sm = size === 'sm';
  const lg = size === 'lg';
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    height: sm ? 28 : lg ? CTRL_M : 32, boxSizing: 'border-box',
    padding: sm ? '0 12px' : lg ? '0 16px' : '0 14px',
    fontSize: sm ? 12 : lg ? 14 : 13, fontWeight: active ? 700 : 500, lineHeight: 1,
    cursor: 'pointer', borderRadius: R, whiteSpace: 'nowrap', flexShrink: 0,
    border: `1px solid ${active ? C.brand : C.line}`,
    background: active ? C.brand : '#fff',
    color: active ? '#fff' : C.mute,
    transition: 'background .1s, border-color .1s, color .1s',
    WebkitTapHighlightColor: 'transparent',
  };
}

/* ── 입력 컨트롤 SSOT — Btn과 같은 32/28 스케일. box-sizing:border-box라 한 줄에서 버튼·검색·select 상하 높이 자동 일치. ── */
export const fieldStyle = (sm = false): CSSProperties => ({
  height: sm ? 28 : 32, boxSizing: 'border-box', padding: sm ? '0 9px' : '0 10px',
  border: `1px solid ${C.line}`, borderRadius: R, fontSize: sm ? 12 : 12.5, color: C.ink,
  background: '#fff', fontFamily: 'inherit', outline: 'none',
});
// select 커스텀 화살표(OS 크롬 제거 → 어느 OS서도 버튼과 같은 높이·룩)
const CARET = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")";
export const selectStyle = (sm = false): CSSProperties => ({
  ...fieldStyle(sm), padding: sm ? '0 24px 0 9px' : '0 28px 0 10px', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  backgroundImage: CARET, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 9px center',
});

/* 표 — 기업형 데이터 그리드. 헤더 sticky · 세로 격자라인 · 숫자 모노. */
export const th: CSSProperties = { padding: '6px 10px', textAlign: 'left', fontSize: 11.5, color: '#33415a', fontWeight: 700, background: C.head, borderBottom: `2px solid #c4ccd8`, borderRight: `1px solid ${C.line}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
export const thR: CSSProperties = { ...th, textAlign: 'right' };
export const td: CSSProperties = { padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap', color: C.ink, borderRight: `1px solid ${C.line2}` };
export const tdR: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: NUM, fontWeight: 600 };
