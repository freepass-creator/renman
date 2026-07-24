'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '@/lib/haptics';
import { C, SCRIM } from './tokens';
import { Btn } from './controls';

/**
 * 하단 시트 SSOT — freepass ERP4 BottomSheet 이식.
 * 검색·정렬·필터·회사·보기 전부 이거. footer 표준:
 *   'std'|'filter' = [해제 좌(ghost) · info 중 · 닫기 우(solid)] — 즉시반영
 *   'commit'       = [해제 좌 · 취소 · 적용/닫기 우] — 조건 확정형
 *   ReactNode      = 커스텀
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
  onCancel,
  dirty = false,
  closeLabel = '닫기',
  commitLabel = '적용',
  clearLabel = '해제',
  cancelLabel = '취소',
  footerInfo,
  pad = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  dockH?: number | string;
  maxHeight?: string | number;
  footer?: 'std' | 'commit' | 'filter' | ReactNode;
  onClear?: () => void;
  onCancel?: () => void;
  dirty?: boolean;
  closeLabel?: string;
  commitLabel?: string;
  clearLabel?: string;
  cancelLabel?: string;
  footerInfo?: ReactNode;
  pad?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  if (!open) return null;

  const isStd = footer === 'std' || footer === 'filter';
  const isCommit = footer === 'commit';
  const sheetFooter = (isStd || isCommit) ? (
    <div style={{
      flex: '0 0 auto',
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 14px',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      borderTop: `1px solid ${C.line}`,
      background: C.taupeBg,
    }}>
      {/* std/filter: [해제 좌 · info 중 · 닫기 우]. commit: [spacer · 취소? · 적용/닫기] */}
      {isStd && onClear ? (
        <Btn variant="ghost" onClick={() => { haptic.tap(); onClear(); }}>{clearLabel}</Btn>
      ) : null}
      {isCommit ? <span style={{ flex: 1 }} /> : (
        <span style={{
          flex: 1, minWidth: 0, fontSize: 12, color: C.mute,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{footerInfo}</span>
      )}
      {isCommit && dirty && onCancel ? (
        <Btn variant="ghost" onClick={() => { onCancel(); }}>{cancelLabel}</Btn>
      ) : null}
      <Btn onClick={() => { haptic.nav(); onClose(); }}>
        {isCommit ? (dirty ? commitLabel : closeLabel) : closeLabel}
      </Btn>
    </div>
  ) : footer != null ? (
    <div style={{
      flex: '0 0 auto',
      padding: '10px 14px',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      borderTop: `1px solid ${C.line}`,
      background: C.taupeBg,
    }}>
      {footer}
    </div>
  ) : null;

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 62, background: SCRIM }}
      onClick={() => { haptic.back(); onClose(); }}
    >
      <div
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0,
          bottom: dockH,
          maxHeight,
          display: 'flex', flexDirection: 'column',
          background: C.taupeBg,
          borderRadius: '14px 14px 0 0',
          boxShadow: 'var(--shadow-lg)',
          animation: 'sheetUp .22s ease',
          paddingBottom: sheetFooter ? 0 : 'env(safe-area-inset-bottom, 0px)',
          overflow: 'hidden',
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? 'none' : 'transform .22s ease',
        }}
      >
        <div
          onTouchStart={(e) => { dragStart.current = e.touches[0].clientY; }}
          onTouchMove={(e) => {
            if (dragStart.current == null) return;
            const dy = e.touches[0].clientY - dragStart.current;
            setDragY(dy > 0 ? dy : 0);
          }}
          onTouchEnd={() => {
            if (dragY > 90) { haptic.back(); onClose(); }
            setDragY(0);
            dragStart.current = null;
          }}
          style={{
            flex: '0 0 auto', display: 'flex', justifyContent: 'center', padding: '12px 0 8px',
            cursor: 'grab', touchAction: 'none',
          }}
        >
          <span style={{ width: 36, height: 4, borderRadius: 2, background: C.line }} />
        </div>
        {title != null && (
          <div style={{
            flex: '0 0 auto', padding: '2px 16px 10px',
            fontSize: 15, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em',
          }}>{title}</div>
        )}
        <div
          className="fp-bottom-sheet-body"
          style={{
            flex: '1 1 auto', minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain',
            padding: pad ? '4px 16px 16px' : undefined,
          }}
        >
          {children}
        </div>
        {sheetFooter}
      </div>
    </div>
  );
}

/** 필터 시트 — BottomSheet footer='filter'(=std) 래퍼. 페이지는 본문만. */
export function FilterSheet({
  open,
  title = '필터',
  onClose,
  onClear,
  children,
  maxHeight = 'min(68vh, 560px)',
  footerInfo,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onClear?: () => void;
  children: ReactNode;
  maxHeight?: string | number;
  footerInfo?: ReactNode;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      maxHeight={maxHeight}
      footer="filter"
      onClear={onClear}
      clearLabel="해제"
      closeLabel="닫기"
      footerInfo={footerInfo}
      pad
    >
      {children}
    </BottomSheet>
  );
}
