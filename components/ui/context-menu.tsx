'use client';

/**
 * 경량 우클릭 컨텍스트 메뉴 — jpkerp5 이식.
 *   lucide·토큰(C/SH)만. 외부 클릭/Esc/다른 우클릭 → 닫힘.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { C, R, SH } from './tokens';

export type ContextMenuItem =
  | { type?: 'item'; label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
  | { type: 'separator' };

export function ContextMenu({
  open, x, y, onClose, items,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  items: ContextMenuItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('contextmenu', onDoc);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('contextmenu', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxX = typeof window !== 'undefined' ? window.innerWidth - 200 : x;
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 250 : y;
  const left = Math.min(x, maxX);
  const top = Math.min(y, maxY);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top, zIndex: 9999,
        minWidth: 180, padding: 4,
        background: C.card, border: `1px solid ${C.line}`,
        borderRadius: R, boxShadow: SH.pop,
        fontSize: 12, color: C.ink,
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => {
        if ('type' in it && it.type === 'separator') {
          return <div key={i} style={{ height: 1, background: C.line2, margin: '4px 0' }} />;
        }
        const item = it as Extract<ContextMenuItem, { onClick: () => void }>;
        return (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.onClick();
              onClose();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '6px 10px',
              background: 'transparent', border: 'none',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              textAlign: 'left', fontSize: 12,
              color: item.danger ? C.danger : item.disabled ? C.faint : C.ink,
              borderRadius: R,
            }}
            onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = C.hover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            {item.icon && <span style={{ display: 'flex', color: C.mute }}>{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
