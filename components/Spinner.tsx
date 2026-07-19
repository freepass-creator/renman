'use client';
// 회전 스피너 — globals.css의 .spin(@keyframes spin) 사용. 로딩 표시 일관화.
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

// 전체 화면 로딩 오버레이 — 긴 작업(실데이터 불러오기 등)에.
export function LoadingOverlay({ label = '처리 중…' }: { label?: string }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 250, background: 'rgba(15,23,42,0.38)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <Spinner size={36} stroke={3} color="#fff" />
      <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
