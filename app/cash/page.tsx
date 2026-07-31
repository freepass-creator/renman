'use client';
/**
 * 재무원장 — 계좌·CMS 같이 반영, 매칭은 자동+수동.
 *   · CMS 업로드 → CMS미연결 로 원장 표시(계좌 입금과 별도, 이중합산 X)
 *   · 통장 CMS집금 → CMS집금·미매칭 / 매칭 후 하위행 CMS연결
 *   · 집금 또는 미연결 클릭 → 수동 매칭 패널
 */
import { useMemo, useState, useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Link2, Unlink, UploadCloud } from 'lucide-react';
import { buildCashLedger, withCmsItemRows, buildBankAccountLedger, type CashRow, type BankAccountRow } from '@/lib/finance/cash-ledger';
import { CASH_BASIC_COLS, CASH_CARD_DETAIL_SECTIONS, CASH_EXPANDED_COLS, CASH_TX_DETAIL_SECTIONS } from '@/lib/finance/cash-cols';
import {
  ACCOUNT_ALL_COLS, ACCOUNT_BASIC_COLS, ACCOUNT_DETAIL_SECTIONS,
} from '@/lib/finance/account-cols';
import { isUnclassified } from '@/lib/payments/ledger-subjects';
import { latestDateOf, summarizeAccountLedgerStats, summarizeCashTxStats } from '@/lib/ledger-stats';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { notifySaved, openIngest, openCar } from '@/lib/ui-bus';
import { MigrateDataButton } from '@/components/MigrateDataButton';
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
  LedgerActions, LedgerActiveFilters, LedgerCreatePanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerPanelFooter, LedgerRecordPanel, Btn, Input, Select, Search, PillTabs, PeriodBar, Badge, Message, ListBox, ListRow,
  C, ContextMenu, type ContextMenuItem, useSheetExport, won, type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import FileDrop from '@/components/FileDrop';
import {
  CASH_ACCOUNT_FILTER_DEFS, CASH_TX_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
  type LedgerFilterFieldDef,
} from '@/lib/ledger-filter-defs';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

type Flow = '전체' | '입금' | '출금';
type CashLedgerKind = '입출금내역' | '계좌관리' | 'CMS 원천내역' | '법인카드 원천내역';
type SourceQuickFilter = '정산완료' | '미정산' | '승인' | '취소' | null;
type AccountStatusFilter = '전체' | '사용중' | '휴면';
type CashInputKind = '계좌' | '계좌거래' | 'CMS' | '법인카드';
type BulkInputSource = '파일' | '링크' | '텍스트';
const amt = (n: number) => (n ? won(n) : '—');
/** 표 DOM 폭주 방지 — 24·25 CMS미연결 수백건이면 페이지가 죽음 */
const ROW_DISPLAY_CAP = 200;

const ACCOUNT_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '계좌 기본', open: true, fields: ['bankName', 'accountNumber', 'accountAlias', 'accountHolder', 'accountType', 'status'] },
  { title: '개설·수집', fields: ['openedDate', 'closedDate', 'openingBalance', 'importMethod', 'memo'] },
];

