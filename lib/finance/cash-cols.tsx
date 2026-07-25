/**
 * 재무원장 열 SSOT — 계좌 입·출금 스트림(CashRow).
 *   CMS집금 / CMS미연결(업로드) / CMS연결(집금 하위행).
 */
import { Badge, C, type SheetCol } from '@/components/ui';
import { companyDisplay } from '@/lib/companies';
import { isUnclassified } from '@/lib/payments/ledger-subjects';
import type { CashRow } from '@/lib/finance/cash-ledger';

const coName = (r: CashRow) => companyDisplay(r.companyId);
const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');
const content = (r: CashRow) => {
  const a = (r.party || '').trim();
  const b = (r.memo || '').trim();
  if (a && b && a !== b) return `${a} · ${b}`;
  return a || b || '';
};

export const CASH_BASIC_COLS: SheetCol<CashRow>[] = [
  {
    key: 'co', label: '표시명', pin: true,
    render: (r) => (r.nest === 'cms-item'
      ? <span style={{ color: C.mute, paddingLeft: 14 }}>↳ CMS</span>
      : coName(r)),
    text: (r) => (r.nest === 'cms-item' ? 'CMS연결' : coName(r)),
  },
  {
    key: 'acct', label: '계좌번호', pin: true,
    render: (r) => {
      if (r.nest === 'cms-item') return <span style={{ color: C.mute, fontSize: 11 }}>{r.account || '—'}</span>;
      if (r.nest === 'cms-pending') return <span style={{ color: C.mute }}>CMS명세</span>;
      return r.account || '—';
    },
    text: (r) => r.account || (r.nest === 'cms-pending' ? 'CMS명세' : ''),
  },
  { key: 'date', label: '일자', align: 'c', render: (r) => r.date || '—', text: (r) => r.date },
  {
    key: 'in', label: '입금', align: 'r',
    render: (r) => (r.inAmt
      ? <span style={{
          color: (r.nest === 'cms-item' || r.nest === 'cms-pending') ? C.brand : C.ok,
          fontWeight: 700,
        }}>{amt(r.inAmt)}</span>
      : '—'),
    text: (r) => r.inAmt,
  },
  {
    key: 'out', label: '출금', align: 'r',
    render: (r) => (r.outAmt ? <span style={{ fontWeight: 700 }}>{amt(r.outAmt)}</span> : '—'),
    text: (r) => r.outAmt,
  },
  {
    key: 'cat', label: '계정과목',
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
    key: 'content', label: '내용',
    render: (r) => content(r) || <span style={{ color: C.faint }}>—</span>,
    text: (r) => content(r),
  },
];

export const CASH_EXPANDED_COLS: SheetCol<CashRow>[] = [
  ...CASH_BASIC_COLS,
  { key: 'src', label: '출처', align: 'c', render: (r) => <Badge tone="gray">{r.source}</Badge>, text: (r) => r.source },
  { key: 'ent', label: '원천', align: 'c', render: (r) => r.entity, text: (r) => r.entity },
  { key: 'key', label: '키', render: (r) => r.recKey || '—', text: (r) => r.recKey },
];
