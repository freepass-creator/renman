'use client';

import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { SheetCol } from './excel-sheet';
import { LedgerPanelFooter } from './ledger-actions';
import { C } from './tokens';

export type LedgerRecordSection<T> = {
  title: React.ReactNode;
  cols: SheetCol<T>[];
  /** 기본 펼침. 없으면 첫 섹션만 연다. */
  open?: boolean;
};

function RecordSection<T>({
  title,
  cols,
  initiallyOpen,
  fieldList,
}: {
  title: React.ReactNode;
  cols: SheetCol<T>[];
  initiallyOpen: boolean;
  fieldList: (fieldCols: SheetCol<T>[]) => React.ReactNode;
}) {
  const [open, setOpen] = React.useState(initiallyOpen);
  return (
    <details
      className="ledger-record-panel__section"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>
        <ChevronRight className="ledger-record-panel__chevron" size={14} aria-hidden="true" />
        {title}
      </summary>
      {fieldList(cols)}
    </details>
  );
}

export function LedgerRecordPanel<T>({
  title,
  subtitle,
  row,
  cols,
  sections,
  actions,
  children,
  onClose,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  row: T;
  /** sections 없을 때 평탄 필드. sections 있으면 폴백·생략 가능. */
  cols?: SheetCol<T>[];
  sections?: LedgerRecordSection<T>[];
  /** 패널 footer 액션 — solid 1 + ghost. LedgerPanelFooter로 감싼다. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  onClose: () => void;
}) {
  const fieldList = (fieldCols: SheetCol<T>[]) => (
    <dl className="ledger-record-panel__fields">
      {fieldCols.map((col) => (
        <div className="ledger-record-panel__field" key={col.key}>
          <dt>{col.label}</dt>
          <dd style={{ color: C.ink }}>{col.render(row)}</dd>
        </div>
      ))}
    </dl>
  );

  const hasSections = !!sections?.length;

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

      <div className="ledger-record-panel__body">
        {hasSections ? (
          <div className="ledger-record-panel__sections">
            {sections!.map((section, index) => {
              const key = typeof section.title === 'string' ? section.title : `sec-${index}`;
              return (
                <RecordSection
                  key={key}
                  title={section.title}
                  cols={section.cols}
                  initiallyOpen={section.open ?? index === 0}
                  fieldList={fieldList}
                />
              );
            })}
          </div>
        ) : fieldList(cols ?? [])}
        {children}
      </div>

      {actions != null && <LedgerPanelFooter>{actions}</LedgerPanelFooter>}
    </section>
  );
}
