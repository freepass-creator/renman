/**
 * 자금·계좌 열 SSOT — BankAccountRow.
 * 엑셀: `자금·계좌 · 엑셀기본|엑셀전체 · ±key` @see lib/ledger-ext.ts
 */
import { Badge, C, money, TwoLineCell, type SheetCol } from '@/components/ui';
import type { BankAccountRow } from '@/lib/finance/cash-ledger';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

const ACCOUNT_COL_CATALOG: SheetCol<BankAccountRow>[] = [
  { key: 'company', label: '회사명', priority: 1, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  {
    key: 'bank', label: '은행·계좌', priority: 1,
    render: (r) => (
      <TwoLineCell
        main={r.bankName || r.accountAlias || LEDGER_EMPTY.dash}
        sub={r.accountNumber || undefined}
      />
    ),
    text: (r) => [r.bankName, r.accountNumber].filter(Boolean).join(' '),
  },
  { key: 'account', label: '계좌번호', priority: 2, render: (r) => r.accountNumber || LEDGER_EMPTY.dash, text: (r) => r.accountNumber },
  { key: 'alias', label: '계좌명', priority: 1, render: (r) => r.accountAlias || LEDGER_EMPTY.dash, text: (r) => r.accountAlias },
  { key: 'holder', label: '예금주', priority: 2, render: (r) => r.accountHolder || LEDGER_EMPTY.dash, text: (r) => r.accountHolder },
  { key: 'type', label: '계좌분류', priority: 2, render: (r) => r.accountType || LEDGER_EMPTY.dash, text: (r) => r.accountType },
  {
    key: 'status', label: '계좌상태', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.status === '사용중' ? 'green' : 'gray'}>{r.status || LEDGER_EMPTY.dash}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'totalIn', label: '누적입금', priority: 1, align: 'r',
    render: (r) => (r.totalIn ? <b style={{ color: C.ok }}>{money(r.totalIn)}</b> : LEDGER_EMPTY.dash),
    text: (r) => r.totalIn,
  },
  {
    key: 'totalOut', label: '누적출금', priority: 1, align: 'r',
    render: (r) => (r.totalOut ? <b>{money(r.totalOut)}</b> : LEDGER_EMPTY.dash),
    text: (r) => r.totalOut,
  },
  {
    key: 'currentBalance', label: '최종잔액', priority: 1, align: 'r',
    render: (r) => money(r.currentBalance),
    text: (r) => r.currentBalance,
  },
  {
    key: 'createdAt', label: '등록일', priority: 2,
    render: (r) => (r.createdAt ? r.createdAt.slice(0, 10) : LEDGER_EMPTY.dash),
    text: (r) => r.createdAt,
  },
  {
    key: 'createdBy', label: '등록자', priority: 2,
    render: (r) => r.createdBy || LEDGER_EMPTY.dash,
    text: (r) => r.createdBy,
  },
  { key: 'opened', label: '개설일', render: (r) => r.openedDate || LEDGER_EMPTY.dash, text: (r) => r.openedDate },
  { key: 'closed', label: '해지일', render: (r) => r.closedDate || LEDGER_EMPTY.dash, text: (r) => r.closedDate },
  {
    key: 'balance', label: '등록시점 잔액', align: 'r',
    render: (r) => (r.openingBalance ? money(r.openingBalance) : LEDGER_EMPTY.dash),
    text: (r) => r.openingBalance,
  },
  { key: 'method', label: '수집방법', render: (r) => r.importMethod || LEDGER_EMPTY.dash, text: (r) => r.importMethod },
  { key: 'memo', label: '메모', render: (r) => r.memo || LEDGER_EMPTY.dash, text: (r) => r.memo },
  {
    key: 'updated', label: '최종수정일',
    render: (r) => (r.updatedAt ? r.updatedAt.slice(0, 16).replace('T', ' ') : LEDGER_EMPTY.dash),
    text: (r) => r.updatedAt,
  },
];

/** 회사 → 신원(은행·계좌) → 상태 → 수치 */
export const ACCOUNT_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'bank', 'holder', 'type', 'status', 'alias', 'totalIn', 'totalOut', 'currentBalance'],
  all: [
    'company', 'bank', 'account', 'alias', 'holder', 'type', 'status',
    'totalIn', 'totalOut', 'currentBalance', 'createdAt', 'createdBy',
    'opened', 'closed', 'balance', 'method', 'memo', 'updated',
  ],
};

const _accountViews = buildSheetViews(ACCOUNT_COL_CATALOG, ACCOUNT_SHEET_KEYS);
export const ACCOUNT_BASIC_COLS = _accountViews.basic;
export const ACCOUNT_ALL_COLS = _accountViews.expanded;

export const ACCOUNT_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '계좌 기본', open: true, keys: ['company', 'bank', 'account', 'alias', 'holder', 'type', 'status'] },
  { title: '잔액·등록', keys: ['totalIn', 'totalOut', 'currentBalance', 'createdAt', 'createdBy'] },
  { title: '개설·수집', keys: ['opened', 'closed', 'balance', 'method', 'memo', 'updated'] },
];

export const ACCOUNT_DETAIL_SECTIONS = buildDetailSections(ACCOUNT_ALL_COLS, ACCOUNT_DETAIL_DEFS);
