'use client';
/**
 * 자금일보 — 원장 규격(LedgerFrame). **거래 1건 = 1행.**
 *
 * 2026-08-06 재작성: 이전 구현은 버린 양식(FacetPage+FacetRail 렌즈 · Sec 6벌 · Cards/Metric ·
 *   ListBox 손롤)이었다. 같은 자금 데이터를 자금관리(/cash)와 다른 몸집으로 두 벌 그리던 셈이라
 *   열·행문법·버튼자리가 화면마다 달랐다. → 원장 4면과 같은 틀·같은 열(SSOT)로 접었다.
 *
 *   · 표 = 일계표(`buildCashJournal`) 순서 그대로 · 열 = `cash-cols`(자금관리와 동일)
 *   · 상태 = `moneyStatusOf` 하나(미분류·집금대기·미매칭·제안있음·매칭완료·해당없음)
 *   · 처리(분류·증빙·계약연결·해제) = 우측 상세패널. 더블클릭으로 연다
 *   · 대량(안전후보 매칭·CMS 집금정산) = 선택 액션바. 후보는 자동 계산 — 「찾기」 버튼 없음
 *   · 보기 = 「일보(하루)」 / 「미매칭(전체)」 — 옛 매칭범위 Select(선택일·30일·전체)를 대체
 *
 * 쓰기 로직(매칭 적용·해제·수동연결·분류·증빙)은 검증본 그대로 이식했다. 특히 쓰기 순서
 * (bank_tx → contract)는 부분 실패가 복구 가능한 쪽으로 끝나게 하는 규칙이라 바꾸지 않았다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSession } from '@/lib/session';
import { openCar, openCustomer, openFinance, openReceivables } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { companyLabel } from '@/lib/companies';
import { type EntityRecord } from '@/lib/intake/entities';
import { buildMatchContract, computeContractView } from '@/lib/contract-ops';
import { findDuplicateCashPayment } from '@/lib/payments/duplicate-cash';
import { findCmsMatchCandidates, buildSettlementPatches, type CmsMatchCandidate } from '@/lib/payments/cms-matching';
import { toast } from '@/lib/toast';
import type { BankTransaction } from '@/lib/payments/types';
import { lockReason } from '@/lib/finance/period-lock';
import { safeRun } from '@/lib/safe-update';
import { useBusyAction } from '@/lib/use-busy-action';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { commitUpdate, commitAll } from '@/lib/commit';
import {
  LedgerFrame, LedgerFilterButton, LedgerFilterPanel, LedgerFilterFields, LedgerActiveFilters,
  LedgerRecordPanel, LedgerPanelFooter, LedgerSelectionBar,
  Badge, Btn, Input, ListBox, ListRow, Message, PillTabs, Search, Select, TextLink,
  C, won, DocUpload, type DocUploadResult, type LedgerColView,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { useConfirm } from '@/components/ui/confirm';
import { buildMatchBacklog } from '@/lib/payments/match-proposal';
import { buildCashLedger, withCmsItemRows, type CashRow } from '@/lib/finance/cash-ledger';
import { buildCashJournal } from '@/lib/finance/cash-journal';
import { calculateCashDaily } from '@/lib/finance/cash-daily';
import { isDepositReceiptCategory, requiresContractLink, requiresExpenseEvidence } from '@/lib/finance/cash-rules';
import { appendDepositReceipt, listDepositReceipts, removeDepositReceipt } from '@/lib/payments/deposit-receipts';
import { buildManualReceiptEntries, manualReceiptPlanLabel, planManualReceiptAllocation } from '@/lib/payments/manual-receipt-allocation';
import { CashDailyClose } from '@/components/CashDailyClose';
import { isUnclassified, LEDGER_SUBJECTS } from '@/lib/payments/ledger-subjects';
import { relatedExpenseEvidenceRows } from '@/lib/finance/evidence-group';
import { cashBundleReviewStatus, requiresLoanRepaymentSplit } from '@/lib/finance/cash-bundle';
import {
  CASH_BASIC_COLS, CASH_EXPANDED_COLS, CASH_TX_DETAIL_SECTIONS, CASH_CARD_DETAIL_SECTIONS, cashMoneyStatus,
} from '@/lib/finance/cash-cols';
import { MONEY_STATUS_TONE } from '@/lib/finance/money-status';
import { countActiveFilters, emptyFilterValues, matchLedgerFilters, type LedgerFilterFieldDef } from '@/lib/ledger-filter-defs';
import { useIsMobile } from '@/lib/use-mobile';

const CONF_TONE: Record<string, 'green' | 'amber' | 'gray'> = { high: 'green', medium: 'amber', low: 'gray' };

const txScopeKey = (tx: Pick<BankTransaction, 'id' | 'companyCode'>) => String(tx.companyCode || '') + ':' + tx.id;
const recordScopeKey = (record: EntityRecord) => String(record.companyId || '') + ':' + String(record._key || '');
const rowScopeKey = (row: CashRow) => row.companyId + ':' + row.recKey;
const cmsScopeKey = (c: Pick<CmsMatchCandidate, 'companyCode' | 'depositId'>) => c.companyCode + ':' + c.depositId;
const moveDate = (iso: string, days: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** 세부필터 — 원장 4면 공통 규격(가끔 쓰는 조건은 줄에 두지 않고 패널로). */
const JOURNAL_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'status', label: '자금상태' },
  { key: 'account', label: '계좌' },
  { key: 'category', label: '계정과목' },
  { key: 'flow', label: '수지구분' },
];

