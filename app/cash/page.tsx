'use client';
/**
 * 재무원장 — 계좌·CMS 같이 반영, 매칭은 자동+수동.
 *   · CMS 업로드 → CMS미연결 로 원장 표시(계좌 입금과 별도, 이중합산 X)
 *   · 통장 CMS집금 → CMS집금·미매칭 / 매칭 후 하위행 CMS연결
 *   · 집금 또는 미연결 클릭 → 수동 매칭 패널
 */
import { useMemo, useState, useCallback } from 'react';
import { Plus, X, Link2, Unlink, UploadCloud } from 'lucide-react';
import { buildCashLedger, withCmsItemRows, type CashRow } from '@/lib/finance/cash-ledger';
import { CASH_BASIC_COLS, CASH_EXPANDED_COLS } from '@/lib/finance/cash-cols';
import { isUnclassified } from '@/lib/payments/ledger-subjects';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { notifySaved } from '@/lib/ui-bus';
import { companyDisplay } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { periodRange } from '@/lib/finance/period';
import { type EntityRecord } from '@/lib/intake/entities';
import {
  listUnmatchedCmsItems,
  manualLinkCmsSettlement,
  manualUnlinkCmsSettlement,
} from '@/lib/payments/auto-settle';
import { useSession } from '@/lib/session';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import {
  LedgerCreatePanel, LedgerFrame, LedgerRecordPanel, Btn, Input, Search, PillTabs, PeriodBar, Badge, Message, ListBox, ListRow,
  C, toggleStyle, won, type LedgerColView, type LedgerFormSection, type SheetCol,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import FileDrop from '@/components/FileDrop';

type Flow = '전체' | '입금' | '출금' | '미분류';
type CashLedgerKind = '거래원장' | '계좌원장';
type CashInputKind = '계좌' | '계좌거래' | 'CMS' | '법인카드';
type BulkInputSource = '파일' | '링크' | '텍스트';
const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');
/** 표 DOM 폭주 방지 — 24·25 CMS미연결 수백건이면 페이지가 죽음 */
const ROW_DISPLAY_CAP = 200;

const CMS_DEP_BG = 'color-mix(in srgb, var(--brand) 10%, var(--bg-card))';

type BankAccountRow = {
  id: string;
  companyId: string;
  company: string;
  bankName: string;
  accountNumber: string;
  accountAlias: string;
  accountHolder: string;
  accountType: string;
  status: string;
  openedDate: string;
  closedDate: string;
  openingBalance: number;
  importMethod: string;
  memo: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  raw: EntityRecord;
};

const accountRow = (record: EntityRecord): BankAccountRow => ({
  id: String(record._key || record.accountNumber || record.id || ''),
  companyId: String(record.companyId || ''),
  company: companyDisplay(String(record.companyId || '')),
  bankName: String(record.bankName || ''),
  accountNumber: String(record.accountNumber || ''),
  accountAlias: String(record.accountAlias || ''),
  accountHolder: String(record.accountHolder || ''),
  accountType: String(record.accountType || ''),
  status: String(record.status || '사용중'),
  openedDate: String(record.openedDate || ''),
  closedDate: String(record.closedDate || ''),
  openingBalance: Number(record.openingBalance) || 0,
  importMethod: String(record.importMethod || ''),
  memo: String(record.memo || ''),
  createdAt: String(record.createdAt || ''),
  createdBy: String(record.createdBy || ''),
  updatedAt: String(record.updatedAt || ''),
  raw: record,
});

const ACCOUNT_BASIC_COLS: SheetCol<BankAccountRow>[] = [
  { key: 'company', label: '회사명', priority: 1, render: (r) => r.company, text: (r) => r.company },
  { key: 'bank', label: '은행명', priority: 1, render: (r) => r.bankName || '—', text: (r) => r.bankName },
  { key: 'account', label: '계좌번호', priority: 1, render: (r) => r.accountNumber, text: (r) => r.accountNumber },
  { key: 'alias', label: '계좌명', priority: 1, render: (r) => r.accountAlias || '—', text: (r) => r.accountAlias },
  { key: 'holder', label: '예금주', priority: 2, render: (r) => r.accountHolder || '—', text: (r) => r.accountHolder },
  { key: 'type', label: '계좌구분', priority: 2, render: (r) => r.accountType || '—', text: (r) => r.accountType },
  { key: 'status', label: '상태', priority: 1, align: 'c', render: (r) => <Badge tone={r.status === '사용중' ? 'green' : 'gray'}>{r.status}</Badge>, text: (r) => r.status },
  { key: 'createdAt', label: '등록일', priority: 2, render: (r) => r.createdAt ? r.createdAt.slice(0, 10) : '—', text: (r) => r.createdAt },
  { key: 'createdBy', label: '등록자', priority: 2, render: (r) => r.createdBy || '—', text: (r) => r.createdBy },
];

const ACCOUNT_ALL_COLS: SheetCol<BankAccountRow>[] = [
  ...ACCOUNT_BASIC_COLS,
  { key: 'opened', label: '개설일', render: (r) => r.openedDate || '—', text: (r) => r.openedDate },
  { key: 'closed', label: '해지일', render: (r) => r.closedDate || '—', text: (r) => r.closedDate },
  { key: 'balance', label: '등록시점 잔액', align: 'r', render: (r) => r.openingBalance ? won(r.openingBalance) : '—', text: (r) => r.openingBalance },
  { key: 'method', label: '수집방법', render: (r) => r.importMethod || '—', text: (r) => r.importMethod },
  { key: 'memo', label: '메모', render: (r) => r.memo || '—', text: (r) => r.memo },
  { key: 'updated', label: '최종수정일', render: (r) => r.updatedAt ? r.updatedAt.slice(0, 16).replace('T', ' ') : '—', text: (r) => r.updatedAt },
];

const ACCOUNT_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '계좌 기본정보', open: true, fields: ['bankName', 'accountNumber', 'accountAlias', 'accountHolder', 'accountType', 'status'] },
  { title: '개설·수집정보', fields: ['openedDate', 'closedDate', 'openingBalance', 'importMethod', 'memo'] },
];

