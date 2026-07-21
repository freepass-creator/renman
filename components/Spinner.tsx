'use client';
/* 로딩 프리미티브 — `components/ui` 배럴이 재노출한다(import는 '@/components/ui'로).
 * 경쟁 SSOT 아님: `PageLoading`(misc.tsx)이 이 Spinner 위에 세워진 페이지 표준이고,
 * 아래 셋은 서로 자리가 다르다 — 섞어 쓰지 말 것.
 *   Spinner        = 최소 단위(다른 원자가 조립용으로만)
 *   Loading        = 인라인(버튼 옆·문장 안). PageLoading으로 대체 불가(52vh 블록이라 레이아웃 깨짐)
 *   LoadingOverlay = 긴 작업 전체 덮기(고정 오버레이)
 * 페이지 본문 로딩은 전부 `PageLoading`. */
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
