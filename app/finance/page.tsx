'use client';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { classifyTx } from '@/lib/classify-tx';
import { FacetPage, Sec, Cards, Metric, DataTable, EmptyState, Badge, Btn, Select, won, C, type Col, PageLoading, PeriodBar } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkPipe } from '@/components/WorkPipe';
import { useCashHubNav } from '@/components/CashHubTabs';
import { companyLabel, ALL_COMPANIES } from '@/lib/companies';
import { loadAliases, type AliasMap } from '@/lib/accounts';
import { downloadCsv } from '@/lib/export-csv';
import { buildCashLedger, aggregateBySubject, aggregateByParty, type CashRow } from '@/lib/finance/cash-ledger';
import { suggestSubject } from '@/lib/finance/classify-subject';
import { LEDGER_KINDS, subjectsByKind, isUnclassified, UNCLASSIFIED } from '@/lib/payments/ledger-subjects';
import { textMatch } from '@/lib/search-match';
import { TODAY } from '@/lib/dashboard-consts';
import { openCar, openCustomer, openPayments, openIngest } from '@/lib/ui-bus';
import { customerKey } from '@/lib/customers';
import { normPlate } from '@/lib/plate';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { useSecOrder } from '@/lib/use-sec-order';

const FIN_SECS = ['f-uncl', 'f-class', 'f-ledger'] as const;
const goSec = (id: string) => {
  if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/** 자금 행 → 차/손님/수납매칭. plate·이름·입금 미분류 순. */
function jumpCashRow(r: CashRow) {
  const plate = normPlate(r.raw.plate) || normPlate((String(r.party || '') + ' ' + String(r.memo || '')).match(/\d{2,3}\s*[가-힣]\s*\d{4}/)?.[0] || '');
  if (plate) { openCar(plate); return; }
  const name = String(r.party || '').trim();
  if (name && name !== '(미상)' && !/입금|출금|이체|CMS|카드/.test(name)) {
    openCustomer(customerKey(name, ''));
    return;
  }
  if (r.inAmt > 0) openPayments();
}

export default function FinancePage() {
  const { companyId, scopeAll } = useSession();
  const cashNav = useCashHubNav();

  const { bank, card, loading } = useCashLedgerLists();
  const [aliases, setAliases] = useState<AliasMap>({});

  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('전체');
  const [order, reorder] = useSecOrder('jpk:order:finance', [...FIN_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  useEffect(() => {
    try {
      const f = new URLSearchParams(window.location.search).get('facet');
      if (f === '미분류') { setFacets(new Set(['미분류'])); goSec('f-uncl'); }
    } catch { /* 무시 */ }
  }, []);

  useEffect(() => { const on = () => setAliases(loadAliases()); on(); window.addEventListener('jpk:alias-change', on); return () => window.removeEventListener('jpk:alias-change', on); }, []);
  const alias = (raw: string) => aliases[raw] || raw;

  // 통합 원장
  const rows = useMemo(() => buildCashLedger(bank, card), [bank, card]);
  const latest = useMemo(() => rows.reduce((m, r) => (r.date > m ? r.date : m), TODAY), [rows]);
  const isAll = !range.from && !range.to;

  // 필터 = FacetRail + PeriodBar + 검색 (탭 없음 — Sec로 생애 표시)
  const flowSel = ['입금', '출금'].filter((x) => facets.has(x));
  const srcSel = ['계좌', 'CMS', '카드'].filter((x) => facets.has(x));
  const classSel = ['미분류', '분류됨'].filter((x) => facets.has(x));
  const scoped = useMemo(() => rows.filter((r) => {
    if (!isAll) { if (range.from && r.date < range.from) return false; if (range.to && r.date > range.to) return false; }
    if (srcSel.length && !srcSel.includes(r.source)) return false;
    if (flowSel.length && !flowSel.includes(r.inAmt > 0 ? '입금' : '출금')) return false;
    const uncl = isUnclassified(r.category);
    if (classSel.length) {
      const hit = (classSel.includes('미분류') && uncl) || (classSel.includes('분류됨') && !uncl);
      if (!hit) return false;
    }
    if (!textMatch(q, r.party, r.account, alias(r.account), r.category, r.source, r.date)) return false;
    return true;
  }), [rows, facets, range.from, range.to, isAll, q, aliases]);

  const totalIn = scoped.reduce((s, r) => s + r.inAmt, 0);
  const totalOut = scoped.reduce((s, r) => s + r.outAmt, 0);
  const unclassified = scoped.filter((r) => isUnclassified(r.category));
  const classed = scoped.filter((r) => !isUnclassified(r.category));
  const aggs = useMemo(() => aggregateBySubject(classed), [classed]);

  // 원장(계정과목 필터 적용) — 최신순
  const ledger = useMemo(() => scoped
    .filter((r) => (cat === '전체' ? true : (cat === UNCLASSIFIED ? isUnclassified(r.category) : r.category === cat)))
    .slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)), [scoped, cat]);

  // 분류 저장 — 공용 SSOT(classifyTx). store가 자동 반영 브로드캐스트 → 홈·타화면 갱신.
  const classify = async (r: CashRow, label: string) => {
    const co = resolveWriteCompany(companyId, r);   // 임의 폴백('switchplan') 금지 — 모호하면 저장 안 함
    if (!co) { toast(NEED_COMPANY, 'error'); return; }
    await classifyTx(r.entity, co, r.recKey, label);
  };
  // 추천 일괄 적용 — 확신도 high/medium 추천을 미분류 건에 한 번에 분류(low는 사람이 확인)
  const suggestable = unclassified.map((r) => ({ r, s: suggestSubject(r) })).filter((x) => x.s && x.s.confidence !== 'low');
  const classifyBatch = async () => {
    if (!suggestable.length) return;
    const jobs = suggestable.map(({ r, s }) => ({ co: resolveWriteCompany(companyId, r), r, s }));
    const skipped = jobs.filter((j) => !j.co).length;
    await Promise.all(jobs.filter((j) => j.co).map((j) => classifyTx(j.r.entity, j.co!, j.r.recKey, j.s!.label)));
    if (skipped) toast(`${skipped}건은 법인 불명으로 건너뜀 — ${NEED_COMPANY}`, 'error');
  };
  const partyAggs = useMemo(() => aggregateByParty(scoped), [scoped]);

  const catPicker = (r: CashRow) => (
    <Select value={isUnclassified(r.category) ? '' : r.category} onChange={(e) => classify(r, e.target.value)} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 160 }}>
      <option value="">계정과목…</option>
      {LEDGER_KINDS.map((k) => <optgroup key={k} label={k}>{subjectsByKind(k).map((s) => <option key={s.code} value={s.label}>{s.label}</option>)}</optgroup>)}
    </Select>
  );

  const cols: Col<CashRow>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (r: CashRow) => <span style={{ color: C.mute }}>{companyLabel(r.companyId)}</span> }] : []),
    { key: 'date', label: '일자', render: (r) => r.date || '—' },
    { key: 'source', label: '소스', render: (r) => <span style={{ fontSize: 11.5, color: C.mute }}>{r.source}</span> },
    { key: 'account', label: '계좌', render: (r) => <span style={{ fontSize: 11.5, color: C.faint }}>{alias(r.account) || '—'}</span> },
    { key: 'party', label: '내용', render: (r) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); jumpCashRow(r); }}
        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: C.ink, fontWeight: 600 }}>
        {r.party || <span style={{ color: C.faint }}>—</span>}
      </button>
    ) },
    { key: 'cat', label: '계정과목', render: (r) => catPicker(r) },
    { key: 'in', label: '입금', align: 'r', render: (r) => (r.inAmt ? <span className="mono" style={{ color: C.ok }}>{won(r.inAmt)}</span> : <span style={{ color: C.faint }}>—</span>) },
    { key: 'out', label: '출금', align: 'r', render: (r) => (r.outAmt ? <span className="mono" style={{ color: C.danger }}>{won(r.outAmt)}</span> : <span style={{ color: C.faint }}>—</span>) },
  ];

  type AggRow = (typeof aggs)[number];
  const aggCols: Col<AggRow>[] = [
    { key: 'kind', label: '성격', render: (a) => {
      const tone = a.kind === '수입' ? C.ok : a.kind === '지출' ? C.danger : a.kind === '미분류' ? C.warn : C.mute;
      return <span style={{ fontSize: 11, fontWeight: 700, color: tone }}>{a.kind}</span>;
    } },
    { key: 'label', label: '계정과목', render: (a) => <span style={{ fontWeight: cat === a.label ? 700 : 600 }}>{a.label}</span> },
    { key: 'count', label: '건수', align: 'r', render: (a) => <span style={{ color: C.faint }}>{a.count}</span> },
    { key: 'net', label: '순증감', align: 'r', render: (a) => {
      const net = a.inAmt - a.outAmt;
      return <span className="mono" style={{ fontWeight: 700, color: net >= 0 ? C.ok : C.danger }}>{won(net)}</span>;
    } },
  ];

  type PartyRow = (typeof partyAggs)[number];
  const partyCols: Col<PartyRow>[] = [
    { key: 'party', label: '거래처', render: (a) => a.party },
    { key: 'meta', label: '건·최근', render: (a) => <span style={{ color: C.faint }}>{a.count}건 · {a.lastDate}</span> },
    { key: 'in', label: '입금', align: 'r', render: (a) => a.inAmt > 0 ? <span className="mono" style={{ color: C.ok }}>+{won(a.inAmt)}</span> : '—' },
    { key: 'out', label: '출금', align: 'r', render: (a) => a.outAmt > 0 ? <span className="mono" style={{ color: C.danger }}>-{won(a.outAmt)}</span> : '—' },
    { key: 'net', label: '순증감', align: 'r', render: (a) => {
      const net = a.inAmt - a.outAmt;
      return <span className="mono" style={{ fontWeight: 700, color: net >= 0 ? C.ok : C.danger }}>{won(net)}</span>;
    } },
  ];

  const exportCsv = () => downloadCsv(`재무현황_${isAll ? '전체' : `${range.from}~${range.to}`}`,
    ['회사', '일자', '소스', '계좌', '내용', '계정과목', '입금', '출금'],
    ledger.map((r) => [companyLabel(r.companyId), r.date, r.source, alias(r.account), r.party, isUnclassified(r.category) ? UNCLASSIFIED : r.category, r.inAmt, r.outAmt]));

  const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: `1px solid ${C.line}`, borderLeft: `2px solid ${C.warn}`, borderRadius: 'var(--radius)', background: C.taupeBg, minWidth: 0 };
  const allUncl = useMemo(() => rows.filter((r) => isUnclassified(r.category)), [rows]);
  const allClassed = useMemo(() => rows.filter((r) => !isUnclassified(r.category)), [rows]);

  return (
    <FacetPage
      title="재무현황"
      meta={`${companyLabel(companyId)} · 자금자산 ${rows.length}건`}
      tools={
        <WorkbenchBar
          {...cashNav}
          mid={<PeriodBar latest={latest} onRange={setRange} />}
          search={{ value: q, onChange: setQ, placeholder: '내용·계좌·계정' }}
          actions={<Btn size="sm" onClick={() => openIngest('bank_tx')}>+ 계좌 담기</Btn>}
        />
      }
      rail={!loading ? <FacetRail lensKey="재무현황" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="생애" desc="자금자산 · 미분류→분류→원장" hideable={false}>
        <Cards min={128} fit>
          <Metric label="미분류" value={`${allUncl.length}건`} tone={allUncl.length ? 'warn' : 'ink'} onClick={() => goSec('f-uncl')} />
          <Metric label="분류됨" value={`${allClassed.length}건`} tone="ok" onClick={() => goSec('f-class')} />
          <Metric label="입금" value={won(totalIn)} tone="ok" onClick={() => goSec('f-ledger')} />
          <Metric label="출금" value={won(totalOut)} tone="danger" onClick={() => goSec('f-ledger')} />
        </Cards>
      </Sec>

      {loading ? <PageLoading />
        : rows.length === 0 ? <EmptyState>재무 자료 없음 — <button type="button" data-ui="action" onClick={() => openIngest('bank_tx')} style={{ border: 'none', background: 'none', padding: 0, color: C.accent, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>담기에서 계좌·CMS·카드 수집</button></EmptyState>
          : order.map((id) => {
            if (id === 'f-uncl') {
              return (
                <Sec key={id} id={id} title="미분류" n={unclassified.length} desc="계정과목 지정 → 분류·원장 반영" onReorder={reorder}
                  right={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    {suggestable.length ? <Btn size="sm" onClick={classifyBatch}>추천 일괄 · {suggestable.length}</Btn> : null}
                    <WorkPipe to="payments" />
                  </span>}>
                  {unclassified.length === 0 ? <EmptyState variant="sec">미분류 없음</EmptyState>
                    : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {unclassified.slice(0, 50).map((r) => {
                        const isIn = r.inAmt > 0;
                        const sug = suggestSubject(r);
                        return (
                          <div key={r.id} style={{ ...rowStyle, borderLeftColor: isIn ? C.ok : C.warn }}>
                            <Badge tone={isIn ? 'green' : 'gray'}>{isIn ? '입금' : '출금'}</Badge>
                            <span style={{ fontSize: 11, color: C.faint }}>{r.source}</span>
                            <span style={{ fontWeight: 600, fontSize: 12.5, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.party || '(내용 없음)'}</span>
                            <span className="mono" style={{ fontWeight: 700, color: isIn ? C.ok : C.danger }}>{won(isIn ? r.inAmt : r.outAmt)}</span>
                            {sug ? <Btn size="sm" variant="ghost" onClick={() => classify(r, sug.label)}>{sug.label}</Btn> : null}
                            {catPicker(r)}
                          </div>
                        );
                      })}
                    </div>}
                </Sec>
              );
            }
            if (id === 'f-class') {
              return (
                <Sec key={id} id={id} title="분류" n={aggs.length} desc="계정과목별 집계" onReorder={reorder}
                  right={<WorkPipe to="payments" />}>
                  {aggs.length === 0 ? <EmptyState variant="sec">집계 없음</EmptyState>
                    : <DataTable cols={aggCols} rows={aggs} onRow={(a) => { setCat(a.label); goSec('f-ledger'); }} />}
                </Sec>
              );
            }
            return (
              <Sec key={id} id={id} title={`원장${cat !== '전체' ? ` · ${cat}` : ''}`} n={ledger.length} desc="일자별 · 거래처 요약"
                onReorder={reorder}
                right={<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <Btn size="sm" variant="ghost" onClick={exportCsv}>CSV</Btn>
                  <WorkPipe to="payments" />
                </span>}>
                {partyAggs.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 6 }}>거래처 상위</div>
                    <DataTable cols={partyCols} rows={partyAggs.slice(0, 15)} />
                  </div>
                )}
                {ledger.length === 0 ? <EmptyState variant="sec">거래 없음</EmptyState>
                  : <DataTable cols={cols} rows={ledger.slice(0, 300)} onRow={jumpCashRow} />}
              </Sec>
            );
          })}
    </FacetPage>
  );
}
