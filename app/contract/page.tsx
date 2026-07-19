'use client';
/**
 * 계약현황 — 계약자산 원장 생애 Sec (탭 금지).
 *   계약예정(대기) · 계약중(운행) · 계약완료(종료) · 손님 + FacetRail 상시.
 *   채권·만기 = 레일. 가동률·미수율은 홈.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore, listsCached } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { companyLabel } from '@/lib/companies';
import { useReloadOnSaved } from '@/lib/use-reload-on-saved';
import {
  computeContractView, contractSchedules,
  patchDeliver, patchReturn, patchTerminate, patchExtend,
  type ContractView,
} from '@/lib/contract-ops';
import { classifyContract, type ContractPhase, type ContractDebt } from '@/lib/domain/model';
import { aggregateCustomers, customerKey, type CustomerAgg } from '@/lib/customers';
import { dueMatcher, selectedInDim } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { FacetPage, Sec, Cards, Metric, DataTable, Badge, StatusTag, Btn, Drawer, Section, DetailGrid, EmptyState, Input, won, th, thR, td, tdR, C, type Col, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkPipe } from '@/components/WorkPipe';
import { openIngest, openEntityEdit, openCar, openCustomer } from '@/lib/ui-bus';
import { toast } from '@/lib/toast';
import { TODAY } from '@/lib/dashboard-consts';
import { useSecOrder } from '@/lib/use-sec-order';

const LIFE_SECS = ['c-wait', 'c-run', 'c-end', 'c-cust'] as const;
type LifeSec = (typeof LIFE_SECS)[number];
const SEC_PHASE: Partial<Record<LifeSec, ContractPhase>> = { 'c-wait': '대기', 'c-run': '운행', 'c-end': '종료' };
const SEC_META: Record<LifeSec, { title: string; desc: string }> = {
  'c-wait': { title: '계약예정', desc: '성립·인도 대기' },
  'c-run': { title: '계약중', desc: '운행 중 계약' },
  'c-end': { title: '계약완료', desc: '종료·해지 원장' },
  'c-cust': { title: '손님', desc: '계약의 사람-뷰' },
};

const goSec = (id: string) => {
  if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

type ActKind = 'deliver' | 'return' | 'terminate' | 'extend' | 'pay';
type Act = { kind: ActKind; value: string };

export default function ContractWorkspace() {
  const { companyId, scopeAll } = useSession();
  const [recs, setRecs] = useState<EntityRecord[]>([]);
  const [views, setViews] = useState<ContractView[]>([]);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [act, setAct] = useState<Act | null>(null);
  const [order, reorder] = useSecOrder('jpk:order:contract', [...LIFE_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  const setF = (labels: string[]) => setFacets(new Set(labels));

  const load = useCallback((silent = false) => {
    const warm = listsCached(['contract'], companyId);
    if (!silent && !warm) setLoading(true);
    getStore().list('contract', companyId).then((rs) => {
      setRecs(rs);
      setViews(rs.map((r) => computeContractView(r, TODAY)).sort((a, b) => b.net - a.net));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [companyId]);
  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  useEffect(() => {
    if (loading) return;
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setOpenKey(c);
  }, [loading]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'customer') goSec('c-cust');
  }, []);

  async function applyPatch(v: ContractView, patch: EntityRecord, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true);
    try {
      await getStore().update('contract', String(v.rec.companyId || companyId), String(v.rec._key || ''), patch);
      setAct(null); setOpenKey(null); load();
    } catch (e) { toast('저장 실패: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  async function delContract(v: ContractView) {
    if (!window.confirm(`이 계약을 삭제할까요? (휴지통에서 복구 가능)\n${String(v.rec.contractorName || '')} · ${String(v.rec.plate || '')}`)) return;
    setBusy(true);
    try { await getStore().remove('contract', String(v.rec.companyId || companyId), String(v.rec._key || ''), '수기 삭제'); setOpenKey(null); load(); }
    catch (e) { toast('삭제 실패: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  function startAct(kind: ActKind, v: ContractView) {
    const defaults: Record<ActKind, string> = {
      deliver: v.startDate || TODAY,
      return: TODAY,
      terminate: TODAY,
      extend: '12',
      pay: String(v.net || ''),
    };
    setAct({ kind, value: defaults[kind] });
  }
  async function commitAct(v: ContractView) {
    if (!act) return;
    const val = act.value.trim();
    if (!val) return;
    if (act.kind === 'deliver') return applyPatch(v, patchDeliver(v.rec, val));
    if (act.kind === 'return') return applyPatch(v, patchReturn(v.rec, val));
    if (act.kind === 'terminate') return applyPatch(v, patchTerminate(v.rec, val), '중도해지로 종료 처리할까요?');
    if (act.kind === 'extend') {
      const n = Number(val); if (!n) return;
      return applyPatch(v, patchExtend(v.rec, n));
    }
    const amt = Number(val.replace(/[^0-9]/g, '')); if (!amt) return;
    setBusy(true);
    const scheds = contractSchedules(v.rec, TODAY);
    const existing = Array.isArray(v.rec._payments) ? (v.rec._payments as Array<Record<string, unknown>>) : [];
    const newPays: Array<Record<string, unknown>> = [];
    let remain = amt;
    for (const s of scheds) {
      if (remain <= 0) break;
      if (s.balance <= 0) continue;
      const pay = Math.min(remain, s.balance);
      newPays.push({ seq: s.seq, date: TODAY, amount: pay, source: '수동', manual: true });
      remain -= pay;
    }
    if (remain > 0) newPays.push({ seq: scheds.length ? scheds[scheds.length - 1].seq : 1, date: TODAY, amount: remain, source: '수동', manual: true });
    try {
      await getStore().update('contract', String(v.rec.companyId || companyId), String(v.rec._key || ''), { _payments: [...existing, ...newPays] });
      setAct(null); load();
    } catch (e) { toast('수납 저장 실패: ' + (e as Error).message, 'error'); }
    finally { setBusy(false); }
  }
  const actMeta: Record<ActKind, { title: string; label: string; type: 'date' | 'number'; confirm: string }> = {
    deliver: { title: '인도 처리', label: '인도일', type: 'date', confirm: '인도 확정' },
    return: { title: '반납 처리', label: '반납일', type: 'date', confirm: '반납 확정' },
    terminate: { title: '중도해지', label: '해지일', type: 'date', confirm: '해지 확정' },
    extend: { title: '계약 연장', label: '연장 개월', type: 'number', confirm: '연장 확정' },
    pay: { title: '입금 기록', label: '입금액(원)', type: 'number', confirm: '입금 반영' },
  };

  const DEBT_LABELS: ContractDebt[] = ['채권잔존', '청산'];
  const nodes = useMemo(() => views.map((v) => ({ v, c: classifyContract(v) })), [views]);
  const debtSel = DEBT_LABELS.filter((x) => facets.has(x));
  const dueMatch = dueMatcher('계약현황', facets);

  const filteredNodes = nodes.filter((n) =>
    (debtSel.length === 0 || debtSel.includes(n.c.debt))
    && (!dueMatch || dueMatch(n.v.dday))
    && textMatch(q, n.v.rec.contractNo, n.v.rec.contractorName, n.v.rec.plate, n.v.rec.contractorPhone));
  const byPhase = (phase: ContractPhase) => filteredNodes.filter((n) => n.c.phase === phase).map((n) => n.v);
  const allFiltered = filteredNodes.map((n) => n.v);

  const nWait = nodes.filter((n) => n.c.phase === '대기').length;
  const nRun = nodes.filter((n) => n.c.phase === '운행').length;
  const nEnd = nodes.filter((n) => n.c.phase === '종료').length;
  const nDebt = nodes.filter((n) => n.c.debt === '채권잔존').length;

  const customersAll = useMemo(() => aggregateCustomers(recs, TODAY).sort((a, b) => b.totalUnpaid - a.totalUnpaid), [recs]);
  const custStatus = selectedInDim('계약현황', '손님', facets);
  const customers = customersAll.filter((c) => {
    if (custStatus.length) {
      const okActive = custStatus.includes('운행중') && c.activeCount > 0;
      const okDebt = custStatus.includes('미수있음') && c.totalUnpaid > 0;
      if (!(okActive || okDebt)) return false;
    }
    return textMatch(q, c.name, c.phone, ...c.vehicles);
  });
  const custDebt = customers.reduce((s, c) => s + Math.max(0, c.totalUnpaid), 0);

  const cols: Col<ContractView>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (v: ContractView) => <span style={{ color: C.mute }}>{companyLabel(v.rec.companyId)}</span> }] : []),
    { key: 'no', label: '계약번호', render: (v) => String(v.rec.contractNo || '—') },
    { key: 'renter', label: '임차인', render: (v) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); openCustomer(customerKey(v.rec.contractorName, v.rec.contractorPhone)); }}
        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, fontWeight: 700, color: C.ink }}>{String(v.rec.contractorName || '—')}</button>
    ) },
    { key: 'plate', label: '차량', render: (v) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); if (v.rec.plate) openCar(v.rec.plate); }}
        style={{ border: 'none', background: 'none', cursor: v.rec.plate ? 'pointer' : 'default', padding: 0, color: C.accent, fontWeight: 600 }}>{String(v.rec.plate || '—')}</button>
    ) },
    { key: 'status', label: '상태', render: (v) => { const c = classifyContract(v); return <Badge tone={c.tone === 'danger' ? 'red' : c.tone === 'ok' ? 'green' : c.tone === 'warn' ? 'amber' : 'gray'}>{c.label}</Badge>; } },
    { key: 'term', label: '기간', render: (v) => <span style={{ fontSize: 12 }}>{v.startDate || '—'}~{v.endDate || '—'}{v.dday != null && <span style={{ marginLeft: 6, color: v.dday < 0 ? C.danger : v.dday <= 30 ? C.warn : C.faint }}>{v.dday < 0 ? `만기경과 ${-v.dday}일` : `D-${v.dday}`}</span>}</span> },
    { key: 'rent', label: '월대여료', align: 'r', render: (v) => won(v.monthlyRent) },
    { key: 'net', label: '순미수', align: 'r', render: (v) => v.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(v.net)}</span> : <span style={{ color: C.faint }}>—</span> },
  ];
  const custCols: Col<CustomerAgg>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (c: CustomerAgg) => <span style={{ color: C.mute }}>{companyLabel(c.companyId)}</span> }] : []),
    { key: 'name', label: '손님', render: (c) => <b>{c.name || '—'}</b> },
    { key: 'phone', label: '연락처', render: (c) => <span style={{ color: C.mute }}>{c.phone || '—'}</span> },
    { key: 'cnt', label: '계약', align: 'r', render: (c) => `${c.contracts.length}건` },
    { key: 'active', label: '운행중', align: 'r', render: (c) => c.activeCount > 0 ? <b style={{ color: 'var(--green-text)' }}>{c.activeCount}</b> : <span style={{ color: C.faint }}>—</span> },
    { key: 'veh', label: '차량', render: (c) => c.vehicles.length ? c.vehicles.slice(0, 2).join(', ') + (c.vehicles.length > 2 ? ` 외 ${c.vehicles.length - 2}` : '') : '—' },
    { key: 'last', label: '최종종료', render: (c) => c.lastEnd || '—' },
    { key: 'debt', label: '순미수', align: 'r', render: (c) => c.totalUnpaid > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(c.totalUnpaid)}</span> : <span style={{ color: C.faint }}>—</span> },
  ];

  const openIdx = openKey ? allFiltered.findIndex((v) => String(v.rec._key) === openKey) : -1;
  const open = openIdx >= 0 ? allFiltered[openIdx] : (openKey ? views.find((v) => String(v.rec._key) === openKey) ?? null : null);
  const sched = open ? contractSchedules(open.rec, TODAY) : [];

  return (
    <FacetPage
      title="계약현황"
      meta={`${companyLabel(companyId)} · ${views.length}건`}
      tools={
        <WorkbenchBar
          search={{ value: q, onChange: setQ, placeholder: '계약·손님·차량' }}
          actions={<Btn size="sm" onClick={() => openIngest('contract')}>+ 신규 계약</Btn>}
        />
      }
      rail={!loading ? <FacetRail lensKey="계약현황" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="생애" desc="계약자산 · 예정→중→완료" hideable={false}>
        <Cards min={100} fit>
          <Metric label="계약예정" value={loading ? '…' : nWait} tone={nWait ? 'warn' : 'ink'} onClick={() => goSec('c-wait')} />
          <Metric label="계약중" value={loading ? '…' : nRun} tone="ok" onClick={() => goSec('c-run')} />
          <Metric label="계약완료" value={loading ? '…' : nEnd} tone="ink" onClick={() => goSec('c-end')} />
          <Metric label="채권잔존" value={loading ? '…' : nDebt} tone={nDebt ? 'danger' : 'ink'} onClick={() => setF(['채권잔존'])} />
          <Metric label="손님" value={loading ? '…' : customersAll.length} tone="ink" onClick={() => goSec('c-cust')} />
        </Cards>
      </Sec>

      {loading ? <PageLoading />
        : order.map((id) => {
          const sid = id as LifeSec;
          const meta = SEC_META[sid];
          if (sid === 'c-cust') {
            return (
              <Sec key={sid} id={sid} title={meta.title} n={customers.length} desc={meta.desc} onReorder={reorder}
                right={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 11.5, color: C.faint }}>채권 {won(custDebt)}</span><WorkPipe to="receivables" /></span>}>
                {customers.length === 0 ? <EmptyState variant="sec">손님 없음</EmptyState>
                  : <DataTable cols={custCols} rows={customers} onRow={(c) => openCustomer(c.key)} />}
              </Sec>
            );
          }
          const phase = SEC_PHASE[sid]!;
          const list = byPhase(phase);
          const pipe = sid === 'c-wait' || sid === 'c-run' ? 'dispatch' as const : sid === 'c-end' ? 'receivables' as const : null;
          return (
            <Sec key={sid} id={sid} title={meta.title} n={list.length} desc={meta.desc} onReorder={reorder}
              right={pipe ? <WorkPipe to={pipe} /> : undefined}>
              {list.length === 0 ? <EmptyState variant="sec">해당 계약 없음</EmptyState>
                : <DataTable cols={cols} rows={list} onRow={(v) => setOpenKey(String(v.rec._key || ''))} />}
            </Sec>
          );
        })}

      {open && (
        <Drawer title={`${open.rec.contractNo || '계약'} · ${open.rec.contractorName || ''}`} meta={<StatusTag value={open.status} />} onClose={() => { setOpenKey(null); setAct(null); }}
          onPrev={openIdx > 0 ? () => { setOpenKey(String(allFiltered[openIdx - 1].rec._key)); setAct(null); } : undefined}
          onNext={openIdx >= 0 && openIdx < allFiltered.length - 1 ? () => { setOpenKey(String(allFiltered[openIdx + 1].rec._key)); setAct(null); } : undefined}
          footer={<>
            {!open.delivered && <Btn variant="solid" onClick={() => startAct('deliver', open)} disabled={busy}>인도 처리</Btn>}
            {open.status === '운행' && <>
              <Btn variant="ghost" onClick={() => startAct('extend', open)} disabled={busy}>연장</Btn>
              <Btn variant="ghost" onClick={() => startAct('return', open)} disabled={busy}>반납</Btn>
              <Btn variant="danger" onClick={() => startAct('terminate', open)} disabled={busy}>중도해지</Btn>
            </>}
            <Btn variant="ghost" onClick={() => openEntityEdit('contract', open.rec)}>정보 수정</Btn>
            <Btn variant="danger" onClick={() => delContract(open)} disabled={busy}>삭제</Btn>
            <span style={{ flex: 1 }} />
            <Btn variant="ghost" onClick={() => openCar(String(open.rec.plate || ''))}>차량 360 →</Btn>
            <Btn variant="ghost" onClick={() => openCustomer(customerKey(open.rec.contractorName, open.rec.contractorPhone))}>손님 360 →</Btn>
            {open.net > 0 && <Btn variant="solid" onClick={() => startAct('pay', open)}>입금 기록</Btn>}
          </>}>
          {act && (() => {
            const m = actMeta[act.kind];
            return (
              <div style={{ marginBottom: 14, padding: '12px 14px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: 'var(--bg-stripe)' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 10 }}>{m.title}</div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.mute, marginBottom: 6 }}>{m.label}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Input type={m.type} value={act.value} onChange={(e) => setAct({ ...act, value: e.target.value })} style={{ width: m.type === 'date' ? 160 : 140 }} />
                  <Btn variant="solid" onClick={() => commitAct(open)} disabled={busy || !act.value.trim()}>{busy ? '처리 중…' : m.confirm}</Btn>
                  <Btn variant="ghost" onClick={() => setAct(null)} disabled={busy}>취소</Btn>
                </div>
              </div>
            );
          })()}
          <Cards min={128} fit>
            <Metric label="순미수" value={won(open.net)} tone={open.net > 0 ? 'danger' : 'ink'} />
            <Metric label="도래미수" value={won(open.gross)} />
            <Metric label="입금누계" value={won(open.paid)} tone="ok" />
            {open.refund > 0 && <Metric label="반납 일할환불" value={won(open.refund)} tone="warn" />}
          </Cards>
          <Section title="계약 정보">
            <DetailGrid rows={[
              ['차량', `${open.rec.plate || ''} ${open.rec.carName || ''}`], ['기간', `${open.startDate} ~ ${open.endDate}`],
              ['월대여료', won(open.monthlyRent)], ['보증금', won(open.rec.deposit)],
              ['인도일', open.rec.deliveredDate], ['반납예정일', open.rec.returnScheduledDate],
              ['반납/해지일', open.rec.returnedDate], ['종료사유', open.rec.endReason],
            ]} />
          </Section>
          <Section title={`수납 스케줄 (${sched.length}회차)`}>
            {sched.length ? (
              <div style={{ overflowX: 'auto', maxHeight: 260 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
                  <thead><tr><th style={th}>회차</th><th style={th}>납기일</th><th style={thR}>금액</th><th style={thR}>할인</th><th style={th}>상태</th></tr></thead>
                  <tbody>
                    {sched.map((s) => (
                      <tr key={s.seq} style={{ borderTop: `1px solid ${C.line2}` }}>
                        <td style={td}>{s.seq}</td><td style={td}>{s.dueDate}</td>
                        <td style={tdR}>{won(s.amount)}</td>
                        <td style={tdR}>{s.discount ? <span style={{ color: C.warn }}>-{won(s.discount)}</span> : '—'}</td>
                        <td style={td}><Badge tone={s.status === '완료' ? 'green' : s.status === '연체' ? 'red' : s.status === '면제' ? 'gray' : 'amber'}>{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div style={{ padding: 12, fontSize: 13, color: C.faint }}>월대여료·기간 입력 시 회차 생성</div>}
          </Section>
        </Drawer>
      )}
    </FacetPage>
  );
}