const CASH_TX_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '거래 기본정보', open: true, fields: ['account', 'txDate', 'amount', 'withdraw'] },
  { title: '분류·내용', fields: ['counterparty', 'memo', 'method', 'balance'] },
];
const CARD_TX_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '카드 승인정보', open: true, fields: ['txDate', 'amount', 'merchant', 'approvalNo', 'cardLast4', 'category'] },
];

const CASH_MATCH_DETAIL_COLS = CASH_EXPANDED_COLS.filter((col) =>
  ['match', 'flowNature', 'fundNature', 'matchedContract', 'matchedSchedule', 'alert'].includes(col.key),
);

const CASH_TRANSACTION_DETAIL_COLS: SheetCol<CashRow>[] = [
  { key: 'detailCompany', label: '회사명', render: (r) => companyDisplay(r.companyId) },
  { key: 'detailAccountName', label: '계좌명', render: (r) => r.accountName || '—' },
  { key: 'detailAccount', label: '계좌번호', render: (r) => r.account || '—' },
  { key: 'detailDate', label: '거래일자', render: (r) => r.date || '—' },
  {
    key: 'detailFlow', label: '거래구분',
    render: (r) => <Badge tone={r.inAmt > 0 ? 'green' : 'amber'}>{r.inAmt > 0 ? '입금' : '출금'}</Badge>,
  },
  {
    key: 'detailAmount', label: '금액', align: 'r',
    render: (r) => <span style={{ fontWeight: 800 }}>{won(r.inAmt || r.outAmt)}</span>,
  },
  { key: 'detailParty', label: '거래처·내용', render: (r) => [r.party, r.memo].filter(Boolean).join(' · ') || '—' },
];

const CARD_DETAIL_COLS: SheetCol<CashRow>[] = [
  { key: 'cardName', label: '카드명', render: (r) => String(r.raw.cardName || r.accountName || '—') },
  { key: 'cardLast4', label: '카드번호', render: (r) => r.raw.cardLast4 ? `•••• ${String(r.raw.cardLast4)}` : '—' },
  { key: 'merchant', label: '가맹점', render: (r) => String(r.raw.merchant || r.party || '—') },
  { key: 'approvalNo', label: '승인번호', render: (r) => String(r.raw.approvalNo || '—') },
  { key: 'cardAmount', label: '승인금액', align: 'r', render: (r) => won(Number(r.raw.amount) || r.outAmt) },
];

