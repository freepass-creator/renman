'use client';

import { useMemo } from 'react';
import { useSession } from '@/lib/session';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx } from '@/lib/section-registry';
import { FacetPage, PageLoading } from '@/components/ui';
import { MySchedule } from '@/components/MySchedule';
import { Agenda } from '@/components/Agenda';

const EMPTY = new Set<string>();

export default function SchedulePage() {
  const { scopeAll } = useSession();
  const { D, contracts, vehicles, insurances, history, bankTx, penalties, inbox, loading } = useDashboardData();
  const ctx = useMemo(
    () => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox }),
    [D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox],
  );

  return (
    <FacetPage title="일정" meta="회사 일정 · 내 업무 일정">
      {loading ? <PageLoading /> : (
        <>
          <Agenda ctx={ctx} facets={EMPTY} />
          <MySchedule />
        </>
      )}
    </FacetPage>
  );
}
