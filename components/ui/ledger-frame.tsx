'use client';
/**
 * LedgerFrame — 원장 페이지 공용 틀 (재무·운영·데이터센터 동일 규격).
 *   Page(frame) + 필터 1행 + ExcelSheet(또는 body) + (옵션) 우측 고정 상세패널.
 *   패널은 오버레이·슬라이드가 아니라 표와 나란히 공간을 나눠 쓴다.
 *
 *   클릭 = 행 선택 · 더블클릭 = 상세패널 열기 · 같은 행/패널 재더블클릭 = 닫기.
 *
 *   버튼 자리 (왼쪽→오른쪽):
 *     필터줄 = 회사(또는 companySlot) · 검색 · ☰필터 · 기간 ····· 지표 · 보기 · [+생성]
 *     ※ ⋯도구 메뉴 없음. 대량액션=선택 액션바 · 투입=[+생성]패널 · 이동=좌측메뉴 · 개별=상세패널.
 *     필드 적은 원장 = `LedgerFilterSelects`로 상단 흡수(3분할 회피). 다수 필드는 좌측 `filterPanel`.
 *     Page.right / 필터줄 right = 쓰기(생성·입력) — zone당 solid 1 · Btn sm
 */
import React, { type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Page } from './layout';
import { ExcelSheet, type SheetCol } from './excel-sheet';
import { CompanyFilter, PillTabs } from './controls';
import { EmptyState, Message, PageLoading } from './misc';
import { C } from './tokens';

export type LedgerColView = '기본' | '전체';

export function LedgerFrame<R>({
  title, meta, right, tools, hint,
  filters, stats,
  colView, onColView, showColView = true,
  view, companySlot, body,
  loading, empty,
  cols, rows, rowKey, onRow, onRowDoubleClick, onCloseDetail, selectedRowKey,
  rowStyle, rowClickable,
  selectedKeys,
  onRowMouseDown, onRowClickEvent, onRowContextMenu,
  selectionBar,
  detail, sidePanel, filterPanel,
  icon,
}: {
  title: string;
  meta?: ReactNode;
  /** 페이지 쓰기 CTA — 생성/입력만. solid 1개 원칙. 필터줄 맨 오른쪽. */
  right?: ReactNode;
  /** @deprecated ⋯도구 메뉴 폐기. 새 코드에서 쓰지 말 것. */
  tools?: ReactNode;
  hint?: ReactNode;
  filters?: ReactNode;
  stats?: ReactNode;
  /** 기본/전체 열보기. showColView=false 이거나 view 지정 시 생략 가능. */
  colView?: LedgerColView;
  onColView?: (v: LedgerColView) => void;
  /** false면 기본/전체 PillTabs 숨김(view로 대체하거나 보기 전환 없음). 기본 true. */
  showColView?: boolean;
  /** 기본/전체 대신 쓸 보기 전환(예: 대기/저장본). */
  view?: ReactNode;
  /** CompanyFilter 대신(합본 저장대상 Select 등). */
  companySlot?: ReactNode;
  /** 시트 자리 커스텀(데이터센터 등). 있으면 ExcelSheet 경로 생략. */
  body?: ReactNode;
  loading?: boolean;
  empty?: ReactNode;
  cols?: SheetCol<R>[];
  rows?: R[];
  rowKey?: (r: R) => string;
  onRow?: (r: R) => void;
  /** 더블클릭 — 같은 행이면 닫고, 다른 행/미열림이면 연다(페이지에서 토글). */
  onRowDoubleClick?: (r: R) => void;
  onCloseDetail?: () => void;
  selectedRowKey?: string | null;
  rowStyle?: (r: R) => React.CSSProperties | undefined;
  rowClickable?: (r: R) => boolean;
  /** 다중 선택 하이라이트(체크박스 없음). */
  selectedKeys?: ReadonlySet<string>;
  onRowMouseDown?: (e: React.MouseEvent, row: R, index: number) => void;
  onRowClickEvent?: (e: React.MouseEvent, row: R, index: number) => void;
  onRowContextMenu?: (e: React.MouseEvent, row: R, index: number) => void;
  /** 표 위 선택 액션바(`LedgerSelectionBar`). 0건이면 페이지가 null. */
  selectionBar?: ReactNode;
  detail?: ReactNode;
  sidePanel?: ReactNode;
  filterPanel?: ReactNode;
  /** 타이틀 nav 아이콘. 생략=경로 자동(lib/nav). false=숨김. */
  icon?: LucideIcon | false;
}) {
  const [pickedKey, setPickedKey] = React.useState<string | null>(null);
  const sheetRows = rows ?? [];
  const sheetCols = cols ?? [];

  React.useEffect(() => {
    if (selectedRowKey != null) setPickedKey(selectedRowKey);
    else if (sidePanel == null) {
      setPickedKey(null);
    }
  }, [selectedRowKey, sidePanel]);

  const openDetail = onRowDoubleClick && rowKey
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
  const selectRow = onRowDoubleClick && rowKey
    ? (row: R) => {
      setPickedKey(rowKey(row));
      onRow?.(row);
    }
    : onRow;

  const viewControl = view != null
    ? view
    : (showColView && colView != null && onColView != null)
      ? (
        <PillTabs
          size="sm"
          value={colView}
          onChange={onColView}
          tabs={[
            { key: '기본', label: '기본' },
            { key: '전체', label: '전체' },
          ]}
        />
      )
      : null;

  // ERP: 제목·필터줄·패널 유지 · 표 자리만 PageLoading.
  return (
    <Page frame title={title} meta={meta} noCompany icon={icon}>
      {hint != null && (
        typeof hint === 'string' || typeof hint === 'number'
          ? <Message variant="info">{hint}</Message>
          : hint
      )}

      <div style={{
        display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: '8px 0 10px', overflowX: 'auto',
      }}>
        {companySlot ?? <CompanyFilter size="sm" />}
        {filters}
        <span style={{ flex: 1, minWidth: 8 }} />
        {stats}
        {viewControl}
        {tools}
        {right}{/* 주액션(생성/등록) — 필터줄 맨 오른쪽. ⋯도구 없음. */}
      </div>

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
            {selectionBar}
            {loading ? (
              <PageLoading />
            ) : body != null ? (
              body
            ) : !sheetRows.length ? (
              <EmptyState variant="sheet">{empty ?? '표시할 항목이 없습니다'}</EmptyState>
            ) : (
              <ExcelSheet
                cols={colView === '기본' ? sheetCols.map((col) => ({ ...col, pin: false })) : sheetCols}
                rows={sheetRows}
                rowKey={rowKey!}
                onRow={selectRow}
                onRowDoubleClick={openDetail}
                selectedRowKey={onRowDoubleClick ? (pickedKey ?? selectedRowKey) : selectedRowKey}
                fit={colView === '기본'}
                rowStyle={rowStyle}
                rowClickable={rowClickable}
                selectedKeys={selectedKeys}
                onRowMouseDown={onRowMouseDown}
                onRowClickEvent={onRowClickEvent ? (e, row, idx) => {
                  if (rowKey) setPickedKey(rowKey(row));
                  onRowClickEvent(e, row, idx);
                } : undefined}
                onRowContextMenu={onRowContextMenu}
              />
            )}
          </div>
          {sidePanel != null && (
            // 상세패널 안 더블클릭은 닫힘과 무관 — 닫기는 X버튼·행 재더블클릭·바깥으로만.
            <aside className="ledger-workspace__panel">
              {sidePanel}
            </aside>
          )}
        </div>
        {detail != null && sheetRows.length > 0 && (
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
    </Page>
  );
}
