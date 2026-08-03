'use client';
/**
 * 자금관리 원장 — 실제 입출금·계좌·카드·자동이체와 미래 자금계획을 함께 관리한다.
 *   · CMS 업로드 → CMS미연결 로 원장 표시(계좌 입금과 별도, 이중합산 X)
 *   · 통장 CMS집금 → CMS집금·미매칭 / 매칭 후 하위행 CMS연결
 *   · 집금 또는 미연결 클릭 → 수동 매칭 패널
 */
import { useMemo, useState, useCallback, type MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Link2, Unlink, UploadCloud } from 'lucide-react';
import { buildCashLedger, withCmsItemRows, buildBankAccountLedger, type CashRow, type BankAccountRow } from '@/lib/finance/cash-ledger';
import { CASH_BASIC_COLS, CASH_CARD_DETAIL_SECTIONS, CASH_EXPANDED_COLS, CASH_TX_DETAIL_SECTIONS, cashBundleStatus, cashMoneyStatus } from '@/lib/finance/cash-cols';
import { buildCashPlan, type CashPlanRow } from '@/lib/finance/cash-plan';
import { CASH_PLAN_BASIC_COLS, CASH_PLAN_DETAIL_SECTIONS, CASH_PLAN_EXPANDED_COLS } from '@/lib/finance/cash-plan-cols';
import {
  ACCOUNT_ALL_COLS, ACCOUNT_BASIC_COLS, ACCOUNT_DETAIL_SECTIONS,
} from '@/lib/finance/account-cols';
import { isUnclassified } from '@/lib/payments/ledger-subjects';
import { LEDGER_SUBJECTS } from '@/lib/payments/ledger-subjects';
import {
  CASH_BUNDLE_TYPES, summarizeCashBundle, type CashBundleItem, type CashBundleType,
} from '@/lib/finance/cash-bundle';
import { requiresContractLink } from '@/lib/finance/cash-rules';
import { latestDateOf, summarizeAccountLedgerStats, summarizeCashTxStats } from '@/lib/ledger-stats';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { useEntityList, useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import { notifySaved, openIngest, openCar, openPayments } from '@/lib/ui-bus';
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
import { commitUpdate } from '@/lib/commit';
import { safeRun } from '@/lib/safe-update';
import {
  LedgerActions, LedgerActiveFilters, LedgerCreatePanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerPanelCloseButton, LedgerPanelFooter, LedgerRecordPanel, Btn, Input, TextArea, Select, Search, PillTabs, PeriodBar, Checkbox, Badge, Message, ListBox, ListRow,
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
type CashLedgerKind = '입출금내역' | '계좌관리' | 'CMS 원천내역' | '법인카드 원천내역' | '자금계획';
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
        <LedgerPanelCloseButton onClose={onClose} label="대량 입력 패널 닫기" />
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
              <TextArea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="표·문자·거래내역을 그대로 붙여넣으세요"
                style={{ minHeight: 180 }}
              />
            </label>
          )}
        </div>
      </div>
      <LedgerPanelFooter hint={ready ? '입력원이 준비되었습니다. 분석·검토 단계는 데이터센터와 연결됩니다.' : '파일·링크·텍스트 중 하나를 입력하세요.'}>
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
                  <Checkbox checked={on} onChange={() => toggle(k)} ariaLabel={`${String(b.counterparty || '적요 없음')} 선택`} />
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

