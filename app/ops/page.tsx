'use client';
/**
 * 마이페이지 (내 업무) — 탭: 일정 · 업무.
 *   · 일정 = 회사 일정(Agenda, 홈과 동일 SSOT) + 내 일정(MySchedule, 개인 메모).
 *   · 업무 = 내가 고른 섹션(MyDesk). 홈 미결과 같은 section-registry.
 *   설정에서 초기 화면으로 지정 가능.
 *   모바일=업로드 최상단 재배치만. 셸은 홈과 동일(FacetPage·WorkbenchBar·FacetRail).
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
type SchedScope = '회사' | '나';

export default function MyPage() {
  const { scopeAll } = useSession();
  const { D, contracts, vehicles, insurances, history, bankTx, penalties, inbox, loading } = useDashboardData();
  const ctx = useMemo(() => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox }), [D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox]);
  const [tab, setTab] = useState<Tab>('업무');
  const [schedScope, setSchedScope] = useState<SchedScope>('회사');
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  const isWork = tab === '업무';
  const isCompanySched = tab === '일정' && schedScope === '회사';

  const rail = !loading
    ? isWork ? <FacetRail lensKey="마이" facets={facets} onToggle={toggleFacet} onReset={resetFacets} />
      : isCompanySched ? <FacetRail lensKey="일정" facets={facets} onToggle={toggleFacet} onReset={resetFacets} />
        : null
    : null;

  return (
    <FacetPage
      title="마이페이지"
      tools={
        <WorkbenchBar
          tabs={[{ key: '일정', label: '일정' }, { key: '업무', label: '업무' }]}
          tab={tab}
          onTab={(k) => setTab(k as Tab)}
          subTabs={tab === '일정' ? [{ key: '회사', label: '회사' }, { key: '나', label: '내 일정' }] : undefined}
          subTab={schedScope}
          onSubTab={(k) => setSchedScope(k as SchedScope)}
          search
        />
      }
      rail={rail}
    >
      {!loading && <UploadSection />}
      {loading ? <PageLoading />
        : isWork ? <MyDesk ctx={ctx} facets={facets} />
          : isCompanySched ? <Agenda ctx={ctx} facets={facets} />
            : <MySchedule />}
    </FacetPage>
  );
}