const CASH_INPUT_KINDS: CashInputKind[] = ['계좌', '계좌거래', 'CMS', '법인카드'];

function CashBulkInputPanel({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<CashInputKind>('계좌거래');
  const [source, setSource] = useState<BulkInputSource>('파일');
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const ready = source === '파일' ? files.length > 0 : source === '링크' ? !!url.trim() : !!text.trim();
  return (
    <section className="ledger-record-panel" aria-label="자금 대량 입력">
      <header className="ledger-record-panel__header">
        <span className="ledger-record-panel__icon" aria-hidden="true"><UploadCloud size={16} /></span>
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__eyebrow">일괄 수집</div>
          <div className="ledger-record-panel__title">대량 입력</div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="대량 입력 패널 닫기"><X size={16} /></button>
      </header>
      <div className="ledger-create-panel__body">
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 7 }}>입력 대상</div>
          <PillTabs size="sm" value={kind} onChange={setKind} tabs={CASH_INPUT_KINDS.map((key) => ({ key, label: key }))} />
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 7 }}>입력 방식</div>
          <PillTabs
            size="sm"
            value={source}
            onChange={setSource}
            tabs={(['파일', '링크', '텍스트'] as BulkInputSource[]).map((key) => ({ key, label: key }))}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          {source === '파일' ? (
            <FileDrop
              multiple
              accept=".xlsx,.xls,.csv,.pdf,image/*"
              onFiles={(list) => setFiles(Array.from(list))}
              hint={`${kind} 엑셀·CSV·PDF·이미지`}
              note={files.length ? `${files.length}개 파일 선택됨` : undefined}
            />
          ) : source === '링크' ? (
            <label className="ledger-create-panel__field">
              <span>자료 링크</span>
              <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
          ) : (
            <label className="ledger-create-panel__field">
              <span>원문 붙여넣기</span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="표·문자·거래내역을 그대로 붙여넣으세요"
                style={{ minHeight: 180, resize: 'vertical', padding: 10, border: `1px solid ${C.line}`, borderRadius: 6, font: 'inherit' }}
              />
            </label>
          )}
        </div>
      </div>
      <footer className="ledger-create-panel__footer">
        <span>{ready ? '입력원이 준비되었습니다. 분석·검토 단계는 데이터센터와 연결됩니다.' : '파일·링크·텍스트 중 하나를 입력하세요.'}</span>
        <div><Btn size="sm" variant="ghost" onClick={onClose}>취소</Btn><Btn size="sm" disabled>분석 준비</Btn></div>
      </footer>
    </section>
  );
}

