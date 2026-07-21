'use client';
/**
 * 마이페이지 (내 업무) — 탭: 일정 · 업무.
 *   · 일정 = 회사 일정(Agenda) + 내 일정(MySchedule)을 Sec으로 한 화면(서브탭 금지).
 *   · 업무 = MyDesk. FacetRail은 탭과 무관하게 상시(렌즈만 일정/마이 전환).
 *   셸 = 홈과 동일(FacetPage·WorkbenchBar·FacetRail).
 */
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx } from '@/lib/section-registry';
import { FacetPage, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { MySchedule } from '@/components/MySchedule';
import { MyDesk } from '@/components/MyDesk';
import { Agenda } from '@/components/Agenda';
import { UploadSection } from '@/components/UploadSection';

type Tab = '일정' | '업무';
const EMPTY = new Set<string>();

export default function MyPage() {
  const { scopeAll } = useSession();
  const { D, contracts, vehicles, insurances, history, bankTx, penalties, inbox, loading } = useDashboardData();
  const ctx = useMemo(() => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox }), [D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox]);
  const [tab, setTab] = useState<Tab>('업무');
  const [facetSel, setFacetSel] = useState<Record<string, Set<string>>>({});
  const lensKey = tab === '업무' ? '마이' : '일정';
  const facets = facetSel[lensKey] || EMPTY;
  const toggleFacet = (label: string) => setFacetSel((m) => {
    const cur = new Set(m[lensKey] || []);
    if (cur.has(label)) cur.delete(label); else cur.add(label);
    return { ...m, [lensKey]: cur };
  });
  const resetFacets = () => setFacetSel((m) => ({ ...m, [lensKey]: new Set() }));

  return (
    <FacetPage
      title="마이페이지"
      tools={
        <WorkbenchBar
          tabs={[{ key: '일정', label: '일정' }, { key: '업무', label: '업무' }]}
          tab={tab}
          onTab={(k) => setTab(k as Tab)}
          search
        />
      }
      rail={!loading ? <FacetRail lensKey={lensKey} facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {!loading && <UploadSection />}
      {loading ? <PageLoading />
        : tab === '업무' ? <MyDesk ctx={ctx} facets={facets} />
          : (
            <>
              <Agenda ctx={ctx} facets={facets} />
              <MySchedule />
            </>
          )}
    </FacetPage>
  );
}
