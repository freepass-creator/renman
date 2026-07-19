'use client';
/**
 * 정비 — 업무 페이지. Sec = section-registry(정비·사고).
 */
import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx, SECTION_MAP } from '@/lib/section-registry';
import { FacetPage, Sec, Btn, PageLoading, SPACE_M, EmptyState } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { openIngest, openLog } from '@/lib/ui-bus';
import { companyLabel } from '@/lib/companies';

const REPAIR_SECS = ['s-repair', 'a-other'] as const;

export default function RepairPage() {
  const { companyId, scopeAll } = useSession();
  const { D, contracts, vehicles, insurances, history, bankTx, penalties, inbox, loading } = useDashboardData();
  const ctx = useMemo(
    () => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox }),
    [D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox],
  );

  return (
    <FacetPage
      title="정비관리"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 정비·사고`}
      tools={
        <WorkbenchBar
          mid={<WorkHubBack />}
          actions={
            <span style={{ display: 'inline-flex', gap: SPACE_M, flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => openLog()}>메모</Btn>
              <Btn variant="ghost" onClick={() => openIngest('history')}>정비·비용 담기</Btn>
            </span>
          }
        />
      }
    >
      {loading ? <PageLoading /> : (
        <>
          <Sec title="빠른 입력" desc="정비·사고·부품 — 이력(이벤트)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
              <Btn variant="ghost" onClick={() => openIngest('history')}>정비·점검 담기</Btn>
              <Btn variant="ghost" onClick={() => openLog()}>QuickLog</Btn>
            </div>
          </Sec>
          {REPAIR_SECS.map((id) => {
            const def = SECTION_MAP[id];
            if (!def) return null;
            return <div key={id}>{def.render(ctx, {})}</div>;
          })}
          {!REPAIR_SECS.some((id) => SECTION_MAP[id]) && (
            <EmptyState>정비 섹션이 없습니다.</EmptyState>
          )}
        </>
      )}
    </FacetPage>
  );
}
