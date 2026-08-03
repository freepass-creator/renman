import React from 'react';
import { Badge, C, money, type SheetCol } from '@/components/ui';
import { buildDetailSections, buildSheetViews } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import type { CashPlanRow } from './cash-plan';

const statusTone = (status: string) => status === '기한경과' || status === '분류필요'
  ? 'red' as const : status === '일정확인' ? 'amber' as const : 'blue' as const;
const directionTone = (direction: string) => direction === '입금'
  ? 'green' as const : direction === '출금' ? 'gray' as const : 'amber' as const;

const CATALOG: SheetCol<CashPlanRow>[] = [
  { key: 'company', label: '회사명', priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'dueDate', label: '예정일', pin: true, priority: 1, render: (r) => r.dueDate || '일정 미정', text: (r) => r.dueDate },
  { key: 'direction', label: '입출금', priority: 1, align: 'c', render: (r) => <Badge tone={directionTone(r.direction)}>{r.direction}</Badge>, text: (r) => r.direction },
  { key: 'source', label: '근거', priority: 1, render: (r) => r.source, text: (r) => r.source },
  { key: 'title', label: '예정 내용', priority: 1, render: (r) => r.title, text: (r) => r.title },
  { key: 'amount', label: '예정금액', priority: 1, align: 'r', sortNum: true, xf: 'money', render: (r) => <b style={{ color: r.direction === '입금' ? C.ok : C.ink }}>{money(r.amount)}</b>, text: (r) => r.amount },
  { key: 'projectedBalance', label: '예상잔액', priority: 1, align: 'r', sortNum: true, xf: 'money', render: (r) => r.balanceKnown ? <b style={{ color: r.projectedBalance < 0 ? C.danger : C.ink }}>{money(r.projectedBalance)}</b> : '잔액 미확인', text: (r) => r.balanceKnown ? r.projectedBalance : '' },
  { key: 'status', label: '처리상태', priority: 1, align: 'c', render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>, text: (r) => r.status },
  { key: 'certainty', label: '확정도', priority: 2, align: 'c', render: (r) => <Badge tone={r.certainty === '확정' ? 'green' : r.certainty === '확인필요' ? 'amber' : 'gray'}>{r.certainty}</Badge>, text: (r) => r.certainty },
  { key: 'counterparty', label: '거래처·대상', priority: 2, render: (r) => r.counterparty || LEDGER_EMPTY.dash, text: (r) => r.counterparty },
  { key: 'reference', label: '연결 근거', priority: 2, render: (r) => r.reference || LEDGER_EMPTY.dash, text: (r) => r.reference },
  { key: 'memo', label: '비고', priority: 2, render: (r) => r.memo || LEDGER_EMPTY.dash, text: (r) => r.memo },
];

const views = buildSheetViews(CATALOG, {
  basic: ['company', 'dueDate', 'direction', 'source', 'title', 'amount', 'projectedBalance', 'status'],
  all: ['company', 'dueDate', 'direction', 'source', 'title', 'amount', 'projectedBalance', 'status', 'certainty', 'counterparty', 'reference', 'memo'],
});

export const CASH_PLAN_BASIC_COLS = views.basic;
export const CASH_PLAN_EXPANDED_COLS = views.expanded;
export const CASH_PLAN_DETAIL_SECTIONS = buildDetailSections(CATALOG, [
  { title: '자금예정', open: true, keys: ['company', 'dueDate', 'direction', 'source', 'title', 'amount', 'projectedBalance', 'status', 'certainty'] },
  { title: '연결 근거', keys: ['counterparty', 'reference', 'memo'] },
]);
