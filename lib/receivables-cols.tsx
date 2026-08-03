import React from 'react';
import { Badge, C, money, type SheetCol } from '@/components/ui';
import { collectionTermsLabel, type ReceivableRow } from './receivables-ledger';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from './ledger-ext';
import { LEDGER_EMPTY } from './ledger-empty';
import { companyLabel } from './companies';
import { LEDGER_LABEL } from './ledger-labels';

const stageTone = (stage: string): 'gray' | 'amber' | 'orange' | 'red' | 'purple' => {
  if (stage === '채권화') return 'purple';
  if (stage === '내용증명') return 'red';
  if (stage === '차량회수') return 'red';
  if (stage === '계약조건 확인') return 'amber';
  if (stage === '시동제어') return 'orange';
  if (stage === '경고') return 'amber';
  return 'gray';
};

export const receivableRowKey = (row: ReceivableRow): string => String(row.rec._key || `${row.rec.companyId || ''}:${row.rec.contractNo || ''}:${row.rec.plate || ''}`);

export const receivableContractState = (row: ReceivableRow): '계약유지' | '계약종료' => row.v.ended ? '계약종료' : '계약유지';

export const receivableNextAction = (row: ReceivableRow): string => {
  if (row.v.ended) {
    if (row.rec.engineDisabled) return '종료계약 시동제어 해제 확인';
    if (!row.rec.noticeSentDate && (row.st.stage === '내용증명' || row.st.stage === '채권화')) return '내용증명 발송';
    return '보증금 정산·잔존채권 회수';
  }
  return row.st.nextAction || '입금 확인·연락';
};

