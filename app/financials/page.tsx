'use client';
import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { FacetPage, Sec, Cards, Metric, won, C, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { useCashHubNav } from '@/components/CashHubTabs';
import { companyLabel } from '@/lib/companies';
import { computeContractView } from '@/lib/contract-ops';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { computeAssetLedgerEntry } from '@/lib/payments/asset-ledger';
import { loanSchedule } from '@/lib/finance/loan-schedule';
import { isCashPurchase } from '@/lib/domain/vehicle-finance';
import type { Vehicle } from '@/lib/payments/types';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';

// 재무상태표(경영·비즈니스 티어) — 오늘 기준 스냅샷. 자산 = 부채 + 자본.
//   자산: 차량 장부가(취득−감가) + 미수금 + 현금(자금일보 순증감). 부채: 할부잔여 + 보증금예수.
//   ★계산값 기준(감가·할부 상각). 상환스케줄표·실사 OCR 되면 실데이터로 교체.
const TYM = TODAY.slice(0, 7);

function Row({ label, value, tone, strong, hint }: { label: string; value: number; tone?: string; strong?: boolean; hint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: strong ? '11px 0' : '7px 0', borderTop: strong ? `2px solid ${C.line}` : 'none' }}>
      <span style={{ fontSize: strong ? 13.5 : 12.5, fontWeight: strong ? 800 : 500, color: strong ? C.ink : C.mute }}>{label}</span>
      {hint ? <span style={{ fontSize: 11, color: C.faint }}>{hint}</span> : null}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: strong ? 14 : 13, fontWeight: strong ? 800 : 700, color: tone || C.ink, fontVariantNumeric: 'tabular-nums' }}>{won(value)}</span>
    </div>
  );
}

export default function FinancialsPage() {
  const { companyId, scopeAll } = useSession();
  const cashNav = useCashHubNav();
  const { data: [vs = [], cs = [], bank = []], loading } = useEntityLists(['vehicle', 'contract', 'bank_tx']);

  const F = useMemo(() => {
    // 자산
    let carBook = 0, acquisition = 0;
    for (const v of vs) {
      const acq = Number(v.acquisitionPrice) || 0; acquisition += acq;
      if (acq) carBook += computeAssetLedgerEntry({ id: String(v.plate), plate: String(v.plate), model: String(v.carName || ''), status: '운행', purchasePrice: acq, firstRegisteredDate: String(v.firstReg || v.acquisitionDate || '') } as unknown as Vehicle, TODAY).bookValue;
    }
    const recv = selectReceivables(cs, TODAY);
    let receivable = recv.misuActive, deposit = 0;
    for (const c of cs) { const view = computeContractView(c, TODAY); if (!view.ended) deposit += Number(c.deposit) || 0; }
    // 현금 = 계좌별 최신 '잔액' 원자(실제 잔액). 잔액 없으면 순증감 fallback(참고치).
    const byAcct = new Map<string, { date: string; idx: number; bal: number }>();
    let cashIsReal = false;
    bank.forEach((b, i) => {
      if (b.balance == null || b.balance === '') return;
      cashIsReal = true;
      const acct = String(b.account || ''), d = String(b.txDate || ''), cur = byAcct.get(acct);
      if (!cur || d > cur.date || (d === cur.date && i > cur.idx)) byAcct.set(acct, { date: d, idx: i, bal: Number(b.balance) || 0 });
    });
    const cash = cashIsReal
      ? [...byAcct.values()].reduce((s, x) => s + x.bal, 0)
      : bank.reduce((s, b) => s + (Number(b.amount) || 0) - (Number(b.withdraw) || 0), 0);
    // 부채
    let loanRemain = 0;
    for (const v of vs) { const cur = loanSchedule(v).filter((r) => r.ym <= TYM).pop(); loanRemain += cur ? cur.balance : (isCashPurchase(v.loanCashOnly) ? 0 : Number(v.loanPrincipal) || 0); }
    const assets = carBook + receivable + cash;
    const liabilities = loanRemain + deposit;
    const equity = assets - liabilities;
    return { carBook, acquisition, depreciation: acquisition - carBook, receivable, cash, cashIsReal, loanRemain, deposit, assets, liabilities, equity };
  }, [vs, cs, bank]);

  return (
    <FacetPage title="재무상태표" meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${TODAY} 기준 · 계산값`} tools={<WorkbenchBar {...cashNav} />}>
      {loading ? <PageLoading /> : <>
        <Sec id="f-summary" title="요약" desc="자산 = 부채 + 자본 (오늘 기준 · 계산값)">
          <Cards min={140} fit>
            <Metric label="자산 총계" value={won(F.assets)} tone="ink" />
            <Metric label="부채 총계" value={won(F.liabilities)} tone="danger" />
            <Metric label="순자산(자본)" value={won(F.equity)} tone={F.equity >= 0 ? 'ok' : 'danger'} hint={`부채비율 ${F.equity > 0 ? Math.round(F.liabilities / F.equity * 100) : '∞'}%`} />
          </Cards>
        </Sec>
        <Sec id="f-asset" title="자산" desc="회사가 가진 것">
          <Row label="차량 (장부가)" value={F.carBook} hint={`취득 ${won(F.acquisition)} − 감가 ${won(F.depreciation)}`} />
          <Row label="미수금" value={F.receivable} hint="운행중 계약 순미수" />
          <Row label="현금" value={F.cash} hint={F.cashIsReal ? '계좌 최신 잔액(실제)' : '자금원장 순증감(기초잔액 미반영)'} tone={F.cash < 0 ? C.danger : undefined} />
          <Row label="자산 총계" value={F.assets} strong />
        </Sec>
        <Sec id="f-liability" title="부채" desc="갚아야 할 것">
          <Row label="할부·리스 잔여원금" value={F.loanRemain} hint="상환스케줄 계산값" />
          <Row label="보증금 예수" value={F.deposit} hint="손님 보증금(반환 대상)" />
          <Row label="부채 총계" value={F.liabilities} strong tone={C.danger} />
        </Sec>
        <Sec id="f-equity" title="자본" desc="자산 − 부채 = 순자산">
          <Row label="순자산(자본)" value={F.equity} strong tone={F.equity >= 0 ? 'var(--green-text)' : C.danger} />
          <div style={{ marginTop: 10, fontSize: 12, color: C.faint, lineHeight: 1.7 }}>※ {F.cashIsReal ? '현금은 계좌 최신 잔액(실제).' : '현금은 기초잔액 없이 자금원장 순증감이라 참고치.'} 감가(5년 정액·잔존10%)·할부잔여는 계산값 — 실사·상환스케줄표 OCR 시 실데이터로 교체됩니다.</div>
        </Sec>
      </>}
    </FacetPage>
  );
}