const CASH_TX_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '거래 기본정보', open: true, fields: ['account', 'txDate', 'amount', 'withdraw'] },
  { title: '분류·내용', fields: ['counterparty', 'memo', 'method', 'balance'] },
];
const CARD_TX_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '카드 승인정보', open: true, fields: ['txDate', 'amount', 'merchant', 'approvalNo', 'cardLast4', 'category'] },
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
      <LedgerPanelFooter hint={ready ? '입력원이 준비되었습니다. 분석·검토 단계는 데이터관리와 연결됩니다.' : '파일·링크·텍스트 중 하나를 입력하세요.'}>
        <Btn size="sm" variant="ghost" onClick={onClose}>취소</Btn>
        <Btn size="sm" disabled>분석 준비</Btn>
      </LedgerPanelFooter>
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
  const router = useRouter();
  const { companyId, isOperator } = useSession();
  const { bank, card, loading, error: loadError, reload } = useCashLedgerLists();
  const { rows: accountRecords, loading: accountLoading } = useEntityList('bank_account');
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const xlTx = useSheetExport<CashRow>({
    title: '자금관리',
    filterSummary: () => '전체',
  });
  const xlAcct = useSheetExport<BankAccountRow>({
    title: '계좌관리',
    filterSummary: () => '전체',
  });
  const openCtx = (e: MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
  };

  const allRows = useMemo(() => {
    const base = buildCashLedger(bank, card)
      .slice()
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id));
    return withCmsItemRows(base, bank);
  }, [bank, card]);

  const latest = useMemo(
    () => latestDateOf(allRows, (r) => (r.nest === 'cms-item' ? '' : r.date), TODAY),
    [allRows],
  );

  const [colView, setColView] = useState<LedgerColView>('기본');
  const [ledgerKind, setLedgerKind] = useState<CashLedgerKind>('입출금내역');
  const [flow, setFlow] = useState<Flow>('전체');
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [sourceQuickFilter, setSourceQuickFilter] = useState<SourceQuickFilter>(null);
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusFilter>('사용중');
  const [q, setQ] = useState('');
  const [accountFilters, setAccountFilters] = useState(() => emptyFilterValues(CASH_ACCOUNT_FILTER_DEFS));
  const [txFilters, setTxFilters] = useState(() => emptyFilterValues(CASH_TX_FILTER_DEFS));
  const [filterOpen, setFilterOpen] = useState(false);
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
  const scopedCashRows = useMemo(() => allRows.filter((row) => {
    if (row.nest === 'cms-item') return false;
    if (row.entity !== 'bank_tx' || row.nest === 'cms-pending') return false;
    if (range.from && row.date < range.from) return false;
    if (range.to && row.date > range.to) return false;
    if (flow === '입금' && row.inAmt <= 0) return false;
    if (flow === '출금' && row.outAmt <= 0) return false;
    if (unclassifiedOnly && !isUnclassified(row.category)) return false;
    return true;
  }), [allRows, range.from, range.to, flow, unclassifiedOnly]);
  const balanceCashRows = useMemo(() => allRows.filter((row) => {
    if (row.nest === 'cms-item' || row.entity !== 'bank_tx') return false;
    if (range.from && row.date < range.from) return false;
    if (range.to && row.date > range.to) return false;
    return true;
  }), [allRows, range.from, range.to]);

  const accountRows = useMemo(
    () => buildBankAccountLedger(accountRecords, bank, scopedCashRows, balanceCashRows)
      .filter((row) => accountStatusFilter === '전체'
        || (accountStatusFilter === '사용중' ? row.status === '사용중' : row.status !== '사용중'))
      .filter((row) => matchLedgerFilters(row, accountFilters, {
        accountType: eqFilter<BankAccountRow>((r) => r.accountType),
      }))
      .filter((row) => textMatch(q, row.company, row.bankName, row.accountNumber, row.accountAlias, row.accountHolder, row.accountType, row.status, row.createdBy))
      .sort((a, b) => Number(a.status !== '사용중') - Number(b.status !== '사용중') || a.bankName.localeCompare(b.bankName, 'ko')),
    [accountRecords, bank, scopedCashRows, balanceCashRows, accountStatusFilter, accountFilters, q],
  );
  const selectedAccountTransactions = useMemo(() => {
    if (!selectedAccount) return [];
    const accountNo = selectedAccount.accountNumber.replace(/\D/g, '');
    const alias = selectedAccount.accountAlias.trim();
    return scopedCashRows
      .filter((row) => row.entity === 'bank_tx')
      .filter((row) => {
        const rowNo = row.account.replace(/\D/g, '');
        return (accountNo && rowNo === accountNo) || (alias && row.accountName === alias);
      })
      .slice(0, 20);
  }, [scopedCashRows, selectedAccount]);
  const rows = useMemo(() => {
    const isAll = !range.from && !range.to;
    const pass = (r: CashRow) => {
      if (ledgerKind === '입출금내역' && (r.entity !== 'bank_tx' || r.nest === 'cms-item' || r.nest === 'cms-pending')) return false;
      if (ledgerKind === 'CMS 원천내역' && !((r.nest === 'cms-item') || (r.nest === 'cms-pending'))) return false;
      if (ledgerKind === '법인카드 원천내역' && r.entity !== 'card_tx') return false;
      if (!isAll) {
        if (range.from && r.date < range.from) return false;
        if (range.to && r.date > range.to) return false;
      }
      if (flow === '입금' && !(r.inAmt > 0)) return false;
      if (flow === '출금' && !(r.outAmt > 0)) return false;
      if (sourceQuickFilter === '정산완료' && r.nest !== 'cms-item') return false;
      if (sourceQuickFilter === '미정산' && r.nest !== 'cms-pending') return false;
      const cardCancelled = r.outAmt < 0 || /취소/.test(`${r.raw.status || ''} ${r.raw.approvalStatus || ''} ${r.memo}`);
      if (sourceQuickFilter === '승인' && cardCancelled) return false;
      if (sourceQuickFilter === '취소' && !cardCancelled) return false;
      if (unclassifiedOnly && !isUnclassified(r.category)) return false;
      if (!matchLedgerFilters(r, txFilters, {
        category: eqFilter<CashRow>((row) => row.category),
        match: eqFilter<CashRow>((row) => String(row.raw.reconciliationStatus || '')),
      })) return false;
      if (!textMatch(q, r.party, r.account, r.category, r.memo, r.date, r.raw.dataAlert, r.raw.reconciliationStatus, companyDisplay(r.companyId), r.companyId)) return false;
      return true;
    };
    const out: CashRow[] = [];
    for (let i = 0; i < allRows.length; i++) {
      const r = allRows[i];
      if (!pass(r)) continue;
      out.push(r);
    }
    return out;
  }, [allRows, ledgerKind, flow, sourceQuickFilter, unclassifiedOnly, txFilters, q, range.from, range.to]);
  const cashCategories = useMemo(() => [...new Set(allRows.map((r) => r.category).filter(Boolean))].sort(), [allRows]);
  const matchStatuses = useMemo(() => [...new Set(allRows.map((r) => String(r.raw.reconciliationStatus || '')).filter(Boolean))].sort(), [allRows]);
  const accountTypes = useMemo(() => [...new Set(accountRows.map((r) => r.accountType).filter(Boolean))].sort(), [accountRows]);

  /** 통장 현금흐름·CMS·알람 — ledger-stats SSOT. */
  const { inSum, outSum, cmsPendingCount, cmsPendingSum, alertN, unclN } = useMemo(
    () => summarizeCashTxStats(rows),
    [rows],
  );
  const rowMore = Math.max(0, rows.length - ROW_DISPLAY_CAP);
  const displayRows = rowMore > 0 ? rows.slice(0, ROW_DISPLAY_CAP) : rows;
  const cols = colView === '기본' ? CASH_BASIC_COLS : CASH_EXPANDED_COLS;
  const onLedgerKindChange = (event: { target: { value: string } }) => {
    const next = event.target.value as CashLedgerKind;
    setLedgerKind(next);
    setFlow('전체');
    setSourceQuickFilter(null);
    setUnclassifiedOnly(false);
    setSelected(null);
    setSelectedAccount(null);
    setCreating(null);
  };

  const ledgerKindControl = (
    <Select
      size="sm"
      aria-label="원장 선택"
      value={ledgerKind}
      onChange={(event) => {
        const next = event.target.value as CashLedgerKind;
        setLedgerKind(next);
        setFlow('전체');
        setSourceQuickFilter(null);
        setUnclassifiedOnly(false);
        setSelected(null);
        setSelectedAccount(null);
        setCreating(null);
      }}
    >
      <option value="입출금내역">입출금내역</option>
      <option value="계좌관리">계좌관리</option>
      <option value="CMS 원천내역">CMS 원천내역</option>
      <option value="법인카드 원천내역">법인카드 원천내역</option>
    </Select>
  );
  /* 필터 패널용 — 공용 필드와 동일 규격(size 미지정 · width 100%). 값·핸들러는 헤더용과 공유. */
  const ledgerKindPanelControl = (
    <Select
      aria-label="원장 선택"
      value={ledgerKind}
      onChange={onLedgerKindChange}
      style={{ width: '100%' }}
    >
      <option value="입출금내역">입출금내역</option>
      <option value="계좌관리">계좌관리</option>
      <option value="CMS 원천내역">CMS 원천내역</option>
      <option value="법인카드 원천내역">법인카드 원천내역</option>
    </Select>
  );
  const onDoneMatch = useCallback(() => {
    setSelected(null);
    reload();
  }, [reload]);

  const showFlowFilter = ledgerKind === '입출금내역' || ledgerKind === '계좌관리';
  const showSourceQuick = ledgerKind === 'CMS 원천내역' || ledgerKind === '법인카드 원천내역';
  const cashFilterDefs: LedgerFilterFieldDef[] = ledgerKind === '계좌관리'
    ? [
      ...CASH_ACCOUNT_FILTER_DEFS,
      ...CASH_TX_FILTER_DEFS.filter((d) => d.key === 'flow' || d.key === 'unclassified'),
    ]
    : CASH_TX_FILTER_DEFS.filter((d) => {
      if (d.key === 'flow') return showFlowFilter;
      if (d.key === 'sourceQuick') return showSourceQuick;
      return true;
    });
  const cashFilterValues = {
    accountStatus: accountStatusFilter === '전체' ? '' : accountStatusFilter,
    accountType: accountFilters.accountType,
    flow: flow === '전체' ? '' : flow,
    sourceQuick: sourceQuickFilter ?? '',
    unclassified: unclassifiedOnly ? '예' : '',
    category: txFilters.category,
    match: txFilters.match,
  };
  const cashFilterCount = countActiveFilters(
    { ...cashFilterValues, accountStatus: accountStatusFilter === '사용중' ? '' : cashFilterValues.accountStatus },
    cashFilterDefs,
  );
  const onCashFilterChange = (key: string, value: string) => {
    if (key === 'accountStatus') {
      setAccountStatusFilter((value || '전체') as AccountStatusFilter);
      setAccountFilters((prev) => ({ ...prev, accountStatus: value }));
      return;
    }
    if (key === 'accountType') {
      setAccountFilters((prev) => ({ ...prev, accountType: value }));
      return;
    }
    if (key === 'flow') {
      setFlow((value || '전체') as Flow);
      setTxFilters((prev) => ({ ...prev, flow: value }));
      return;
    }
    if (key === 'sourceQuick') {
      setSourceQuickFilter((value || null) as SourceQuickFilter);
      setTxFilters((prev) => ({ ...prev, sourceQuick: value }));
      return;
    }
    if (key === 'unclassified') {
      setUnclassifiedOnly(value === '예');
      setTxFilters((prev) => ({ ...prev, unclassified: value }));
      return;
    }
    setTxFilters((prev) => ({ ...prev, [key]: value }));
  };
  const cashFilterPanel = filterOpen ? (
    <LedgerFilterPanel
      title="자금 필터"
      onReset={() => {
        setAccountFilters(emptyFilterValues(CASH_ACCOUNT_FILTER_DEFS));
        setTxFilters(emptyFilterValues(CASH_TX_FILTER_DEFS));
        setFlow('전체');
        setUnclassifiedOnly(false);
        setSourceQuickFilter(null);
        setAccountStatusFilter('전체');
      }}
      onClose={() => setFilterOpen(false)}
    >
      {/* ★필터 패널 안의 셀렉트는 공용 필드(LedgerFilterFields)와 같은 규격이어야 한다 —
          size 미지정 + width:100%. 헤더용 컨트롤(size="sm")을 그대로 넣으면 폭이 혼자 좁아진다. */}
      <label>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>원장 선택</span>
        {ledgerKindPanelControl}
      </label>
      <LedgerFilterFields
        defs={cashFilterDefs}
        values={cashFilterValues}
        onChange={onCashFilterChange}
        options={{
          accountStatus: ['사용중', '휴면'],
          accountType: accountTypes,
          flow: ['입금', '출금'],
          sourceQuick: ledgerKind === 'CMS 원천내역' ? ['정산완료', '미정산'] : ['승인', '취소'],
          unclassified: [{ value: '예', label: '미분류만' }],
          category: cashCategories,
          match: matchStatuses,
        }}
      />
    </LedgerFilterPanel>
  ) : null;

  const singleKindTabs = (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 7 }}>입력 대상</div>
      <PillTabs
        size="sm"
        value={singleKind}
        onChange={(next) => {
          setSingleKind(next);
          setLedgerKind(
            next === '계좌' ? '계좌관리'
              : next === 'CMS' ? 'CMS 원천내역'
                : next === '법인카드' ? '법인카드 원천내역'
                  : '입출금내역',
          );
          setCreating(next === '계좌' ? 'account' : 'transaction');
        }}
        tabs={CASH_INPUT_KINDS.map((key) => ({ key, label: key }))}
      />
    </div>
  );

  const createActions = (
    <LedgerActions aria-label="쓰기">
      <Btn
        size="sm"
        tip={creating === 'account' || creating === 'transaction'
          ? '입력 취소'
          : ledgerKind === '계좌관리' ? '계좌 추가' : '단건 입력'}
        onClick={() => {
          setSelected(null);
          setSelectedAccount(null);
          setSingleKind(
            ledgerKind === '계좌관리' ? '계좌'
              : ledgerKind === 'CMS 원천내역' ? 'CMS'
                : ledgerKind === '법인카드 원천내역' ? '법인카드'
                  : '계좌거래',
          );
          setCreating((open) => open === 'account' || open === 'transaction' ? null : (ledgerKind === '계좌관리' ? 'account' : 'transaction'));
        }}
        aria-pressed={creating === 'account' || creating === 'transaction'}
        variant={creating === 'account' || creating === 'transaction' ? 'ghost' : 'solid'}
      >
        {creating === 'account' || creating === 'transaction'
          ? <><X size={14} /> 입력 취소</>
          : <><Plus size={14} /> {ledgerKind === '계좌관리' ? '계좌 추가' : '단건 입력'}</>}
      </Btn>
      <Btn
        size="sm"
        variant="ghost"
        iconOnly
        tip={creating === 'bulk' ? '대량 입력 취소' : '대량 입력'}
        onClick={() => {
          setSelected(null);
          setSelectedAccount(null);
          setCreating((open) => open === 'bulk' ? null : 'bulk');
        }}
        aria-pressed={creating === 'bulk'}
      >
        <UploadCloud size={14} />
      </Btn>
    </LedgerActions>
  );

  if (ledgerKind === '계좌관리') {
    const { total: accountTotal, active: activeAccounts } = summarizeAccountLedgerStats(accountRows);
    const acctItems: ContextMenuItem[] = [
      xlAcct.exportItem(),
      ...(isOperator ? [xlAcct.exportItem({ unmasked: true })] : []),
    ];
    return (
      <>
      <LedgerFrame
        title="자금관리"
        meta="계좌·입출금·CMS"
        right={createActions}
        colView={colView}
        onColView={setColView}
        filters={<>
          <Search
            size="sm"
            placeholder="회사·은행·계좌번호·계좌명·등록자"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
          />
          <LedgerFilterButton open={filterOpen} count={cashFilterCount} onClick={() => setFilterOpen((o) => !o)} />
          {!filterOpen && (
            <LedgerActiveFilters
              defs={cashFilterDefs} values={cashFilterValues}
              onClear={(key: string) => onCashFilterChange(key, '')}
              onClearAll={() => cashFilterDefs.forEach((d) => onCashFilterChange(d.key, ''))}
            />
          )}
          {/* 필터 창이 닫혀 있어도 «무엇을 보고 있는지» 알아야 한다 — 칩을 누르면 그 축만 해제. */}
          {!filterOpen && (
            <LedgerActiveFilters
              defs={cashFilterDefs} values={cashFilterValues}
              onClear={(key: string) => onCashFilterChange(key, '')}
              onClearAll={() => cashFilterDefs.forEach((d) => onCashFilterChange(d.key, ''))}
            />
          )}
          <PeriodBar latest={latest} initial="월간" size="sm" onRange={onRange} />
        </>}
        filterPanel={cashFilterPanel}
        stats={<span style={{ fontSize: 12.5, color: C.mute }}>전체 <b>{accountTotal}</b> · 사용중 <b style={{ color: C.ok }}>{activeAccounts}</b></span>}
        loading={accountLoading}
        error={loadError}
        onRetry={reload}
        empty="등록된 계좌가 없습니다. 「신규 계좌」에서 등록하세요."
        cols={colView === '기본' ? ACCOUNT_BASIC_COLS : ACCOUNT_ALL_COLS}
        rows={accountRows}
        rowKey={(row) => row.id}
        selectedRowKey={selectedAccount?.id}
        onView={xlAcct.onView}
        onRowContextMenu={openCtx}
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
            fileIngest={{ label: '통장 담기 (데이터관리)', onClick: () => openIngest('bank_tx') }}
            onClose={() => setCreating(null)}
          />
        ) : selectedAccount ? (
          <LedgerRecordPanel
            title={`${selectedAccount.bankName} ${selectedAccount.accountNumber}`}
            identity={selectedAccount.company || LEDGER_EMPTY.dash}
            statusBadge={<Badge tone={selectedAccount.status === '사용중' ? 'green' : 'gray'}>{selectedAccount.status}</Badge>}
            row={selectedAccount}
            cols={ACCOUNT_ALL_COLS}
            sections={ACCOUNT_DETAIL_SECTIONS}
            onClose={() => setSelectedAccount(null)}
          >
            <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8 }}>거래·수납정보</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 8 }}>
                <span>전체 거래 <b>{selectedAccount.transactionCount}</b>건</span>
                <span>입금 <b style={{ color: C.ok }}>{won(selectedAccount.totalIn)}</b></span>
                <span>출금 <b>{won(selectedAccount.totalOut)}</b></span>
                <span>최종잔액 <b>{won(selectedAccount.currentBalance)}</b></span>
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
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
        items={acctItems}
      />
      </>
    );
  }

  const ledgerMeta = '계좌·입출금·CMS';
  const ledgerEmpty = (
    <>
      {ledgerKind === 'CMS 원천내역'
        ? '표시할 CMS 원천내역이 없습니다. 기간을 바꾸거나 대량 입력에서 CMS 자료를 등록하세요.'
        : ledgerKind === '법인카드 원천내역'
          ? '표시할 법인카드 원천내역이 없습니다. 기간을 바꾸거나 대량 입력에서 법인카드 자료를 등록하세요.'
          : '표시할 계좌 입출금이 없습니다. 기간을 바꾸거나 단건·대량 입력에서 등록하세요.'}
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        <MigrateDataButton size="sm" />
      </div>
    </>
  );

  return (
    <>
    <LedgerFrame
      title="자금관리"
      meta={ledgerMeta}
      right={createActions}
      colView={colView}
      onColView={setColView}
      filters={
        <>
          <Search
            size="sm"
            placeholder="회사·계좌·상대·과목·내용"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
          />
          <LedgerFilterButton open={filterOpen} count={cashFilterCount} onClick={() => setFilterOpen((o) => !o)} />
          <PeriodBar latest={latest} initial="월간" size="sm" onRange={onRange} />
        </>
      }
      filterPanel={cashFilterPanel}
      hint={
        rowMore > 0 ? (
          <Message variant="warning">
            표는 상위 {ROW_DISPLAY_CAP}건만 표시합니다 (외 {rowMore.toLocaleString('ko-KR')}건). 월간·검색으로 좁히면 전부 볼 수 있습니다.
          </Message>
        ) : null
      }
      stats={
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <span>{ledgerKind === 'CMS 원천내역' ? 'CMS' : ledgerKind === '법인카드 원천내역' ? '카드' : '계좌'} <b>{rows.length}</b></span>
          {ledgerKind === '입출금내역' && <span>입금 <b style={{ color: C.ok }}>{amt(inSum)}</b></span>}
          {ledgerKind === '입출금내역' && <span>출금 <b>{amt(outSum)}</b></span>}
          {ledgerKind === 'CMS 원천내역' && cmsPendingCount > 0 && (
            <span>CMS미연결 <b style={{ color: C.brand }}>{cmsPendingCount}</b>·<b style={{ color: C.brand }}>{amt(cmsPendingSum)}</b></span>
          )}
          {alertN > 0 && <span>데이터알람 <b style={{ color: C.warn }}>{alertN}</b></span>}
        </span>
      }
      loading={loading}
      empty={ledgerEmpty}
      cols={cols}
      rows={displayRows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id}
      onView={xlTx.onView}
      onRowContextMenu={openCtx}
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
          fileIngest={{ label: '통장 담기 (데이터관리)', onClick: () => openIngest('bank_tx') }}
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
          title={`${selected.date || '일자 없음'} · ${selected.category || '거래'}`}
          identity={selected.accountName || selected.account || LEDGER_EMPTY.unassigned}
          statusBadge={CASH_BASIC_COLS.find((c) => c.key === 'match')?.render(selected)}
          row={selected}
          cols={CASH_EXPANDED_COLS}
          sections={selected.entity === 'card_tx' ? CASH_CARD_DETAIL_SECTIONS : CASH_TX_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={String(selected.raw.matchedContractId || selected.raw.plate || '') ? (
            <Btn
              size="sm"
              variant="ghost"
              onClick={() => {
                const plate = String(selected.raw.plate || '');
                if (plate) openCar(plate);
                else router.push('/contract');
              }}
            >
              연결 계약
            </Btn>
          ) : undefined}
        />
      ) : null}
    />
    <ContextMenu
      open={ctxMenu.open}
      x={ctxMenu.x}
      y={ctxMenu.y}
      onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
      items={[
        xlTx.exportItem(),
        ...(isOperator ? [xlTx.exportItem({ unmasked: true })] : []),
      ]}
    />
    </>
  );
}
