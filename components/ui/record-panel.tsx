'use client';

import React from 'react';
import { ChevronRight, X } from 'lucide-react';
import type { SheetCol } from './excel-sheet';
import { LedgerPanelFooter } from './ledger-actions';
import { revealSectionInPanel } from './ledger-panel-scroll';
import { C } from './tokens';
import { haptic } from '@/lib/haptics';

export function LedgerPanelCloseButton({ onClose, label = '상세패널 닫기' }: { onClose: () => void; label?: string }) {
  return (
    <button type="button" className="ledger-record-panel__close" onClick={() => { haptic.tap(); onClose(); }} aria-label={label}>
      <X size={14} />
    </button>
  );
}

export type LedgerRecordSection<T> = {
  title: React.ReactNode;
  cols: SheetCol<T>[];
  /** 기본 펼침. 없으면 첫 섹션만 연다. */
  open?: boolean;
  /**
   * 섹션 안에 들어갈 표·목록. **여러 건인 이력**(계약이력·정비·사고·과태료)은 KV 한 줄로
   * 못 담으므로 여기로 넣는다 — 접기·제목 위계는 KV 섹션과 완전히 같다(같은 규격, 다른 내용).
   * cols 가 비어 있으면 KV 없이 body 만 그린다.
   */
  body?: React.ReactNode;
  /** 제목 옆 건수 배지. 접힌 상태에서도 «몇 건인지»가 보이게. */
  count?: number;
};

/** 빈 값 → '—'. 0·false는 유지(금액 0·불리언). */
function displayCell(node: React.ReactNode): React.ReactNode {
  if (node == null || node === false) return <span style={{ color: C.faint }}>—</span>;
  if (typeof node === 'string' && !node.trim()) return <span style={{ color: C.faint }}>—</span>;
  return node;
}

/** text() 기준 비어 있으면 섹션 숨김(구분별 원자 빈 섹션 렌더 금지). */
function sectionHasValue<T>(cols: SheetCol<T>[], row: T): boolean {
  if (!cols.length) return false;
  return cols.some((col) => {
    if (!col.text) return true;
    const t = col.text(row);
    if (t == null) return false;
    if (typeof t === 'string' && !t.trim()) return false;
    return true;
  });
}

function RecordSection<T>({
  title,
  cols,
  initiallyOpen,
  fieldList,
  body,
  count,
}: {
  title: React.ReactNode;
  cols: SheetCol<T>[];
  initiallyOpen: boolean;
  fieldList: (fieldCols: SheetCol<T>[]) => React.ReactNode;
  /** 여러 건인 이력(계약·정비·사고…) — KV 로는 못 담아 섹션 안에 표로 넣는다. */
  body?: React.ReactNode;
  /** 제목 옆 건수. 이력 섹션이 몇 건인지 접힌 채로도 보이게. */
  count?: number;
}) {
  const [open, setOpen] = React.useState(initiallyOpen);
  const userToggleRef = React.useRef(false);

  return (
    <details
      className="ledger-record-panel__section"
      open={open}
      onToggle={(event) => {
        const el = event.currentTarget;
        const next = el.open;
        setOpen(next);
        if (next && userToggleRef.current) {
          userToggleRef.current = false;
          revealSectionInPanel(el);
        } else {
          userToggleRef.current = false;
        }
      }}
    >
      <summary onClick={() => { userToggleRef.current = true; }}>
        <ChevronRight className="ledger-record-panel__chevron" size={14} aria-hidden="true" />
        {title}
        {count != null ? <span className="ledger-record-panel__count">{count}건</span> : null}
      </summary>
      {cols.length > 0 ? fieldList(cols) : null}
      {body}
    </details>
  );
}

export function LedgerRecordPanel<T>({
  title,
  subtitle,
  identity,
  statusBadge,
  row,
  cols,
  sections,
  actions,
  children,
  onClose,
}: {
  title: React.ReactNode;
  /** @deprecated identity+statusBadge 권장. 하위호환 유지. */
  subtitle?: React.ReactNode;
  /** 행문법 신원(차번·계약자 등 페이지별) */
  identity?: React.ReactNode;
  /** 행문법 상태 배지 */
  statusBadge?: React.ReactNode;
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
          <dd>{displayCell(col.render(row))}</dd>
        </div>
      ))}
    </dl>
  );

  const visibleSections = React.useMemo(
    // body 만 있는 섹션(이력 표)은 cols 가 비어 있으므로 KV 기준으로 지우면 안 된다.
    () => (sections || []).filter((section) => section.body != null || sectionHasValue(section.cols, row)),
    [sections, row],
  );
  const hasSections = visibleSections.length > 0;
  const meta = identity != null || statusBadge != null
    ? (
      <div className="ledger-record-panel__meta">
        {identity != null ? <span className="ledger-record-panel__identity">{identity}</span> : null}
        {statusBadge != null ? <span className="ledger-record-panel__badge">{statusBadge}</span> : null}
      </div>
    )
    : (subtitle != null ? <div className="ledger-record-panel__subtitle">{subtitle}</div> : null);

  return (
    <section className="ledger-record-panel" aria-label="선택 행 상세정보">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{title}</div>
          {meta}
        </div>
        <LedgerPanelCloseButton onClose={onClose} />
      </header>

      <div className="ledger-record-panel__body">
        {hasSections ? (
          <div className="ledger-record-panel__sections">
            {visibleSections.map((section, index) => {
              const key = typeof section.title === 'string' ? section.title : `sec-${index}`;
              return (
                <RecordSection
                  key={key}
                  title={section.title}
                  cols={section.cols}
                  body={section.body}
                  count={section.count}
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
