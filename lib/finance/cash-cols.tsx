/**
 * 재무원장 열 SSOT — 계좌 입·출금 스트림(CashRow).
 * 엑셀 추가/삭제: `자금 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts
 */
import { Badge, C, money, TreeIndent, type SheetCol } from '@/components/ui';
import { companyDisplay } from '@/lib/companies';
import { groupOfLabel, isUnclassified, kindOfLabel } from '@/lib/payments/ledger-subjects';
import {
  moneyStatusOf, moneyClassOf, MONEY_STATUS, MONEY_STATUS_TONE, MONEY_CLASS, MONEY_CLASS_TONE,
  type MoneyStatus, type MoneyClass,
} from '@/lib/finance/money-status';
import type { CashRow } from '@/lib/finance/cash-ledger';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { cashBundleReviewStatus, requiresLoanRepaymentSplit } from './cash-bundle';

const coName = (r: CashRow) => companyDisplay(r.companyId);
/** 내용 = 메모(거래 설명). 상대방은 party 열. */
const content = (r: CashRow) => (r.memo || '').trim();
const settlementKind = (r: CashRow): string => r.nest === 'cms-dep' ? 'CMS집금'
  : r.nest === 'card-dep' ? '카드정산'
    : r.nest === 'bundle-parent' ? String(r.raw.bundleType || '일반묶음')
      : requiresLoanRepaymentSplit(r.category) ? '할부·리스상환' : '';
export const cashBundleStatus = (r: CashRow): '미완료' | '대사완료' =>
  cashBundleReviewStatus(r) === '미완료' ? '미완료' : '대사완료';

/* 자금상태 = «매칭됐는가». 판정은 lib/finance/money-status.ts 가 유일한 정의처다.
   ★이전 구현은 상태가 3개뿐이라 «계정과목이 없는 돈»과 «분류는 됐지만 계약에 안 붙은 돈»이
     똑같이 «미매칭»으로 보였다 — 해야 할 일이 다른데 같은 상태로 표시됐다. */
export const cashMoneyStatus = (r: CashRow): MoneyStatus => moneyStatusOf({
  category: r.category,
  inAmount: r.inAmt,
  outAmount: r.outAmt,
  matchedContractId: r.raw.matchedContractId,
  matchedScheduleSeq: r.raw.matchedScheduleSeq,
  matchedKind: r.raw.matchedKind,
  isCmsItem: r.nest === 'cms-item' || r.nest === 'cms-pending',
  isCmsDeposit: r.nest === 'cms-dep' || r.nest === 'card-dep',
  cmsSettled: String(r.raw.settlementRole || '') === 'deposit',
});

/* 자금분류 = «뭐로 입금됐는가». 계정과목(무슨 돈인가)과 다른 축 — 같은 칸에 담지 않는다. */
const moneyClass = (r: CashRow): MoneyClass => moneyClassOf({
  // 은행 채널코드 전용 필드만 근거로 쓴다. 거래상대(counterparty)를 적요로 오인하면
  // 모든 고객명이 미지 채널이 되어 실제 계좌이체도 전부 «기타»로 잘못 분류된다.
  jeokyo: r.raw.jeokyo,
  isCms: r.nest === 'cms-item' || r.nest === 'cms-pending' || r.nest === 'cms-dep',
  isCard: !!r.raw.approvalNo || !!r.raw.cardNo,
  source: r.raw.method || r.raw.source,
});

