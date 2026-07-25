'use client';
/**
 * LedgerFrame — 원장 페이지 공용 틀 (재무·운영 동일 규격).
 *   Page(frame) + 필터 1행 + ExcelSheet + (옵션) 행 아래 펼침 detail.
 *   좌측 FacetRail 없음. 재무 세부는 오버레이 말고 detail 슬롯(목록 밑).
 */
import React, { type ReactNode } from 'react';
import { Page } from './layout';
import { ExcelSheet, type SheetCol } from './excel-sheet';
import { PillTabs } from './controls';
import { EmptyState, Message, PageLoading } from './misc';
import { C } from './tokens';

export type LedgerColView = '기본' | '전체';

export function LedgerFrame<R>({
  title, meta, right, hint,
  filters, stats,
  colView, onColView,
  loading, empty,
  cols, rows, rowKey, onRow,
  rowStyle, rowClickable,
  detail,
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
  rowStyle?: (r: R) => React.CSSProperties | undefined;
  rowClickable?: (r: R) => boolean;
  /** 행 클릭 후 표 바로 아래(수동매칭 등). CMS 구성건은 표에 상시 표시. */
  detail?: ReactNode;
}) {
  return (
    <Page frame title={title} meta={meta} right={right}>
      {hint != null && (
        typeof hint === 'string' || typeof hint === 'number'
          ? <Message variant="info">{hint}</Message>
          : hint
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, flexShrink: 0,
        padding: '8px 0 10px',
      }}>
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

      {loading ? <PageLoading /> : !rows.length ? (
        <EmptyState>{empty ?? '표시할 항목이 없습니다'}</EmptyState>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <ExcelSheet
              cols={cols}
              rows={rows}
              rowKey={rowKey}
              onRow={onRow}
              rowStyle={rowStyle}
              rowClickable={rowClickable}
            />
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
