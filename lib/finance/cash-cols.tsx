/**
 * 재무원장 열 SSOT — 계좌 입·출금 스트림(CashRow).
 * 엑셀 추가/삭제: `자금 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts
 */
import { Badge, C, won, type RailTone, type SheetCol } from '@/components/ui';
import { companyDisplay } from '@/lib/companies';
import { groupOfLabel, isUnclassified, kindOfLabel } from '@/lib/payments/ledger-subjects';
import type { CashRow } from '@/lib/finance/cash-ledger';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { workRailStyle } from '@/lib/work-rail';

const coName = (r: CashRow) => companyDisplay(r.companyId);
const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : LEDGER_EMPTY.dash);
const content = (r: CashRow) => {
  const a = (r.party || '').trim();
  const b = (r.memo || '').trim();
  if (a && b && a !== b) return `${a} · ${b}`;
  return a || b || '';
};

const matchStatus = (r: CashRow) => {
  if (r.nest === 'cms-item') return { label: '매칭완료', tone: 'green' as const };
  if (r.nest === 'cms-pending') return { label: LEDGER_EMPTY.unmatched, tone: 'amber' as const };
  if (r.nest === 'cms-dep') {
    return String(r.raw.settlementRole || '') === 'deposit'
      ? { label: '매칭완료', tone: 'green' as const }
      : { label: LEDGER_EMPTY.unmatched, tone: 'amber' as const };
  }
  if (r.raw.matchedContractId || r.raw.matchedScheduleSeq) return { label: '매칭완료', tone: 'green' as const };
  if (r.inAmt > 0) return { label: LEDGER_EMPTY.unmatched, tone: 'amber' as const };
  return { label: '해당없음', tone: 'gray' as const };
};

/** 자금 행 rail — 미매칭=warn · 매칭완료·해당없음=무색. */
export function cashRail(r: CashRow): RailTone {
  return matchStatus(r).label === LEDGER_EMPTY.unmatched ? 'warn' : 'none';
}

export { workRailStyle as cashRailStyle };

const CASH_COL_CATALOG: SheetCol<CashRow>[] = [
  {
    key: 'company', label: '회사명', pin: true, priority: 1,
    render: (r) => (r.nest === 'cms-item'
      ? <span style={{ color: C.mute, paddingLeft: 14 }}>↳ CMS</span>
      : coName(r)),
    text: (r) => (r.nest === 'cms-item' ? 'CMS연결' : coName(r)),
  },
  {
    key: 'acctName', label: '계좌명', pin: true, priority: 1,
    render: (r) => r.accountName || (r.nest === 'cms-pending' ? 'CMS 명세' : LEDGER_EMPTY.dash),
    text: (r) => r.accountName || (r.nest === 'cms-pending' ? 'CMS 명세' : ''),
  },
  {
    key: 'acct', label: '계좌번호', priority: 2,
    render: (r) => {
      if (r.nest === 'cms-item') return <span style={{ color: C.mute, fontSize: 11 }}>{r.account || LEDGER_EMPTY.dash}</span>;
      if (r.nest === 'cms-pending') return <span style={{ color: C.mute }}>CMS명세</span>;
      return r.account || LEDGER_EMPTY.dash;
    },
    text: (r) => r.account || (r.nest === 'cms-pending' ? 'CMS명세' : ''),
  },
  {
    key: 'content', label: '내용', priority: 2,
    render: (r) => content(r) || <span style={{ color: C.faint }}>{LEDGER_EMPTY.dash}</span>,
    text: (r) => content(r),
  },
  {
    key: 'cat', label: '계정과목', priority: 1,
    render: (r) => {
      if (r.nest === 'cms-item') return <Badge tone="blue">CMS연결</Badge>;
      if (r.nest === 'cms-pending') return <Badge tone="amber">CMS미연결</Badge>;
      if (r.nest === 'cms-dep') {
        const settled = String(r.raw.settlementRole || '') === 'deposit';
        return <Badge tone={settled ? 'blue' : 'amber'}>{settled ? 'CMS집금' : `CMS집금·${LEDGER_EMPTY.unmatched}`}</Badge>;
      }
      if (isUnclassified(r.category)) return <Badge tone="amber">미분류</Badge>;
      return r.category || LEDGER_EMPTY.dash;
    },
    text: (r) => {
      if (r.nest === 'cms-item') return 'CMS연결';
      if (r.nest === 'cms-pending') return 'CMS미연결';
      return r.category;
    },
  },
  {
    key: 'match', label: '매칭상태', align: 'c', priority: 1,
    render: (r) => {
      const status = matchStatus(r);
      return <Badge tone={status.tone}>{status.label}</Badge>;
    },
    text: (r) => matchStatus(r).label,
  },
  { key: 'date', label: '일자', align: 'c', priority: 1, render: (r) => r.date || LEDGER_EMPTY.dash, text: (r) => r.date },
  {
    key: 'in', label: '입금', align: 'r', priority: 1,
    render: (r) => (r.inAmt
      ? <span style={{
          color: (r.nest === 'cms-item' || r.nest === 'cms-pending') ? C.brand : C.ok,
          fontWeight: 700,
        }}>{amt(r.inAmt)}</span>
      : LEDGER_EMPTY.dash),
    text: (r) => r.inAmt,
  },
  {
    key: 'out', label: '출금', align: 'r', priority: 1,
    render: (r) => (r.outAmt ? <span style={{ fontWeight: 700 }}>{amt(r.outAmt)}</span> : LEDGER_EMPTY.dash),
    text: (r) => r.outAmt,
  },
  {
    key: 'alert', label: '데이터알람', priority: 3,
    render: (r) => {
      const alert = String(r.raw.dataAlert || '');
      if (alert) return <Badge tone="amber">{alert}</Badge>;
      if (r.nest === 'cms-pending') return <Badge tone="amber">집금 연결 필요</Badge>;
      if (r.raw.reconciliationStatus === '매칭완료') return <Badge tone="green">원본 대사완료</Badge>;
      return <span style={{ color: C.faint }}>{LEDGER_EMPTY.dash}</span>;
    },
    text: (r) => String(r.raw.dataAlert || r.raw.reconciliationStatus || ''),
  },
  {
    key: 'flowNature', label: '수지구분', align: 'c',
    render: (r) => {
      const value = kindOfLabel(r.category) || (r.inAmt > 0 ? '수입' : r.outAmt > 0 ? '지출' : LEDGER_EMPTY.dash);
      return <Badge tone={value === '수입' ? 'green' : value === '지출' ? 'amber' : 'gray'}>{value}</Badge>;
    },
    text: (r) => kindOfLabel(r.category) || (r.inAmt > 0 ? '수입' : r.outAmt > 0 ? '지출' : ''),
  },
  {
    key: 'fundNature', label: '자금성격', align: 'c',
    render: (r) => isUnclassified(r.category)
      ? <Badge tone="amber">미분류</Badge>
      : <Badge tone="blue">{groupOfLabel(r.category)}</Badge>,
    text: (r) => isUnclassified(r.category) ? '미분류' : groupOfLabel(r.category),
  },
  {
    key: 'matchedContract', label: '매칭계약',
    render: (r) => String(r.raw.matchedContractId || LEDGER_EMPTY.dash),
    text: (r) => String(r.raw.matchedContractId || ''),
  },
  {
    key: 'matchedSchedule', label: '매칭회차', align: 'c',
    render: (r) => r.raw.matchedScheduleSeq ? `${String(r.raw.matchedScheduleSeq)}회차` : LEDGER_EMPTY.dash,
    text: (r) => String(r.raw.matchedScheduleSeq || ''),
  },
  { key: 'src', label: '출처', align: 'c', render: (r) => <Badge tone="gray">{r.source}</Badge>, text: (r) => r.source },
  { key: 'ent', label: '원천', align: 'c', render: (r) => r.entity, text: (r) => r.entity },
  { key: 'key', label: '키', render: (r) => r.recKey || LEDGER_EMPTY.dash, text: (r) => r.recKey },
];

