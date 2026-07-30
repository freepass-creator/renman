'use client';
/**
 * 원장 워크플로 ⋯메뉴 — 필터줄 tools 슬롯. 항목 없으면 null.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useIsMobile } from '@/lib/use-mobile';
import { C, R, SCRIM, ctrlH } from './tokens';

export type LedgerToolItem = {
  key: string;
  label: string;
  href?: string;
  onClick?: () => void;
  /** 파괴적 실행 — 빨간 라벨. */
  danger?: boolean;
};

export function LedgerToolsMenu({
  items,
  'aria-label': ariaLabel = '도구',
}: {
  items: LedgerToolItem[];
  'aria-label'?: string;
}) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile, 'sm');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: h, height: h, padding: 0, display: 'inline-grid', placeItems: 'center',
          boxSizing: 'border-box',
          border: `1px solid ${open ? C.brand : C.line}`, borderRadius: R,
          background: open ? C.brand : C.card, color: open ? C.inverse : C.mute, cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={mobile ? 16 : 14} />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 40,
            minWidth: 168, padding: 4,
            background: C.card, border: `1px solid ${C.line}`, borderRadius: R,
            boxShadow: `0 8px 24px ${SCRIM}`,
          }}
        >
          {items.map((item) => {
            const color = item.danger ? C.danger : C.ink;
            const common = {
              role: 'menuitem' as const,
              onClick: () => {
                setOpen(false);
                item.onClick?.();
              },
              style: {
                display: 'block', width: '100%', textAlign: 'left' as const,
                padding: '8px 10px', border: 'none', borderRadius: R,
                background: 'transparent', color, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textDecoration: 'none', boxSizing: 'border-box' as const,
              },
            };
            if (item.href) {
              return (
                <a key={item.key} href={item.href} {...common}>
                  {item.label}
                </a>
              );
            }
            return (
              <button key={item.key} type="button" {...common}>
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
