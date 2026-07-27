'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { Btn } from './controls';
import { C } from './tokens';

export function LedgerFilterButton({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="세부 필터"
      aria-pressed={open}
      title="세부 필터"
      onClick={onClick}
      style={{
        position: 'relative', width: 30, height: 30, padding: 0, display: 'inline-grid', placeItems: 'center',
        border: `1px solid ${open ? C.brand : C.line}`, borderRadius: 4,
        background: open ? C.brand : C.card, color: open ? C.inverse : C.mute, cursor: 'pointer',
      }}
    >
      <SlidersHorizontal size={15} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 999, background: C.danger, color: C.inverse, boxSizing: 'border-box',
          fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
        }}>{count > 99 ? '99+' : count}</span>
      )}
    </button>
  );
}

export function LedgerFilterPanel({
  title = '세부 필터',
  children,
  onReset,
  onClose,
}: {
  title?: string;
  children: ReactNode;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section className="ledger-record-panel" aria-label={title}>
      <header className="ledger-record-panel__header">
        <strong style={{ flex: 1, fontSize: 13, color: C.ink }}>{title}</strong>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label={`${title} 닫기`}><X size={16} /></button>
      </header>
      <div style={{ padding: 12, display: 'grid', gap: 14, overflow: 'auto' }}>
        {children}
      </div>
      <div style={{ marginTop: 'auto', padding: 10, borderTop: `1px solid ${C.line}` }}>
        <Btn size="sm" variant="ghost" onClick={onReset} block>필터 초기화</Btn>
      </div>
    </section>
  );
}