/** 회사 → 신원(계좌) → 내용 → 분류 → 상태(매칭) → 수치 */
export const CASH_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'acctName', 'acct', 'content', 'cat', 'match', 'date', 'in', 'out', 'alert'],
  all: [
    'company', 'acctName', 'acct', 'content', 'cat', 'match', 'date', 'in', 'out', 'alert',
    'flowNature', 'fundNature', 'matchedContract', 'matchedSchedule', 'src', 'ent', 'key',
  ],
};

const _cashViews = buildSheetViews(CASH_COL_CATALOG, CASH_SHEET_KEYS);
export const CASH_BASIC_COLS = _cashViews.basic;
export const CASH_EXPANDED_COLS = _cashViews.expanded;

/** 거래 상세 — 시트 카탈로그 키 재사용(손롤 detail* 금지) */
export const CASH_TX_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '거래 기본',
    open: true,
    keys: ['company', 'acctName', 'acct', 'date', 'content', 'in', 'out'],
  },
  {
    title: '분류·수납정보',
    keys: ['cat', 'match', 'flowNature', 'fundNature', 'matchedContract', 'matchedSchedule', 'alert'],
  },
];
export const CASH_TX_DETAIL_SECTIONS = buildDetailSections(CASH_EXPANDED_COLS, CASH_TX_DETAIL_DEFS);

/** 카드 승인 — 원장 raw 필드(시트에 없는 키) */
const CARD_DETAIL_CATALOG: SheetCol<CashRow>[] = [
  ...CASH_EXPANDED_COLS,
  { key: 'cardName', label: '카드명', render: (r) => String(r.raw.cardName || r.accountName || LEDGER_EMPTY.dash) },
  { key: 'cardLast4', label: '카드번호', render: (r) => (r.raw.cardLast4 ? `•••• ${String(r.raw.cardLast4)}` : LEDGER_EMPTY.dash) },
  { key: 'merchant', label: '가맹점', render: (r) => String(r.raw.merchant || r.party || LEDGER_EMPTY.dash) },
  { key: 'approvalNo', label: '승인번호', render: (r) => String(r.raw.approvalNo || LEDGER_EMPTY.dash) },
  {
    key: 'cardAmount', label: '승인금액', align: 'r',
    render: (r) => won(Number(r.raw.amount) || r.outAmt),
  },
];

export const CASH_CARD_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '거래 기본',
    open: true,
    keys: ['company', 'date', 'content', 'out', 'cat'],
  },
  {
    title: '카드 승인정보',
    keys: ['cardName', 'cardLast4', 'merchant', 'approvalNo', 'cardAmount', 'match', 'alert'],
  },
];
export const CASH_CARD_DETAIL_SECTIONS = buildDetailSections(CARD_DETAIL_CATALOG, CASH_CARD_DETAIL_DEFS);