const CASH_COL_CATALOG: SheetCol<CashRow>[] = [
  {
    key: 'company', label: '회사명', pin: true, priority: 1,
    render: (r) => (r.nest === 'cms-item'
      ? <TreeIndent>↳ CMS</TreeIndent>
      : coName(r)),
    text: (r) => (r.nest === 'cms-item' ? 'CMS연결' : coName(r)),
  },
  {
    key: 'acctName', label: '계좌명', pin: true, priority: 1,
    render: (r) => {
      // 2줄 금지 — 계좌번호는 전체뷰 「계좌번호」 컬럼이 담당.
      if (r.nest === 'cms-pending') return 'CMS 명세';
      if (r.nest === 'cms-item') return 'CMS연결';
      return r.accountName || LEDGER_EMPTY.dash;
    },
    text: (r) => r.accountName || (r.nest === 'cms-pending' ? 'CMS 명세' : r.account || ''),
  },
  {
    key: 'acct', label: '계좌번호', priority: 2,
    render: (r) => r.account || (r.nest === 'cms-pending' ? 'CMS명세' : LEDGER_EMPTY.dash),
    text: (r) => r.account || (r.nest === 'cms-pending' ? 'CMS명세' : ''),
  },
  {
    key: 'content', label: '내용', priority: 2,
    render: (r) => content(r) || <span style={{ color: C.faint }}>{LEDGER_EMPTY.dash}</span>,
    text: (r) => content(r),
  },
  {
    key: 'party', label: '상대방', priority: 2,
    render: (r) => (r.party || '').trim() || <span style={{ color: C.faint }}>{LEDGER_EMPTY.dash}</span>,
    text: (r) => (r.party || '').trim(),
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
    // 행 문법 4번 — 자금분류(뭐로 입금됐는가). 분류는 신호가 아니므로 중립 톤.
    key: 'moneyClass', label: '자금분류', align: 'c', priority: 1,
    render: (r) => <Badge tone={MONEY_CLASS_TONE[moneyClass(r)]}>{moneyClass(r)}</Badge>,
    text: (r) => moneyClass(r),
    values: () => [...MONEY_CLASS],
  },
  {
    // 행 문법 5번 — 자금상태(매칭됐는가). 색 신호는 여기가 담당.
    key: 'match', label: '자금상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={MONEY_STATUS_TONE[cashMoneyStatus(r)]}>{cashMoneyStatus(r)}</Badge>,
    text: (r) => cashMoneyStatus(r),
    values: () => [...MONEY_STATUS],
  },
  { key: 'date', label: '일자', align: 'c', priority: 1, xf: 'date', render: (r) => r.date || LEDGER_EMPTY.dash, text: (r) => r.date },
  {
    key: 'in', label: '입금', align: 'r', priority: 1, xf: 'money', sortNum: true,
    render: (r) => (r.inAmt
      ? <span style={{
          color: (r.nest === 'cms-item' || r.nest === 'cms-pending') ? C.brand : C.ok,
          fontWeight: 700,
        }}>{money(r.inAmt)}</span>
      : LEDGER_EMPTY.dash),
    text: (r) => r.inAmt,
  },
  {
    key: 'out', label: '출금', align: 'r', priority: 1, xf: 'money', sortNum: true,
    render: (r) => (r.outAmt ? <span style={{ fontWeight: 700 }}>{money(r.outAmt)}</span> : LEDGER_EMPTY.dash),
    text: (r) => r.outAmt,
  },
  {
    key: 'balance', label: '잔액', align: 'r', priority: 1, xf: 'money', sortNum: true,
    render: (r) => {
      const bal = r.raw.balance;
      if (bal === '' || bal == null) return LEDGER_EMPTY.dash;
      const n = Number(bal);
      return Number.isFinite(n) ? money(n) : LEDGER_EMPTY.dash;
    },
    text: (r) => (r.raw.balance === '' || r.raw.balance == null ? '' : Number(r.raw.balance) || 0),
  },
  {
    key: 'alert', label: '데이터알람', priority: 2,
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
    key: 'bundle', label: '묶음구성', align: 'c', priority: 2,
    render: (r) => {
      const kind = settlementKind(r);
      if (!kind) return LEDGER_EMPTY.dash;
      const count = Number(r.raw.bundleItemCount ?? r.raw.settlementItemCount) || 0;
      const reviewStatus = cashBundleReviewStatus(r);
      const complete = reviewStatus === '해당없음' || reviewStatus === '대사완료';
      return <Badge tone={complete ? 'blue' : 'amber'}>{kind}{count ? ` ${count}건` : ''}{complete ? '' : '·미완료'}</Badge>;
    },
    text: (r) => {
      const kind = settlementKind(r);
      const count = Number(r.raw.bundleItemCount ?? r.raw.settlementItemCount) || 0;
      return kind ? `${kind}${count ? ` ${count}건` : ''}` : '';
    },
  },
  {
    key: 'flowNature', label: '수지구분', align: 'c', priority: 2,
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
    key: 'matchedContract', label: '매칭계약', priority: 3,
    render: (r) => String(r.raw.matchedContractId || LEDGER_EMPTY.dash),
    text: (r) => String(r.raw.matchedContractId || ''),
  },
  {
    key: 'matchedSchedule', label: '매칭회차', align: 'c', priority: 3,
    render: (r) => r.raw.matchedScheduleSeq ? `${String(r.raw.matchedScheduleSeq)}회차` : LEDGER_EMPTY.dash,
    text: (r) => String(r.raw.matchedScheduleSeq || ''),
  },
  { key: 'src', label: '출처', align: 'c', render: (r) => <Badge tone="gray">{r.source}</Badge>, text: (r) => r.source },
  { key: 'ent', label: '원천', align: 'c', render: (r) => r.entity, text: (r) => r.entity },
  { key: 'key', label: '키', render: (r) => r.recKey || LEDGER_EMPTY.dash, text: (r) => r.recKey },
];

/** 회사 → 계좌 → 일자·내용·상대 → 수지·계정·매칭 → 금액·잔액·알람 */
export const CASH_SHEET_KEYS: SheetViewKeys = {
  basic: [
    'company', 'acctName', 'party', 'moneyClass', 'match',
    'bundle', 'cat', 'flowNature', 'date', 'content', 'in', 'out', 'balance',
    'matchedContract', 'matchedSchedule', 'alert',
  ],
  all: [
    'company', 'acctName', 'party', 'moneyClass', 'match', 'cat',
    'bundle', 'acct', 'date', 'content', 'flowNature', 'in', 'out', 'balance', 'alert',
    'fundNature', 'matchedContract', 'matchedSchedule', 'src', 'ent', 'key',
  ],
};

