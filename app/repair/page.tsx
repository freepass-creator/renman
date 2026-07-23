'use client';
/**
 * 정비 — 업무 페이지. Sec = section-registry. FacetRail = 데이터 좁히기(secs show/hide 금지).
 */
import { useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx, SECTION_MAP } from '@/lib/section-registry';
import { FacetPage, Sec, Btn, PageLoading, SPACE_M, EmptyState } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { openIngest, openLog } from '@/lib/ui-bus';
import { companyLabel } from '@/lib/companies';
import { useSecOrder } from '@/lib/use-sec-order';

const REPAIR_SECS = ['s-repair', 'a-other'] as const;
const EMPTY = new Set<string>();
const LABEL_TO_SEC: Record<string, string> = { '정비·사고': 's-repair', '기타상태': 'a-other' };

export default function RepairPage() {
  const { companyId, scopeAll } = useSession();
  const { D, contracts, vehicles, insurances, history, bankTx, penalties, inbox, loading } = useDashboardData();
  const ctx = useMemo(
    () => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox }),
    [D, contracts, history, bankTx, scopeAll, vehicles, insurances, penalties, inbox],
  );
  const [facets, setFacets] = useState<Set<string>>(EMPTY);
  const [order, reorder] = useSecOrder('jpk:order:repair', [...REPAIR_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });
  const resetFacets = () => setFacets(new Set());
  // 데이터 좁히기: 선택 칩 → 해당 Sec만. 미선택=전체.
  const wantSecs = facets.size
    ? new Set([...facets].map((l) => LABEL_TO_SEC[l]).filter(Boolean))
    : null;
  const secs = order.filter((id) => SECTION_MAP[id] && (!wantSecs || wantSecs.has(id)));

  return (
    <FacetPage
      title="차량수선"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 정비·사고`}
      tools={
        <WorkbenchBar
          mid={<WorkHubBack />}
          search
          actions={
            <span style={{ display: 'inline-flex', gap: SPACE_M, flexWrap: 'wrap' }}>
              <Btn variant="ghost" onClick={() => openLog()}>메모</Btn>
              <Btn variant="ghost" onClick={() => openIngest('history')}>정비·비용 담기</Btn>
            </span>
          }
        />
      }
      rail={!loading ? <FacetRail lensKey="차량수선" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {loading ? <PageLoading /> : (
        <>
          <Sec id="repair-quick" title="빠른 입력" desc="정비·사고·부품 — 이력(이벤트)">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
              <Btn variant="ghost" onClick={() => openIngest('history')}>정비·점검 담기</Btn>
              <Btn variant="ghost" onClick={() => openLog()}>QuickLog</Btn>
            </div>
          </Sec>
          {secs.map((id) => {
            const def = SECTION_MAP[id];
            if (!def) return null;
            // section-registry 렌더는 자체 Sec — 접힌 상태 DnD를 위해 래퍼에 id·onReorder 전달은 레지스트리 쪽.
            // 페이지 순서만 useSecOrder로 제어.
            return <div key={id} data-sec={id} style={{ order: order.indexOf(id) }}>{def.render(ctx, { onReorder: reorder })}</div>;
          })}
          {secs.length === 0 && (
            <EmptyState variant="sec">선택한 구분에 해당하는 섹션이 없습니다.</EmptyState>
          )}
        </>
      )}
    </FacetPage>
  );
}
