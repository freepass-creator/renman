'use client';
/**
 * 수납 자동매칭 — 은행 입금(bank_tx) → 계약 회차 자동매칭 + CMS 집금 묶음 정산.
 *   · 매칭엔진(receipt-match autoMatchAll): 입금자명·차번끝4·금액·CMS dueDate근접·동명이인 격하.
 *   · CMS 집금(cms-matching): 통장 1건 ↔ 자동이체 N건 + 수수료 (v5 이식).
 *   · 적용 = 계약 _payments append(computeContractView가 흡수→미수 자동감소) + bank_tx matched 표시.
 *   · 안전: high 신뢰만 제안 · operator 체크 확인 후 적용 · 이중적용 가드 · 매칭은 미수를 줄이기만(허위미수 불가) · 감사 자동기록.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { FacetPage, Sec, Cards, Metric, Badge, Btn, Checkbox, EmptyState, ListBox, ListRow, Input, Select, TextLink, C, won, SPACE_M, type BadgeTone, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { WorkPipe } from '@/components/WorkPipe';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { useSecOrder } from '@/lib/use-sec-order';
import { useConfirm } from '@/components/ui/confirm';
import { buildMatchBacklog, type MatchBacklogScope } from '@/lib/payments/match-proposal';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import { calculateCashDaily } from '@/lib/finance/cash-daily';
import { isDepositReceiptCategory, reducesReceivable, requiresContractLink, requiresExpenseEvidence } from '@/lib/finance/cash-rules';
import { appendDepositReceipt, listDepositReceipts, removeDepositReceipt } from '@/lib/payments/deposit-receipts';
import { buildManualReceiptEntries, manualReceiptPlanLabel, planManualReceiptAllocation } from '@/lib/payments/manual-receipt-allocation';
import { CashDailyClose } from '@/components/CashDailyClose';
import { isUnclassified, LEDGER_SUBJECTS } from '@/lib/payments/ledger-subjects';
import { DocUpload, type DocUploadResult } from '@/components/ui/doc-upload';
import { reviewInternalTransfers } from '@/lib/finance/internal-transfer';
import { relatedExpenseEvidenceRows } from '@/lib/finance/evidence-group';
import { cashBundleReviewStatus, requiresLoanRepaymentSplit } from '@/lib/finance/cash-bundle';

const CONF_TONE: Record<string, BadgeTone> = { high: 'green', medium: 'amber', low: 'gray' };
const EMPTY = new Set<string>();
const PAY_SECS = ['pay-status', 'pay-review', 'pay-cms', 'pay-match', 'pay-matched', 'pay-pending'] as const;
const FACET_SEC: Record<string, string> = { 미완료: 'pay-review', CMS: 'pay-cms', 매칭제안: 'pay-match', 매칭됨: 'pay-matched', 미매칭: 'pay-pending' };

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

const txScopeKey = (tx: Pick<BankTransaction, 'id' | 'companyCode'>) => String(tx.companyCode || '') + ':' + tx.id;
const recordScopeKey = (record: EntityRecord) => String(record.companyId || '') + ':' + String(record._key || '');
const cmsScopeKey = (candidate: Pick<CmsMatchCandidate, 'companyCode' | 'depositId'>) => candidate.companyCode + ':' + candidate.depositId;
const moveDate = (iso: string, days: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export default function PaymentsPage() {
  const { companyId, scopeAll, user } = useSession();
  // work hub back only — no sibling tabs
  const { data: [cs = [], txs = [], cardTxs = []], loading, error: loadError, reload } = useEntityLists(['contract', 'bank_tx', 'card_tx']);
  const confirm = useConfirm();
  const [cmsResults, setCmsResults] = useState<CmsMatchCandidate[] | null>(null);
  const [cmsSel, setCmsSel] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [busy, runBusy] = useBusyAction();
  const [msg, setMsg] = useState('');
  const [manualTx, setManualTx] = useState<BankTransaction | null>(null);
  const [mq, setMq] = useState('');
  const [facets, setFacets] = useState<Set<string>>(EMPTY);
  const [journalDate, setJournalDate] = useState(TODAY);
  const [matchScope, setMatchScope] = useState<MatchBacklogScope>('all');
  const [pendingVisible, setPendingVisible] = useState(60);
  const [evidenceRowId, setEvidenceRowId] = useState('');
  const focusHandled = useRef(false);
  const [order, reorder] = useSecOrder('jpk:order:payments', [...PAY_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });
  const resetFacets = () => setFacets(new Set());
  // 데이터 좁히기: 칩=구간 라벨. 미선택=전체. 현황은 항상.
  const show = (id: string) => {
    if (id === 'pay-status') return true;
    if (!facets.size) return true;
    return [...facets].some((f) => FACET_SEC[f] === id);
  };

  const allBank = useMemo(() => txs.map(toBankTx), [txs]);
  const latestTxDate = useMemo(() => txs.reduce((latest, tx) => {
    const date = String(tx.txDate || '').slice(0, 10);
    return date > latest ? date : latest;
  }, ''), [txs]);
  const cashRows = useMemo(() => buildCashLedger(txs, cardTxs), [txs, cardTxs]);
  const internalTransferReview = useMemo(() => reviewInternalTransfers(cashRows), [cashRows]);
  const unpairedTransferIds = useMemo(
    () => new Set(internalTransferReview.unpairedRows.map((row) => row.id)),
    [internalTransferReview],
  );
  const daily = useMemo(() => calculateCashDaily(cashRows, journalDate, 0), [cashRows, journalDate]);
  const dailyWorkRows = useMemo(() => cashRows.filter((row) =>
    row.date.slice(0, 10) === journalDate
    && row.nest !== 'cms-item' && row.nest !== 'cms-pending' && row.nest !== 'card-item'
    && ((cashBundleReviewStatus(row) === '미완료')
      || (row.nest !== 'bundle-parent' && isUnclassified(row.category))
      || (row.outAmt > 0 && requiresExpenseEvidence(row.category) && !row.raw.documentId && !row.raw.evidenceUrl)
      || Number(row.raw.matchedUnappliedAmount) > 0
      || unpairedTransferIds.has(row.id))),
  [cashRows, journalDate, unpairedTransferIds]);
  const datedBank = useMemo(() => allBank.filter((t) => t.txDate.slice(0, 10) === journalDate), [allBank, journalDate]);
  const txCategoryByKey = useMemo(() => new Map(txs.map((record) => [recordScopeKey(record), String(record.category || record.subject || '')])), [txs]);
  // 일일 현황의 매칭 완료는 기준일만, 미처리 대기열은 별도 범위(선택일/30일/전체)로 본다.
  const datedDeposits = useMemo(() => datedBank.filter((t) =>
    t.amount > 0 && !(t.withdraw && t.withdraw > 0) && t.settlementRole !== 'deposit'
    && requiresContractLink(txCategoryByKey.get(txScopeKey(t)))),
  [datedBank, txCategoryByKey]);
  const matched = datedDeposits.filter((t) => t.matchedContractId)
    .sort((a, b) => b.txDate.localeCompare(a.txDate) || b.id.localeCompare(a.id));
  const matchBacklog = useMemo(
    () => buildMatchBacklog(txs, cs, journalDate, matchScope),
    [cs, journalDate, matchScope, txs],
  );
  const pending = matchBacklog.map((row) => row.tx);
  const csByKey = useMemo(() => new Map(cs.map((r) => [recordScopeKey(r), r])), [cs]);
  const contractRecordFor = (companyId: string, key: string) => csByKey.get(companyId + ':' + key);
  const cmsSettled = useMemo(() => datedBank.filter((t) => t.settlementRole === 'deposit').length, [datedBank]);
  const proposalById = useMemo(() => new Map(
    matchBacklog.map((row) => [txScopeKey(row.tx), row.proposal]),
  ), [matchBacklog]);
  const displayResults = useMemo(
    () => matchBacklog.flatMap((row) => row.automatic ? [row.automatic] : []),
    [matchBacklog],
  );
  const reviewProposalCount = matchBacklog.filter((row) => row.proposal.state === '복수후보' || row.proposal.state === '검토후보').length;
  const noProposalCount = matchBacklog.filter((row) => row.proposal.state === '미매칭').length;
  const displayedProposalIds = new Set(displayResults.map((result) => txScopeKey(result.tx)));
  const unmatchedPending = pending.filter((tx) => !displayedProposalIds.has(txScopeKey(tx)));

  function run() {
    // ★현장수납과 겹치는 제안은 기본 선택에서 뺀다 — 그대로 적용하면 같은 돈이 두 번 차감된다.
    //   («일괄 적용»이 기본 전체선택이므로 여기서 빼지 않으면 사람이 볼 기회 없이 통과한다.)
    const dupIds = new Set(
      displayResults.filter((r) => findDuplicateCashPayment(contractRecordFor(String(r.tx.companyCode || ''), r.candidate.contract.id), r.tx)).map((r) => txScopeKey(r.tx)),
    );
    setSel(new Set(displayResults.filter((r) => !dupIds.has(txScopeKey(r.tx))).map((r) => txScopeKey(r.tx))));
    setMsg(displayResults.length === 0
      ? '자동매칭 제안 없음 — 이름·금액 일치 입금이 없습니다(수동 검토).'
      : dupIds.size ? `중복 입금 의심 ${dupIds.size}건은 선택에서 제외했습니다 — 현장수납과 같은 돈인지 확인 후 개별 선택하세요.` : '단일 안전후보를 선택했습니다. 계약·회차 확인 후 적용하세요.');
  }

  function runCms() {
    const cands = findCmsMatchCandidates(allBank).filter((candidate) => candidate.depositDate === journalDate);
    setCmsResults(cands);
    setCmsSel(new Set(cands.filter((c) => c.confidence === 'high').map(cmsScopeKey)));
    setMsg(cands.length === 0
      ? 'CMS 집금 후보 없음 — CMS 명세·통장 집금이 같은 회사·±7일·수수료≤3.5%로 맞아야 합니다.'
      : '');
  }

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleCms = (id: string) => setCmsSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function applyCms() {
    if (!cmsResults?.length) return;
    await runBusy(async () => {
      setApplying(true);
      const txByKey = new Map(txs.map((r) => [recordScopeKey(r), r]));
      let applied = 0, skipped = 0, locked = 0;
      for (const cand of cmsResults) {
        if (!cmsSel.has(cmsScopeKey(cand))) continue;
        if (lockReason(companyId, cand.depositDate)) { locked++; skipped++; continue; }
        const patches = buildSettlementPatches(cand);
        let okAll = true;
        for (const { id, patch } of patches) {
          const trec = txByKey.get(cand.companyCode + ':' + id);
          if (!trec || trec.settlementId) { okAll = false; break; }
          if (!resolveWriteCompany(companyId, trec)) { okAll = false; break; }
          const ok = await safeRun(async () => {
            await commitUpdate({ entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key), patch });
          });
          if (!ok) { okAll = false; break; }
        }
        if (okAll) applied++; else skipped++;
      }
      setApplying(false);
      const lockNote = locked ? ` · 마감월 ${locked}` : '';
      setMsg(`CMS 집금정산 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''}`);
      toast(`CMS 집금정산 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''}`, applied ? 'success' : 'info');
      reload();
    });
  }

  async function apply() {
    if (!displayResults.length) return;
    const selected = displayResults.filter((result) => sel.has(txScopeKey(result.tx)));
    if (!selected.length) return;
    const selectedAmount = selected.reduce((sum, result) => sum + result.tx.amount, 0);
    if (!(await confirm({
      title: '입금 매칭 일괄 적용',
      message: `${selected.length}건 · ${won(selectedAmount)}을 계약 회차에 반영합니다.\n법인과 계약·회차를 확인했나요?`,
      confirmLabel: '확인 후 적용',
    }))) return;
    await runBusy(async () => {
      setApplying(true);
      const txByKey = new Map(txs.map((r) => [recordScopeKey(r), r]));
      // ★같은 계약에 입금 2건 이상을 적용할 때, 직전 append 결과를 누적해야 앞선 입금이 안 지워진다.
      //   (csByKey는 페이지 로드 스냅샷 → 매 루프 같은 _payments를 읽어 전체 교체하면 1건만 남음: QA 출시차단 #2)
      const appliedPayments = new Map<string, Array<Record<string, unknown>>>();
      let applied = 0, skipped = 0, locked = 0, duplicateSkipped = 0;
      for (const r of displayResults) {
        if (!sel.has(txScopeKey(r.tx))) continue;
        if (lockReason(companyId, r.tx.txDate)) { locked++; skipped++; continue; }
        const crec = contractRecordFor(String(r.tx.companyCode || ''), r.candidate.contract.id);
        const trec = txByKey.get(txScopeKey(r.tx));
        if (!crec || !trec || trec.matchedContractId) { skipped++; continue; }
        const ckey = String(crec._key);
        const existing = appliedPayments.get(ckey)
          ?? (Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : []);
        if (existing.some((p) => p.txId === r.tx.id)) { skipped++; continue; }
        // 기본선택을 거치지 않고 행을 직접 선택해도 쓰기 직전 다시 검사한다.
        // 현장수납과 같은 돈이면 자동 적용하지 않고 수동 연결의 개별 확인 경로로 남긴다.
        if (findDuplicateCashPayment({ ...crec, _payments: existing }, r.tx)) {
          duplicateSkipped++;
          skipped++;
          continue;
        }
        const co = resolveWriteCompany(companyId, crec);
        const txCo = resolveWriteCompany(companyId, trec);
        if (!co || !txCo) { skipped++; continue; }
        const newPayments = [...existing, { seq: r.candidate.scheduleSeq, date: r.tx.txDate, amount: r.tx.amount, source: '계좌', txId: r.tx.id }];
        // ★순서 = bank_tx 먼저, 계약(_payments) 나중.
        //   commitAll은 트랜잭션이 아니다(lib/commit.ts) → 부분 실패가 반드시 «복구 가능한» 쪽으로 끝나야 한다.
        //   · 계약 먼저였을 때: 수납은 들어갔는데 입금은 미매칭 → 화면에 «해제» 버튼이 없어 영구 고아(미수도 잘못 깎임)
        //   · bank_tx 먼저: 입금은 매칭 표시·수납 미기록 → 미수는 정상(안 깎임) + «해제»로 되돌릴 수 있음
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
      const notes = [
        skipped ? `건너뜀 ${skipped}` : '',
        locked ? `마감월 ${locked}` : '',
        duplicateSkipped ? `중복수납 의심 ${duplicateSkipped}` : '',
      ].filter(Boolean).join(' · ');
      const outcome = `매칭 적용 ${applied}건${notes ? ` · ${notes}` : ''} — 미수에 반영됨`;
      setMsg(outcome);
      toast(outcome, applied ? 'success' : 'info');
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
      || !!crec && listDepositReceipts(crec).some((receipt) => receipt.txId === t.id);
    /* ★쓰기 순서 = bank_tx → contract (apply와 동일 규칙).
       commitAll은 트랜잭션이 아니라 앞선 쓰기가 남는다. 계약을 먼저 쓰면 부분 실패 시
       «수납은 지워졌는데 입금은 여전히 매칭 상태» = 미수가 잘못 늘고 되돌릴 버튼도 없다.
       bank_tx를 먼저 풀면 부분 실패해도 «해제 표시 + 수납 잔존»이라 다시 해제/연결로 복구된다. */
    const ok = await safeRun(async () => {
      const ops = [];
      if (!resolveWriteCompany(companyId, trec)) { toast(NEED_COMPANY, 'error'); return false; }
      ops.push({
        entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
        // 연결 해제는 귀속만 되돌린다. 1차 분류(계정과목)는 별도 판단 원자이므로 보존한다.
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
    // ★실패했는데 «해제됨»이라고 말하면 안 된다(서버 마감·권한 거부가 조용히 삼켜졌다).
    if (!ok) { reload(); return; }
    toast(depositReceipt ? '계약 귀속 해제 — 보증금 수령액 원복' : '매칭 해제 — 미수 원복', 'info'); reload();
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
      const co = resolveWriteCompany(companyId, crec);
      const txCo = resolveWriteCompany(companyId, trec);
      if (!co || !txCo) { toast(NEED_COMPANY, 'error'); return; }
      const contractPatch = appendDepositReceipt(crec, {
        txId: t.id, date: t.txDate, amount: t.amount, source: t.source || t.method || '계좌',
      });
      try {
        await commitAll([
          {
            entity: 'bank_tx', sessionCompanyId: companyId, rec: trec, key: String(trec._key),
            patch: {
              matchedContractId: String(crec._key), matchedScheduleSeq: '', matchedAt: new Date().toISOString(),
              matchedKind: 'deposit', matchProposalState: '', matchProposalReason: '', matchProposalCount: 0,
            },
          },
          { entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key), patch: contractPatch },
        ]);
        toast(`${String(crec.contractorName || '')} · 보증금 ${won(t.amount)} 귀속 — 대여료 미수 차감 없음`, 'success');
      } catch { toast('보증금 계약 귀속 실패', 'error'); }
      setManualTx(null); setMq(''); reload();
      return;
    }
    const existing = Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : [];
    if (existing.some((p) => p.txId === t.id)) { toast('이미 연결됨', 'info'); return; }
    // ★현장에서 현금·카드로 이미 받아 기록한 돈일 수 있다 — 연결하면 미수가 두 번 차감된다.
    const dup = findDuplicateCashPayment(crec, { txDate: t.txDate, amount: t.amount });
    if (dup && !(await confirm({
      title: '중복 입금 의심',
      message: `${dup.message}

그래도 이 입금을 계약에 연결할까요?`,
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
    const co = resolveWriteCompany(companyId, crec);
    const txCo = resolveWriteCompany(companyId, trec);
    if (!co || !txCo) { toast(NEED_COMPANY, 'error'); return; }
    const matchedAt = new Date().toISOString();
    const paymentEntries = buildManualReceiptEntries(allocationPlan, { txId: t.id, txDate: t.txDate, matchedAt });
    try {
      /* ★쓰기 순서 = bank_tx → contract. apply()가 못박은 규칙과 같아야 한다.
         계약을 먼저 쓰면 bank_tx 실패 시(서버 회계마감 거부 등) «미수는 깎였는데 입금은 미매칭»이 되고,
         자금일보에 «해제» 버튼이 뜨지 않아 화면에서 되돌릴 방법이 없는 영구 고아가 된다.
         bank_tx를 먼저 쓰면 실패해도 «매칭 표시만 남고 미수는 정상» → 해제로 복구 가능. */
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
        {
          entity: 'contract', sessionCompanyId: companyId, rec: crec, key: String(crec._key),
          patch: { _payments: [...existing, ...paymentEntries] },
        },
      ]);
      toast(`${String(crec.contractorName || '')} · ${won(t.amount)} 연결 — ${allocationLabel}`, 'success');
    } catch { toast('연결 실패', 'error'); }
    setManualTx(null); setMq(''); reload();
  }
  const mNorm = (s: unknown) => String(s || '').replace(/\s/g, '');
  const manualProposal = manualTx ? proposalById.get(txScopeKey(manualTx)) : undefined;
  const proposedContractIds = new Set(manualProposal?.candidates.map((candidate) => candidate.contract.id) || []);
  const mCands = manualTx
    ? cs.filter((c) => String(c.companyId || '') === String(manualTx.companyCode || '')
      && (mq.trim()
        ? [c.contractorName, c.plate, c.contractNo, c.contractorPhone].some((f) => mNorm(f).includes(mNorm(mq)))
        : proposedContractIds.has(String(c._key)))).slice(0, 8)
    : [];

  useEffect(() => {
    if (focusHandled.current || loading || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const txId = params.get('tx') || '';
    const requestedCompany = params.get('company') || '';
    if (!txId) { focusHandled.current = true; return; }

    const target = allBank.find((tx) => tx.id === txId && (!requestedCompany || String(tx.companyCode || '') === requestedCompany));
    focusHandled.current = true;
    if (!target) {
      setMsg('자금관리에서 선택한 거래를 현재 회사 범위에서 찾을 수 없습니다.');
      return;
    }

    const targetKey = txScopeKey(target);
    setMatchScope('all');
    if (target.txDate) setJournalDate(target.txDate.slice(0, 10));
    const reveal = (id: string) => window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);

    if (target.matchedContractId) {
      setFacets(new Set(['매칭됨']));
      setMsg('자금관리에서 선택한 입금의 계약 귀속 결과입니다.');
      reveal('pay-matched');
      return;
    }

    const backlogRow = matchBacklog.find((row) => txScopeKey(row.tx) === targetKey);
    if (!backlogRow) {
      setMsg('선택 거래는 계약 수납 대상이 아닙니다. 자금관리에서 계정과목을 다시 확인하세요.');
      return;
    }
    if (backlogRow.automatic) {
      setFacets(new Set(['매칭제안']));
      setSel(new Set([targetKey]));
      setMsg('자금관리에서 선택한 입금의 안전후보 1건을 표시했습니다. 계약·회차 확인 후 적용하세요.');
      reveal('pay-match');
      return;
    }

    const targetIndex = unmatchedPending.findIndex((tx) => txScopeKey(tx) === targetKey);
    if (targetIndex >= 0) setPendingVisible((count) => Math.max(count, targetIndex + 1));
    const raw = txs.find((record) => recordScopeKey(record) === targetKey);
    setFacets(new Set(['미매칭']));
    setManualTx(target);
    setMq(String(raw?.plate || raw?.renter || target.counterparty || ''));
    setMsg(isDepositReceiptCategory(raw?.category || raw?.subject)
      ? '자금관리에서 선택한 보증금의 계약 귀속을 이어서 표시했습니다. 대여료 미수는 차감하지 않습니다.'
      : '자금관리에서 선택한 입금의 수동 계약 연결을 이어서 표시했습니다.');
    reveal('pay-pending');
  }, [allBank, loading, matchBacklog, txs, unmatchedPending]);

  const selCount = displayResults.filter((r) => sel.has(txScopeKey(r.tx))).length;
  const cmsSelCount = cmsResults ? cmsResults.filter((c) => cmsSel.has(cmsScopeKey(c))).length : 0;

  async function classifyDailyRow(row: (typeof cashRows)[number], category: string) {
    const lr = lockReason(companyId, row.date);
    if (lr) { toast(lr, 'error'); return; }
    if (!category) return;
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    const ok = await safeRun(async () => {
      await commitUpdate({
        entity: row.entity,
        sessionCompanyId: companyId,
        rec: row.raw,
        key: row.recKey,
        patch: { category, subject: category, classifiedAt: new Date().toISOString(), classifiedBy: user.email },
      });
    });
    if (!ok) return;
    toast(`${row.party || '거래'} · ${category} 분류 완료`, 'success');
    reload();
  }

  async function attachDailyEvidence(row: (typeof cashRows)[number], result: DocUploadResult) {
    if (!result.url) return;
    if (!resolveWriteCompany(companyId, row.raw)) { toast(NEED_COMPANY, 'error'); return; }
    const relatedRows = relatedExpenseEvidenceRows(cashRows, row);
    const evidenceGroupId = relatedRows.length > 1
      ? `${row.companyId}:${row.date.slice(0, 10)}:${row.recKey}`
      : '';
    const ok = await safeRun(async () => {
      const attachedAt = new Date().toISOString();
      await commitAll(relatedRows.map((related) => ({
        entity: related.entity,
        sessionCompanyId: companyId,
        rec: related.raw,
        key: related.recKey,
        patch: {
          evidenceUrl: result.url,
          evidenceFileName: result.file.name,
          evidenceAttachedAt: attachedAt,
          evidenceAttachedBy: user.email,
          evidenceGroupId,
          evidenceGroupCount: relatedRows.length,
        },
      })));
    });
    if (!ok) return;
    setEvidenceRowId('');
    toast(`${row.party || '거래'} · ${relatedRows.length > 1 ? `${relatedRows.length}건 증빙 함께 연결` : '증빙 연결 완료'}`, 'success');
    reload();
  }

  return (
    <FacetPage
      title="자금일보"
      error={loadError}
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${journalDate} · 자금원장 가공 · 확인 후 일마감`}
      tools={<WorkbenchBar mid={<>
        <WorkHubBack />
        <Btn size="sm" variant="ghost" tip="이전일" onClick={() => setJournalDate((date) => moveDate(date, -1))}>이전일</Btn>
        <Input type="date" value={journalDate} onChange={(event) => setJournalDate(event.target.value || TODAY)} style={{ width: 142 }} />
        <Btn size="sm" variant="ghost" tip="다음일" onClick={() => setJournalDate((date) => moveDate(date, 1))}>다음일</Btn>
        {latestTxDate && latestTxDate !== journalDate ? <Btn size="sm" variant="ghost" onClick={() => setJournalDate(latestTxDate)}>최근 거래일</Btn> : null}
      </>} search={false} actions={
        <>
          <Btn variant="ghost" onClick={() => openReceivables()}>미수관리</Btn>
          <Btn variant="ghost" onClick={runCms} disabled={loading || busy || applying}>CMS 집금정산</Btn>
          <Select size="sm" aria-label="입금 매칭 범위" value={matchScope} onChange={(event) => setMatchScope(event.target.value as MatchBacklogScope)} style={{ width: 126 }}>
            <option value="date">선택일 미매칭</option>
            <option value="30d">최근 30일</option>
            <option value="all">전체 미매칭</option>
          </Select>
          <Btn onClick={run} disabled={loading || displayResults.length === 0 || busy || applying}>안전후보 전체선택</Btn>
        </>
      } />}
      rail={!loading ? <FacetRail lensKey="자금일보" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {loading ? <PageLoading /> : order.map((id) => {
        if (!show(id)) return null;
        if (id === 'pay-status') {
          return (
            <Sec key={id} id={id} title="일일 현황" desc="자금관리 원장을 기준일로 가공 · 미분류·증빙·입금매칭 확인 후 마감" onReorder={reorder} right={<WorkPipe to="finance" />}>
              <Cards min={128} fit>
                <Metric label="전체 거래" value={`${daily.transactionCount}건`} tone="ink" />
                <Metric label="입금" value={won(daily.inflow)} tone="ok" />
                <Metric label="출금" value={won(daily.outflow)} tone="ink" />
                <Metric label="미분류" value={`${daily.unclassifiedCount}건`} tone={daily.unclassifiedCount ? 'danger' : 'ok'} />
                <Metric label="분해 미완료" value={`${daily.bundleIncompleteCount}건`} tone={daily.bundleIncompleteCount ? 'warn' : 'ok'} />
                <Metric label="증빙 누락" value={`${daily.missingEvidenceCount}건`} tone={daily.missingEvidenceCount ? 'warn' : 'ok'} />
                <Metric label="계약 미연결" value={`${daily.unmatchedContractCount}건`} tone={daily.unmatchedContractCount ? 'warn' : 'ok'} />
                <Metric label="과오납·미배분" value={daily.unappliedReceiptAmount ? won(daily.unappliedReceiptAmount) : '0건'} tone={daily.unappliedReceiptCount ? 'danger' : 'ok'} />
                <Metric label="이체 짝 미확인" value={`${daily.unpairedTransferCount}건`} tone={daily.unpairedTransferCount ? 'danger' : 'ok'} />
                <Metric label="안전후보" value={`${displayResults.length}건`} tone={displayResults.length ? 'ok' : 'ink'} />
                <Metric label="수동검토" value={`${reviewProposalCount}건`} tone={reviewProposalCount ? 'warn' : 'ok'} />
                <Metric label="후보없음" value={`${noProposalCount}건`} tone={noProposalCount ? 'warn' : 'ok'} />
                <Metric label="CMS 후보" value={cmsResults ? `${cmsResults.length}건` : '대기'} tone={cmsResults && cmsResults.length ? 'ok' : 'ink'} />
                <Metric label="CMS 정산됨" value={`${cmsSettled}건`} tone={cmsSettled ? 'ok' : 'ink'} />
              </Cards>
              {scopeAll
                ? <div style={{ marginTop: SPACE_M, fontSize: 12.5, color: C.mute }}>일마감은 회사를 선택한 뒤 진행합니다.</div>
                : <div style={{ marginTop: SPACE_M }}><CashDailyClose rows={cashRows} date={journalDate} companyId={companyId} actor={user.name || user.email} /></div>}
              {msg && <div style={{ marginTop: SPACE_M, fontSize: 12.5, color: msg.startsWith('매칭 적용') || msg.startsWith('CMS') ? C.ok : C.mute }}>{msg}</div>}
            </Sec>
          );
        }
        if (id === 'pay-review') {
          return (
            <Sec key={id} id={id} title="미완료 처리" n={dailyWorkRows.length} desc="계정과목 확정 · 증빙 확인 · 과오납 재검토 · 완료되지 않은 건은 일마감 차단" hideable={false} onReorder={reorder} right={<WorkPipe to="finance" />}>
              {dailyWorkRows.length === 0 ? <EmptyState>미분류·분해 미완료·증빙 누락·과오납 미배분 없음</EmptyState> : (
                <ListBox>
                  {dailyWorkRows.map((row) => {
                    const bundleIncomplete = cashBundleReviewStatus(row) === '미완료';
                    const loanSplitIncomplete = bundleIncomplete
                      && (requiresLoanRepaymentSplit(row.category) || String(row.raw.bundleType || '') === '할부·리스상환');
                    const missingCategory = !bundleIncomplete && isUnclassified(row.category);
                    const missingEvidence = row.outAmt > 0 && requiresExpenseEvidence(row.category) && !row.raw.documentId && !row.raw.evidenceUrl;
                    const unappliedReceipt = Math.max(0, Number(row.raw.matchedUnappliedAmount) || 0);
                    const unpairedTransfer = unpairedTransferIds.has(row.id);
                    const evidenceGroup = missingEvidence ? relatedExpenseEvidenceRows(cashRows, row) : [];
                    const evidenceOpen = evidenceRowId === row.id;
                    return (
                      <div key={row.id}>
                        <ListRow
                          badge={loanSplitIncomplete ? '원리금미분해' : bundleIncomplete ? '묶음미완료' : missingCategory ? '미분류' : unappliedReceipt ? '과오납미배분' : unpairedTransfer ? '이체짝없음' : '증빙누락'}
                          badgeTone={missingCategory || unappliedReceipt || unpairedTransfer ? 'red' : 'amber'}
                          main={`${scopeAll ? companyLabel(row.companyId) + ' · ' : ''}${row.party || row.memo || '(상대 미상)'}`}
                          sub={`${row.accountName || row.account || '계좌 미확인'} · ${row.inAmt > 0 ? `입금 ${won(row.inAmt)}` : `출금 ${won(row.outAmt)}`}${unappliedReceipt ? ` · 과오납·미배분 ${won(unappliedReceipt)}` : ''}${unpairedTransfer ? ' · 반대편 입출금 확인 필요' : ''}${missingEvidence ? ' · 증빙 연결 필요' : ''}`}
                          right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            {bundleIncomplete ? <Btn size="sm" variant="solid" onClick={() => openFinance({
                              transactionId: row.recKey,
                              companyId: row.companyId,
                            })}>{loanSplitIncomplete ? '원금·이자 분해' : '묶음 분해'}</Btn> : missingCategory ? (
                              <Select
                                size="sm"
                                aria-label={`${row.party || '거래'} 계정과목`}
                                value=""
                                onChange={(event) => void classifyDailyRow(row, event.target.value)}
                                style={{ width: 150 }}
                              >
                                <option value="">계정과목 선택</option>
                                {LEDGER_SUBJECTS
                                  .filter((subject) => row.inAmt > 0 ? subject.kind !== '지출' : subject.kind !== '수입')
                                  .map((subject) => <option key={subject.code} value={subject.label}>{subject.label}</option>)}
                              </Select>
                            ) : null}
                            {missingEvidence ? <Btn size="sm" variant={evidenceOpen ? 'solid' : 'ghost'} onClick={() => setEvidenceRowId(evidenceOpen ? '' : row.id)}>{evidenceOpen ? '닫기' : evidenceGroup.length > 1 ? `${evidenceGroup.length}건 증빙 연결` : '증빙 연결'}</Btn> : null}
                            {unappliedReceipt ? <Btn size="sm" variant="solid" onClick={() => {
                              setFacets(new Set(['매칭됨']));
                              window.setTimeout(() => document.getElementById('pay-matched')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
                            }}>매칭 재검토</Btn> : null}
                            {unpairedTransfer ? <Btn size="sm" variant="solid" onClick={() => openFinance({
                              transactionId: row.recKey,
                              companyId: row.companyId,
                            })}>자금관리 확인</Btn> : null}
                          </span>}
                        />
                        {evidenceOpen ? (
                          <div style={{ padding: '10px 14px 14px 28px', borderBottom: `1px solid ${C.line}` }}>
                            <DocUpload
                              storeAt={{ company: row.companyId, entity: row.entity, key: row.recKey }}
                              hint={evidenceGroup.length > 1
                                ? `같은 날·계좌·상대방 ${evidenceGroup.length}건에 함께 연결 · PDF/JPG/PNG`
                                : '영수증·세금계산서·거래명세서 · PDF/JPG/PNG'}
                              onDone={(result) => void attachDailyEvidence(row, result)}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </ListBox>
              )}
            </Sec>
          );
        }
        if (id === 'pay-cms') {
          if (!cmsResults || cmsResults.length === 0) return null;
          return (
            <Sec key={id} id={id} title="CMS 집금 후보" n={cmsResults.length} desc="통장 입금 1건 ↔ 자동이체 N건 · 수수료=합계−집금 · high만 기본선택 · 구성건은 자금원장에서 제외(이중계상 방지)" hideable={false} onReorder={reorder}
              right={<Btn size="sm" onClick={applyCms} disabled={applying || busy || cmsSelCount === 0}>{applying || busy ? '적용 중…' : `선택 ${cmsSelCount}건 정산`}</Btn>}>
              <ListBox>
                {cmsResults.map((c) => {
                  const on = cmsSel.has(cmsScopeKey(c));
                  return (
                    <ListRow
                      key={cmsScopeKey(c)}
                      main={`${c.depositDate} · ${won(c.depositAmount)}`}
                      sub={`묶음 ${c.items.length}건 · 총액 ${won(c.itemsSum)} · 수수료 ${won(c.estimatedFee)} (${(c.feeRate * 100).toFixed(2)}%)`}
                      right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                        <Badge tone={CONF_TONE[c.confidence] || 'gray'}>{c.confidence}</Badge>
                        <Checkbox checked={on} onChange={() => toggleCms(cmsScopeKey(c))} ariaLabel={`${c.depositDate} CMS 집금 후보 선택`} />
                      </span>}
                      onClick={() => toggleCms(cmsScopeKey(c))}
                    />
                  );
                })}
              </ListBox>
            </Sec>
          );
        }
        if (id === 'pay-match') {
          if (displayResults.length === 0) return null;
          return (
            <Sec key={id} id={id} title="확정 가능 후보" n={displayResults.length} desc="입금자·금액이 한 계약의 미납 회차에만 일치 · 직원 확인 후 적용 · 자동 저장하지 않음" hideable={false} onReorder={reorder}
              right={<Btn size="sm" onClick={apply} disabled={applying || busy || selCount === 0}>{applying || busy ? '적용 중…' : `선택 ${selCount}건 적용`}</Btn>}>
              <ListBox>
                {displayResults.map((r) => {
                  const on = sel.has(txScopeKey(r.tx));
                  const plate = r.candidate.contract.vehiclePlate;
                  return (
                    <ListRow
                      key={txScopeKey(r.tx)}
                      main={`${scopeAll ? companyLabel(String(r.tx.companyCode || '')) + ' · ' : ''}${r.tx.txDate} · ${r.tx.counterparty || '(적요없음)'} · ${won(r.tx.amount)}`}
                      sub={
                        <span>
                          →{' '}
                          <TextLink stop onClick={() => { if (plate) openCar(plate, 'unpaid'); }}>
                            {r.candidate.contract.customerName} · {plate}
                          </TextLink>
                          {' · '}<b>{r.candidate.scheduleSeq}회차</b>
                        </span>
                      }
                      right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                        <Badge tone={CONF_TONE[r.candidate.confidence] || 'gray'}>{r.candidate.confidence}</Badge>
                        <Checkbox checked={on} onChange={() => toggle(txScopeKey(r.tx))} ariaLabel={`${r.tx.txDate} ${r.tx.counterparty || '입금'} 매칭 후보 선택`} />
                      </span>}
                      onClick={() => toggle(txScopeKey(r.tx))}
                    />
                  );
                })}
              </ListBox>
            </Sec>
          );
        }
        if (id === 'pay-matched') {
          if (matched.length === 0) return null;
          return (
            <Sec key={id} id={id} title="계약 귀속 완료" n={matched.length} desc="대여료는 회차·미수에 반영 · 보증금은 수령액에만 반영 · 잘못 붙었으면 해제" hideable={false} onReorder={reorder}>
              <ListBox>
                {matched.slice(0, 60).map((t) => {
                  const crec = contractRecordFor(String(t.companyCode || ''), String(t.matchedContractId));
                  const plate = crec ? String(crec.plate || '') : '';
                  const ck = crec ? customerKey(crec.contractorName, crec.contractorPhone) : '';
                  const isDepositReceipt = isDepositReceiptCategory(txCategoryByKey.get(txScopeKey(t)));
                  const allocationText = !isDepositReceipt && t.matchedScheduleAllocations?.length
                    ? t.matchedScheduleAllocations.map((allocation) => `${allocation.seq}회차 ${won(allocation.amount)}`).join(' + ')
                    : '';
                  const unappliedText = !isDepositReceipt && Number(t.matchedUnappliedAmount) > 0
                    ? `과오납·미배분 ${won(Number(t.matchedUnappliedAmount))}`
                    : '';
                  return (
                    <ListRow
                      key={txScopeKey(t)}
                      main={`${t.txDate} · ${t.counterparty || '(적요없음)'}`}
                      sub={crec ? (
                        <span>
                          →{' '}
                          <TextLink disabled={!ck} onClick={() => { if (ck) openCustomer(ck); }}>{String(crec.contractorName || '')}</TextLink>
                          {' · '}
                          <TextLink mono disabled={!plate} onClick={() => { if (plate) openCar(plate, 'unpaid'); }}>{plate}</TextLink>
                          {isDepositReceipt ? ' · 보증금(미수 차감 없음)' : ''}
                          {allocationText ? ` · ${allocationText}` : ''}
                          {unappliedText ? ` · ${unappliedText}` : ''}
                        </span>
                      ) : String(t.matchedContractId)}
                      right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{won(t.amount)}</span>
                        <Btn size="sm" variant="ghost"
                          tip={`${t.txDate} ${t.counterparty || '적요 없음'} ${won(t.amount)} ${isDepositReceipt ? '보증금 귀속' : '수납 매칭'} 해제`}
                          onClick={() => unmatch(t)}>해제</Btn>
                      </span>}
                    />
                  );
                })}
              </ListBox>
              {matched.length > 60 && <div style={{ fontSize: 11.5, color: C.faint, padding: '4px 2px' }}>외 {matched.length - 60}건 …</div>}
            </Sec>
          );
        }
        return (
          <Sec key={id} id={id} title="미매칭 입금" n={unmatchedPending.length} desc="제안 후보를 제외한 입금 · 최신 거래 우선 · 인라인 수동 연결" hideable={false} onReorder={reorder}>
            {unmatchedPending.length === 0 ? <EmptyState>미매칭 입금 없음</EmptyState>
              : (
                <>
                  <ListBox>
                    {unmatchedPending.slice(0, pendingVisible).map((t) => {
                      const suggested = displayResults.some((r) => r.tx.id === t.id);
                      const proposal = proposalById.get(txScopeKey(t));
                      const open = manualTx ? txScopeKey(manualTx) === txScopeKey(t) : false;
                      const isDepositReceipt = isDepositReceiptCategory(txCategoryByKey.get(txScopeKey(t)));
                      return (
                        <div key={txScopeKey(t)}>
                          <ListRow
                            main={`${scopeAll ? companyLabel(String(t.companyCode || '')) + ' · ' : ''}${t.txDate} · ${t.counterparty || '(적요 없음)'}`}
                            sub={suggested ? '자동후보 · 위 제안에서 확인' : proposal ? `${proposal.state} · ${proposal.reason}${proposal.candidates.length ? ` · 후보 ${new Set(proposal.candidates.map((candidate) => candidate.contract.id)).size}계약` : ''}` : open ? '연결 중…' : undefined}
                            right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M, opacity: suggested ? 0.55 : 1 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{won(t.amount)}</span>
                              <Btn size="sm" variant={open ? 'solid' : 'ghost'}
                                tip={`${t.txDate} ${t.counterparty || '적요 없음'} ${won(t.amount)} ${open ? '연결창 닫기' : isDepositReceipt ? '보증금 계약 귀속' : '계약 연결'}`}
                                onClick={() => { if (open) { setManualTx(null); setMq(''); } else { setManualTx(t); setMq(''); } }}>{open ? '닫기' : isDepositReceipt ? '계약 귀속' : '연결'}</Btn>
                            </span>}
                          />
                          {open && (
                            <div style={{ padding: '8px 12px 12px 28px', borderBottom: `1px solid ${C.line}` }}>
                              <Input autoFocus value={mq} onChange={(e) => setMq(e.target.value)} placeholder="계약자·차번·연락처 검색" style={{ width: '100%', maxWidth: 360 }} />
                              <div style={{ marginTop: SPACE_M, maxHeight: 220, overflowY: 'auto' }}>
                                {mCands.length === 0 ? <div style={{ fontSize: 12, color: C.faint, padding: '8px 4px' }}>{mq.trim() ? '일치 계약 없음' : manualProposal?.candidates.length ? '후보 계약을 불러오지 못했습니다' : '자동 후보 없음 · 계약자·차번·연락처를 검색하세요'}</div>
                                  : (
                                    <ListBox>
                                      {mCands.map((c) => {
                                        const v = computeContractView(c, TODAY);
                                        const contractIdentity = [c.plate || '차량 미지정', c.contractNo || '계약번호 미지정', v.status || '상태 미지정'].join(' · ');
                                        return (
                                          <ListRow
                                            key={String(c._key)}
                                            main={String(c.contractorName || '—')}
                                            sub={contractIdentity}
                                            right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                                              {v.net > 0
                                                ? <span style={{ fontSize: 11.5, color: C.danger, fontWeight: 700 }}>미수 {won(v.net)} · {v.count}회차</span>
                                                : <span style={{ fontSize: 11, color: C.faint }}>미수없음</span>}
                                              <Btn
                                                size="sm"
                                                variant="ghost"
                                                tip={`${String(c.contractorName || '계약자 미지정')} ${String(c.plate || '')} ${isDepositReceipt ? '보증금 계약 귀속' : '입금 매칭'}`}
                                                onClick={() => void manualMatch(t, c)}
                                              >{isDepositReceipt ? '귀속' : '연결'}</Btn>
                                            </span>}
                                          />
                                        );
                                      })}
                                    </ListBox>
                                  )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </ListBox>
                  {unmatchedPending.length > pendingVisible && (
                    <div style={{ padding: '8px 2px' }}>
                      <Btn size="sm" variant="ghost" onClick={() => setPendingVisible((count) => count + 60)}>
                        다음 {Math.min(60, unmatchedPending.length - pendingVisible)}건 보기 · 남음 {unmatchedPending.length - pendingVisible}건
                      </Btn>
                    </div>
                  )}
                </>
              )}
          </Sec>
        );
      })}
    </FacetPage>
  );
}