const CATALOG: SheetCol<ReceivableRow>[] = [
  {
    key: 'company', label: LEDGER_LABEL.company, pin: true, priority: 2,
    render: (r) => r.rec.companyId ? companyLabel(String(r.rec.companyId)) : LEDGER_EMPTY.dash,
    text: (r) => r.rec.companyId ? companyLabel(String(r.rec.companyId)) : '',
  },
  {
    key: 'contractState', label: '미수분류', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.v.ended ? 'gray' : 'blue'}>{receivableContractState(r)}</Badge>,
    text: receivableContractState,
  },
  {
    key: 'stage', label: '미수상태', priority: 1, align: 'c',
    render: (r) => <Badge tone={stageTone(r.st.stage)}>{r.st.stage}</Badge>,
    text: (r) => r.st.stage,
  },
  {
    key: 'customer', label: LEDGER_LABEL.contractor, priority: 1,
    render: (r) => String(r.rec.contractorName || LEDGER_EMPTY.none),
    text: (r) => String(r.rec.contractorName || ''),
  },
  {
    key: 'plate', label: LEDGER_LABEL.plate, pin: true, priority: 1,
    render: (r) => <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{String(r.rec.plate || LEDGER_EMPTY.dash)}</span>,
    text: (r) => String(r.rec.plate || ''),
  },
  {
    key: 'unpaid', label: '미수금', priority: 1, align: 'r', sortNum: true, xf: 'money',
    render: (r) => <span style={{ color: C.danger, fontWeight: 800 }}>{money(r.v.net)}</span>,
    text: (r) => r.v.net,
  },
  {
    key: 'overdueDays', label: '연체일', priority: 1, align: 'r', sortNum: true,
    render: (r) => <span style={{ color: r.v.overdueDays >= 30 ? C.danger : C.warn, fontWeight: 700 }}>{r.v.overdueDays}일</span>,
    text: (r) => r.v.overdueDays,
  },
  {
    key: 'unpaidCount', label: '미납회차', priority: 1, align: 'r', sortNum: true,
    render: (r) => `${r.v.count}회`,
    text: (r) => r.v.count,
  },
  {
    key: 'nextAction', label: '다음조치', priority: 1,
    render: (r) => receivableNextAction(r),
    text: receivableNextAction,
  },
  {
    key: 'contractTerms', label: '연체조치 계약조건', priority: 2,
    render: (r) => collectionTermsLabel(r.rec),
    text: (r) => collectionTermsLabel(r.rec),
  },
  {
    key: 'contractNo', label: LEDGER_LABEL.contractNo, priority: 2,
    render: (r) => String(r.rec.contractNo || LEDGER_EMPTY.dash),
    text: (r) => String(r.rec.contractNo || ''),
  },
  {
    key: 'phone', label: LEDGER_LABEL.phone, priority: 2,
    render: (r) => String(r.rec.contractorPhone || LEDGER_EMPTY.dash),
    text: (r) => String(r.rec.contractorPhone || ''),
  },
  {
    key: 'period', label: '계약기간', priority: 2,
    render: (r) => `${r.v.startDate || LEDGER_EMPTY.dash} ~ ${r.v.endDate || LEDGER_EMPTY.dash}`,
    text: (r) => `${r.v.startDate || ''} ${r.v.endDate || ''}`,
  },
  {
    key: 'monthlyRent', label: '월대여료', priority: 2, align: 'r', sortNum: true, xf: 'money',
    render: (r) => r.v.monthlyRent ? money(r.v.monthlyRent) : LEDGER_EMPTY.dash,
    text: (r) => r.v.monthlyRent,
  },
  {
    key: 'gross', label: '청구잔액', priority: 2, align: 'r', sortNum: true, xf: 'money',
    render: (r) => money(r.v.gross),
    text: (r) => r.v.gross,
  },
  {
    key: 'paid', label: '확인입금', priority: 2, align: 'r', sortNum: true, xf: 'money',
    render: (r) => money(r.v.paid),
    text: (r) => r.v.paid,
  },
  {
    key: 'notice', label: '내용증명', priority: 2,
    render: (r) => r.rec.noticeSentDate ? `발송 ${String(r.rec.noticeSentDate).slice(0, 10)}` : '미발송',
    text: (r) => String(r.rec.noticeSentDate || '미발송'),
  },
  {
    key: 'engine', label: '시동제어', priority: 2,
    render: (r) => r.rec.engineDisabled
      ? (r.v.ended ? <span style={{ color: C.danger, fontWeight: 700 }}>종료 후 잔존</span> : `적용중 ${String(r.rec.engineDisabledAt || '').slice(0, 10)}`)
      : (r.v.ended ? '대상 아님' : '미적용'),
    text: (r) => r.rec.engineDisabled ? (r.v.ended ? '종료 후 잔존' : '적용중') : (r.v.ended ? '대상 아님' : '미적용'),
  },
  {
    key: 'lastContact', label: '최근연락', priority: 2,
    render: (r) => r.contact ? `${String(r.contact.category || '')} · ${String(r.contact.date || '')}` : LEDGER_EMPTY.none,
    text: (r) => r.contact ? `${String(r.contact.category || '')} ${String(r.contact.date || '')}` : '',
  },
  {
    key: 'contactMemo', label: '연락내용', priority: 2,
    render: (r) => r.contact ? String(r.contact.memo || r.contact.content || r.contact.note || LEDGER_EMPTY.dash) : LEDGER_EMPTY.dash,
    text: (r) => r.contact ? String(r.contact.memo || r.contact.content || r.contact.note || '') : '',
  },
];

export const RECEIVABLE_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'contractNo', 'customer', 'contractState', 'stage', 'plate', 'unpaid', 'overdueDays', 'unpaidCount', 'nextAction'],
  all: ['company', 'contractNo', 'customer', 'contractState', 'stage', 'plate', 'unpaid', 'overdueDays', 'unpaidCount', 'nextAction', 'contractTerms', 'phone', 'period', 'monthlyRent', 'gross', 'paid', 'notice', 'engine', 'lastContact', 'contactMemo'],
};

const views = buildSheetViews(CATALOG, RECEIVABLE_SHEET_KEYS);
export const RECEIVABLE_BASIC_COLS = views.basic;
export const RECEIVABLE_EXPANDED_COLS = views.expanded;

const DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '채권 현황', open: true,
    keys: ['company', 'contractState', 'stage', 'unpaid', 'gross', 'paid', 'overdueDays', 'unpaidCount', 'nextAction'],
  },
  {
    title: '계약·고객',
    keys: ['contractNo', 'customer', 'phone', 'plate', 'period', 'monthlyRent', 'contractTerms'],
  },
  {
    title: '회수 조치',
    keys: ['notice', 'engine', 'lastContact', 'contactMemo'],
  },
];

export const RECEIVABLE_DETAIL_SECTIONS = buildDetailSections(RECEIVABLE_EXPANDED_COLS, DETAIL_DEFS);
