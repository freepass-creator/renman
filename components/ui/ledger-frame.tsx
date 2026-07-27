'use client';
/**
 * LedgerFrame — 원장 페이지 공용 틀 (재무·운영 동일 규격).
 *   Page(frame) + 필터 1행 + ExcelSheet + (옵션) 우측 고정 상세패널.
 *   패널은 오버레이·슬라이드가 아니라 표와 나란히 공간을 나눠 쓴다.
 *
 *   클릭 = 행 선택 · 더블클릭 = 상세패널 열기 · 같은 행/패널 재더블클릭 = 닫기.
 */
import React, { type ReactNode } from 'react';
import { Page } from './layout';
import { ExcelSheet, type SheetCol } from './excel-sheet';
import { CompanyFilter, PillTabs } from './controls';
import { EmptyState, Message, PageLoading } from './misc';
import { C } from './tokens';

export type LedgerColView = '기본' | '전체';

export function LedgerFrame<R>({
  title, meta, right, hint,
  filters, stats,
  colView, onColView,
  loading, empty,
  cols, rows, rowKey, onRow, onRowDoubleClick, onCloseDetail, selectedRowKey,
  rowStyle, rowClickable,
  detail, sidePanel, filterPanel,
}: {
  title: string;
  meta?: ReactNode;
  right?: ReactNode;
  hint?: ReactNode;
  filters?: ReactNode;
  stats?: ReactNode;
  colView: LedgerColView;
  onColView: (v: LedgerColView) => void;
  loading?: boolean;
  empty?: ReactNode;
  cols: SheetCol<R>[];
  rows: R[];
  rowKey: (r: R) => string;
  onRow?: (r: R) => void;
  /** 더블클릭 — 같은 행이면 닫고, 다른 행/미열림이면 연다(페이지에서 토글). */
  onRowDoubleClick?: (r: R) => void;
  onCloseDetail?: () => void;
  selectedRowKey?: string | null;
  rowStyle?: (r: R) => React.CSSProperties | undefined;
  rowClickable?: (r: R) => boolean;
  detail?: ReactNode;
  sidePanel?: ReactNode;
  filterPanel?: ReactNode;
}) {
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (selectedRowKey != null) setPickedKey(selectedRowKey);
    else if (sidePanel == null) {
      setPickedKey(null);
    }
  }, [selectedRowKey, sidePanel]);

  const openDetail = onRowDoubleClick
    ? (row: R) => {
      const key = rowKey(row);
      if (pickedKey === key && sidePanel != null && onCloseDetail) {
        setPickedKey(null);
        onCloseDetail();
        return;
      }
      setPickedKey(key);
      onRowDoubleClick(row);
    }
    : undefined;

  // 클릭은 선택만, 더블클릭은 모든 원장에서 동일하게 상세를 연다.
  const selectRow = onRowDoubleClick
    ? (row: R) => {
      setPickedKey(rowKey(row));
      onRow?.(row);
    }
    : onRow;

  return (
    <Page frame title={title} meta={meta} right={right} noCompany>
      {hint != null && (
        typeof hint === 'string' || typeof hint === 'number'
          ? <Message variant="info">{hint}</Message>
          : hint
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: '8px 0 10px',
      }}>
        <CompanyFilter />
        {filters}
        <span style={{ flex: 1, minWidth: 8 }} />
        {stats}
        <PillTabs
          size="sm"
          value={colView}
          onChange={onColView}
          tabs={[
            { key: '기본', label: '기본' },
            { key: '전체', label: '전체' },
          ]}
        />
      </div>

      {loading ? <PageLoading /> : !rows.length && sidePanel == null ? (
        <EmptyState>{empty ?? '표시할 항목이 없습니다'}</EmptyState>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            className="ledger-workspace"
            data-panel={sidePanel != null ? 'open' : 'closed'}
            data-filter={filterPanel != null ? 'open' : 'closed'}
          >
            {filterPanel != null && (
              <aside className="ledger-workspace__filter">
                {filterPanel}
              </aside>
            )}
            <div className="ledger-workspace__sheet">
              {!rows.length ? (
                <EmptyState>{empty ?? '표시할 항목이 없습니다'}</EmptyState>
              ) : (
                <ExcelSheet
                  cols={colView === '기본' ? cols.map((col) => ({ ...col, pin: false })) : cols}
                  rows={rows}
                  rowKey={rowKey}
                  onRow={selectRow}
                  onRowDoubleClick={openDetail}
                  selectedRowKey={onRowDoubleClick ? (pickedKey ?? selectedRowKey) : selectedRowKey}
                  fit={colView === '기본'}
                  rowStyle={rowStyle}
                  rowClickable={rowClickable}
                />
              )}
            </div>
            {sidePanel != null && (
              <aside
                className="ledger-workspace__panel"
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest('button,a,input,select,textarea')) return;
                  setPickedKey(null);
                  onCloseDetail?.();
                }}
              >
                {sidePanel}
              </aside>
            )}
          </div>
          {detail != null && (
            <div style={{
              flexShrink: 0,
              borderTop: `1px solid ${C.line}`,
              background: C.card,
              maxHeight: '42vh',
              overflow: 'auto',
            }}>
              {detail}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
