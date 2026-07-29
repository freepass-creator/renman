/**
 * 일정 원장 열 — AgendaItem 1건=1행. 어김·임박·예정 이행상태.
 * 엑셀 추가/삭제: `일정 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts
 */
import React from 'react';
import { Badge, type SheetCol, C } from '@/components/ui';
import type { AgendaItem } from './agenda';
import {
  buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys,
} from './ledger-ext';
import { LEDGER_EMPTY } from './ledger-empty';

const statusTone = (s: AgendaItem['status']): 'red' | 'amber' | 'green' =>
  s === '어김' ? 'red' : s === '임박' ? 'amber' : 'green';

const AGENDA_COL_CATALOG: SheetCol<AgendaItem>[] = [
  { key: 'company', label: '표시명', pin: true, align: 'c', render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'date', label: '기한일', align: 'c', render: (r) => r.date, text: (r) => r.date },
  {
    key: 'dday', label: 'D-day', align: 'c',
    render: (r) => (
      <span style={{ fontWeight: 700, color: r.dday < 0 ? C.danger : r.dday <= 7 ? C.warn : C.ink }}>
        {r.dday < 0 ? `${-r.dday}일 지남` : r.dday === 0 ? '오늘' : `D-${r.dday}`}
      </span>
    ),
    text: (r) => r.dday,
  },
  {
    key: 'status', label: '이행', align: 'c',
    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'kind', label: '종류', align: 'c',
    render: (r) => <Badge tone="gray">{r.kind}</Badge>,
    text: (r) => r.kind,
  },
  { key: 'plate', label: '차량', pin: true, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate },
  { key: 'title', label: '내용', render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  { key: 'companyId', label: '회사ID', render: (r) => r.companyId || LEDGER_EMPTY.dash, text: (r) => r.companyId },
  { key: 'key', label: '키', render: (r) => r.key, text: (r) => r.key },
];

export const AGENDA_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'date', 'dday', 'status', 'kind', 'plate', 'title'],
  all: ['company', 'date', 'dday', 'status', 'kind', 'plate', 'title', 'companyId', 'key'],
};

const _agendaViews = buildSheetViews(AGENDA_COL_CATALOG, AGENDA_SHEET_KEYS);
export const AGENDA_BASIC_COLS = _agendaViews.basic;
export const AGENDA_EXPANDED_COLS = _agendaViews.expanded;

/** 일정 상세 — `일정 · {섹션} · +|-key` */
export const AGENDA_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '일정 기본', open: true, keys: ['company', 'date', 'dday', 'status', 'kind'] },
  { title: '대상·내용', keys: ['plate', 'title'] },
  { title: '식별', keys: ['companyId', 'key'] },
];

export const AGENDA_DETAIL_SECTIONS = buildDetailSections(AGENDA_EXPANDED_COLS, AGENDA_DETAIL_DEFS);
