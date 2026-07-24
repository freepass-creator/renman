'use client';
/**
 * WebPage — PageDef 웹 렌더러 (설계서 §4.3). 현재 E-grid(현황 그리드) 구현.
 *   운영시트 표준 프레임: FacetPage(frame) + WorkbenchBar(보기 탭·요약·구간·CSV) + FacetRail + ExcelSheet.
 *   기존 app/sheet/page.tsx의 상태·조립을 def 기반으로 일반화 — 화면·동작 동일.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Download } from 'lucide-react';
import { FacetPage, ExcelSheet, Btn, EmptyState, PageLoading, C, type SheetCol } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { downloadCsv } from '@/lib/export-csv';
import type { PageDef } from '@/lib/pagedef/types';

const MONTH_INPUT: CSSProperties = { height: 32, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 7, padding: '0 6px', fontSize: 12, background: 'var(--bg-card)', color: 'inherit', fontFamily: 'inherit' };

export function WebPage<R>({ def }: { def: PageDef<R> }) {
  if (def.archetype === 'E-grid') return <EGrid def={def} />;
  return <EmptyState>렌더러 준비중: {def.archetype}</EmptyState>;
}

function EGrid<R>({ def }: { def: PageDef<R> }) {
  const { rows: allRows, loading } = def.useData();
  const colSets = def.colSets ?? [];
  const [view, setView] = useState<string>(colSets[0]?.key ?? '');
  const [fromM, setFromM] = useState('');
  const [toM, setToM] = useState('');
  const [facets, setFacets] = useState<Set<string>>(new Set(def.facetDefault ?? []));
  const radio = def.radioKeys ?? [];

  const toggleFacet = (label: string) => setFacets((s) => {
    const n = new Set(s);
    if (radio.includes(label)) { radio.forEach((o) => n.delete(o)); n.add(label); }
    else { n.has(label) ? n.delete(label) : n.add(label); }
    return n;
  });
  const resetFacets = () => setFacets(new Set(def.facetDefault ?? []));

  const rows = useMemo(() => {
    const f = def.filter;
    const arr = f ? allRows.filter((r) => f(r, facets, { from: fromM, to: toM })) : allRows;
    return def.sort ? [...arr].sort(def.sort) : arr;
  }, [allRows, facets, fromM, toM]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => (def.counts ? def.counts(allRows) : {}), [allRows]); // eslint-disable-line react-hooks/exhaustive-deps

  // 기본뷰: 기본 컬럼 + 켜진 facet 대응 열 자동 노출. 그 외 뷰: 해당 콜셋 그대로.
  const cols = useMemo(() => {
    const first = colSets[0];
    const base = colSets.find((c) => c.key === view)?.cols ?? first?.cols ?? [];
    if (!first || view !== first.key || !def.revealCols) return base;
    const seen = new Set(base.map((c) => c.key));
    const extra: SheetCol<R>[] = [];
    for (const label of facets) for (const c of (def.revealCols[label] || [])) if (!seen.has(c.key)) { seen.add(c.key); extra.push(c); }
    return [...base, ...extra];
  }, [view, facets]); // eslint-disable-line react-hooks/exhaustive-deps

  const [shown, setShown] = useState<R[]>([]);
  useEffect(() => { setShown(rows); }, [rows]);

  const tabs = colSets.map((c) => ({ key: c.key, label: c.label }));
  const exportCsv = () => downloadCsv(def.csvName?.(view) ?? def.title, cols.map((c) => c.label), shown.map((r) => cols.map((c) => (c.text ? c.text(r) : ''))));

  const toneColor = (t?: string) => (t === 'danger' ? C.danger : t === 'ok' ? C.ok : t === 'warn' ? C.warn : undefined);
  const mid = def.summary && def.summary.length ? (
    <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
      {def.summary.map((s) => ((s.show ? s.show(shown) : true)
        ? <span key={s.key}>{s.label} <b style={{ color: toneColor(s.tone) }}>{s.value(shown)}</b></span>
        : null))}
    </span>
  ) : undefined;

  return (
    <FacetPage
      frame
      title={def.title}
      tools={
        <WorkbenchBar
          tabs={tabs}
          tab={view}
          onTab={(k) => setView(k as string)}
          mid={mid}
          search={false}
          actions={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {def.period === 'month' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="계약기간이 이 구간과 겹치는 항목만 표시">
                  <input type="month" value={fromM} max={toM || undefined} onChange={(e) => setFromM(e.target.value)} style={MONTH_INPUT} aria-label="기간 시작월" />
                  <span style={{ color: C.faint, fontSize: 12 }}>~</span>
                  <input type="month" value={toM} min={fromM || undefined} onChange={(e) => setToM(e.target.value)} style={MONTH_INPUT} aria-label="기간 종료월" />
                  {(fromM || toM) && <Btn variant="ghost" size="sm" onClick={() => { setFromM(''); setToM(''); }}>전체</Btn>}
                </span>
              )}
              {def.csvName && <Btn variant="ghost" onClick={exportCsv} disabled={!shown.length}><Download size={15} /></Btn>}
            </span>
          }
        />
      }
      rail={!loading && def.lensKey ? <FacetRail lensKey={def.lensKey} facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      {loading ? <PageLoading />
        : !rows.length ? <EmptyState>표시할 항목이 없습니다</EmptyState>
          : <ExcelSheet cols={cols} rows={rows} rowKey={def.rowKey} onRow={def.drill} onFiltered={setShown} />}
    </FacetPage>
  );
}