function CashClassificationPanel({ row, companyId, actor, onClose, onDone }: {
  row: CashRow;
  companyId: string;
  actor: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const flow: '입금' | '출금' = row.inAmt > 0 ? '입금' : '출금';
  const categories = LEDGER_SUBJECTS.filter((subject) =>
    flow === '입금' ? subject.kind !== '지출' : subject.kind !== '수입');
  const [category, setCategory] = useState(String(row.raw.category || ''));
  const [party, setParty] = useState(String(row.entity === 'card_tx' ? row.raw.merchant || '' : row.raw.counterparty || ''));
  const [memo, setMemo] = useState(String(row.raw.memo || ''));
  const [plate, setPlate] = useState(String(row.raw.plate || ''));
  const [saving, setSaving] = useState(false);
  const needsContract = row.inAmt > 0 && requiresContractLink(category)
    && !String(row.raw.matchedContractId || row.raw.matchedScheduleSeq || '');

  async function save() {
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    const partyKey = row.entity === 'card_tx' ? 'merchant' : 'counterparty';
    const ok = await safeRun(async () => {
      await commitUpdate({
        entity: row.entity, sessionCompanyId: companyId, rec: row.raw, key: row.recKey,
        patch: {
          category: category.trim(),
          [partyKey]: party.trim(),
          memo: memo.trim(),
          plate: plate.trim(),
          firstClassifiedAt: new Date().toISOString(),
          firstClassifiedBy: actor,
        },
      });
    });
    setSaving(false);
    if (!ok) return;
    toast(category.trim() ? `1차 분류 · ${category.trim()}` : '미분류 상태로 저장', category.trim() ? 'success' : 'info');
    onDone();
  }

  return (
    <section className="ledger-record-panel" aria-label="자금 1차 분류">
      <header className="ledger-record-panel__header">
        <span className="ledger-record-panel__icon" aria-hidden="true"><Link2 size={16} /></span>
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__eyebrow">자금 1차 분류</div>
          <div className="ledger-record-panel__title">{row.date || '일자 없음'} · {flow} {won(row.inAmt || row.outAmt)}</div>
          <div className="ledger-record-panel__identity">{row.accountName || row.account || LEDGER_EMPTY.unassigned}</div>
        </div>
        <LedgerPanelCloseButton onClose={onClose} label="1차 분류 패널 닫기" />
      </header>
      <div className="ledger-create-panel__body">
        <Message variant="info">거래일·금액·계좌 원본은 유지합니다. 지금 아는 정보만 저장할 수 있고 미분류는 후속 업무로 계속 남습니다.</Message>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 12 }}>
          <label className="ledger-create-panel__field"><span>계정과목</span>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">미분류</option>
              {categories.map((subject) => <option key={subject.code} value={subject.label}>{subject.label}</option>)}
            </Select>
          </label>
          <label className="ledger-create-panel__field"><span>거래처·대상</span><Input value={party} onChange={(event) => setParty(event.target.value)} /></label>
          <label className="ledger-create-panel__field"><span>차량번호</span><Input value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="차량 관련 거래만" /></label>
        </div>
        <label className="ledger-create-panel__field" style={{ marginTop: 10 }}><span>내용·판단근거</span><Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="분류 근거 또는 확인할 내용" /></label>
        {needsContract ? <Message variant="warning">계약성 입금입니다. 1차 분류 저장 후 자금일보의 입금 매칭에서 실제 계약·회차를 연결해야 완료됩니다.</Message> : null}
      </div>
      <LedgerPanelFooter hint={category.trim() ? '분류 결과가 원장과 자금일보에 함께 반영됩니다.' : '미분류로 저장해도 사라지지 않고 계속 확인 대상으로 남습니다.'}>
        <Btn size="sm" variant="ghost" onClick={onClose}>닫기</Btn>
        <Btn size="sm" onClick={() => void save()} disabled={saving}>{saving ? '저장 중…' : '1차 분류 저장'}</Btn>
      </LedgerPanelFooter>
    </section>
  );
}

