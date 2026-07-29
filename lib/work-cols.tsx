/**
 * 업무·과태료 엑셀 열 SSOT.
 * 추가/삭제: `업무 · 엑셀기본|엑셀전체 · ±key` / `과태료 · …` @see lib/ledger-ext.ts
 * 회사 열 key = `company` (전 원장 통일).
 */
'use client';

import React from 'react';
import { Badge, C, money, TwoLineCell, type SheetCol } from '@/components/ui';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import {
  WORK_SOURCE_LABEL,
  fmtStamp,
  workStatusTone,
  type WorkLedgerRow,
} from '@/lib/work-ledger';

function KindCell({ kind }: { kind: string }) {
  if (!kind || kind === '미분류' || kind === '일반') {
    return <Badge tone="amber">미분류</Badge>;
  }
  return <>{kind}</>;
}

function AssigneeCell({ name }: { name: string }) {
  if (!name) return <Badge tone="amber">미지정</Badge>;
  return <>{name}</>;
}

const WORK_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  {
    key: 'kind', label: '업무구분', pin: true, priority: 1,
    render: (r) => <KindCell kind={r.kind} />,
    text: (r) => r.kind,
  },
  {
    key: 'status', label: '상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'plate', label: '차량번호', priority: 1, pin: true,
    render: (r) => (r.plate
      ? <TwoLineCell mono main={r.plate} sub={r.carName || undefined} />
      : <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>),
    text: (r) => [r.plate, r.carName].filter(Boolean).join(' '),
  },
  {
    key: 'contractor', label: '계약자', priority: 1,
    render: (r) => {
      const name = String(r.customerName || '').trim();
      if (!name) return <span style={{ color: C.mute }}>{LEDGER_EMPTY.none}</span>;
      return <TwoLineCell main={name} sub={r.rentalType || undefined} />;
    },
    text: (r) => r.customerName || LEDGER_EMPTY.none,
  },
  { key: 'title', label: '업무내용', priority: 1, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  {
    key: 'contractNo', label: '계약번호', priority: 1,
    render: (r) => r.contractNo || LEDGER_EMPTY.dash,
    text: (r) => r.contractNo || '',
  },
  {
    key: 'priority', label: '우선순위', align: 'c', priority: 1,
    render: (r) => {
      const p = String(r.priority || '').trim();
      if (!p) return <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>;
      const tone = /긴급/.test(p) ? 'red' as const : /높음/.test(p) ? 'amber' as const : 'gray' as const;
      return <Badge tone={tone}>{p}</Badge>;
    },
    text: (r) => r.priority || '',
  },
  {
    key: 'workDate', label: '발생일', priority: 1,
    render: (r) => r.workDate || LEDGER_EMPTY.dash,
    text: (r) => r.workDate,
  },
  {
    key: 'assignee', label: '담당자', priority: 1,
    render: (r) => <AssigneeCell name={r.assignee} />,
    text: (r) => r.assignee,
  },
  {
    key: 'created', label: '생성일시', priority: 1,
    render: (r) => fmtStamp(r.createdAt),
    text: (r) => r.createdAt,
  },
  {
    key: 'updated', label: '최종처리', priority: 1,
    render: (r) => fmtStamp(r.updatedAt),
    text: (r) => r.updatedAt,
  },
  { key: 'due', label: '기한', priority: 1, render: (r) => r.dueDate || LEDGER_EMPTY.dash, text: (r) => r.dueDate },
  { key: 'amount', label: '금액', align: 'r', render: (r) => (r.amount ? money(r.amount) : LEDGER_EMPTY.dash), text: (r) => r.amount || '' },
  { key: 'source', label: '원천', render: (r) => WORK_SOURCE_LABEL[r.source], text: (r) => r.source },
];

const PENALTY_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'violationDate', label: '위반일', pin: true, priority: 1, render: (r) => r.violationDate || LEDGER_EMPTY.dash, text: (r) => r.violationDate || '' },
  { key: 'plate', label: '차량번호', pin: true, priority: 1, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate || '' },
  {
    key: 'amount', label: '금액', align: 'r', priority: 1,
    render: (r) => (r.amount ? <span style={{ color: C.warn, fontWeight: 700 }}>{money(r.amount)}</span> : LEDGER_EMPTY.dash),
    text: (r) => r.amount || '',
  },
  { key: 'driver', label: '실운전자', priority: 1, render: (r) => r.driverName || LEDGER_EMPTY.unmatched, text: (r) => r.driverName || '' },
  {
    key: 'status', label: '처리상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  { key: 'ptype', label: '유형', priority: 2, render: (r) => r.penaltyKind || LEDGER_EMPTY.dash, text: (r) => r.penaltyKind || '' },
  { key: 'title', label: '위반내용', priority: 2, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  { key: 'company', label: '회사명', priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'due', label: '납기', priority: 2, render: (r) => r.dueDate || LEDGER_EMPTY.dash, text: (r) => r.dueDate },
];

export const WORK_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'contractor', 'title', 'kind', 'priority', 'status', 'contractNo', 'workDate', 'due', 'assignee'],
  all: [
    'company', 'plate', 'contractor', 'title', 'kind', 'priority', 'status', 'contractNo', 'workDate',
    'assignee', 'created', 'updated', 'due', 'amount', 'source',
  ],
};

export const PENALTY_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'driver', 'title', 'status', 'violationDate', 'amount'],
  all: ['company', 'plate', 'driver', 'title', 'status', 'violationDate', 'amount', 'ptype', 'due'],
};

const _workViews = buildSheetViews(WORK_COL_CATALOG, WORK_SHEET_KEYS);
export const WORK_BASIC_COLS = _workViews.basic;
export const WORK_ALL_COLS = _workViews.expanded;

const _penViews = buildSheetViews(PENALTY_COL_CATALOG, PENALTY_SHEET_KEYS);
export const PENALTY_BASIC_COLS = _penViews.basic;
export const PENALTY_ALL_COLS = _penViews.expanded;

export const WORK_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '업무 분류', open: true, keys: ['company', 'kind', 'priority', 'status', 'source'] },
  { title: '신원·내용', keys: ['plate', 'contractor', 'contractNo', 'title'] },
  { title: '처리정보', keys: ['workDate', 'created', 'updated', 'due', 'assignee', 'amount'] },
];

export const PENALTY_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '고지서', open: true, keys: ['violationDate', 'plate', 'amount', 'driver', 'status'] },
  { title: '부가', keys: ['ptype', 'title', 'company', 'due'] },
];

export const WORK_DETAIL_SECTIONS = buildDetailSections(WORK_ALL_COLS, WORK_DETAIL_DEFS);
export const PENALTY_DETAIL_SECTIONS = buildDetailSections(PENALTY_ALL_COLS, PENALTY_DETAIL_DEFS);

export { workStatusTone };