function CmsMatchPanel({
  dep, bank, companyId, initialItemKeys, onClose, onDone,
}: {
  dep: CashRow;
  bank: EntityRecord[];
  companyId: string;
  /** CMS미연결 행에서 넘어온 사전선택 키 */
  initialItemKeys?: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const sid = String(dep.raw.settlementId || '');
  const linked = bank.filter((b) => sid && String(b.settlementId || '') === sid && String(b.settlementRole || '') === 'item');
  const unmatched = listUnmatchedCmsItems(bank);
  const near = unmatched
    .map((b) => {
      const lag = Math.abs((new Date(String(b.txDate || '')).getTime() - new Date(dep.date).getTime()) / 86400000);
      return { b, lag };
    })
    .filter((x) => Number.isFinite(x.lag) && x.lag <= 14)
    .sort((a, b) => a.lag - b.lag);

  const [sel, setSel] = useState<Set<string>>(() => {
    const s = new Set(linked.map((b) => String(b._key)));
    for (const k of initialItemKeys || []) s.add(k);
    return s;
  });
  const [busy, setBusy] = useState(false);

  const toggle = (k: string) => setSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const selectedSum = [...sel].reduce((s, k) => {
    const r = bank.find((b) => String(b._key) === k);
    return s + (Number(r?.amount) || 0);
  }, 0);
  const fee = Math.max(0, selectedSum - dep.inAmt);

  async function save() {
    const co = resolveWriteCompany(companyId, dep.raw);
    if (!co) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    try {
      if (sel.size === 0) {
        const r = await manualUnlinkCmsSettlement(co, dep.recKey);
        if (!r.ok) { toast(r.error || '해제 실패', 'error'); return; }
        toast('CMS 정산 해제', 'info');
      } else {
        const r = await manualLinkCmsSettlement(co, dep.recKey, [...sel]);
        if (!r.ok) { toast(r.error || '연결 실패', 'error'); return; }
        toast(`CMS 수동매칭 ${sel.size}건`, 'success');
      }
      notifySaved();
      onDone();
    } finally { setBusy(false); }
  }

  async function unlinkAll() {
    const co = resolveWriteCompany(companyId, dep.raw);
    if (!co) { toast(NEED_COMPANY, 'error'); return; }
    setBusy(true);
    try {
      const r = await manualUnlinkCmsSettlement(co, dep.recKey);
      if (!r.ok) { toast(r.error || '해제 실패', 'error'); return; }
      toast('CMS 정산 해제', 'info');
      notifySaved();
      onDone();
    } finally { setBusy(false); }
  }

  const pool = [
    ...linked.map((b) => ({ b, tag: '연결됨' as const })),
    ...near.map(({ b }) => ({ b, tag: '후보' as const })),
  ];
  // dedupe by key (linked first)
  const seen = new Set<string>();
  const list = pool.filter(({ b }) => {
    const k = String(b._key);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return (
    <div style={{ padding: '12px 14px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.ink }}>CMS 수동 매칭</span>
        <Badge tone="blue">CMS집금</Badge>
        <span style={{ fontSize: 12.5, color: C.mute }}>{dep.date} · {amt(dep.inAmt)}</span>
        <span style={{ flex: 1 }} />
        {sid && (
          <Btn size="sm" variant="ghost" disabled={busy} onClick={unlinkAll}><Unlink size={14} /> 정산 해제</Btn>
        )}
        <Btn size="sm" variant="ghost" onClick={onClose}><X size={14} /> 닫기</Btn>
      </div>

      <Message variant="info">
        계좌 CMS집금 ↔ 업로드 CMS 성공분을 연결합니다. 입력·업로드 시 자동매칭되고, 안 붙거나 틀린 건 여기서 고칩니다.
      </Message>

      <div style={{ display: 'flex', gap: 16, fontSize: 12.5, margin: '10px 0', flexWrap: 'wrap' }}>
        <span>선택 <b>{sel.size}</b>건</span>
        <span>합계 <b style={{ color: C.ok }}>{amt(selectedSum)}</b></span>
        <span>집금 <b>{amt(dep.inAmt)}</b></span>
        <span>수수료 <b>{amt(fee)}</b></span>
      </div>

      <ListBox>
        {list.length === 0 ? (
          <div style={{ padding: 12, color: C.mute, fontSize: 13 }}>근처에 미연결 CMS 성공분이 없습니다.</div>
        ) : list.map(({ b, tag }) => {
          const k = String(b._key);
          const on = sel.has(k);
          return (
            <ListRow
              key={k}
              badge={tag}
              badgeTone={tag === '연결됨' ? 'green' : 'gray'}
              main={`${String(b.txDate || '—')} · ${String(b.counterparty || '(적요없음)')}`}
              sub={String(b.memo || '') || undefined}
              right={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: C.ok }}>{amt(Number(b.amount) || 0)}</span>
                  <input type="checkbox" checked={on} onChange={() => toggle(k)} onClick={(e) => e.stopPropagation()} />
                </span>
              }
              onClick={() => toggle(k)}
            />
          );
        })}
      </ListBox>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
        <Btn size="sm" variant="ghost" disabled={busy} onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled={busy} onClick={save}>
          <Link2 size={14} /> {busy ? '저장 중…' : sel.size ? `${sel.size}건 연결` : '연결 없이 저장(해제)'}
        </Btn>
      </div>
    </div>
  );
}

export default function CashLedgerPage() {
  const mobile = useIsMobile();
  const { companyId } = useSession();
  const { bank, card, loading, reload } = useCashLedgerLists();
  const { rows: accountRecords, loading: accountLoading } = useEntityList('bank_account');

  const allRows = useMemo(() => {
    const base = buildCashLedger(bank, card)
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
    return withCmsItemRows(base, bank);
  }, [bank, card]);

  const latest = useMemo(
    () => allRows.filter((r) => r.nest !== 'cms-item').reduce((m, r) => (r.date > m ? r.date : m), TODAY),
    [allRows],
  );

  const [colView, setColView] = useState<LedgerColView>('기본');
  const [ledgerKind, setLedgerKind] = useState<CashLedgerKind>('거래원장');
  const [flow, setFlow] = useState<Flow>('전체');
  const [q, setQ] = useState('');
  const [srcSel, setSrcSel] = useState<Set<string>>(new Set());
  // PeriodBar의 effect를 기다리면 첫 프레임이 전체 기간으로 계산되어 행 제한 경고가 번쩍인다.
  // 화면에 표시할 기본 월간 범위를 같은 기준일로 첫 렌더부터 적용한다.
  const [range, setRange] = useState<{ from: string; to: string }>(() => periodRange(latest, '월간'));
  const onRange = useCallback((r: { from: string; to: string }) => {
    setRange((prev) => (prev.from === r.from && prev.to === r.to ? prev : r));
  }, []);
  const [selected, setSelected] = useState<CashRow | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BankAccountRow | null>(null);
  const [creating, setCreating] = useState<'account' | 'transaction' | 'bulk' | null>(null);
  const [singleKind, setSingleKind] = useState<CashInputKind>('계좌거래');

  const accountRows = useMemo(
    () => {
      const explicit = accountRecords.map(accountRow);
      const seen = new Set(explicit.map((row) => `${row.companyId}:${row.accountNumber.replace(/\D/g, '') || row.accountNumber}`));
      const derived: BankAccountRow[] = [];
      for (const record of bank) {
        if (String(record.settlementRole || '') === 'item') continue;
        const rawAccount = String(record.accountNumber || record.account || '').trim();
        const explicitLabel = String(record.accountAlias || record.accountName || record.bankName || '').trim();
        const labeledAccount = /계좌|법인카드|\([^)]*\d{4}\)/.test(rawAccount);
        if (!rawAccount || (!explicitLabel && !labeledAccount)) continue;
        const accountNumber = rawAccount;
        const companyId = String(record.companyId || '');
        const identity = `${companyId}:${accountNumber.replace(/\D/g, '') || accountNumber}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        const accountAlias = explicitLabel || accountNumber;
        const bankName = String(record.bankName || accountAlias.match(/\(([^0-9)]+)/)?.[1] || '');
        derived.push({
          id: `derived:${identity}`,
          companyId,
          company: companyDisplay(companyId),
          bankName,
          accountNumber,
          accountAlias,
          accountHolder: String(record.accountHolder || ''),
          accountType: String(record.accountType || '입출금'),
          status: '사용중',
          openedDate: '',
          closedDate: '',
          openingBalance: 0,
          importMethod: '거래원장 자동구성',
          memo: '',
          createdAt: '',
          createdBy: '원장',
          updatedAt: '',
          raw: record,
        });
      }
      return [...explicit, ...derived]
      .filter((row) => textMatch(q, row.company, row.bankName, row.accountNumber, row.accountAlias, row.accountHolder, row.accountType, row.status, row.createdBy))
      .sort((a, b) => Number(a.status !== '사용중') - Number(b.status !== '사용중') || a.bankName.localeCompare(b.bankName, 'ko'));
    },
    [accountRecords, bank, q],
  );
  const selectedAccountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    const accountNo = selectedAccount.accountNumber.replace(/\D/g, '');
    const alias = selectedAccount.accountAlias.trim();
    return allRows
      .filter((row) => row.nest !== 'cms-item' && row.entity === 'bank_tx')
      .filter((row) => {
        const rowNo = row.account.replace(/\D/g, '');
        return (accountNo && rowNo === accountNo) || (alias && row.accountName === alias);
      })
      .slice(0, 20);
  }, [allRows, selectedAccount]);
  const selectedAccountIn = selectedAccountTransactions.reduce((sum, row) => sum + row.inAmt, 0);
  const selectedAccountOut = selectedAccountTransactions.reduce((sum, row) => sum + row.outAmt, 0);

  const rows = useMemo(() => {
    const isAll = !range.from && !range.to;
    const pass = (r: CashRow) => {
      if (!isAll) {
        if (range.from && r.date < range.from) return false;
        if (range.to && r.date > range.to) return false;
      }
      if (flow === '입금' && !(r.inAmt > 0)) return false;
      if (flow === '출금' && !(r.outAmt > 0)) return false;
      if (flow === '미분류' && !isUnclassified(r.category)) return false;
      if (srcSel.size && !srcSel.has(r.source)) return false;
      if (!textMatch(q, r.party, r.account, r.category, r.memo, r.date, r.raw.dataAlert, r.raw.reconciliationStatus, companyDisplay(r.companyId), r.companyId)) return false;
      return true;
    };
    const out: CashRow[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (r.nest === 'cms-item') continue;
      if (!pass(r)) continue;
      out.push(r);
    }
    return out;
  }, [allRows, flow, srcSel, q, range.from, range.to]);

  /** 통장 현금흐름만(입금·출금 합계). CMS미연결은 별도. */
  const bankRows = rows.filter((r) => r.nest !== 'cms-item' && r.nest !== 'cms-pending');
  const pendingCms = rows.filter((r) => r.nest === 'cms-pending');
  const inSum = bankRows.reduce((s, r) => s + r.inAmt, 0);
  const outSum = bankRows.reduce((s, r) => s + r.outAmt, 0);
  const cmsPendingSum = pendingCms.reduce((s, r) => s + r.inAmt, 0);
  const alertN = rows.filter((r) => r.raw.dataAlert || r.nest === 'cms-pending').length;
  const unclN = bankRows.filter((r) => isUnclassified(r.category)).length;
  const rowMore = Math.max(0, rows.length - ROW_DISPLAY_CAP);
  const displayRows = rowMore > 0 ? rows.slice(0, ROW_DISPLAY_CAP) : rows;
  const cols = colView === '기본' ? CASH_BASIC_COLS : CASH_EXPANDED_COLS;
  const sources = useMemo(
    () => [...new Set(allRows.filter((r) => r.nest !== 'cms-item').map((r) => r.source))],
    [allRows],
  );

  const toggleSrc = (k: string) => setSrcSel((s) => {
    const n = new Set(s);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  });

  const onDoneMatch = useCallback(() => {
    setSelected(null);
    reload();
  }, [reload]);

  const ledgerKindTabs = (
    <PillTabs
      size="sm"
      value={ledgerKind}
      onChange={(next) => {
        setLedgerKind(next);
        setSelected(null);
        setSelectedAccount(null);
        setCreating(null);
      }}
      tabs={[
        { key: '거래원장', label: '거래원장' },
        { key: '계좌원장', label: '계좌원장' },
      ]}
    />
  );

  const singleKindTabs = (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 7 }}>입력 대상</div>
      <PillTabs
        size="sm"
        value={singleKind}
        onChange={(next) => {
          setSingleKind(next);
          const account = next === '계좌';
          setLedgerKind(account ? '계좌원장' : '거래원장');
          setCreating(account ? 'account' : 'transaction');
        }}
        tabs={CASH_INPUT_KINDS.map((key) => ({ key, label: key }))}
      />
    </div>
  );

  const createActions = (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      <Btn size="sm" onClick={() => {
        setSelected(null);
        setSelectedAccount(null);
        setSingleKind(ledgerKind === '계좌원장' ? '계좌' : '계좌거래');
        setCreating((open) => open === 'account' || open === 'transaction' ? null : (ledgerKind === '계좌원장' ? 'account' : 'transaction'));
      }} aria-pressed={creating === 'account' || creating === 'transaction'} variant={creating === 'account' || creating === 'transaction' ? 'ghost' : 'solid'}><Plus size={14} /> {creating === 'account' || creating === 'transaction' ? '입력 취소' : '단건 입력'}</Btn>
      <Btn size="sm" onClick={() => {
        setSelected(null);
        setSelectedAccount(null);
        setCreating((open) => open === 'bulk' ? null : 'bulk');
      }} aria-pressed={creating === 'bulk'} variant={creating === 'bulk' ? 'ghost' : 'solid'}><UploadCloud size={14} /> {creating === 'bulk' ? '입력 취소' : '대량 입력'}</Btn>
    </span>
  );

  if (ledgerKind === '계좌원장') {
    const activeAccounts = accountRows.filter((row) => row.status === '사용중').length;
    return (
      <LedgerFrame
        title="자금관리"
        meta="계좌 1개 1행 · 상태·등록일·등록자·수집방법"
        right={createActions}
        colView={colView}
        onColView={setColView}
        filters={<>
          {ledgerKindTabs}
          <Search
            size="sm"
            placeholder="회사·은행·계좌번호·계좌명·등록자"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ width: mobile ? '100%' : 280 }}
          />
        </>}
        stats={<span style={{ fontSize: 12.5, color: C.mute }}>전체 <b>{accountRows.length}</b> · 사용중 <b style={{ color: C.ok }}>{activeAccounts}</b></span>}
        loading={accountLoading}
        empty="등록된 계좌가 없습니다. 「신규 계좌」에서 등록하세요."
        cols={colView === '기본' ? ACCOUNT_BASIC_COLS : ACCOUNT_ALL_COLS}
        rows={accountRows}
        rowKey={(row) => row.id}
        selectedRowKey={selectedAccount?.id}
        onRowDoubleClick={(row) => {
          setCreating(null);
          setSelectedAccount(row);
        }}
        onCloseDetail={() => setSelectedAccount(null)}
        sidePanel={creating === 'bulk' ? (
          <CashBulkInputPanel onClose={() => setCreating(null)} />
        ) : creating === 'account' ? (
          <LedgerCreatePanel
            key="new-bank-account"
            entityKey="bank_account"
            title="신규 계좌 등록"
            sections={ACCOUNT_CREATE_SECTIONS}
            initial={{ status: '사용중', importMethod: '수기' }}
            prefix={singleKindTabs}
            onClose={() => setCreating(null)}
          />
        ) : selectedAccount ? (
          <LedgerRecordPanel
            title={`${selectedAccount.bankName} ${selectedAccount.accountNumber}`}
            subtitle={`${selectedAccount.company} · ${selectedAccount.status}`}
            row={selectedAccount}
            cols={ACCOUNT_ALL_COLS}
            sections={[
              { title: '기본정보', cols: ACCOUNT_BASIC_COLS },
              { title: '개설·수집정보', cols: ACCOUNT_ALL_COLS.slice(ACCOUNT_BASIC_COLS.length) },
            ]}
            onClose={() => setSelectedAccount(null)}
          >
            <div style={{ borderTop: `1px solid ${C.line}`, padding: '10px 14px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>거래·수납정보</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 8 }}>
                <span>최근 거래 <b>{selectedAccountTransactions.length}</b>건</span>
                <span>입금 <b style={{ color: C.ok }}>{won(selectedAccountIn)}</b></span>
                <span>출금 <b>{won(selectedAccountOut)}</b></span>
              </div>
              <ListBox>
                {selectedAccountTransactions.length ? selectedAccountTransactions.slice(0, 8).map((tx) => (
                  <ListRow
                    key={tx.id}
                    badge={tx.inAmt > 0 ? '입금' : '출금'}
                    badgeTone={tx.inAmt > 0 ? 'green' : 'gray'}
                    main={`${tx.date || '일자 없음'} · ${tx.party || tx.category || '거래'}`}
                    sub={tx.memo || tx.category || undefined}
                    right={<b style={{ color: tx.inAmt > 0 ? C.ok : C.ink }}>{won(tx.inAmt || tx.outAmt)}</b>}
                  />
                )) : <div style={{ padding: 12, color: C.mute, fontSize: 12.5 }}>연결된 계좌 거래가 없습니다.</div>}
              </ListBox>
            </div>
          </LedgerRecordPanel>
        ) : null}
      />
    );
  }

  return (
    <LedgerFrame
      title="자금관리"
      meta="거래 1건 1행 · 계좌·CMS·카드 입출금과 계약 매칭"
      right={createActions}
      colView={colView}
      onColView={setColView}
      filters={
        <>
          {ledgerKindTabs}
          <Search
            size="sm"
            placeholder="회사·계좌·상대·과목·내용"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? '100%' : 180 }}
          />
          <PillTabs
            size="sm"
            value={flow}
            onChange={setFlow}
            tabs={[
              { key: '전체', label: '전체' },
              { key: '입금', label: '입금' },
              { key: '출금', label: '출금' },
              { key: '미분류', label: '미분류', badge: unclN || undefined },
            ]}
          />
          <PeriodBar latest={latest} initial="월간" onRange={onRange} />
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
            {sources.map((s) => (
              <button
                key={s}
                type="button"
                data-ui="toggle"
                aria-pressed={srcSel.has(s)}
                onClick={() => toggleSrc(s)}
                style={toggleStyle(srcSel.has(s), 'sm', mobile)}
              >
                {s}
              </button>
            ))}
            {srcSel.size > 0 && <Btn variant="ghost" size="sm" onClick={() => setSrcSel(new Set())}>출처 해제</Btn>}
          </span>
        </>
      }
      hint={rowMore > 0 ? (
            <Message variant="warning">
              표는 상위 {ROW_DISPLAY_CAP}건만 표시합니다 (외 {rowMore.toLocaleString('ko-KR')}건). 월간·검색으로 좁히면 전부 볼 수 있습니다.
            </Message>
          ) : null}
      stats={
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <span>계좌 <b>{bankRows.length}</b></span>
          <span>입금 <b style={{ color: C.ok }}>{amt(inSum)}</b></span>
          <span>출금 <b>{amt(outSum)}</b></span>
          {pendingCms.length > 0 && (
            <span>CMS미연결 <b style={{ color: C.brand }}>{pendingCms.length}</b>·<b style={{ color: C.brand }}>{amt(cmsPendingSum)}</b></span>
          )}
          {alertN > 0 && <span>데이터알람 <b style={{ color: C.warn }}>{alertN}</b></span>}
        </span>
      }
      loading={loading}
      empty="표시할 거래가 없습니다. 기간을 바꾸거나 「거래 등록」에서 입력하세요."
      cols={cols}
      rows={displayRows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id}
      rowStyle={(r) => {
        if (r.nest === 'cms-dep') return { background: CMS_DEP_BG };
        if (r.nest === 'cms-pending') return { background: 'color-mix(in srgb, var(--orange-text) 8%, var(--bg-card))' };
        return undefined;
      }}
      onRowDoubleClick={(row) => {
        setCreating(null);
        setSelected(row);
      }}
      onCloseDetail={() => setSelected(null)}
      sidePanel={creating === 'bulk' ? (
        <CashBulkInputPanel onClose={() => setCreating(null)} />
      ) : creating === 'transaction' ? (
        <LedgerCreatePanel
          key={`new-cash-${singleKind}`}
          entityKey={singleKind === '법인카드' ? 'card_tx' : 'bank_tx'}
          title={`${singleKind} 단건 입력`}
          sections={singleKind === '법인카드' ? CARD_TX_CREATE_SECTIONS : CASH_TX_CREATE_SECTIONS}
          initial={{ txDate: new Date().toISOString().slice(0, 10), method: singleKind === 'CMS' ? 'CMS' : '계좌' }}
          prefix={singleKindTabs}
          onClose={() => setCreating(null)}
        />
      ) : selected?.nest === 'cms-dep' ? (
        <CmsMatchPanel
          key={selected.id}
          dep={selected}
          bank={bank}
          companyId={companyId}
          onClose={() => setSelected(null)}
          onDone={onDoneMatch}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={`${selected.date || '일자 없음'} · ${selected.party || selected.category || '거래'}`}
          subtitle={`${companyDisplay(selected.companyId)} · ${selected.account || '계좌 미입력'}`}
          row={selected}
          cols={CASH_TRANSACTION_DETAIL_COLS}
          sections={[
            { title: '기본정보', cols: CASH_TRANSACTION_DETAIL_COLS },
            {
              title: selected.entity === 'card_tx' ? '카드 승인정보' : '분류·수납정보',
              cols: selected.entity === 'card_tx' ? CARD_DETAIL_COLS : CASH_MATCH_DETAIL_COLS,
            },
          ]}
          onClose={() => setSelected(null)}
        />
      ) : null}
    />
  );
}
