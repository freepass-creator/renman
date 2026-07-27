'use client';

import { X } from 'lucide-react';
import { type ReactNode } from 'react';
import { Btn } from './controls';
import { C } from './tokens';

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