function toBankTx(rec: EntityRecord): BankTransaction {
  const method = String(rec.method || '계좌');
  return {
    id: String(rec._key || ''),
    txDate: String(rec.txDate || ''),
    amount: Number(rec.amount) || 0,
    withdraw: Number(rec.withdraw) || 0,
    counterparty: String(rec.counterparty || rec.memo || ''),
    memo: String(rec.memo || ''),
    source: method,
    method,
    companyCode: String(rec.companyId || ''),
    matchedContractId: rec.matchedContractId ? String(rec.matchedContractId) : undefined,
    matchedKind: rec.matchedKind === 'receivable' || rec.matchedKind === 'deposit' ? rec.matchedKind : undefined,
    matchedScheduleSeq: rec.matchedScheduleSeq != null ? Number(rec.matchedScheduleSeq) : undefined,
    matchedScheduleAllocations: Array.isArray(rec.matchedScheduleAllocations)
      ? rec.matchedScheduleAllocations.map((allocation) => ({
        seq: Number((allocation as Record<string, unknown>).seq) || 0,
        amount: Number((allocation as Record<string, unknown>).amount) || 0,
      })).filter((allocation) => allocation.seq > 0 && allocation.amount > 0)
      : undefined,
    matchedUnappliedAmount: rec.matchedUnappliedAmount != null ? Number(rec.matchedUnappliedAmount) : undefined,
    settlementId: rec.settlementId ? String(rec.settlementId) : undefined,
    settlementRole: rec.settlementRole === 'deposit' || rec.settlementRole === 'item' ? rec.settlementRole : undefined,
    settlementGrossAmount: rec.settlementGrossAmount != null ? Number(rec.settlementGrossAmount) : undefined,
    settlementFeeAmount: rec.settlementFeeAmount != null ? Number(rec.settlementFeeAmount) : undefined,
    settlementItemCount: rec.settlementItemCount != null ? Number(rec.settlementItemCount) : undefined,
  } as BankTransaction;
}

