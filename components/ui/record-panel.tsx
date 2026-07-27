'use client';

import React from 'react';
import { X } from 'lucide-react';
import type { SheetCol } from './excel-sheet';
import { C } from './tokens';

export function LedgerRecordPanel<T>({
  title,
  subtitle,
  row,
  cols,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  row: T;
  cols: SheetCol<T>[];
  onClose: () => void;
}) {
  return (
    <section className="ledger-record-panel" aria-label="선택 행 상세정보">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{title}</div>
          {subtitle != null && <div className="ledger-record-panel__subtitle">{subtitle}</div>}
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="상세패널 닫기">
          <X size={14} />
        </button>
      </header>

      <dl className="ledger-record-panel__fields">
        {cols.map((col) => (
          <div className="ledger-record-panel__field" key={col.key}>
            <dt>{col.label}</dt>
            <dd style={{ color: C.ink }}>{col.render(row)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
