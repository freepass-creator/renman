'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { useIsMobile } from '@/lib/use-mobile';
import { Btn } from './controls';
import { C, R, SH } from './tokens';

export type ActionMenuItem = {
  key: string;
  label: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
};

/**
 * 툴바·상세패널의 보조 기능 드롭다운 SSOT.
 * 트리거는 Btn 규격, 항목은 데스크톱 36px·모바일 44px을 유지한다.
 */
export function ActionMenu({
  label,
  items,
  size = 'sm',
  align = 'right',
  menuLabel,
}: {
  label: React.ReactNode;
  items: ActionMenuItem[];
  size?: 'sm' | 'md';
  align?: 'left' | 'right';
  menuLabel?: string;
}) {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.requestAnimationFrame(() => {
      rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <span
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onKeyDown={(event) => {
        if (!open || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
        const enabled = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])];
        if (!enabled.length) return;
        event.preventDefault();
        const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown'
          ? enabled[(index + 1 + enabled.length) % enabled.length]
          : enabled[(index - 1 + enabled.length) % enabled.length];
        next?.focus();
      }}
    >
      <Btn
        size={size}
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <ChevronDown
          size={13}
          strokeWidth={2.2}
          aria-hidden
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s ease' }}
        />
      </Btn>
      {open && (
        <>
          <span
            aria-hidden
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            onClick={() => setOpen(false)}
          />
          <span
            id={menuId}
            role="menu"
            aria-label={menuLabel}
            style={{
              position: 'absolute',
              [align]: 0,
              top: 'calc(100% + 4px)',
              zIndex: 41,
              minWidth: mobile ? 180 : 152,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              padding: 5,
              background: C.card,
              border: `1px solid ${C.line}`,
              borderRadius: R,
              boxShadow: SH.pop,
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  if (item.disabled) return;
                  haptic.tap();
                  setOpen(false);
                  item.onClick();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  minHeight: mobile ? 44 : 36,
                  padding: mobile ? '8px 12px' : '6px 10px',
                  border: 'none',
                  borderRadius: R,
                  background: 'transparent',
                  color: item.danger ? C.danger : item.disabled ? C.faint : C.ink,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                  fontSize: mobile ? 15 : 12.5,
                  fontWeight: 600,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={(event) => {
                  if (!item.disabled) event.currentTarget.style.background = C.hover;
                }}
                onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent'; }}
              >
                {item.icon ? <span aria-hidden style={{ display: 'inline-flex', color: C.mute }}>{item.icon}</span> : null}
                <span>{item.label}</span>
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