const _cashViews = buildSheetViews(CASH_COL_CATALOG, CASH_SHEET_KEYS);
export const CASH_BASIC_COLS = _cashViews.basic;
export const CASH_EXPANDED_COLS = _cashViews.expanded;

/** 거래 상세 — 시트 카탈로그 키 재사용(손롤 detail* 금지) + bank_tx.method 상세 전용 */
const CASH_TX_DETAIL_CATALOG: SheetCol<CashRow>[] = [
  ...CASH_EXPANDED_COLS,
  {
    key: 'method', label: '수단',
    render: (r) => String(r.raw.method || '').trim() || LEDGER_EMPTY.dash,
    text: (r) => String(r.raw.method || '').trim(),
  },
  {
    key: 'settlementGross', label: '구성 합계', align: 'r', xf: 'money', sortNum: true,
    render: (r) => Number(r.raw.bundleItemSum ?? r.raw.settlementGrossAmount) ? money(Number(r.raw.bundleItemSum ?? r.raw.settlementGrossAmount)) : LEDGER_EMPTY.dash,
    text: (r) => Number(r.raw.bundleItemSum ?? r.raw.settlementGrossAmount) || 0,
  },
  {
    key: 'settlementFee', label: '수수료·차액', align: 'r', xf: 'money', sortNum: true,
    render: (r) => Number(r.raw.bundleFeeAmount ?? r.raw.settlementFeeAmount) ? money(Number(r.raw.bundleFeeAmount ?? r.raw.settlementFeeAmount)) : LEDGER_EMPTY.dash,
    text: (r) => Number(r.raw.bundleFeeAmount ?? r.raw.settlementFeeAmount) || 0,
  },
  {
    key: 'settlementCheck', label: '묶음 대사', align: 'c',
    render: (r) => {
      const count = Number(r.raw.bundleItemCount ?? r.raw.settlementItemCount) || 0;
      if (!settlementKind(r)) return LEDGER_EMPTY.dash;
      if (r.nest === 'bundle-parent') {
        const status = cashBundleStatus(r);
        return <Badge tone={status === '대사완료' ? 'green' : 'amber'}>{status}</Badge>;
      }
      const gross = Number(r.raw.settlementGrossAmount) || 0;
      const fee = Number(r.raw.settlementFeeAmount) || 0;
      const diff = gross - fee - r.inAmt;
      return <Badge tone={count > 0 && Math.abs(diff) < 1 ? 'green' : 'amber'}>{count > 0 && Math.abs(diff) < 1 ? '대사완료' : '확인필요'}</Badge>;
    },
    text: (r) => settlementKind(r) ? `${Number(r.raw.settlementItemCount) || 0}건` : '',
  },
];

export const CASH_TX_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '거래 기본',
    open: true,
    keys: ['company', 'acctName', 'acct', 'date', 'content', 'party', 'method', 'in', 'out', 'balance'],
  },
  {
    title: '분류·연결정보',
    keys: ['cat', 'match', 'flowNature', 'fundNature', 'matchedContract', 'matchedSchedule', 'alert'],
  },
  {
    title: '묶음·대사',
    keys: ['bundle', 'settlementGross', 'settlementFee', 'settlementCheck'],
  },
];
export const CASH_TX_DETAIL_SECTIONS = buildDetailSections(CASH_TX_DETAIL_CATALOG, CASH_TX_DETAIL_DEFS);

/** 카드 승인 — 원장 raw 필드(시트에 없는 키) */
const CARD_DETAIL_CATALOG: SheetCol<CashRow>[] = [
  ...CASH_EXPANDED_COLS,
  { key: 'cardName', label: '카드명', render: (r) => String(r.raw.cardName || r.accountName || LEDGER_EMPTY.dash), text: (r) => String(r.raw.cardName || r.accountName || '') },
  { key: 'cardLast4', label: '카드번호', render: (r) => (r.raw.cardLast4 ? `•••• ${String(r.raw.cardLast4)}` : LEDGER_EMPTY.dash), text: (r) => String(r.raw.cardLast4 || '') },
  { key: 'merchant', label: '가맹점', render: (r) => String(r.raw.merchant || r.party || LEDGER_EMPTY.dash), text: (r) => String(r.raw.merchant || r.party || '') },
  { key: 'approvalNo', label: '승인번호', render: (r) => String(r.raw.approvalNo || LEDGER_EMPTY.dash), text: (r) => String(r.raw.approvalNo || '') },
  {
    key: 'cardAmount', label: '승인금액', align: 'r', xf: 'money', sortNum: true,
    render: (r) => money(Number(r.raw.amount) || r.outAmt),
    text: (r) => Number(r.raw.amount) || r.outAmt || 0,
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
