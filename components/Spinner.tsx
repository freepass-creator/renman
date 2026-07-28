'use client';
/* 로딩 프리미티브 — `components/ui` 배럴이 재노출한다(import는 '@/components/ui'로).
 * ERP 통상 3층 (자리 섞지 말 것):
 *   1) Gate(session)     = 셸 생기기 전 부트만 풀스크린
 *   2) PageLoading       = 톱바·제목 유지, 작업영역(본문)만. Page/FacetPage/LedgerFrame `loading`
 *   3) LoadingOverlay    = 긴 쓰기·마이그레이션 스크림(z 250)
 *   + Loading            = 인라인(버튼 옆). 52vh/플렉스 본문 금지
 * Spinner = 조립 단위만. soft-load(listsCached)면 스피너 생략. */
import { SCRIM, SCRIM_FG } from './ui/tokens';
export function Spinner({ size = 16, stroke = 2, color = 'currentColor' }: { size?: number; stroke?: number; color?: string }) {
  return (
    <span className="spin" aria-label="로딩"
      style={{ display: 'inline-block', width: size, height: size, border: `${stroke}px solid ${color}`, borderTopColor: 'transparent', borderRadius: '50%', boxSizing: 'border-box', verticalAlign: 'middle' }} />
  );
}

// 인라인 로딩(텍스트 + 스피너) — "불러오는 중…" 자리 대체.
export function Loading({ label = '불러오는 중…', color = 'var(--text-sub)' }: { label?: string; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color, fontSize: 13 }}>
      <Spinner size={15} color={color} /> {label}
    </span>
  );
}

/* 전체 화면 로딩 오버레이 — 긴 작업(실데이터 불러오기 등)에.
 * 스크림·그 위 글자색은 `SCRIM`/`SCRIM_FG` SSOT(tokens). 테마 토큰을 쓰면 안 되는 자리다. */
export function LoadingOverlay({ label = '처리 중…' }: { label?: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: SCRIM, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Spinner size={36} stroke={3} color={SCRIM_FG} />
      <div style={{ color: SCRIM_FG, fontSize: 14, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
