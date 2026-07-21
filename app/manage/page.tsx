'use client';
import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { computeKPI, kpiByCompany } from '@/lib/kpi';
import { Page, Sec, Cards, Metric, won, C, th, thR, td, tdR, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { useCashHubNav } from '@/components/CashHubTabs';
import { COMPANIES, companyLabel } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';

const AGING_LABELS = ['0~30일', '31~60일', '61~90일', '90일+'];
const AGING_COLORS = ['var(--green-text)', C.warn, C.warn, 'var(--red-text)'];

// 경영 현황 = 경영진용 분석 화면(실무 콕핏과 분리). 가동률·미수 aging·부채·법인별 비교. 허브=홈과 동일(메뉴·탭).
export default function ManagePage() {
  const { companyId, scopeAll } = useSession();
  const cashNav = useCashHubNav();
  const { data: [contracts = [], vehicles = []], loading } = useEntityLists(['contract', 'vehicle']);
  const total = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const byCo = useMemo(() => (scopeAll ? kpiByCompany(contracts, vehicles, TODAY, COMPANIES) : []), [contracts, vehicles, scopeAll]);
  const agingMax = Math.max(1, ...total.aging);

  return (
    <Page title={`경영 현황 · ${scopeAll ? '전체 법인' : companyLabel(companyId)}`} tools={<WorkbenchBar {...cashNav} />}>
      {loading ? <PageLoading /> : <>
        <Sec title="핵심 지표">
          <Cards min={150}>
            <Metric label="가동률" value={`${total.util}%`} hint="운행÷보유" tone={total.util >= 85 ? 'ok' : total.util >= 60 ? 'warn' : 'danger'} />
            <Metric label="운행 / 보유" value={`${total.running} / ${total.totalVehicles}`} hint="계약 파생" />
            <Metric label="진행 계약" value={total.activeContracts} />
            <Metric label="월 청구액" value={won(total.monthlyBilled)} />
            <Metric label="총 미수" value={won(total.totalUnpaid)} hint="운행+반납" tone={total.totalUnpaid > 0 ? 'danger' : 'ink'} />
            <Metric label="운행중 미수" value={won(total.misuActive)} hint="운행중만" tone={total.misuActive > 0 ? 'danger' : 'ink'} />
            <Metric label="반납 미수" value={won(total.misuReturned)} hint="종료 후" tone={total.misuReturned > 0 ? 'warn' : 'ink'} />
            <Metric label="미수 고객" value={total.unpaidCount} tone={total.unpaidCount > 0 ? 'warn' : 'ink'} />
            <Metric label="만기 임박(30일)" value={total.expiring30} hint="계약 만기" tone={total.expiring30 > 0 ? 'warn' : 'ink'} />
            <Metric label="자산(매입가)" value={won(total.assetValue)} />
            <Metric label="부채(할부잔여)" value={won(total.loanRemaining)} />
            <Metric label="부채비율" value={`${total.debtRatio}%`} hint="할부÷매입가" tone={total.debtRatio > 80 ? 'danger' : total.debtRatio > 50 ? 'warn' : 'ok'} />
          </Cards>
        </Sec>

        <Sec title="미수 채권 aging" desc="연체 경과별 미수 분포">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {total.aging.map((amt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 66, flex: '0 0 66px', fontSize: 12, color: C.mute }}>{AGING_LABELS[i]}</span>
                <div style={{ flex: 1, height: 18, background: 'var(--bg-stripe)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((amt / agingMax) * 100)}%`, height: '100%', background: AGING_COLORS[i], transition: 'width .3s' }} />
                </div>
                <span style={{ width: 130, flex: '0 0 130px', textAlign: 'right', fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{won(amt)}</span>
              </div>
            ))}
          </div>
        </Sec>

        {byCo.length > 0 && (
          <Sec title="법인별 비교" desc="멀티법인 한눈에">
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                <thead><tr><th style={th}>법인</th><th style={thR}>보유</th><th style={thR}>운행</th><th style={thR}>가동률</th><th style={thR}>진행계약</th><th style={thR}>월청구</th><th style={thR}>총미수</th><th style={thR}>부채비율</th></tr></thead>
                <tbody>{byCo.map((k) => (
                  <tr key={k.companyId}>
                    <td style={td}>{companyLabel(k.companyId)}</td>
                    <td style={tdR}>{k.totalVehicles}</td>
                    <td style={tdR}>{k.running}</td>
                    <td style={tdR}>{k.util}%</td>
                    <td style={tdR}>{k.activeContracts}</td>
                    <td style={tdR}>{won(k.monthlyBilled)}</td>
                    <td style={tdR}>{k.totalUnpaid > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(k.totalUnpaid)}</span> : '—'}</td>
                    <td style={tdR}>{k.debtRatio}%</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Sec>
        )}
      </>}
    </Page>
  );
}
