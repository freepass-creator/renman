'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { FacetPage, Sec, Cards, Metric, DataTable, EmptyState, PeriodBar, won, C, PageLoading, type Col } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { useCashHubNav } from '@/components/CashHubTabs';
import { companyLabel } from '@/lib/companies';
import { buildCashLedger, aggregateBySubject, type SubjectAgg } from '@/lib/finance/cash-ledger';
import { groupOfLabel } from '@/lib/payments/ledger-subjects';
import { loanTotalsInRange } from '@/lib/finance/loan-schedule';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';
import { useEntityList } from '@/lib/use-entity-lists';

// 손익분석(경영·비즈니스 티어) — 영업손익(영업수입 − 영업비용) + 금융비용(할부이자) = 세전이익. 현금 기준.
export default function PnlPage() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const cashNav = useCashHubNav();
  const { bank, card, loading: cashLoading } = useCashLedgerLists();
  const { rows: veh, loading: vehLoading } = useEntityList('vehicle');
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const loading = cashLoading || vehLoading;
  const rows = useMemo(() => buildCashLedger(bank, card), [bank, card]);
  const latest = useMemo(() => rows.reduce((mx, r) => (r.date > mx ? r.date : mx), ''), [rows]);
  const inRange = useMemo(() => rows.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)), [rows, range]);
  const subjects = useMemo(() => aggregateBySubject(inRange), [inRange]);
  const loan = useMemo(() => loanTotalsInRange(veh, range.from, range.to), [veh, range]);

  // 최근 12개월 영업손익 추이(기간필터 무관 — 전체 원장에서 월별 집계)
  const trend = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
    const by = new Map(months.map((m) => [m, { inc: 0, exp: 0 }]));
    for (const r of rows) {
      const b = by.get(String(r.date || '').slice(0, 7)); if (!b) continue;
      if (groupOfLabel(r.category) !== '영업') continue;
      b.inc += r.inAmt; b.exp += r.outAmt;
    }
    const list = months.map((m) => { const b = by.get(m)!; return { m, inc: b.inc, exp: b.exp, profit: b.inc - b.exp }; });
    const max = Math.max(1, ...list.map((x) => Math.max(x.inc, x.exp)));
    return { list, max };
  }, [rows]);

  // 영업(손익) vs 자본·금융(손익 외) 분리
  const opIncome = subjects.filter((s) => s.kind === '수입' && groupOfLabel(s.label) === '영업');
  const opExpense = subjects.filter((s) => s.kind === '지출' && groupOfLabel(s.label) === '영업');
  const capFin = subjects.filter((s) => { const g = groupOfLabel(s.label); return g === '자본' || g === '금융'; });
  const unclass = subjects.filter((s) => s.kind === '미분류');
  const totalIn = opIncome.reduce((s, x) => s + x.inAmt, 0);
  const totalOut = opExpense.reduce((s, x) => s + x.outAmt, 0);
  const opProfit = totalIn - totalOut;
  const loanInterest = loan.interest;               // 할부이자(우리 계산) = 금융비용
  const preTax = opProfit - loanInterest;           // 세전이익
  const margin = totalIn > 0 ? Math.round((preTax / totalIn) * 100) : 0;
  const capFinOut = capFin.reduce((s, x) => s + x.outAmt, 0);
  const capFinIn = capFin.reduce((s, x) => s + x.inAmt, 0);
  const unclassAmt = unclass.reduce((s, x) => s + x.inAmt + x.outAmt, 0);

  const cols = (base: number): Col<SubjectAgg>[] => [
    { key: 'label', label: '계정과목', render: (s) => <b>{s.label}</b> },
    { key: 'count', label: '건수', align: 'r', render: (s) => `${s.count}건` },
    { key: 'amt', label: '금액', align: 'r', render: (s) => <b style={{ color: s.kind === '수입' ? 'var(--green-text)' : s.kind === '지출' ? C.danger : C.mute }}>{won(s.kind === '수입' ? s.inAmt : s.outAmt)}</b> },
    { key: 'pct', label: '비중', align: 'r', render: (s) => { const amt = s.kind === '수입' ? s.inAmt : s.outAmt; return base ? `${Math.round((amt / base) * 100)}%` : '—'; } },
  ];

  return (
    <FacetPage
      title="손익분석"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)}${range.from ? ` · ${range.from}~${range.to}` : ' · 전체'} · 현금 기준`}
      tools={<WorkbenchBar {...cashNav} mid={<PeriodBar latest={latest} initial="월간" onRange={setRange} />} />}
    >
      {loading ? <PageLoading /> : <>
        <Sec id="p-pl" title="손익" desc="영업손익(영업수입−영업비용) − 할부이자 = 세전이익 · 현금 기준">
          <Cards min={132} fit>
            <Metric label="영업수입" value={won(totalIn)} tone="ok" hint={`${opIncome.length}개 과목`} />
            <Metric label="영업비용" value={won(totalOut)} tone="danger" hint={`${opExpense.length}개 과목`} />
            <Metric label="영업손익" value={won(opProfit)} tone={opProfit >= 0 ? 'ok' : 'danger'} hint="금융 전" />
            <Metric label="할부이자" value={won(loanInterest)} tone="warn" hint={`계산값 · ${loan.cars}대`} />
            <Metric label="세전이익" value={won(preTax)} tone={preTax >= 0 ? 'ok' : 'danger'} hint={`${preTax >= 0 ? '흑자' : '적자'} · 이익률 ${margin}%`} />
            {unclassAmt > 0 ? <Metric label="미분류" value={won(unclassAmt)} tone="warn" hint="분류하면 반영" onClick={() => router.push('/finance')} /> : null}
          </Cards>
        </Sec>
        <Sec id="p-income" title="영업수입" n={opIncome.length} desc="계정과목별 · 큰 금액순">
          {opIncome.length ? <DataTable cols={cols(totalIn)} rows={opIncome} /> : <EmptyState>이 기간 영업수입 없음</EmptyState>}
        </Sec>
        <Sec id="p-expense" title="영업비용" n={opExpense.length} desc="할부이자 별도(아래) · 큰 금액순">
          {opExpense.length ? <DataTable cols={cols(totalOut)} rows={opExpense} /> : <EmptyState>이 기간 영업비용 없음</EmptyState>}
        </Sec>
        <Sec id="p-loan" title="할부·리스 (금융)" desc="원금=부채상환(손익 아님) · 이자=금융비용(위 반영). 상환스케줄 OCR 전 계산값">
          <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.7 }}>
            우리 계산 상환({loan.cars}대): 상환액 <b style={{ color: C.ink }}>{won(loan.payment)}</b> = 원금 <b style={{ color: C.ink }}>{won(loan.principal)}</b> + <b style={{ color: C.warn }}>이자 {won(loan.interest)}</b> (이자비중 {loan.payment ? Math.round(loan.interest / loan.payment * 100) : 0}%)<br />
            {capFin.length ? <>실제 자금원장 자본·금융 지출: <b style={{ color: C.ink }}>{won(capFinOut)}</b>{capFinIn ? <> · 수입 {won(capFinIn)}</> : null} — 원금상환·차량매입 포함(손익 아님).</> : null}
          </div>
          {capFin.length ? <div style={{ marginTop: 10 }}><DataTable cols={cols(capFinOut)} rows={capFin} /></div> : null}
        </Sec>
        <Sec id="p-trend" title="월별 추이" desc="최근 12개월 영업손익 (수입=초록·비용=빨강 막대)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {trend.list.map((t) => (
              <div key={t.m} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ width: 58, color: C.mute, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{t.m}</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{ height: 7, background: 'var(--green-text)', opacity: 0.7, width: `${Math.round(t.inc / trend.max * 100)}%`, borderRadius: 2, minWidth: t.inc ? 3 : 0 }} title={`수입 ${won(t.inc)}`} />
                  <div style={{ height: 7, background: C.danger, opacity: 0.6, width: `${Math.round(t.exp / trend.max * 100)}%`, borderRadius: 2, minWidth: t.exp ? 3 : 0 }} title={`비용 ${won(t.exp)}`} />
                </div>
                <span style={{ width: 84, textAlign: 'right', fontWeight: 700, color: t.profit >= 0 ? 'var(--green-text)' : C.danger, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{won(t.profit)}</span>
              </div>
            ))}
          </div>
        </Sec>
      </>}
    </FacetPage>
  );
}
