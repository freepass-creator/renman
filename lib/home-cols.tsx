/**
 * 홈 주의원장 열 — 미결·리스크·휴차.
 * 컬럼: 구분 · 차번 · 대상 · 차명 · 기한 · 금액 · 상태
 */
import React from 'react';
import { Badge, won, C, type SheetCol } from '@/components/ui';
import type { HomeSheetRow } from './home-briefing';
import { buildSheetViews, type SheetViewKeys } from './ledger-ext';

const toneColor = (tone: HomeSheetRow['tone']) => (
  tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'brand' ? C.brand : C.mute
);

const CATALOG: SheetCol<HomeSheetRow>[] = [
  {
    key: 'group', label: '구분', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.badgeTone}>{r.group}</Badge>,
    text: (r) => r.group,
  },
  {
    key: 'kind', label: '세부', priority: 2, align: 'c',
    render: (r) => r.kind,
    text: (r) => r.kind,
  },
  {
    key: 'plate', label: '차번', priority: 1, pin: true,
    render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.plate || '—'}</span>,
    text: (r) => r.plate,
  },
  {
    key: 'customer', label: '대상', priority: 1,
    render: (r) => r.customer || '—',
    text: (r) => r.customer,
  },
  {
    key: 'carName', label: '차명', priority: 2,
    render: (r) => r.carName || '—',
    text: (r) => r.carName,
  },
  {
    key: 'due', label: '기한', priority: 1, align: 'c',
    render: (r) => <span style={{ fontWeight: 700, color: toneColor(r.tone) }}>{r.due}</span>,
    text: (r) => r.due,
  },
  {
    key: 'amount', label: '금액', priority: 1, align: 'r', sortNum: true,
    render: (r) => (r.amount > 0
      ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.amount)}</span>
      : '—'),
    text: (r) => r.amount,
  },
  {
    key: 'status', label: '상태', priority: 1, align: 'c',
    render: (r) => <span style={{ fontWeight: 700, color: toneColor(r.tone) }}>{r.status}</span>,
    text: (r) => r.status,
  },
];

export const HOME_SHEET_KEYS: SheetViewKeys = {
  basic: ['group', 'plate', 'customer', 'carName', 'due', 'amount', 'status'],
  all: ['group', 'kind', 'plate', 'customer', 'carName', 'due', 'amount', 'status'],
};

const views = buildSheetViews(CATALOG, HOME_SHEET_KEYS);
export const HOME_BASIC_COLS = views.basic;
export const HOME_EXPANDED_COLS = views.expanded;
