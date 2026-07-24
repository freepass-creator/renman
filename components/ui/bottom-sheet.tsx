'use client';
import { useEffect, type ReactNode } from 'react';
import { haptic } from '@/lib/haptics';
import { C } from './tokens';
import { Btn } from './controls';

/**
 * 하단 시트 SSOT — 화면 바닥에서 슬라이드업(freepasserp4 BottomSheet 이식).
 * 모바일 필터·검색·정렬·메뉴 공용. footer='filter' → [적용][해제][닫기] 표준 액션바.
 * @keyframes sheetUp 은 globals.css에 이미 존재.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
  dockH = 0,
  maxHeight = 'min(58vh, 520px)',
  footer,
  onClear,
  applyLabel = '적용',
  clearLabel = '해제',
  pad = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  dockH?: number | string;
  maxHeight?: string | number;
  /** 'filter' = 적용·해제·닫기 표준 푸터 / ReactNode = 커스텀 */
  footer?: 'filter' | ReactNode;
  onClear?: () => void;
  applyLabel?: string;
  clearLabel?: string;
  pad?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const filterFooter = footer === 'filter' ? (
    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${C.line}`, background: C.taupeBg }}>
      <div style={{ flex: 1 }}><Btn block onClick={() => { haptic.nav(); onClose(); }}>{applyLabel}</Btn></div>
      {onClear ? <Btn variant="ghost" onClick={() => { haptic.tap(); onClear(); }}>{clearLabel}</Btn> : null}
      <Btn variant="ghost" onClick={() => { haptic.nav(); onClose(); }}>닫기</Btn>
    </div>
  ) : footer != null && footer !== 'filter' ? (
    <div style={{ flex: '0 0 auto', padding: '10px 14px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', borderTop: `1px solid ${C.line}`, background: C.taupeBg }}>{footer}</div>
  ) : null;

  return (
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 62, background: 'rgba(15,23,42,0.38)' }} onClick={() => { haptic.back(); onClose(); }}>
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: 0, right: 0, bottom: dockH, maxHeight, display: 'flex', flexDirection: 'column', background: C.taupeBg, borderRadius: '14px 14px 0 0', boxShadow: '0 -10px 32px rgba(15,23,42,0.2)', animation: 'sheetUp .22s ease', paddingBottom: filterFooter ? 0 : 'env(safe-area-inset-bottom, 0px)', overflow: 'hidden' }}
      >
        {/* 드래그 핸들 힌트 */}
        <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <span style={{ width: 36, height: 4, borderRadius: 2, background: C.line }} />
        </div>
        {title != null && (
          <div style={{ flex: '0 0 auto', padding: '2px 16px 10px', fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{title}</div>
        )}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain', padding: pad ? '4px 16px 16px' : undefined }}>
          {children}
        </div>
        {filterFooter}
      </div>
    </div>
  );
}

/** 필터 시트 — BottomSheet footer='filter' 래퍼. 페이지는 본문(칩·섹션)만 넘김. */
export function FilterSheet({
  open,
  title = '필터',
  onClose,
  onClear,
  children,
  maxHeight = 'min(68vh, 560px)',
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onClear?: () => void;
  children: ReactNode;
  maxHeight?: string | number;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title} maxHeight={maxHeight} footer="filter" onClear={onClear} pad>
      {children}
    </BottomSheet>
  );
}
