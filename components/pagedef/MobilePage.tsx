'use client';
/**
 * MobilePage — PageDef 모바일 렌더러 (설계서 §4.3). 현재 E-grid.
 *   MHead + 2×2 지표 + 상태그룹 Rows/ObjRow 리스트. 같은 def를 WebPage와 공유(웹=그리드/모바일=행).
 *   기본 facet(예: 보유)만 적용 — 상세 필터(FilterSheet)는 P2.
 */
import { useMemo } from 'react';
import { Metric, Rows, ObjRow, EmptyState, PageLoading } from '@/components/ui';
import { MHead } from '@/components/m/MHead';
import type { PageDef } from '@/lib/pagedef/types';

export function MobilePage<R>({ def, tabColor }: { def: PageDef<R>; tabColor?: string }) {
  if (def.archetype === 'E-grid') return <MGrid def={def} tabColor={tabColor} />;
  return (
    <>
      <MHead title={def.title} color={tabColor} />
      <div style={{ padding: '40px 16px' }}><EmptyState>렌더러 준비중: {def.archetype}</EmptyState></div>
    </>
  );
}

function MGrid<R>({ def, tabColor }: { def: PageDef<R>; tabColor?: string }) {
  const { rows: allRows, loading } = def.useData();
  const facets = useMemo(() => new Set(def.facetDefault ?? []), [def.facetDefault]);
  const rows = useMemo(() => {
    const f = def.filter;
    const arr = f ? allRows.filter((r) => f(r, facets, { from: '', to: '' })) : allRows;
    return def.sort ? [...arr].sort(def.sort) : arr;
  }, [allRows, facets, def.filter, def.sort]);

  const groups = def.groups ?? [];
  const drill = def.drill;
  const renderRow = (r: R) => {
    const p = def.row ? def.row(r) : {};
    return <ObjRow key={def.rowKey(r)} {...p} onClick={drill ? () => drill(r) : undefined} />;
  };

  return (
    <>
      <MHead title={def.title} sub="전체 회사" color={tabColor} />
      {loading ? <PageLoading />
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {def.summary && def.summary.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {def.summary.map((s) => <Metric key={s.key} label={s.label} value={s.value(rows)} tone={s.tone} />)}
              </div>
            )}
            {!rows.length ? <EmptyState variant="sec">표시할 항목이 없습니다</EmptyState>
              : groups.length ? groups.map((g) => {
                const gr = rows.filter(g.match);
                if (!gr.length) return null;
                return <Rows key={g.key} title={g.label} tone={g.tone} n={gr.length} collapsible id={`ops-${g.key}`}>{gr.map(renderRow)}</Rows>;
              })
                : <Rows>{rows.map(renderRow)}</Rows>}
          </div>
        )}
    </>
  );
}
