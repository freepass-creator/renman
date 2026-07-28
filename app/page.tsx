'use client';
/**
 * 대시보드 — 관제 콕핏(② 지표).
 * KPI 타일 + 법인별 요약. 엑셀 예외 원장·Facet·PageLoading 금지. soft-fill만.
 * 월별 추이 SSOT 없음 → 생략.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  Page, Sec, Cards, Metric, Btn, ExcelSheet, EmptyState, won,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openIngest } from '@/lib/ui-bus';
import {
  DASHBOARD_CO_COLS,
  dashboardCompanyRows,
  dashboardTotalKpi,
  softVal,
  thisMonthOperatingProfit,
} from '@/lib/home-kpi';

export default function DashboardPage() {
  const router = useRouter();
  const { data: [contracts = [], vehicles = [], bankTx = [], cardTx = []], loading } = useEntityLists([
    'contract', 'vehicle', 'bank_tx', 'card_tx',
  ]);

  const kpi = useMemo(() => dashboardTotalKpi(contracts, vehicles, TODAY), [contracts, vehicles]);
  const byCo = useMemo(() => dashboardCompanyRows(contracts, vehicles, TODAY), [contracts, vehicles]);
  const monthPnL = useMemo(
    () => thisMonthOperatingProfit(bankTx, cardTx, TODAY),
    [bankTx, cardTx],
  );

  const go = (href: string) => router.push(href);

  return (
    <Page
      title="대시보드"
      meta="관제"
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터센터" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
    >
      <Sec id="dash-kpi" title="한눈" desc="클릭 → 원장·리스크">
        <Cards min={140} fit>
          <Metric
            label="보유"
            value={softVal(loading, `${kpi.totalVehicles}대`)}
            hint={loading ? undefined : `가동률 ${kpi.util}% · 운행 ${kpi.running}`}
            tone={!loading && kpi.util >= 70 ? 'ok' : !loading && kpi.util < 50 ? 'warn' : 'ink'}
            onClick={() => go('/status')}
          />
          <Metric
            label="운행중 미수"
            value={softVal(loading, won(kpi.misuActive))}
            hint={loading ? undefined : `${kpi.misuActive > 0 ? '회수 필요' : '이상 없음'}`}
            tone={!loading && kpi.misuActive > 0 ? 'danger' : 'ink'}
            onClick={() => go('/risk')}
          />
          <Metric
            label="휴차"
            value={softVal(loading, kpi.idle)}
            hint={loading ? undefined : '보유 중 미가동'}
            tone={!loading && kpi.idle ? 'warn' : 'ink'}
            onClick={() => go('/risk')}
          />
          <Metric
            label="이번달 손익"
            value={softVal(loading, won(monthPnL))}
            hint={loading ? undefined : '영업수입−영업비용'}
            tone={!loading && monthPnL < 0 ? 'danger' : !loading && monthPnL > 0 ? 'ok' : 'ink'}
            onClick={() => go('/cash')}
          />
        </Cards>
      </Sec>

      <Sec id="dash-co" title="법인별" desc="보유 · 가동 · 미수">
        {loading ? (
          <EmptyState variant="sec">법인 요약 불러오는 중…</EmptyState>
        ) : byCo.length === 0 ? (
          <EmptyState variant="sec">표시할 법인이 없습니다</EmptyState>
        ) : (
          <ExcelSheet
            cols={DASHBOARD_CO_COLS}
            rows={byCo}
            rowKey={(k) => k.companyId}
          />
        )}
      </Sec>
    </Page>
  );
}
