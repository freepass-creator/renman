'use client';
/**
 * 수납 자동매칭 — 은행 입금(bank_tx) → 계약 회차 자동매칭 + CMS 집금 묶음 정산.
 *   · 매칭엔진(receipt-match autoMatchAll): 입금자명·차번끝4·금액·CMS dueDate근접·동명이인 격하.
 *   · CMS 집금(cms-matching): 통장 1건 ↔ 자동이체 N건 + 수수료 (v5 이식).
 *   · 적용 = 계약 _payments append(computeContractView가 흡수→미수 자동감소) + bank_tx matched 표시.
 *   · 안전: high 신뢰만 제안 · operator 체크 확인 후 적용 · 이중적용 가드 · 매칭은 미수를 줄이기만(허위미수 불가) · 감사 자동기록.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { notifySaved, openCar, openCustomer } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { companyLabel } from '@/lib/companies';
import { type EntityRecord } from '@/lib/intake/entities';
import { buildMatchContract, computeContractView } from '@/lib/contract-ops';
import { autoMatchAll, type AutoMatchResult } from '@/lib/payments/receipt-match';
import { findCmsMatchCandidates, buildSettlementPatches, type CmsMatchCandidate } from '@/lib/payments/cms-matching';
import { toast } from '@/lib/toast';
import type { BankTransaction } from '@/lib/payments/types';
import { lockReason } from '@/lib/finance/period-lock';
import { safeUpdate } from '@/lib/safe-update';
import { useBusyAction } from '@/lib/use-busy-action';
import { visibleSecs } from '@/lib/lens-filters';
import { FacetPage, Sec, Cards, Metric, Badge, Btn, EmptyState, ListBox, ListRow, Input, C, won, SPACE_M, type BadgeTone, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { WorkPipe } from '@/components/WorkPipe';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';

const CONF_TONE: Record<string, BadgeTone> = { high: 'green', medium: 'amber', low: 'gray' };
const EMPTY = new Set<string>();

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
    settlementId: rec.settlementId ? String(rec.settlementId) : undefined,
    settlementRole: rec.settlementRole === 'deposit' || rec.settlementRole === 'item' ? rec.settlementRole : undefined,
    settlementGrossAmount: rec.settlementGrossAmount != null ? Number(rec.settlementGrossAmount) : undefined,
    settlementFeeAmount: rec.settlementFeeAmount != null ? Number(rec.settlementFeeAmount) : undefined,
    settlementItemCount: rec.settlementItemCount != null ? Number(rec.settlementItemCount) : undefined,
  } as BankTransaction;
}

export default function PaymentsPage() {
  const { companyId, scopeAll } = useSession();
  // work hub back only — no sibling tabs
  const { data: [cs = [], txs = []], loading, reload } = useEntityLists(['contract', 'bank_tx']);
  const [results, setResults] = useState<AutoMatchResult[] | null>(null);
  const [cmsResults, setCmsResults] = useState<CmsMatchCandidate[] | null>(null);
  const [cmsSel, setCmsSel] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [busy, runBusy] = useBusyAction();
  const [msg, setMsg] = useState('');
  const [manualTx, setManualTx] = useState<BankTransaction | null>(null);
  const [mq, setMq] = useState('');
  const [facets, setFacets] = useState<Set<string>>(EMPTY);
  const toggleFacet = (label: string) => setFacets((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });
  const resetFacets = () => setFacets(new Set());
  const vis = visibleSecs('자금일보', facets);
  const show = (id: string) => !vis || vis.has(id);

  const allBank = useMemo(() => txs.map(toBankTx), [txs]);
  const deposits = useMemo(() => allBank.filter((t) => t.amount > 0 && !(t.withdraw && t.withdraw > 0) && t.settlementRole !== 'deposit'), [allBank]);
  const pending = deposits.filter((t) => !t.matchedContractId && t.settlementRole !== 'item');
  const matched = deposits.filter((t) => t.matchedContractId);
  const csByKey = useMemo(() => new Map(cs.map((r) => [String(r._key), r])), [cs]);
  const cmsSettled = useMemo(() => allBank.filter((t) => t.settlementRole === 'deposit').length, [allBank]);

  function run() {
    const matchCs = cs.map((r) => buildMatchContract(r, TODAY));
    const res = autoMatchAll(pending, matchCs);
    setResults(res);
    setSel(new Set(res.map((r) => r.tx.id)));
    setMsg(res.length === 0 ? '자동매칭 제안 없음 — 이름·금액 일치 입금이 없습니다(수동 검토).' : '');
  }

  function runCms() {
    const cands = findCmsMatchCandidates(allBank);
    setCmsResults(cands);
    setCmsSel(new Set(cands.filter((c) => c.confidence === 'high').map((c) => c.depositId)));
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
      const txByKey = new Map(txs.map((r) => [String(r._key), r]));
      let applied = 0, skipped = 0, locked = 0;
      for (const cand of cmsResults) {
        if (!cmsSel.has(cand.depositId)) continue;
        if (lockReason(companyId, cand.depositDate)) { locked++; skipped++; continue; }
        const patches = buildSettlementPatches(cand);
        let okAll = true;
        for (const { id, patch } of patches) {
          const trec = txByKey.get(id);
          if (!trec || trec.settlementId) { okAll = false; break; }
          const txCo = String(trec.companyId || companyId);
          const ok = await safeUpdate(async () => {
            await getStore().update('bank_tx', txCo, String(trec._key), patch);
          });
          if (ok == null) { okAll = false; break; }
        }
        if (okAll) applied++; else skipped++;
      }
      notifySaved();
      setApplying(false);
      const lockNote = locked ? ` · 마감월 ${locked}` : '';
      setMsg(`CMS 집금정산 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''}`);
      toast(`CMS 집금정산 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''}`, applied ? 'success' : 'info');
      reload();
    });
  }

  async function apply() {
    if (!results) return;
    await runBusy(async () => {
      setApplying(true);
      const txByKey = new Map(txs.map((r) => [String(r._key), r]));
      let applied = 0, skipped = 0, locked = 0;
      for (const r of results) {
        if (!sel.has(r.tx.id)) continue;
        if (lockReason(companyId, r.tx.txDate)) { locked++; skipped++; continue; }
        const crec = csByKey.get(r.candidate.contract.id);
        const trec = txByKey.get(r.tx.id);
        if (!crec || !trec || trec.matchedContractId) { skipped++; continue; }
        const existing = Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : [];
        if (existing.some((p) => p.txId === r.tx.id)) { skipped++; continue; }
        const co = String(crec.companyId || companyId);
        const txCo = String(trec.companyId || companyId);
        const newPayments = [...existing, { seq: r.candidate.scheduleSeq, date: r.tx.txDate, amount: r.tx.amount, source: '계좌', txId: r.tx.id }];
        const ok = await safeUpdate(async () => {
          await getStore().update('contract', co, String(crec._key), { _payments: newPayments });
          await getStore().update('bank_tx', txCo, String(trec._key), { matchedContractId: String(crec._key), matchedScheduleSeq: r.candidate.scheduleSeq, matchedAt: new Date().toISOString(), subject: '대여료수입', category: '대여료수입' });
        });
        if (ok != null) applied++; else skipped++;
      }
      notifySaved();
      setApplying(false);
      const lockNote = locked ? ` · 마감월 ${locked}` : '';
      setMsg(`매칭 적용 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''} — 미수에 반영됨`);
      toast(`매칭 적용 ${applied}건${skipped ? ` · 건너뜀 ${skipped}${lockNote}` : ''} — 미수 반영`, applied ? 'success' : 'info');
      reload();
    });
  }

  async function unmatch(t: BankTransaction) {
    const lr = lockReason(companyId, t.txDate);
    if (lr) { toast(lr, 'error'); return; }
    const trec = txs.find((r) => String(r._key) === t.id);
    if (!trec) return;
    const crec = cs.find((r) => String(r._key) === String(t.matchedContractId));
    await safeUpdate(async () => {
      if (crec) {
        const existing = Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : [];
        await getStore().update('contract', String(crec.companyId || companyId), String(crec._key), { _payments: existing.filter((p) => p.txId !== t.id) });
      }
      await getStore().update('bank_tx', String(trec.companyId || companyId), String(trec._key), { matchedContractId: '', matchedScheduleSeq: '', matchedAt: '', subject: '', category: '' });
    });
    notifySaved(); toast('매칭 해제 — 미수 원복', 'info'); reload();
  }

  async function manualMatch(t: BankTransaction, crec: EntityRecord) {
    const lr = lockReason(companyId, t.txDate);
    if (lr) { toast(lr, 'error'); return; }
    const trec = txs.find((r) => String(r._key) === t.id);
    if (!trec || trec.matchedContractId) { toast('이미 처리된 입금', 'info'); return; }
    const existing = Array.isArray(crec._payments) ? (crec._payments as Array<Record<string, unknown>>) : [];
    if (existing.some((p) => p.txId === t.id)) { toast('이미 연결됨', 'info'); return; }
    const mc = buildMatchContract(crec, TODAY);
    const unpaid = (mc.schedules ?? []).filter((s: { status: string }) => s.status !== '완료') as Array<{ seq: number }>;
    const seq = unpaid.length ? unpaid[0].seq : existing.length + 1;
    const co = String(crec.companyId || companyId), txCo = String(trec.companyId || companyId);
    try {
      await getStore().update('contract', co, String(crec._key), { _payments: [...existing, { seq, date: t.txDate, amount: t.amount, source: '계좌', txId: t.id, manual: true }] });
      await getStore().update('bank_tx', txCo, String(trec._key), { matchedContractId: String(crec._key), matchedScheduleSeq: seq, matchedAt: new Date().toISOString(), subject: '대여료수입', category: '대여료수입' });
      notifySaved();
      toast(`${String(crec.contractorName || '')} · ${won(t.amount)} 연결 — 미수 반영`, 'success');
    } catch { toast('연결 실패', 'error'); }
    setManualTx(null); setMq(''); reload();
  }
  const mNorm = (s: unknown) => String(s || '').replace(/\s/g, '');
  const mCands = (manualTx && mq.trim())
    ? cs.filter((c) => [c.contractorName, c.plate, c.contractNo, c.contractorPhone].some((f) => mNorm(f).includes(mNorm(mq)))).slice(0, 8)
    : [];

  const selCount = results ? results.filter((r) => sel.has(r.tx.id)).length : 0;
  const cmsSelCount = cmsResults ? cmsResults.filter((c) => cmsSel.has(c.depositId)).length : 0;

  return (
    <FacetPage
      title="자금일보"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 입금→계약 · 재무현황 공급`}
      tools={<WorkbenchBar mid={<WorkHubBack />} search actions={
        <>
          <Btn variant="ghost" onClick={runCms} disabled={loading || busy || applying}>CMS 집금정산</Btn>
          <Btn onClick={run} disabled={loading || pending.length === 0 || busy || applying}>자동매칭 실행</Btn>
        </>
      } />}
      rail={!loading ? <FacetRail lensKey="자금일보" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {loading ? <PageLoading /> : (
        <>
      {show('pay-status') && (
      <Sec id="pay-status" title="현황" desc="미매칭 입금→계약 · CMS 명세→통장 집금 묶음" right={<WorkPipe to="finance" />}>
        <Cards min={128} fit>
          <Metric label="입금 거래" value={`${deposits.length}건`} tone="ink" />
          <Metric label="미매칭 입금" value={`${pending.length}건`} tone={pending.length ? 'warn' : 'ok'} />
          <Metric label="매칭 제안" value={results ? `${results.length}건` : '대기'} tone={results && results.length ? 'ok' : 'ink'} />
          <Metric label="CMS 후보" value={cmsResults ? `${cmsResults.length}건` : '대기'} tone={cmsResults && cmsResults.length ? 'ok' : 'ink'} />
          <Metric label="CMS 정산됨" value={`${cmsSettled}건`} tone={cmsSettled ? 'ok' : 'ink'} />
        </Cards>
        {msg && <div style={{ marginTop: SPACE_M, fontSize: 12.5, color: msg.startsWith('매칭 적용') || msg.startsWith('CMS') ? C.ok : C.mute }}>{msg}</div>}
      </Sec>
      )}

      {show('pay-cms') && cmsResults && cmsResults.length > 0 && (
        <Sec id="pay-cms" title="CMS 집금 후보" n={cmsResults.length} desc="통장 입금 1건 ↔ 자동이체 N건 · 수수료=합계−집금 · high만 기본선택 · 구성건은 자금원장에서 제외(이중계상 방지)" hideable={false}
          right={<Btn onClick={applyCms} disabled={applying || busy || cmsSelCount === 0}>{applying || busy ? '적용 중…' : `선택 ${cmsSelCount}건 정산`}</Btn>}>
          <ListBox>
            {cmsResults.map((c) => {
              const on = cmsSel.has(c.depositId);
              return (
                <ListRow
                  key={c.depositId}
                  main={`${c.depositDate} · ${won(c.depositAmount)}`}
                  sub={`묶음 ${c.items.length}건 · 총액 ${won(c.itemsSum)} · 수수료 ${won(c.estimatedFee)} (${(c.feeRate * 100).toFixed(2)}%)`}
                  right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                    <Badge tone={CONF_TONE[c.confidence] || 'gray'}>{c.confidence}</Badge>
                    <label style={{ display: 'inline-flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={on} onChange={() => toggleCms(c.depositId)} />
                    </label>
                  </span>}
                  onClick={() => toggleCms(c.depositId)}
                />
              );
            })}
          </ListBox>
        </Sec>
      )}

      {show('pay-match') && results && results.length > 0 && (
        <Sec id="pay-match" title="매칭 제안" n={results.length} desc="체크 확인 후 적용 · high=이름/차번+금액 일치 · 매칭은 미수를 줄이기만" hideable={false}
          right={<Btn onClick={apply} disabled={applying || busy || selCount === 0}>{applying || busy ? '적용 중…' : `선택 ${selCount}건 적용`}</Btn>}>
          <ListBox>
            {results.map((r) => {
              const on = sel.has(r.tx.id);
              const plate = r.candidate.contract.vehiclePlate;
              return (
                <ListRow
                  key={r.tx.id}
                  main={`${r.tx.txDate} · ${r.tx.counterparty || '(적요없음)'} · ${won(r.tx.amount)}`}
                  sub={
                    <span>
                      →{' '}
                      <button type="button" onClick={(e) => { e.stopPropagation(); if (plate) openCar(plate, 'unpaid'); }}
                        style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: C.accent, fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit' }}>
                        {r.candidate.contract.customerName} · {plate}
                      </button>
                      {' · '}<b>{r.candidate.scheduleSeq}회차</b>
                    </span>
                  }
                  right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                    <Badge tone={CONF_TONE[r.candidate.confidence] || 'gray'}>{r.candidate.confidence}</Badge>
                    <label style={{ display: 'inline-flex', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={on} onChange={() => toggle(r.tx.id)} />
                    </label>
                  </span>}
                  onClick={() => toggle(r.tx.id)}
                />
              );
            })}
          </ListBox>
        </Sec>
      )}

      {show('pay-matched') && matched.length > 0 && (
        <Sec id="pay-matched" title="매칭된 입금" n={matched.length} desc="계약 회차에 붙은 입금 — 잘못 붙었으면 해제(미수 원복)" hideable={false}>
          <ListBox>
            {matched.slice(0, 60).map((t) => {
              const crec = csByKey.get(String(t.matchedContractId));
              const plate = crec ? String(crec.plate || '') : '';
              const ck = crec ? customerKey(crec.contractorName, crec.contractorPhone) : '';
              return (
                <ListRow
                  key={t.id}
                  main={`${t.txDate} · ${t.counterparty || '(적요없음)'}`}
                  sub={crec ? (
                    <span>
                      →{' '}
                      <button type="button" onClick={() => ck && openCustomer(ck)} style={{ border: 'none', background: 'none', padding: 0, cursor: ck ? 'pointer' : 'default', color: C.accent, fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit' }}>{String(crec.contractorName || '')}</button>
                      {' · '}
                      <button type="button" onClick={() => plate && openCar(plate, 'unpaid')} style={{ border: 'none', background: 'none', padding: 0, cursor: plate ? 'pointer' : 'default', color: C.accent, fontWeight: 700, fontSize: 'inherit', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}>{plate}</button>
                    </span>
                  ) : String(t.matchedContractId)}
                  right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{won(t.amount)}</span>
                    <Btn size="sm" variant="ghost" onClick={() => unmatch(t)}>해제</Btn>
                  </span>}
                />
              );
            })}
          </ListBox>
          {matched.length > 60 && <div style={{ fontSize: 11.5, color: C.faint, padding: '4px 2px' }}>외 {matched.length - 60}건 …</div>}
        </Sec>
      )}

      {show('pay-pending') && (
      <Sec id="pay-pending" title="미매칭 입금" n={pending.length} desc="자동매칭 안 된 입금 — 수동 검토(차량360 수납 또는 재실행)" hideable={false}>
        {pending.length === 0 ? <EmptyState>미매칭 입금 없음</EmptyState>
          : (
            <>
              <ListBox>
                {pending.slice(0, 60).map((t) => {
                  const suggested = results?.some((r) => r.tx.id === t.id);
                  return (
                    <ListRow
                      key={t.id}
                      main={`${t.txDate} · ${t.counterparty || '(적요 없음)'}`}
                      sub={suggested ? '제안됨↑' : undefined}
                      right={<span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE_M, opacity: suggested ? 0.55 : 1 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{won(t.amount)}</span>
                        <Btn size="sm" variant="ghost" onClick={() => { setManualTx(t); setMq(''); }}>연결</Btn>
                      </span>}
                    />
                  );
                })}
              </ListBox>
              {pending.length > 60 && <div style={{ fontSize: 11.5, color: C.faint, padding: '4px 2px' }}>외 {pending.length - 60}건 …</div>}
            </>
          )}
      </Sec>
      )}

      {manualTx && (
        <div onClick={() => { setManualTx(null); setMq(''); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.taupeBg, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 440, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>입금 수동 연결</div>
            <div style={{ fontSize: 12.5, color: C.mute, marginTop: 4 }}>{manualTx.txDate} · {manualTx.counterparty || '(적요없음)'} · <b style={{ color: C.ink }}>{won(manualTx.amount)}</b> → 계약 선택</div>
            <Input autoFocus value={mq} onChange={(e) => setMq(e.target.value)} placeholder="계약자·차번·연락처 검색"
              style={{ width: '100%', marginTop: SPACE_M }} />
            <div style={{ marginTop: SPACE_M, maxHeight: 300, overflowY: 'auto' }}>
              {mCands.length === 0 ? <div style={{ fontSize: 12, color: C.faint, padding: '12px 4px' }}>{mq.trim() ? '일치 계약 없음' : '검색어를 입력하세요'}</div>
                : (
                  <ListBox>
                    {mCands.map((c) => {
                      const v = computeContractView(c, TODAY);
                      return (
                        <ListRow
                          key={String(c._key)}
                          main={String(c.contractorName || '—')}
                          sub={String(c.plate || '')}
                          right={v.net > 0 ? <span style={{ fontSize: 11.5, color: C.danger, fontWeight: 700 }}>미수 {won(v.net)}</span> : <span style={{ fontSize: 11, color: C.faint }}>미수없음</span>}
                          onClick={() => manualMatch(manualTx, c)}
                        />
                      );
                    })}
                  </ListBox>
                )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: SPACE_M }}><Btn size="sm" variant="ghost" onClick={() => { setManualTx(null); setMq(''); }}>닫기</Btn></div>
          </div>
        </div>
      )}
        </>
      )}
    </FacetPage>
  );
}