export default function PaymentsPage() {
  const { companyId, scopeAll, user, isOperator } = useSession();
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const { data: [cs = [], txs = [], cardTxs = []], loading, error: loadError, reload } = useEntityLists(['contract', 'bank_tx', 'card_tx']);

  const [mode, setMode] = useState<'일보' | '미매칭'>('일보');
  const [journalDate, setJournalDate] = useState(TODAY);
  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>(() => emptyFilterValues(JOURNAL_FILTER_DEFS));
  const [selected, setSelected] = useState<CashRow | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [manualQuery, setManualQuery] = useState('');
  const [applying, setApplying] = useState(false);
  const [busy, runBusy] = useBusyAction();
  const [msg, setMsg] = useState('');
  const focusHandled = useRef(false);

  const allBank = useMemo(() => txs.map(toBankTx), [txs]);
  const latestTxDate = useMemo(() => txs.reduce((latest, tx) => {
    const date = String(tx.txDate || '').slice(0, 10);
    return date > latest ? date : latest;
  }, ''), [txs]);
  const cashRows = useMemo(() => buildCashLedger(txs, cardTxs), [txs, cardTxs]);
  const daily = useMemo(() => calculateCashDaily(cashRows, journalDate, 0), [cashRows, journalDate]);
  const csByKey = useMemo(() => new Map(cs.map((r) => [recordScopeKey(r), r])), [cs]);
  const contractRecordFor = useCallback(
    (company: string, key: string) => csByKey.get(company + ':' + key),
    [csByKey],
  );

  // 일계표 = 자금관리 원장을 선택일로 가공. CMS집금은 성공분(cms-item)으로 전개해야 하므로 여기서만 withCmsItemRows.
  const journalRows = useMemo(() => withCmsItemRows(cashRows, txs), [cashRows, txs]);
  const resolveAttribution = useCallback((r: CashRow) => {
    const cid = String(r.raw.matchedContractId || '');
    if (!cid) return '';
    const crec = csByKey.get(r.companyId + ':' + cid);
    return crec ? [crec.contractorName, crec.plate].filter(Boolean).join(' · ') : '';
  }, [csByKey]);
  const journal = useMemo(
    () => buildCashJournal(journalRows, journalDate, resolveAttribution),
    [journalRows, journalDate, resolveAttribution],
  );
  const bankTxForRow = useCallback(
    (r: CashRow) => allBank.find((b) => b.id === r.recKey && String(b.companyCode || '') === r.companyId) || null,
    [allBank],
  );

  /* 매칭 후보는 «찾기» 버튼 없이 항상 계산한다 — 사람이 버튼을 눌러야만 보이는 후보는
     누르지 않으면 없는 것과 같다(옛 화면의 «안전후보 전체선택»·«CMS 집금정산» 트리거 폐기). */
  const matchScope = mode === '일보' ? 'date' : 'all';
  const matchBacklog = useMemo(
    () => buildMatchBacklog(txs, cs, journalDate, matchScope),
    [cs, journalDate, matchScope, txs],
  );
  const proposalById = useMemo(() => new Map(matchBacklog.map((r) => [txScopeKey(r.tx), r.proposal])), [matchBacklog]);
  const automaticByKey = useMemo(
    () => new Map(matchBacklog.flatMap((r) => (r.automatic ? [[txScopeKey(r.tx), r.automatic] as const] : []))),
    [matchBacklog],
  );
  const cmsCandidates = useMemo(
    () => findCmsMatchCandidates(allBank).filter((c) => mode === '미매칭' || c.depositDate === journalDate),
    [allBank, journalDate, mode],
  );
  const cmsByKey = useMemo(
    () => new Map(cmsCandidates.map((c) => [c.companyCode + ':' + c.depositId, c] as const)),
    [cmsCandidates],
  );

  // ── 표 행 ─────────────────────────────────────────────────────────────
  const baseRows = useMemo(() => {
    if (mode === '미매칭') {
      // 전체 미매칭 계약성 입금 — 옛 «매칭범위: 전체» 를 보기 전환으로 옮긴 것.
      return cashRows
        .filter((r) => r.inAmt > 0 && r.nest !== 'cms-item' && r.nest !== 'cms-pending'
          && requiresContractLink(r.category) && !r.raw.matchedContractId && !r.raw.matchedScheduleSeq)
        .sort((a, b) => b.date.localeCompare(a.date));
    }
    // 일보 = 일계표 순서(계좌별·구성건 전개) 그대로. 소계는 stats·계좌 필터가 담당한다.
    return journal.accounts.flatMap((acc) => acc.lines.map((line) => line.row));
  }, [mode, cashRows, journal]);

  const accountOptions = useMemo(() => {
    const set = new Map<string, string>();
    for (const r of baseRows) set.set(r.account || '', r.accountName || r.account || '미확인');
    return [...set.entries()].map(([value, label]) => ({ value, label })).filter((o) => o.value);
  }, [baseRows]);
  const categoryOptions = useMemo(() => {
    const set = new Set(baseRows.map((r) => r.category).filter(Boolean));
    return [...set].sort().map((v) => ({ value: v, label: v }));
  }, [baseRows]);

  const filterOptions = useMemo(() => ({
    status: [...new Set(baseRows.map(cashMoneyStatus))].map((v) => ({ value: v, label: v })),
    account: accountOptions,
    category: categoryOptions,
    flow: [{ value: '입금', label: '입금' }, { value: '출금', label: '출금' }],
  }), [baseRows, accountOptions, categoryOptions]);

  const norm = (s: unknown) => String(s || '').toLowerCase();
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (needle && ![r.party, r.memo, r.category, r.accountName, r.account, companyLabel(r.companyId)]
        .some((f) => norm(f).includes(needle))) return false;
      return matchLedgerFilters(r, filterValues, {
        status: (row, v) => cashMoneyStatus(row) === v,
        account: (row, v) => (row.account || '') === v,
        category: (row, v) => row.category === v,
        flow: (row, v) => (v === '입금' ? row.inAmt > 0 : row.outAmt > 0),
      });
    });
  }, [baseRows, q, filterValues]);

  const filterCount = countActiveFilters(filterValues, JOURNAL_FILTER_DEFS);
  const onFilterChange = (key: string, value: string) => setFilterValues((v) => ({ ...v, [key]: value }));
  const resetFilters = () => setFilterValues(emptyFilterValues(JOURNAL_FILTER_DEFS));

  // ── 선택(대량 액션) ───────────────────────────────────────────────────
  const candidateRows = useMemo(() => rows.filter((r) => {
    const tx = bankTxForRow(r);
    if (!tx) return false;
    return automaticByKey.has(txScopeKey(tx)) || cmsByKey.has(rowScopeKey(r));
  }), [rows, bankTxForRow, automaticByKey, cmsByKey]);

  const selectedRows = useMemo(() => rows.filter((r) => selectedKeys.has(r.id)), [rows, selectedKeys]);
  const selectedMatchable = selectedRows.filter((r) => {
    const tx = bankTxForRow(r);
    return !!tx && automaticByKey.has(txScopeKey(tx));
  });
  const selectedCms = selectedRows.flatMap((r) => {
    const c = cmsByKey.get(rowScopeKey(r));
    return c ? [c] : [];
  });

  const toggleKey = (key: string, additive: boolean) => setSelectedKeys((prev) => {
    if (!additive) return prev.size === 1 && prev.has(key) ? new Set() : new Set([key]);
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // ── 쓰기 (검증본 이식 — 순서·가드 그대로) ──────────────────────────────
  async function applyMatches() {
    if (selectedMatchable.length === 0) return;
    const results = selectedMatchable.flatMap((r) => {
      const tx = bankTxForRow(r);
      const auto = tx ? automaticByKey.get(txScopeKey(tx)) : undefined;
      return auto ? [auto] : [];
    });
    const selectedAmount = results.reduce((sum, r) => sum + r.tx.amount, 0);
    if (!(await confirm({
      title: '입금 매칭 적용',
      message: `${results.length}건 · ${won(selectedAmount)}을 계약 회차에 반영합니다.\n법인과 계약·회차를 확인했나요?`,
      confirmLabel: '확인 후 적용',
    }))) return;
    await runBusy(async () => {
      setApplying(true);
      const txByKey = new Map(txs.map((r) => [recordScopeKey(r), r]));
      /* ★같은 계약에 2건 이상 적용할 때 직전 append 결과를 누적해야 앞선 입금이 안 지워진다
         (csByKey는 로드 스냅샷이라 매 루프 같은 _payments를 읽어 전체 교체하면 1건만 남는다). */
      const appliedPayments = new Map<string, Array<Record<string, unknown>>>();
      let applied = 0, skipped = 0, locked = 0, duplicateSkipped = 0;
      for (const r of results) {
        if (lockReason(companyId, r.tx.txDate)) { locked++; skipped++; continue; }
        const crec = contractRecordFor(String(r.tx.companyCode || ''), r.candidate.contract.id);
        const trec = txByKey.get(txScopeKey(r.tx));
        if (!crec || !trec || trec.matchedContractId) { skipped++; continue; }
        const ckey = String(crec._key);
        const existing = appliedPayments.get(ckey)
          ?? (Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : []);
        if (existing.some((p) => p.txId === r.tx.id)) { skipped++; continue; }
        // 현장수납과 같은 돈이면 자동 적용하지 않는다 — 연결하면 미수가 두 번 깎인다.
        if (findDuplicateCashPayment({ ...crec, _payments: existing }, r.tx)) { duplicateSkipped++; skipped++; continue; }
        if (!resolveWriteCompany(companyId, crec) || !resolveWriteCompany(companyId, trec)) { skipped++; continue; }
        const newPayments = [...existing, { seq: r.candidate.scheduleSeq, date: r.tx.txDate, amount: r.tx.amount, source: '계좌', txId: r.tx.id }];
        /* ★순서 = bank_tx 먼저, 계약(_payments) 나중. commitAll은 트랜잭션이 아니므로 부분 실패가
           «복구 가능한» 쪽으로 끝나야 한다. 계약 먼저면 «수납은 들어갔는데 입금은 미매칭» =
           해제 버튼이 없어 영구 고아(미수도 잘못 깎임). bank_tx 먼저면 해제로 되돌릴 수 있다. */
        const ok = await safeRun(async () => {
          await commitAll([
            {
              entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
              patch: {
                matchedContractId: ckey, matchedScheduleSeq: r.candidate.scheduleSeq, matchedAt: new Date().toISOString(),
                matchedKind: 'receivable',
                subject: '대여료수입', category: '대여료수입', matchProposalState: '', matchProposalReason: '', matchProposalCount: 0,
              },
            },
            { entity: 'contract', sessionCompanyId: companyId, rec: crec, key: ckey, patch: { _payments: newPayments } },
          ]);
        });
        if (ok) { applied++; appliedPayments.set(ckey, newPayments); } else skipped++;
      }
      setApplying(false);
      const notes = [skipped ? `건너뜀 ${skipped}` : '', locked ? `마감월 ${locked}` : '', duplicateSkipped ? `중복수납 의심 ${duplicateSkipped}` : '']
        .filter(Boolean).join(' · ');
      const outcome = `매칭 적용 ${applied}건${notes ? ` · ${notes}` : ''} — 미수에 반영됨`;
      setMsg(outcome);
      toast(outcome, applied ? 'success' : 'info');
      setSelectedKeys(new Set());
      reload();
    });
  }

  async function applyCms() {
    if (selectedCms.length === 0) return;
    await runBusy(async () => {
      setApplying(true);
      const txByKey = new Map(txs.map((r) => [recordScopeKey(r), r]));
      let applied = 0, skipped = 0, locked = 0;
      for (const cand of selectedCms) {
        if (lockReason(companyId, cand.depositDate)) { locked++; skipped++; continue; }
        let okAll = true;
        for (const { id, patch } of buildSettlementPatches(cand)) {
          const trec = txByKey.get(cand.companyCode + ':' + id);
          if (!trec || trec.settlementId || !resolveWriteCompany(companyId, trec)) { okAll = false; break; }
          const ok = await safeRun(async () => {
            await commitUpdate({ entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key), patch });
          });
          if (!ok) { okAll = false; break; }
        }
        if (okAll) applied++; else skipped++;
      }
      setApplying(false);
      const lockNote = locked ? ` · 마감월 ${locked}` : '';
      const outcome = `CMS 집금정산 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''}`;
      setMsg(outcome);
      toast(outcome, applied ? 'success' : 'info');
      setSelectedKeys(new Set());
      reload();
    });
  }

  async function unmatch(t: BankTransaction) {
    const lr = lockReason(companyId, t.txDate);
    if (lr) { toast(lr, 'error'); return; }
    const trec = txs.find((r) => recordScopeKey(r) === txScopeKey(t));
    if (!trec) return;
    const crec = cs.find((r) => String(r._key) === String(t.matchedContractId));
    const depositReceipt = String(trec.matchedKind || '') === 'deposit'
      || (!!crec && listDepositReceipts(crec).some((receipt) => receipt.txId === t.id));
    // ★쓰기 순서 = bank_tx → contract (applyMatches와 같은 규칙).
    const ok = await safeRun(async () => {
      const ops = [];
      if (!resolveWriteCompany(companyId, trec)) { toast(NEED_COMPANY, 'error'); return false; }
      ops.push({
        entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
        // 귀속만 되돌린다. 1차 분류(계정과목)는 별도 판단 원자이므로 보존.
        patch: {
          matchedContractId: '', matchedScheduleSeq: '', matchedScheduleAllocations: [],
          matchedUnappliedAmount: 0, matchedAt: '', matchedKind: '',
        },
      });
      if (crec) {
        if (!resolveWriteCompany(companyId, crec)) { toast(NEED_COMPANY, 'error'); return false; }
        ops.push({
          entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key),
          patch: depositReceipt
            ? removeDepositReceipt(crec, t.id)
            : { _payments: (Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : []).filter((p) => p.txId !== t.id) },
        });
      }
      await commitAll(ops);
    });
    if (!ok) { reload(); return; }
    toast(depositReceipt ? '계약 귀속 해제 — 보증금 수령액 원복' : '매칭 해제 — 미수 원복', 'info');
    setSelected(null);
    reload();
  }

  async function manualMatch(t: BankTransaction, crec: EntityRecord) {
    const lr = lockReason(companyId, t.txDate);
    if (lr) { toast(lr, 'error'); return; }
    const trec = txs.find((r) => recordScopeKey(r) === txScopeKey(t));
    if (!trec || trec.matchedContractId) { toast('이미 처리된 입금', 'info'); return; }
    const depositReceipt = isDepositReceiptCategory(trec.category || trec.subject);
    const contractLabel = [crec.contractorName, crec.plate, crec.contractNo].filter(Boolean).join(' · ') || '선택 계약';
    if (depositReceipt) {
      if (!(await confirm({
        title: '보증금 계약 귀속 확인',
        message: `${t.txDate} · ${t.counterparty || '적요 없음'} · ${won(t.amount)}\n→ ${contractLabel}\n\n보증금 실수령액에만 반영하며 대여료 미수는 차감하지 않습니다.`,
        confirmLabel: '계약 귀속',
      }))) return;
      if (!resolveWriteCompany(companyId, crec) || !resolveWriteCompany(companyId, trec)) { toast(NEED_COMPANY, 'error'); return; }
      try {
        await commitAll([
          {
            entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
            patch: {
              matchedContractId: String(crec._key), matchedScheduleSeq: '', matchedAt: new Date().toISOString(),
              matchedKind: 'deposit', matchProposalState: '', matchProposalReason: '', matchProposalCount: 0,
            },
          },
          {
            entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key),
            patch: appendDepositReceipt(crec, { txId: t.id, date: t.txDate, amount: t.amount, source: t.source || t.method || '계좌' }),
          },
        ]);
        toast(`${String(crec.contractorName || '')} · 보증금 ${won(t.amount)} 귀속 — 대여료 미수 차감 없음`, 'success');
      } catch { toast('보증금 계약 귀속 실패', 'error'); }
      setManualQuery(''); setSelected(null); reload();
      return;
    }
    const existing = Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : [];
    if (existing.some((p) => p.txId === t.id)) { toast('이미 연결됨', 'info'); return; }
    // 현장에서 현금·카드로 이미 받은 돈일 수 있다 — 연결하면 미수가 두 번 차감된다.
    const dup = findDuplicateCashPayment(crec, { txDate: t.txDate, amount: t.amount });
    if (dup && !(await confirm({
      title: '중복 입금 의심',
      message: `${dup.message}\n\n그래도 이 입금을 계약에 연결할까요?`,
      confirmLabel: '연결', danger: true,
    }))) return;
    const mc = buildMatchContract(crec, TODAY);
    const allocationPlan = planManualReceiptAllocation(mc.schedules ?? [], t.amount, t.txDate);
    if (allocationPlan.allocations.length === 0) {
      toast('배분 가능한 회차가 없습니다. 계약의 시작일·기간·월대여료를 먼저 확인하세요.', 'error');
      return;
    }
    const allocationLabel = manualReceiptPlanLabel(allocationPlan);
    if (!(await confirm({
      title: '입금 매칭 확인',
      message: `${t.txDate} · ${t.counterparty || '적요 없음'} · ${won(t.amount)}\n→ ${contractLabel}\n→ ${allocationLabel}\n\n여러 회차 입금은 오래된 미납부터 나누고, 남는 금액은 과오납·미배분으로 보존합니다.`,
      confirmLabel: '입금 매칭',
    }))) return;
    if (!resolveWriteCompany(companyId, crec) || !resolveWriteCompany(companyId, trec)) { toast(NEED_COMPANY, 'error'); return; }
    const matchedAt = new Date().toISOString();
    const paymentEntries = buildManualReceiptEntries(allocationPlan, { txId: t.id, txDate: t.txDate, matchedAt });
    try {
      // ★쓰기 순서 = bank_tx → contract. applyMatches가 못박은 규칙과 같아야 한다.
      await commitAll([
        {
          entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
          patch: {
            matchedContractId: String(crec._key),
            matchedScheduleSeq: allocationPlan.allocations[0]?.seq,
            matchedScheduleAllocations: allocationPlan.allocations.map(({ seq, amount }) => ({ seq, amount })),
            matchedUnappliedAmount: allocationPlan.unappliedAmount,
            matchedAt,
            matchedKind: 'receivable',
            subject: '대여료수입', category: '대여료수입', matchProposalState: '', matchProposalReason: '', matchProposalCount: 0,
          },
        },
        { entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key), patch: { _payments: [...existing, ...paymentEntries] } },
      ]);
      toast(`${String(crec.contractorName || '')} · ${won(t.amount)} 연결 — ${allocationLabel}`, 'success');
    } catch { toast('연결 실패', 'error'); }
    setManualQuery(''); setSelected(null); reload();
  }

  async function classifyRow(row: CashRow, category: string) {
    const lr = lockReason(companyId, row.date);
    if (lr) { toast(lr, 'error'); return; }
    if (!category) return;
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    const ok = await safeRun(async () => {
      await commitUpdate({
        entity: row.entity, sessionCompanyId: companyId, rec: row.raw, key: row.recKey,
        patch: { category, subject: category, classifiedAt: new Date().toISOString(), classifiedBy: user.email },
      });
    });
    if (!ok) return;
    toast(`${row.party || '거래'} · ${category} 분류 완료`, 'success');
    reload();
  }

  async function attachEvidence(row: CashRow, result: DocUploadResult) {
    if (!result.url) return;
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    const relatedRows = relatedExpenseEvidenceRows(cashRows, row);
    const evidenceGroupId = relatedRows.length > 1 ? `${row.companyId}:${row.date.slice(0, 10)}:${row.recKey}` : '';
    const ok = await safeRun(async () => {
      const attachedAt = new Date().toISOString();
      await commitAll(relatedRows.map((related) => ({
        entity: related.entity, sessionCompanyId: companyId, rec: related.raw, key: related.recKey,
        patch: {
          evidenceUrl: result.url, evidenceFileName: result.file.name, evidenceAttachedAt: attachedAt,
          evidenceAttachedBy: user.email, evidenceGroupId, evidenceGroupCount: relatedRows.length,
        },
      })));
    });
    if (!ok) return;
    toast(`${row.party || '거래'} · ${relatedRows.length > 1 ? `${relatedRows.length}건 증빙 함께 연결` : '증빙 연결 완료'}`, 'success');
    reload();
  }

  // ── 자금관리에서 넘어온 딥링크(?tx=&company=) ──────────────────────────
  useEffect(() => {
    if (focusHandled.current || loading || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const txId = params.get('tx') || '';
    const requestedCompany = params.get('company') || '';
    if (!txId) { focusHandled.current = true; return; }
    focusHandled.current = true;
    const target = cashRows.find((r) => r.recKey === txId && (!requestedCompany || r.companyId === requestedCompany));
    if (!target) { setMsg('자금관리에서 선택한 거래를 현재 회사 범위에서 찾을 수 없습니다.'); return; }
    if (target.date) setJournalDate(target.date.slice(0, 10));
    setSelected(target);
    setSelectedKeys(new Set([target.id]));
  }, [cashRows, loading]);

  // ── 우측 처리 패널 ────────────────────────────────────────────────────
  const panelTx = selected ? bankTxForRow(selected) : null;
  const panelProposal = panelTx ? proposalById.get(txScopeKey(panelTx)) : undefined;
  const panelAuto = panelTx ? automaticByKey.get(txScopeKey(panelTx)) : undefined;
  const panelCms = selected ? cmsByKey.get(rowScopeKey(selected)) : undefined;
  const panelStatus = selected ? cashMoneyStatus(selected) : null;
  const panelDeposit = selected ? isDepositReceiptCategory(selected.category) : false;
  const panelBundleIncomplete = selected ? cashBundleReviewStatus(selected) === '미완료' : false;
  const panelMissingEvidence = !!selected && selected.outAmt > 0 && requiresExpenseEvidence(selected.category)
    && !selected.raw.documentId && !selected.raw.evidenceUrl;
  const panelUnapplied = selected ? Math.max(0, Number(selected.raw.matchedUnappliedAmount) || 0) : 0;
  const panelContract = selected && selected.raw.matchedContractId
    ? contractRecordFor(selected.companyId, String(selected.raw.matchedContractId))
    : undefined;

  const mNorm = (s: unknown) => String(s || '').replace(/\s/g, '');
  const proposedContractIds = new Set(panelProposal?.candidates.map((c) => c.contract.id) || []);
  const manualCandidates = selected && panelTx && !selected.raw.matchedContractId
    ? cs.filter((c) => String(c.companyId || '') === selected.companyId
      && (manualQuery.trim()
        ? [c.contractorName, c.plate, c.contractNo, c.contractorPhone].some((f) => mNorm(f).includes(mNorm(manualQuery)))
        : proposedContractIds.has(String(c._key)))).slice(0, 8)
    : [];

  const sidePanel = selected ? (
    <LedgerRecordPanel
      title={`${selected.date} · ${selected.accountName || selected.account || '계좌 미확인'}`}
      identity={selected.party || selected.memo || '상대방 미입력'}
      statusBadge={panelStatus ? <Badge tone={MONEY_STATUS_TONE[panelStatus]}>{panelStatus}</Badge> : undefined}
      row={selected}
      sections={selected.entity === 'card_tx' ? CASH_CARD_DETAIL_SECTIONS : CASH_TX_DETAIL_SECTIONS}
      onClose={() => { setSelected(null); setManualQuery(''); }}
      actions={(
        <LedgerPanelFooter hint={panelUnapplied > 0 ? `과오납·미배분 ${won(panelUnapplied)}` : undefined}>
          {panelContract && panelTx ? (
            <Btn size="sm" variant="ghost" onClick={() => void unmatch(panelTx)}>
              {panelDeposit ? '귀속 해제' : '매칭 해제'}
            </Btn>
          ) : null}
          {panelBundleIncomplete ? (
            <Btn size="sm" onClick={() => openFinance({ transactionId: selected.recKey, companyId: selected.companyId })}>
              {requiresLoanRepaymentSplit(selected.category) || String(selected.raw.bundleType || '') === '할부·리스상환' ? '원금·이자 분해' : '묶음 분해'}
            </Btn>
          ) : null}
        </LedgerPanelFooter>
      )}
    >
      {/* 처리 — 이 거래에 지금 필요한 일만 띄운다(할 일이 없으면 아무것도 안 뜬다). */}
      {isUnclassified(selected.category) ? (
        <div style={{ padding: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>계정과목 확정</div>
          <Select
            size="sm" aria-label="계정과목" value=""
            onChange={(e) => void classifyRow(selected, e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="">계정과목 선택</option>
            {LEDGER_SUBJECTS
              .filter((s) => (selected.inAmt > 0 ? s.kind !== '지출' : s.kind !== '수입'))
              .map((s) => <option key={s.code} value={s.label}>{s.label}</option>)}
          </Select>
        </div>
      ) : null}

      {panelMissingEvidence ? (
        <div style={{ padding: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>증빙 연결</div>
          <DocUpload
            storeAt={{ company: selected.companyId, entity: selected.entity, key: selected.recKey }}
            hint={(() => {
              const group = relatedExpenseEvidenceRows(cashRows, selected);
              return group.length > 1
                ? `같은 날·계좌·상대방 ${group.length}건에 함께 연결 · PDF/JPG/PNG`
                : '영수증·세금계산서·거래명세서 · PDF/JPG/PNG';
            })()}
            onDone={(result) => void attachEvidence(selected, result)}
          />
        </div>
      ) : null}

      {panelCms ? (
        <div style={{ padding: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            CMS 집금 후보 <Badge tone={CONF_TONE[panelCms.confidence] || 'gray'}>{panelCms.confidence}</Badge>
          </div>
          <div style={{ fontSize: 12, color: C.mute, marginBottom: 8 }}>
            묶음 {panelCms.items.length}건 · 총액 {won(panelCms.itemsSum)} · 수수료 {won(panelCms.estimatedFee)} ({(panelCms.feeRate * 100).toFixed(2)}%)
          </div>
          <Btn size="sm" disabled={applying || busy} onClick={() => { setSelectedKeys(new Set([selected.id])); void applyCms(); }}>
            이 건 정산
          </Btn>
        </div>
      ) : null}

      {panelContract ? (
        <div style={{ padding: '10px 0', fontSize: 12.5 }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>계약 귀속</div>
          <TextLink
            disabled={!customerKey(panelContract.contractorName, panelContract.contractorPhone)}
            onClick={() => {
              const ck = customerKey(panelContract.contractorName, panelContract.contractorPhone);
              if (ck) openCustomer(ck);
            }}
          >
            {String(panelContract.contractorName || '')}
          </TextLink>
          {' · '}
          <TextLink mono disabled={!panelContract.plate} onClick={() => { if (panelContract.plate) openCar(String(panelContract.plate), 'unpaid'); }}>
            {String(panelContract.plate || '')}
          </TextLink>
          {panelDeposit ? <span style={{ color: C.mute }}> · 보증금(미수 차감 없음)</span> : null}
          {Array.isArray(selected.raw.matchedScheduleAllocations) && selected.raw.matchedScheduleAllocations.length ? (
            <div style={{ color: C.mute, marginTop: 4 }}>
              {(selected.raw.matchedScheduleAllocations as Array<{ seq: number; amount: number }>)
                .map((a) => `${a.seq}회차 ${won(a.amount)}`).join(' + ')}
            </div>
          ) : null}
        </div>
      ) : panelTx && selected.inAmt > 0 && requiresContractLink(selected.category) ? (
        <div style={{ padding: '10px 0' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
            {panelDeposit ? '보증금 계약 귀속' : '계약 연결'}
          </div>
          {panelAuto ? (
            <Message variant="info">
              안전후보: {panelAuto.candidate.contract.customerName} · {panelAuto.candidate.contract.vehiclePlate} · {panelAuto.candidate.scheduleSeq}회차
            </Message>
          ) : panelProposal ? (
            <div style={{ fontSize: 12, color: C.mute, marginBottom: 6 }}>{panelProposal.state} · {panelProposal.reason}</div>
          ) : null}
          <Input
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            placeholder="계약자·차번·연락처 검색"
            style={{ width: '100%' }}
          />
          <div style={{ marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
            {manualCandidates.length === 0 ? (
              <div style={{ fontSize: 12, color: C.faint, padding: '8px 4px' }}>
                {manualQuery.trim() ? '일치 계약 없음' : '자동 후보 없음 · 계약자·차번·연락처를 검색하세요'}
              </div>
            ) : (
              <ListBox>
                {manualCandidates.map((c) => {
                  const v = computeContractView(c, TODAY);
                  return (
                    <ListRow
                      key={String(c._key)}
                      main={String(c.contractorName || '—')}
                      sub={[c.plate || '차량 미지정', c.contractNo || '계약번호 미지정', v.status || '상태 미지정'].join(' · ')}
                      right={(
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                          {v.net > 0
                            ? <span style={{ fontSize: 11.5, color: C.danger, fontWeight: 700 }}>미수 {won(v.net)} · {v.count}회차</span>
                            : <span style={{ fontSize: 11, color: C.faint }}>미수없음</span>}
                          <Btn size="sm" variant="ghost" onClick={() => void manualMatch(panelTx, c)}>
                            {panelDeposit ? '귀속' : '연결'}
                          </Btn>
                        </span>
                      )}
                    />
                  );
                })}
              </ListBox>
            )}
          </div>
        </div>
      ) : null}
    </LedgerRecordPanel>
  ) : null;

  const dateStep = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Btn size="sm" variant="ghost" iconOnly tip="이전일" onClick={() => setJournalDate((d) => moveDate(d, -1))}>
        <ChevronLeft size={16} strokeWidth={2.2} aria-hidden />
      </Btn>
      <Input
        type="date" value={journalDate}
        onChange={(e) => setJournalDate(e.target.value || TODAY)}
        style={{ width: 142, height: 28 }}
      />
      <Btn size="sm" variant="ghost" iconOnly tip="다음일" onClick={() => setJournalDate((d) => moveDate(d, 1))}>
        <ChevronRight size={16} strokeWidth={2.2} aria-hidden />
      </Btn>
      {latestTxDate && latestTxDate !== journalDate
        ? <Btn size="sm" variant="ghost" onClick={() => setJournalDate(latestTxDate)}>최근 거래일</Btn>
        : null}
    </span>
  );

  return (
    <LedgerFrame
      title="자금일보"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${mode === '일보' ? journalDate : '전체 미매칭'} · 자금원장 가공 · 확인 후 일마감`}
      right={(
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>미수관리</Btn>
          {mode === '일보' && !scopeAll ? (
            <CashDailyClose rows={cashRows} date={journalDate} companyId={companyId} actor={user.name || user.email} />
          ) : null}
        </span>
      )}
      view={(
        <PillTabs
          size="sm" value={mode} onChange={(v) => { setMode(v); setSelectedKeys(new Set()); }}
          tabs={[{ key: '일보' as const, label: '일보' }, { key: '미매칭' as const, label: '미매칭' }]}
        />
      )}
      colView={colView}
      onColView={setColView}
      filters={(
        <>
          <Search
            size="sm" placeholder="상대·계좌·과목·내용" value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: mobile ? 160 : 260, flexShrink: 0 }}
          />
          <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
          {!filterOpen && (
            <LedgerActiveFilters
              defs={JOURNAL_FILTER_DEFS} values={filterValues}
              onClear={(key) => onFilterChange(key, '')}
              onClearAll={resetFilters}
            />
          )}
          {mode === '일보' ? dateStep : null}
        </>
      )}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel onReset={resetFilters} onClose={() => setFilterOpen(false)}>
          <LedgerFilterFields defs={JOURNAL_FILTER_DEFS} values={filterValues} onChange={onFilterChange} options={filterOptions} />
        </LedgerFilterPanel>
      ) : undefined}
      stats={(
        <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
          <span>거래 <b>{rows.length.toLocaleString('ko-KR')}</b></span>
          {mode === '일보' ? <span>입금 <b style={{ color: C.ok }}>{won(journal.inflow)}</b></span> : null}
          {mode === '일보' ? <span>출금 <b>{won(journal.outflow)}</b></span> : null}
          {mode === '일보' ? <span>순증감 <b style={{ color: journal.net >= 0 ? C.ok : C.danger }}>{won(journal.net)}</b></span> : null}
          {daily.unclassifiedCount > 0 && mode === '일보' ? <span>미분류 <b style={{ color: C.danger }}>{daily.unclassifiedCount}</b></span> : null}
          {candidateRows.length > 0 ? <span>후보 <b style={{ color: C.brand }}>{candidateRows.length}</b></span> : null}
        </span>
      )}
      hint={msg ? <Message variant="info">{msg}</Message> : null}
      loading={loading}
      error={loadError}
      onRetry={reload}
      empty={mode === '일보'
        ? `${journalDate} 자금 거래 없음 — 자금관리에서 입출금을 수집하세요`
        : '미매칭 입금 없음'}
      cols={colView === '기본' ? CASH_BASIC_COLS : CASH_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.id}
      selectedRowKey={selected?.id ?? null}
      selectedKeys={selectedKeys}
      onRowClickEvent={(e, row) => toggleKey(row.id, e.ctrlKey || e.metaKey || e.shiftKey)}
      onRowDoubleClick={(row) => { setSelected(row); setManualQuery(''); }}
      onCloseDetail={() => { setSelected(null); setManualQuery(''); }}
      selectionBar={(
        <LedgerSelectionBar
          count={selectedKeys.size}
          onSelectAll={candidateRows.length ? () => setSelectedKeys(new Set(candidateRows.map((r) => r.id))) : undefined}
          onClear={() => setSelectedKeys(new Set())}
        >
          {selectedMatchable.length > 0 ? (
            <Btn size="sm" disabled={applying || busy} onClick={() => void applyMatches()}>
              {applying || busy ? '적용 중…' : `안전후보 ${selectedMatchable.length}건 매칭`}
            </Btn>
          ) : null}
          {selectedCms.length > 0 ? (
            <Btn size="sm" variant="ghost" disabled={applying || busy} onClick={() => void applyCms()}>
              {applying || busy ? '정산 중…' : `CMS ${selectedCms.length}건 정산`}
            </Btn>
          ) : null}
        </LedgerSelectionBar>
      )}
      mobileCard={(row) => {
        const status = cashMoneyStatus(row);
        return {
          co: isOperator ? row.companyId : undefined,
          badge: status,
          badgeTone: MONEY_STATUS_TONE[status],
          name: row.party || row.memo || '상대방 미입력',
          carType: `${row.date || '일자 없음'} · ${row.accountName || row.source}`,
          fields: [['계정', row.category || '미분류']] as Array<[string, string]>,
          right: row.inAmt > 0 ? `+${won(row.inAmt)}` : row.outAmt > 0 ? `-${won(row.outAmt)}` : won(0),
        };
      }}
      sidePanel={sidePanel}
    />
  );
}
