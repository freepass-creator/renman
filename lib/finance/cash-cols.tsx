/**
 * 재무원장 열 SSOT — 계좌 입·출금 스트림(CashRow).
 * 엑셀 추가/삭제: `자금 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts
 * (카탈로그·KEYS는 아래 CASH_SHEET_KEYS — BASIC/EXPANDED와 동기.)
 */
import { Badge, C, type SheetCol } from '@/components/ui';
import { companyDisplay } from '@/lib/companies';
import { groupOfLabel, isUnclassified, kindOfLabel } from '@/lib/payments/ledger-subjects';
import type { CashRow } from '@/lib/finance/cash-ledger';
import type { SheetViewKeys } from '@/lib/ledger-ext';

const coName = (r: CashRow) => companyDisplay(r.companyId);
const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');
const content = (r: CashRow) => {
  const a = (r.party || '').trim();
  const b = (r.memo || '').trim();
  if (a && b && a !== b) return `${a} · ${b}`;
  return a || b || '';
};

const matchStatus = (r: CashRow) => {
  if (r.nest === 'cms-item') return { label: '매칭완료', tone: 'green' as const };
  if (r.nest === 'cms-pending') return { label: '미매칭', tone: 'amber' as const };
  if (r.nest === 'cms-dep') {
    return String(r.raw.settlementRole || '') === 'deposit'
      ? { label: '매칭완료', tone: 'green' as const }
      : { label: '미매칭', tone: 'amber' as const };
  }
  if (r.raw.matchedContractId || r.raw.matchedScheduleSeq) return { label: '매칭완료', tone: 'green' as const };
  if (r.inAmt > 0) return { label: '미매칭', tone: 'amber' as const };
  return { label: '해당없음', tone: 'gray' as const };
};

export const CASH_BASIC_COLS: SheetCol<CashRow>[] = [
  {
    key: 'co', label: '회사명', pin: true, priority: 1,
    render: (r) => (r.nest === 'cms-item'
      ? <span style={{ color: C.mute, paddingLeft: 14 }}>↳ CMS</span>
      : coName(r)),
    text: (r) => (r.nest === 'cms-item' ? 'CMS연결' : coName(r)),
  },
  {
    key: 'acctName', label: '계좌명', pin: true, priority: 1,
    render: (r) => r.accountName || (r.nest === 'cms-pending' ? 'CMS 명세' : '—'),
    text: (r) => r.accountName || (r.nest === 'cms-pending' ? 'CMS 명세' : ''),
  },
  {
    key: 'acct', label: '계좌번호', priority: 2,
    render: (r) => {
      if (r.nest === 'cms-item') return <span style={{ color: C.mute, fontSize: 11 }}>{r.account || '—'}</span>;
      if (r.nest === 'cms-pending') return <span style={{ color: C.mute }}>CMS명세</span>;
      return r.account || '—';
    },
    text: (r) => r.account || (r.nest === 'cms-pending' ? 'CMS명세' : ''),
  },
  {
    key: 'match', label: '매칭상태', align: 'c', priority: 1,
    render: (r) => {
      const status = matchStatus(r);
      return <Badge tone={status.tone}>{status.label}</Badge>;
    },
    text: (r) => matchStatus(r).label,
  },
  { key: 'date', label: '일자', align: 'c', priority: 1, render: (r) => r.date || '—', text: (r) => r.date },
  {
    key: 'in', label: '입금', align: 'r', priority: 1,
    render: (r) => (r.inAmt
      ? <span style={{
          color: (r.nest === 'cms-item' || r.nest === 'cms-pending') ? C.brand : C.ok,
          fontWeight: 700,
        }}>{amt(r.inAmt)}</span>
      : '—'),
    text: (r) => r.inAmt,
  },
  {
    key: 'out', label: '출금', align: 'r', priority: 1,
    render: (r) => (r.outAmt ? <span style={{ fontWeight: 700 }}>{amt(r.outAmt)}</span> : '—'),
    text: (r) => r.outAmt,
  },
  {
    key: 'cat', label: '계정과목', priority: 1,
    render: (r) => {
      if (r.nest === 'cms-item') return <Badge tone="blue">CMS연결</Badge>;
      if (r.nest === 'cms-pending') return <Badge tone="amber">CMS미연결</Badge>;
      if (r.nest === 'cms-dep') {
        const settled = String(r.raw.settlementRole || '') === 'deposit';
        return <Badge tone={settled ? 'blue' : 'amber'}>{settled ? 'CMS집금' : 'CMS집금·미매칭'}</Badge>;
      }
      if (isUnclassified(r.category)) return <Badge tone="amber">미분류</Badge>;
      return r.category || '—';
    },
    text: (r) => {
      if (r.nest === 'cms-item') return 'CMS연결';
      if (r.nest === 'cms-pending') return 'CMS미연결';
      return r.category;
    },
  },
  {
    key: 'content', label: '내용', priority: 2,
    render: (r) => content(r) || <span style={{ color: C.faint }}>—</span>,
    text: (r) => content(r),
  },
  {
    key: 'alert', label: '데이터알람', priority: 3,
    render: (r) => {
      const alert = String(r.raw.dataAlert || '');
      if (alert) return <Badge tone="amber">{alert}</Badge>;
      if (r.nest === 'cms-pending') return <Badge tone="amber">집금 연결 필요</Badge>;
      if (r.raw.reconciliationStatus === '매칭완료') return <Badge tone="green">원본 대사완료</Badge>;
      return <span style={{ color: C.faint }}>—</span>;
    },
    text: (r) => String(r.raw.dataAlert || r.raw.reconciliationStatus || ''),
  },
];

export const CASH_EXPANDED_COLS: SheetCol<CashRow>[] = [
  ...CASH_BASIC_COLS,
  {
    key: 'flowNature', label: '수지구분', align: 'c',
    render: (r) => {
      const value = kindOfLabel(r.category) || (r.inAmt > 0 ? '수입' : r.outAmt > 0 ? '지출' : '—');
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
    render: (r) => String(r.raw.matchedContractId || '—'),
    text: (r) => String(r.raw.matchedContractId || ''),
  },
  {
    key: 'matchedSchedule', label: '매칭회차', align: 'c',
    render: (r) => r.raw.matchedScheduleSeq ? `${String(r.raw.matchedScheduleSeq)}회차` : '—',
    text: (r) => String(r.raw.matchedScheduleSeq || ''),
  },
  { key: 'src', label: '출처', align: 'c', render: (r) => <Badge tone="gray">{r.source}</Badge>, text: (r) => r.source },
  { key: 'ent', label: '원천', align: 'c', render: (r) => r.entity, text: (r) => r.entity },
  { key: 'key', label: '키', render: (r) => r.recKey || '—', text: (r) => r.recKey },
];

/** 자금 엑셀 열 keys — 추가/삭제 요청 시 여기와 BASIC/EXPANDED를 같이 맞춤. */
export const CASH_SHEET_KEYS: SheetViewKeys = {
  basic: ['co', 'acctName', 'acct', 'match', 'date', 'in', 'out', 'cat', 'content', 'alert'],
  all: [
    'co', 'acctName', 'acct', 'match', 'date', 'in', 'out', 'cat', 'content', 'alert',
    'flowNature', 'fundNature', 'matchedContract', 'matchedSchedule', 'src', 'ent', 'key',
  ],
};
