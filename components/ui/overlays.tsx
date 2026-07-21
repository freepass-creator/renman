'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import { C, R, SCRIM } from './tokens';

/* 드로어 · 모달 — 오버레이 원자. */

/* 공통 상세 드로어 — 모든 목록 상세가 이 하나 재사용. ↑↓ 이동 · URL 동기화 · ↗전체화면. */
export function Drawer({ title, meta, onClose, children, footer, width = 560, onPrev, onNext, expandHref }: { title: React.ReactNode; meta?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number; onPrev?: () => void; onNext?: () => void; expandHref?: string }) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' && onNext) { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowUp' && onPrev) { e.preventDefault(); onPrev(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);
  const mobile = useIsMobile();
  const navBtn: React.CSSProperties = { border: `1px solid ${C.line}`, background: C.card, borderRadius: R, width: mobile ? 44 : 26, height: mobile ? 44 : 26, cursor: 'pointer', color: C.mute, fontSize: mobile ? 18 : 13, lineHeight: 1 };
  // 모바일 = 하단 바텀시트. z=70 > MobileTabBar(56).
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: SCRIM, zIndex: 70, display: 'flex', justifyContent: mobile ? 'stretch' : 'flex-end', alignItems: mobile ? 'flex-end' : 'stretch' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: mobile ? '100%' : width, height: mobile ? 'auto' : '100vh', maxHeight: mobile ? '92dvh' : undefined, background: C.card, boxShadow: mobile ? '0 -8px 32px rgba(0,0,0,0.2)' : '-10px 0 32px rgba(0,0,0,0.16)', display: 'flex', flexDirection: 'column', borderLeft: mobile ? 'none' : `1px solid ${C.line}`, borderRadius: mobile ? '16px 16px 0 0' : 0, animation: mobile ? 'sheetUp .24s cubic-bezier(.2,.8,.2,1)' : undefined }}>
        {mobile && <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}><div style={{ width: 40, height: 4, borderRadius: 2, background: C.line2 }} /></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '9px 14px 10px' : '11px 16px', borderBottom: `1px solid ${C.line}`, background: mobile ? C.card : C.head }}>
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h2 style={{ fontSize: mobile ? 16 : 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h2>
            {meta && <span style={{ fontSize: 12, color: C.mute }}>{meta}</span>}
          </div>
          <span style={{ flex: 1 }} />
          {(onPrev || onNext) && !mobile && <div style={{ display: 'flex', gap: 4 }} title="↑/↓ 이전·다음">
            <button onClick={onPrev} disabled={!onPrev} style={navBtn}>↑</button>
            <button onClick={onNext} disabled={!onNext} style={navBtn}>↓</button>
          </div>}
          {expandHref && !mobile && <a href={expandHref} title="전체화면" style={{ ...navBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>↗</a>}
          <button onClick={() => { haptic.tap(); onClose(); }} aria-label="닫기" style={{ ...navBtn, fontSize: mobile ? 22 : 18, border: 'none', background: 'none', WebkitTapHighlightColor: 'transparent' }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', WebkitOverflowScrolling: 'touch' }}>{children}</div>
        {footer && <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: mobile ? '11px 14px calc(11px + env(safe-area-inset-bottom))' : '11px 16px', borderTop: `1px solid ${C.line}`, background: C.bg, flexWrap: 'wrap' }}>{footer}</div>}
      </div>
    </div>
  );
}

/* 풀스크린/중앙 모달 — 현장 위저드·확인용.
 *   mobile: 100dvh · z=70(탭바 위) · safe-area 푸터.
 *   lock: 배경 탭으로 안 닫힘(현장 실수 방지). */
export function Modal({ title, meta, onClose, children, footer, width = 720, lock }: {
  title: React.ReactNode; meta?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number;
  /** true면 배경 탭·Esc로 닫지 않음(×·푸터만). 현장 위저드용. */
  lock?: boolean;
}) {
  const mobile = useIsMobile();
  React.useEffect(() => {
    if (lock) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lock, onClose]);
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      onClick={lock ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, background: SCRIM, zIndex: 70, display: 'flex', alignItems: mobile ? 'stretch' : 'flex-start', justifyContent: 'center', padding: mobile ? 0 : '6vh 16px', overflowY: mobile ? 'hidden' : 'auto' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: mobile ? '100%' : width, height: mobile ? '100dvh' : undefined, minHeight: mobile ? '100dvh' : undefined,
          background: C.card, borderRadius: mobile ? 0 : R, boxShadow: mobile ? 'none' : '0 16px 48px rgba(0,0,0,0.22)',
          overflow: 'hidden', border: mobile ? 'none' : `1px solid ${C.line}`,
          display: 'flex', flexDirection: 'column', animation: mobile ? 'sheetUp .22s cubic-bezier(.2,.8,.2,1)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '10px 12px 10px 16px' : '13px 18px', borderBottom: `1px solid ${C.line}`, background: C.head, flexShrink: 0 }}>
          <h2 style={{ fontSize: mobile ? 16 : 14.5, fontWeight: 800, margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
          {meta && <span style={{ fontSize: 12, color: C.mute, flexShrink: 0 }}>{meta}</span>}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => { haptic.tap(); onClose(); }}
            aria-label="닫기"
            style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer', color: C.faint, lineHeight: 1, width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
          >×</button>
        </div>
        <div style={{ padding: mobile ? '14px 16px' : '16px 18px', flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>{children}</div>
        {footer && (
          <div style={{
            display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
            padding: mobile ? '12px 14px calc(12px + env(safe-area-inset-bottom))' : '12px 18px',
            borderTop: `1px solid ${C.line}`, background: C.bg,
          }}>{footer}</div>
        )}
      </div>
    </div>
  );
}
