/**
 * 리스크관리 엑셀 열 — 구분 · 차번 · 대상 · 차명 · 기한 · 금액 · 상태
 */
import React from 'react';
import { Badge, won, C, type SheetCol } from '@/components/ui';
import type { RiskSheetRow } from './risk-ledger';
import { buildSheetViews, buildDetailSections, type DetailSectionDef, type SheetViewKeys } from './ledger-ext';
import { LEDGER_EMPTY } from './ledger-empty';

const toneColor = (tone: RiskSheetRow['tone']) => (
  tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'brand' ? C.brand : C.mute
);

const CATALOG: SheetCol<RiskSheetRow>[] = [
  {
    key: 'company', label: '회사명', pin: true, priority: 2,
    render: (r) => r.company || LEDGER_EMPTY.dash,
    text: (r) => r.company,
  },
  {
    key: 'group', label: '구분', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.badgeTone}>{r.group}</Badge>,
    text: (r) => r.group,
  },
  {
    key: 'kind', label: '세부', priority: 2, align: 'c',
    render: (r) => r.kind || LEDGER_EMPTY.dash,
    text: (r) => r.kind,
  },
  {
    key: 'plate', label: '차량번호', priority: 1, pin: true,
    render: (r) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {r.plate || LEDGER_EMPTY.dash}
      </span>
    ),
    text: (r) => r.plate,
  },
  {
    key: 'customer', label: '대상', priority: 1,
    render: (r) => r.customer || LEDGER_EMPTY.none,
    text: (r) => r.customer,
  },
  {
    key: 'carName', label: '차명', priority: 2,
    render: (r) => r.carName || LEDGER_EMPTY.dash,
    text: (r) => r.carName,
  },
  {
    key: 'due', label: '기한', priority: 1, align: 'c',
    render: (r) => <span style={{ fontWeight: 700, color: toneColor(r.tone) }}>{r.due || LEDGER_EMPTY.dash}</span>,
    text: (r) => r.due,
  },
  {
    key: 'amount', label: '금액', priority: 1, align: 'r', sortNum: true,
    render: (r) => (r.amount > 0
      ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.amount)}</span>
      : LEDGER_EMPTY.dash),
    text: (r) => r.amount,
  },
  {
    key: 'status', label: '상태', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.badgeTone}>{r.status || LEDGER_EMPTY.dash}</Badge>,
    text: (r) => r.status,
  },
];

/** 회사 → 신원 → 내용(차명) → 분류 → 상태 → 수치 */
export const RISK_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'customer', 'carName', 'group', 'status', 'due', 'amount'],
  all: ['company', 'plate', 'customer', 'carName', 'group', 'kind', 'status', 'due', 'amount'],
};

const views = buildSheetViews(CATALOG, RISK_SHEET_KEYS);
export const RISK_BASIC_COLS = views.basic;
export const RISK_EXPANDED_COLS = views.expanded;

/** 리스크 상세 — `리스크 · {섹션} · ±key` */
export const RISK_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '신원·분류',
    open: true,
    keys: ['company', 'plate', 'customer', 'group', 'kind', 'status'],
  },
  {
    title: '기한·금액',
    keys: ['carName', 'due', 'amount'],
  },
];

export const RISK_DETAIL_SECTIONS = buildDetailSections(RISK_EXPANDED_COLS, RISK_DETAIL_DEFS);
