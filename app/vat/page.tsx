'use client';
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { FacetPage, Sec, Cards, Metric, DataTable, EmptyState, PeriodBar, won, C, PageLoading, type Col } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { useCashHubNav } from '@/components/CashHubTabs';
import { companyLabel } from '@/lib/companies';
import { buildCashLedger, aggregateBySubject, type SubjectAgg } from '@/lib/finance/cash-ledger';
import { vatOfLabel } from '@/lib/payments/ledger-subjects';
import { useCashLedgerLists } from '@/lib/use-cash-ledger-lists';

// 부가세 산출(경영·비즈니스 티어) — 매출세액 − 매입세액 = 납부/환급세액. 현금기준 추정(세금계산서 대사 전).
//   부가세 = 공급대가 × 10/110 (입출금액에 부가세 내포 가정). 면세(보험·급여·세금)·거래외(보증금·이체) 제외.
//   분기 단위(부가세 신고 주기). 기간=공용 PeriodBar.
export default function VatPage() {
  const { companyId, scopeAll } = useSession();
  const cashNav = useCashHubNav();
  const { bank, card, loading } = useCashLedgerLists();
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });

  const rows = useMemo(() => buildCashLedger(bank, card), [bank, card]);
  const latest = useMemo(() => rows.reduce((mx, r) => (r.date > mx ? r.date : mx), ''), [rows]);
  const inRange = useMemo(() => rows.filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to)), [rows, range]);
  const subjects = useMemo(() => aggregateBySubject(inRange), [inRange]);

  const taxableIn = subjects.filter((s) => s.kind === '수입' && vatOfLabel(s.label) === '과세');
  const taxableOut = subjects.filter((s) => s.kind === '지출' && vatOfLabel(s.label) === '과세');
  const salesGross = taxableIn.reduce((s, x) => s + x.inAmt, 0);
  const purchaseGross = taxableOut.reduce((s, x) => s + x.outAmt, 0);
  const salesVat = Math.round(salesGross / 11);
  const purchaseVat = Math.round(purchaseGross / 11);
  const payable = salesVat - purchaseVat;
  const supplyValue = salesGross - salesVat;

  const cols = (kind: '수입' | '지출'): Col<SubjectAgg>[] => [
    { key: 'label', label: '계정과목', render: (s) => <b>{s.label}</b> },
    { key: 'count', label: '건수', align: 'r', render: (s) => `${s.count}건` },
    { key: 'gross', label: '공급대가', align: 'r', render: (s) => won(kind === '수입' ? s.inAmt : s.outAmt) },
    { key: 'vat', label: '세액', align: 'r', render: (s) => <b style={{ color: C.accent }}>{won(Math.round((kind === '수입' ? s.inAmt : s.outAmt) / 11))}</b> },
  ];

  return (
    <FacetPage
      title="부가세"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)}${range.from ? ` · ${range.from}~${range.to}` : ' · 전체'} · 현금기준 추정`}
      tools={<WorkbenchBar {...cashNav} mid={<PeriodBar latest={latest} initial="분기" onRange={setRange} />} />}
    >
      {loading ? <PageLoading /> : <>
        <Sec title="부가세 요약" desc="매출세액 − 매입세액 = 납부/환급 · 현금기준 추정(세금계산서 대사 전)">
          <Cards min={140} fit>
            <Metric label="과세 매출(공급대가)" value={won(salesGross)} tone="ok" hint={`공급가액 ${won(supplyValue)}`} />
            <Metric label="매출세액" value={won(salesVat)} tone="ok" />
            <Metric label="매입세액" value={won(purchaseVat)} tone="danger" hint={`과세매입 ${won(purchaseGross)}`} />
            <Metric label={payable >= 0 ? '납부세액' : '환급세액'} value={won(Math.abs(payable))} tone={payable >= 0 ? 'danger' : 'ok'} hint={payable >= 0 ? '납부 예상' : '환급 예상'} />
          </Cards>
        </Sec>
        <Sec title="매출세액 (과세 매출)" n={taxableIn.length} desc="공급대가 × 10/110">
          {taxableIn.length ? <DataTable cols={cols('수입')} rows={taxableIn} /> : <EmptyState>이 기간 과세 매출 없음</EmptyState>}
        </Sec>
        <Sec title="매입세액 (과세 매입·지출)" n={taxableOut.length} desc="공급대가 × 10/110 (공제)">
          {taxableOut.length ? <DataTable cols={cols('지출')} rows={taxableOut} /> : <EmptyState>이 기간 과세 매입 없음</EmptyState>}
        </Sec>
        <Sec title="안내">
          <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.7 }}>※ <b>현금기준 추정</b>입니다. 실제 신고는 <b>세금계산서·현금영수증 기준 공급가액</b>으로 확정하세요. 면세(보험·급여·세금·과태료)·거래외(보증금·이체)는 제외. 부가세 = 공급대가 × 10/110(입출금액에 부가세 내포 가정). 신고 주기는 <b>분기(예정)·반기(확정)</b> — 상단에서 기간 선택.</div>
        </Sec>
      </>}
    </FacetPage>
  );
}
