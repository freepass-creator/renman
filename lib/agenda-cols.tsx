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
import { LEDGER_LABEL } from './ledger-labels';

const statusTone = (s: AgendaItem['status']): 'red' | 'amber' | 'green' =>
  s === '어김' ? 'red' : s === '임박' ? 'amber' : 'green';

const AGENDA_COL_CATALOG: SheetCol<AgendaItem>[] = [
  { key: 'company', label: LEDGER_LABEL.company, pin: true, align: 'c', render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'date', label: '기한일', align: 'c', xf: 'date', render: (r) => r.date, text: (r) => r.date },
  {
    key: 'dday', label: LEDGER_LABEL.dday, align: 'c', sortNum: true, xf: 'int',
    render: (r) => (
      <span style={{ fontWeight: 700, color: r.dday < 0 ? C.danger : r.dday <= 7 ? C.warn : C.ink }}>
        {r.dday < 0 ? `${-r.dday}일 지남` : r.dday === 0 ? '오늘' : `D-${r.dday}`}
      </span>
    ),
    text: (r) => r.dday,
  },
  {
    key: 'status', label: '일정상태', align: 'c',
    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'kind', label: '일정분류', align: 'c',
    render: (r) => <Badge tone="gray">{r.kind}</Badge>,
    text: (r) => r.kind,
  },
  { key: 'plate', label: LEDGER_LABEL.plate, pin: true, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate },
  // 「X내용」 규격 + 상태 뒤 자리 — 리스크(리스크내용)·업무(업무내용)와 같은 성격·같은 자리.
  { key: 'title', label: '일정내용', render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  { key: 'companyId', label: '회사ID', render: (r) => r.companyId || LEDGER_EMPTY.dash, text: (r) => r.companyId },
  { key: 'key', label: '키', render: (r) => r.key, text: (r) => r.key },
];

export const AGENDA_SHEET_KEYS: SheetViewKeys = {
  // 기준 = 자산관리: 회사(1) · 식별자(2) · 이름(3) · 분류(4) · 상태(5) · 나머지
  // 일정은 «차명» 칸이 없어 신원 블록이 차량번호 하나다. 내용은 다른 원장과 같이 상태 뒤.
  basic: ['company', 'plate', 'kind', 'status', 'title', 'date', 'dday'],
  all: ['company', 'plate', 'kind', 'status', 'title', 'date', 'dday', 'companyId', 'key'],
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