function CashBundlePanel({ row, companyId, actor, contracts, onClose, onDone }: {
  row: CashRow;
  companyId: string;
  actor: string;
  contracts: EntityRecord[];
  onClose: () => void;
  onDone: () => void;
}) {
  const flow: '입금' | '출금' = row.inAmt > 0 ? '입금' : '출금';
  const actualAmount = row.inAmt || row.outAmt;
  const initialItems = Array.isArray(row.raw.bundleItems)
    ? (row.raw.bundleItems as Array<Record<string, unknown>>).map((item, index): CashBundleItem => ({
      id: String(item.id || `saved-${index + 1}`),
      party: String(item.party || ''), memo: String(item.memo || ''),
      amount: Number(item.amount) || 0, category: String(item.category || ''),
      referenceId: String(item.referenceId || ''),
    }))
    : [];
  const [bundleType, setBundleType] = useState<CashBundleType>(() => {
    const saved = String(row.raw.bundleType || '');
    return CASH_BUNDLE_TYPES.includes(saved as CashBundleType)
      ? saved as CashBundleType
      : flow === '입금' ? '일괄입금' : '일괄출금';
  });
  const [items, setItems] = useState<CashBundleItem[]>(initialItems);
  const [fee, setFee] = useState(String(Number(row.raw.bundleFeeAmount) || ''));
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => summarizeCashBundle({
    flow, actualAmount, feeAmount: Number(fee) || 0, items,
  }), [flow, actualAmount, fee, items]);
  const categories = LEDGER_SUBJECTS.filter((subject) =>
    flow === '입금' ? subject.kind !== '지출' : subject.kind !== '수입');
  const contractOptions = useMemo(() => contracts
    .filter((contract) => !contract.deletedAt && String(contract.companyId || '') === row.companyId)
    .map((contract) => ({
      value: String(contract._key || contract.contractNo || ''),
      label: [contract.contractNo, contract.plate, contract.contractorName].filter(Boolean).join(' · '),
    }))
    .filter((option) => option.value)
    .sort((a, b) => a.label.localeCompare(b.label, 'ko')), [contracts, row.companyId]);

  const updateItem = (id: string, patch: Partial<CashBundleItem>) =>
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const addItem = () => setItems((current) => [...current, {
    id: `bundle-${Date.now()}-${current.length + 1}`, party: '', memo: '', amount: 0, category: '',
  }]);
  const removeItem = (id: string) => setItems((current) => current.filter((item) => item.id !== id));

  async function save() {
    if (row.entity !== 'bank_tx') { toast('계좌 입출금만 묶음 분해할 수 있습니다.', 'error'); return; }
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    setSaving(true);
    const cleaned = items.map((item) => ({
      ...item,
      party: item.party.trim(), memo: item.memo.trim(), category: item.category.trim(), referenceId: String(item.referenceId || '').trim(),
      amount: Math.max(0, Number(item.amount) || 0),
    }));
    const nextSummary = summarizeCashBundle({ flow, actualAmount, feeAmount: Number(fee) || 0, items: cleaned });
    const ok = await safeRun(async () => {
      await commitUpdate({
        entity: 'bank_tx', sessionCompanyId: companyId, rec: row.raw, key: row.recKey,
        patch: {
          bundleType,
          bundleItems: cleaned,
          bundleItemCount: nextSummary.itemCount,
          bundleItemSum: nextSummary.itemSum,
          bundleFeeAmount: nextSummary.feeAmount,
          bundleExpectedAmount: nextSummary.expectedAmount,
          bundleDifference: nextSummary.difference,
          bundleReviewStatus: nextSummary.status,
          bundleUpdatedAt: new Date().toISOString(),
          bundleUpdatedBy: actor,
        },
      });
    });
    setSaving(false);
    if (!ok) return;
    toast(`${bundleType} ${nextSummary.itemCount}건 · ${nextSummary.status}`, nextSummary.status === '대사완료' ? 'success' : 'info');
    onDone();
  }

  return (
    <section className="ledger-record-panel" aria-label="묶음 입출금 분해">
      <header className="ledger-record-panel__header">
        <span className="ledger-record-panel__icon" aria-hidden="true"><Link2 size={16} /></span>
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__eyebrow">자금 1차 분류</div>
          <div className="ledger-record-panel__title">묶음 입출금 분해</div>
          <div className="ledger-record-panel__identity">{row.date} · {row.party || row.accountName || '거래'} · {flow} {won(actualAmount)}</div>
        </div>
        <LedgerPanelCloseButton onClose={onClose} label="묶음 분해 패널 닫기" />
      </header>
      <div className="ledger-create-panel__body">
        <Message variant="info">실제 계좌 거래는 한 번만 반영하고, 여기서는 구성내역과 수수료를 분해합니다. 덜 채운 상태도 미완료로 저장해 이어서 작업할 수 있습니다.</Message>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(140px, 1fr)', gap: 10, marginTop: 12 }}>
          <label className="ledger-create-panel__field"><span>묶음 유형</span>
            <Select value={bundleType} onChange={(event) => setBundleType(event.target.value as CashBundleType)}>
              {CASH_BUNDLE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </label>
          <label className="ledger-create-panel__field"><span>수수료·차감액</span>
            <Input inputMode="numeric" value={fee} onChange={(event) => setFee(event.target.value.replace(/[^\d]/g, ''))} placeholder="0" />
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 }}>
          <b style={{ fontSize: 12.5 }}>구성내역</b>
          <Badge tone={summary.status === '대사완료' ? 'green' : 'amber'}>{summary.status}</Badge>
          <span style={{ flex: 1 }} />
          <Btn size="sm" variant="ghost" onClick={addItem}><Plus size={14} /> 구성 추가</Btn>
        </div>
        {items.length === 0 ? <div style={{ padding: 14, border: `1px dashed ${C.line}`, color: C.mute, fontSize: 12.5 }}>아직 구성내역이 없습니다. 유형만 정해 미완료로 저장하거나 구성건을 추가하세요.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((item, index) => (
              <div key={item.id} style={{ padding: 10, border: `1px solid ${C.line}`, borderRadius: 8, background: C.card }}>
                <div style={{ display: 'grid', gridTemplateColumns: '28px minmax(100px, 1fr) minmax(110px, 1fr) minmax(100px, 0.8fr) 34px', gap: 7, alignItems: 'end' }}>
                  <b style={{ fontSize: 12, color: C.mute, alignSelf: 'center' }}>{index + 1}</b>
                  <label className="ledger-create-panel__field"><span>거래처·대상</span><Input size="sm" value={item.party} onChange={(event) => updateItem(item.id, { party: event.target.value })} /></label>
                  <label className="ledger-create-panel__field"><span>계정과목</span><Select size="sm" value={item.category} onChange={(event) => updateItem(item.id, { category: event.target.value })}><option value="">미분류</option>{categories.map((subject) => <option key={subject.code} value={subject.label}>{subject.label}</option>)}</Select></label>
                  <label className="ledger-create-panel__field"><span>금액</span><Input size="sm" inputMode="numeric" value={item.amount || ''} onChange={(event) => updateItem(item.id, { amount: Number(event.target.value.replace(/[^\d]/g, '')) || 0 })} /></label>
                  <Btn size="sm" variant="ghost" iconOnly tip={`${index + 1}번 구성 삭제`} onClick={() => removeItem(item.id)}><X size={14} /></Btn>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 7, marginTop: 7 }}>
                  <label className="ledger-create-panel__field"><span>내용·판단근거</span><Input size="sm" value={item.memo} onChange={(event) => updateItem(item.id, { memo: event.target.value })} placeholder="급여명세·정비내역·정산 근거" /></label>
                  <label className="ledger-create-panel__field"><span>{requiresContractLink(item.category) ? '연결 계약' : '계약·문서 근거'}</span>
                    {requiresContractLink(item.category) ? (
                      <Select size="sm" value={item.referenceId || ''} onChange={(event) => updateItem(item.id, { referenceId: event.target.value })}>
                        <option value="">계약 연결 필요</option>
                        {contractOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </Select>
                    ) : (
                      <Input size="sm" value={item.referenceId || ''} onChange={(event) => updateItem(item.id, { referenceId: event.target.value })} placeholder="선택 입력" />
                    )}
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 6, marginTop: 12, padding: 10, borderRadius: 8, background: C.head, fontSize: 12.5 }}>
          <span>실제 {flow} <b>{won(summary.actualAmount)}</b></span>
          <span>구성 합계 <b>{won(summary.itemSum)}</b></span>
          <span>수수료 <b>{won(summary.feeAmount)}</b></span>
          <span>계산 금액 <b>{won(summary.expectedAmount)}</b></span>
          <span>차이 <b style={{ color: Math.abs(summary.difference) < 1 ? C.ok : C.danger }}>{won(summary.difference)}</b></span>
          <span>미분류 <b style={{ color: summary.unclassifiedCount ? C.warn : C.ok }}>{summary.unclassifiedCount}건</b></span>
          <span>필수누락 <b style={{ color: summary.requiredMissingCount ? C.warn : C.ok }}>{summary.requiredMissingCount}건</b></span>
          <span>계약미연결 <b style={{ color: summary.linkMissingCount ? C.warn : C.ok }}>{summary.linkMissingCount}건</b></span>
        </div>
      </div>
      <LedgerPanelFooter hint={summary.status === '대사완료' ? '원본 금액과 구성내역이 일치합니다.' : '미완료로 저장되며 자금일보 마감 전 계속 보완할 수 있습니다.'}>
        <Btn size="sm" variant="ghost" onClick={onClose}>닫기</Btn>
        <Btn size="sm" onClick={() => void save()} disabled={saving}>{saving ? '저장 중…' : `${summary.status} 저장`}</Btn>
      </LedgerPanelFooter>
    </section>
  );
}

export default function CashLedgerPage() {
  const mobile = useIsMobile();
  const router = useRouter();
  const { companyId, isOperator, user } = useSession();
  const { bank, card, loading, error: loadError, reload } = useCashLedgerLists();
  const { rows: accountRecords, loading: accountLoading } = useEntityList('bank_account');
  const {
    data: [planContracts = [], planWork = [], planInsurances = [], planPenalties = [], planLeases = []],
    loading: planLoading, error: planLoadError, reload: reloadPlan,
  } = useEntityLists(['contract', 'work_item', 'insurance', 'penalty', 'lease']);
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
  const [planHorizon, setPlanHorizon] = useState(90);
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
  const [selectedPlan, setSelectedPlan] = useState<CashPlanRow | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<BankAccountRow | null>(null);
  const [creating, setCreating] = useState<'account' | 'transaction' | 'bulk' | null>(null);
  const [bundleEditing, setBundleEditing] = useState(false);
  const [classificationEditing, setClassificationEditing] = useState(false);
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
  const planAccounts = useMemo(() => {
    const bankRows = allRows.filter((row) => row.entity === 'bank_tx' && row.nest !== 'cms-item');
    return buildBankAccountLedger(accountRecords, bank, bankRows, bankRows)
      .filter((row) => row.status === '사용중');
  }, [accountRecords, bank, allRows]);
  const planOpeningBalance = useMemo(
    () => planAccounts.reduce((sum, row) => sum + row.currentBalance, 0),
    [planAccounts],
  );
  const planOpeningKnown = useMemo(
    () => planAccounts.length > 0 && planAccounts.every((row) => row.lastTxDate || row.raw.openingBalance != null),
    [planAccounts],
  );
  const cashPlan = useMemo(() => buildCashPlan({
    contracts: planContracts,
    workItems: planWork,
    insurances: planInsurances,
    penalties: planPenalties,
    leases: planLeases,
    today: TODAY,
    horizonDays: planHorizon,
    openingBalance: planOpeningBalance,
    openingBalanceKnown: planOpeningKnown,
  }), [planContracts, planWork, planInsurances, planPenalties, planLeases, planHorizon, planOpeningBalance, planOpeningKnown]);
  const planRows = useMemo(() => cashPlan.rows.filter((row) => textMatch(
    q, row.company, row.dueDate, row.direction, row.source, row.title, row.counterparty,
    row.status, row.certainty, row.reference, row.memo,
  )), [cashPlan.rows, q]);
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
        match: eqFilter<CashRow>((row) => cashMoneyStatus(row)),
        bundleStatus: eqFilter<CashRow>((row) => row.nest === 'bundle-parent' ? cashBundleStatus(row) : ''),
      })) return false;
      if (!textMatch(q, r.party, r.account, r.category, r.memo, r.date, r.raw.dataAlert, cashMoneyStatus(r), r.raw.bundleType, r.nest === 'bundle-parent' ? cashBundleStatus(r) : '', companyDisplay(r.companyId), r.companyId)) return false;
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
    setSelectedPlan(null);
    setSelectedAccount(null);
    setCreating(null);
    setClassificationEditing(false);
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
        setSelectedPlan(null);
        setSelectedAccount(null);
        setCreating(null);
        setClassificationEditing(false);
      }}
    >
      <option value="입출금내역">입출금내역</option>
      <option value="계좌관리">계좌관리</option>
      <option value="CMS 원천내역">CMS 원천내역</option>
      <option value="법인카드 원천내역">법인카드 원천내역</option>
      <option value="자금계획">자금계획</option>
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
      <option value="자금계획">자금계획</option>
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
    bundleStatus: txFilters.bundleStatus,
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
          match: ['미분류', '집금대기', '미매칭', '제안있음', '매칭완료', '해당없음'],
          bundleStatus: ['미완료', '대사완료'],
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

  if (ledgerKind === '자금계획') {
    const S = cashPlan.summary;
    return (
      <LedgerFrame
        title="자금관리"
        meta="현재잔액을 시작으로 계약·업무·보험·과태료·임차료 예정 Cash-in/out을 투영"
        view={ledgerKindControl}
        colView={colView}
        onColView={setColView}
        filters={<>
          <Search
            size="sm"
            placeholder="회사·예정일·근거·대상·상태"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
          />
          <Select
            size="sm"
            aria-label="전망기간"
            value={String(planHorizon)}
            onChange={(event) => { setPlanHorizon(Number(event.target.value) || 90); setSelectedPlan(null); }}
          >
            <option value="30">30일 전망</option>
            <option value="60">60일 전망</option>
            <option value="90">90일 전망</option>
            <option value="180">180일 전망</option>
          </Select>
        </>}
        stats={<span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <span>현재잔액 <b>{S.openingBalanceKnown ? won(S.openingBalance) : '미확인'}</b></span>
          <span>예정입금 <b style={{ color: C.ok }}>{won(S.inflow)}</b></span>
          <span>예정출금 <b>{won(S.outflow)}</b></span>
          <span>예상잔액 <b style={{ color: S.openingBalanceKnown && S.closingBalance < 0 ? C.danger : C.ink }}>{S.openingBalanceKnown ? won(S.closingBalance) : '미확인'}</b></span>
          {S.openingBalanceKnown && S.minimumBalance < 0 ? <span>부족예상 <b style={{ color: C.danger }}>{S.minimumBalanceDate} · {won(Math.abs(S.minimumBalance))}</b></span> : null}
        </span>}
        hint={S.needsReview > 0 ? <Message variant="warning">계산에서 확정할 수 없는 방향·금액·일정 또는 정산 항목 {S.needsReview}건을 먼저 확인하세요.</Message> : null}
        loading={loading || accountLoading || planLoading}
        error={loadError || planLoadError}
        onRetry={() => { reload(); reloadPlan(); }}
        empty="전망기간에 반영할 자금예정이 없습니다. 계약 회차 또는 자금 업무의 금액·기한을 확인하세요."
        cols={colView === '기본' ? CASH_PLAN_BASIC_COLS : CASH_PLAN_EXPANDED_COLS}
        rows={planRows}
        rowKey={(row) => row.id}
        selectedRowKey={selectedPlan?.id}
        mobileCard={(row) => ({
          badge: row.direction,
          badgeTone: row.direction === '입금' ? 'green' : row.direction === '출금' ? 'gray' : 'amber',
          name: row.title,
          carType: row.dueDate || '일정 미정',
          fields: [['근거', row.source], ['상태', row.status]],
          right: won(row.amount),
        })}
        onRowDoubleClick={(row) => setSelectedPlan(row)}
        onCloseDetail={() => setSelectedPlan(null)}
        sidePanel={selectedPlan ? (
          <LedgerRecordPanel
            title={`${selectedPlan.dueDate || '일정 미정'} · ${selectedPlan.source}`}
            identity={selectedPlan.title}
            statusBadge={<Badge tone={selectedPlan.status === '예정' ? 'blue' : selectedPlan.status === '일정확인' ? 'amber' : 'red'}>{selectedPlan.status}</Badge>}
            row={selectedPlan}
            cols={CASH_PLAN_EXPANDED_COLS}
            sections={CASH_PLAN_DETAIL_SECTIONS}
            onClose={() => setSelectedPlan(null)}
          />
        ) : null}
      />
    );
  }

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
        meta="계좌·입출금·법인카드·자동이체 · 묶음 1차 분류"
        right={createActions}
        view={ledgerKindControl}
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
        mobileCard={(row) => ({
          co: isOperator ? row.companyId : undefined,
          badge: row.status || '미지정',
          badgeTone: row.status === '사용중' ? 'green' : 'gray',
          name: row.accountAlias || row.bankName || '계좌',
          carType: row.accountNumber || undefined,
          fields: [
            ['예금주', row.accountHolder || LEDGER_EMPTY.dash],
            ['최근거래', row.lastTxDate || LEDGER_EMPTY.dash],
            ['거래', `${row.transactionCount}건`],
          ],
          right: won(row.currentBalance),
        })}
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
            fileIngest={{ label: '통장 담기 (데이터센터)', onClick: () => openIngest('bank_tx') }}
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

  const ledgerMeta = '계좌·입출금·법인카드·자동이체 · 묶음 1차 분류';
  const ledgerEmpty = (
    <>
      {ledgerKind === 'CMS 원천내역'
        ? '표시할 CMS 원천내역이 없습니다. 기간을 바꾸거나 대량 입력에서 CMS 자료를 등록하세요.'
        : ledgerKind === '법인카드 원천내역'
          ? '표시할 법인카드 원천내역이 없습니다. 기간을 바꾸거나 대량 입력에서 법인카드 자료를 등록하세요.'
          : '표시할 계좌 입출금이 없습니다. 기간을 바꾸거나 단건·대량 입력에서 등록하세요.'}
    </>
  );

  return (
    <>
    <LedgerFrame
      title="자금관리"
      meta={ledgerMeta}
      right={createActions}
      view={ledgerKindControl}
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
          <span>{ledgerKind === 'CMS 원천내역' ? 'CMS' : ledgerKind === '법인카드 원천내역' ? '카드' : '거래'} <b>{rows.length.toLocaleString('ko-KR')}</b>건</span>
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
      mobileCard={(row) => {
        const status = cashMoneyStatus(row);
        return {
          co: isOperator ? row.companyId : undefined,
          badge: status,
          badgeTone: status === '미분류' ? 'red' as const
            : status === '집금대기' || status === '미매칭' ? 'amber' as const
              : status === '제안있음' ? 'blue' as const
                : status === '매칭완료' ? 'green' as const : 'gray' as const,
          name: row.party || row.memo || '상대방 미입력',
          carType: `${row.date || '일자 없음'} · ${row.accountName || row.source}`,
          fields: [
            ['계정', row.category || '미분류'],
            ...(row.memo && row.memo !== row.party ? [['내용', row.memo] as [string, string]] : []),
          ],
          right: row.inAmt > 0 ? `+${won(row.inAmt)}` : row.outAmt > 0 ? `-${won(row.outAmt)}` : won(0),
        };
      }}
      onView={xlTx.onView}
      onRowContextMenu={openCtx}
      onRowDoubleClick={(row) => {
        setCreating(null);
        setBundleEditing(false);
        setClassificationEditing(false);
        setSelected(row);
      }}
      onCloseDetail={() => { setSelected(null); setBundleEditing(false); setClassificationEditing(false); }}
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
          fileIngest={{ label: '통장 담기 (데이터센터)', onClick: () => openIngest('bank_tx') }}
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
      ) : selected && classificationEditing ? (
        <CashClassificationPanel
          key={selected.id}
          row={selected}
          companyId={companyId}
          actor={user.email}
          onClose={() => setClassificationEditing(false)}
          onDone={() => { setSelected(null); setClassificationEditing(false); reload(); }}
        />
      ) : selected && bundleEditing ? (
        <CashBundlePanel
          key={selected.id}
          row={selected}
          companyId={companyId}
          actor={user.email}
          contracts={planContracts}
          onClose={() => setBundleEditing(false)}
          onDone={() => { setSelected(null); setBundleEditing(false); reload(); }}
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
          actions={(
            <>
              {(!selected.nest && selected.entity === 'bank_tx') || selected.entity === 'card_tx' ? (
                <Btn size="sm" variant={isUnclassified(selected.category) ? 'solid' : 'ghost'} onClick={() => setClassificationEditing(true)}>1차 분류</Btn>
              ) : null}
              {selected.entity === 'bank_tx' && (!selected.nest || selected.nest === 'bundle-parent') ? (
                <Btn size="sm" variant={selected.nest ? 'solid' : 'ghost'} onClick={() => setBundleEditing(true)}>{selected.nest === 'bundle-parent' ? '묶음 수정' : '묶음 분해'}</Btn>
              ) : null}
              {String(selected.raw.plate || '') ? (
                <Btn size="sm" variant="ghost" onClick={() => openCar(selected.raw.plate, undefined, selected.companyId)}>차량 360</Btn>
              ) : null}
              {String(selected.raw.matchedContractId || '') ? (
                <Btn size="sm" variant="ghost" onClick={() => router.push(`/contract?open=${encodeURIComponent(String(selected.raw.matchedContractId))}`)}>연결 계약</Btn>
              ) : null}
              {selected.inAmt > 0 && !selected.nest && !String(selected.raw.matchedContractId || '') ? (
                <Btn size="sm" variant={isUnclassified(selected.category) ? 'ghost' : 'solid'} onClick={() => openPayments()}>입금 매칭</Btn>
              ) : null}
            </>
          )}
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
