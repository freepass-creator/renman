'use client';
/**
 * 운영시트 — 차량 1대 = 1행 통합 마스터(엑셀 전용, 웹 데스크톱).
 * 한 줄에 자산 + (활성)계약/손님 + 미수. [기본]↔[전체] = 기본 열 그대로 + 부가 열이 우측에 쭉.
 * 좌측 사이드필터(FacetRail) 상시 — 기본 '보유' 선택(매각/처분은 명시 선택 시). 헤더 자동필터도 병행.
 * 행 클릭 → 차량360. 금액·상태·미수는 computeContractView/linkFleet 파생(재계산 손롤 금지).
 *   열 문법 = lib/sheet-cols SSOT(FLEET_BASIC_COLS/FLEET_EXPANDED_COLS).
 */
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { companyLabel } from '@/lib/companies';
import { useSession } from '@/lib/session';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS, FLEET_REVEAL_COLS } from '@/lib/sheet-cols';
import type { SheetCol } from '@/components/ui';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { FacetPage, ExcelSheet, Btn, EmptyState, PageLoading, won, C } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type View = '기본' | '전체';
const VIEWS: View[] = ['기본', '전체'];

export default function SheetPage() {
  const { companyId, scopeAll } = useSession();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [q, setQ] = useState('');
  const [view, setView] = useState<View>('기본');
  const [facets, setFacets] = useState<Set<string>>(new Set(['보유'])); // 기본: 보유차량만
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);
  const allRows = useMemo(() => buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY), [fleet, ins, hs]);

  const rows = useMemo(() => {
    const bo = ['보유', '매각'].filter((x) => facets.has(x));
    const util = ['운행', '휴차', '정비'].filter((x) => facets.has(x));
    const misu = ['미수있음', '연체90일+'].filter((x) => facets.has(x));
    const due = ['검사임박', '보험임박'].filter((x) => facets.has(x));
    const debt = ['할부있음', '보험없음'].filter((x) => facets.has(x));
    const warn = ['경고있음', '위험만'].filter((x) => facets.has(x));
    return allRows.filter((r) => {
      const held = r.ownership !== '처분완료';
      if (bo.length && !((bo.includes('보유') && held) || (bo.includes('매각') && !held))) return false;
      if (util.length && !util.includes(r.util)) return false;
      if (misu.length && !((misu.includes('미수있음') && r.net > 0) || (misu.includes('연체90일+') && r.overdueDays >= 90))) return false;
      if (due.length) {
        const insp = dday(r.inspectionTo), insE = dday(r.insEnd);
        if (!((due.includes('검사임박') && insp != null && insp <= 30) || (due.includes('보험임박') && insE != null && insE <= 30))) return false;
      }
      if (debt.length && !((debt.includes('할부있음') && r.loanCompany && r.loanCompany !== '현금') || (debt.includes('보험없음') && !r.insurer))) return false;
      if (warn.length && !((warn.includes('경고있음') && r.warnings.length > 0) || (warn.includes('위험만') && r.warnings.some((w) => w.sev === 'high')))) return false;
      if (q.trim() && !textMatch(q, r.plate, r.carName, r.customer, r.company, r.status, r.loanCompany, r.insurer, r.phone)) return false;
      return true;
    });
  }, [allRows, facets, q]);

  // 칩별 매칭 건수(erp3식 '라벨(N)') — 전체 데이터 정적 집계(교차필터 아님). 필터 술어와 동일 기준.
  const counts = useMemo(() => {
    const c: Record<string, number> = { 보유: 0, 매각: 0, 운행: 0, 휴차: 0, 정비: 0, 경고있음: 0, 위험만: 0, 미수있음: 0, '연체90일+': 0, 검사임박: 0, 보험임박: 0, 할부있음: 0, 보험없음: 0 };
    for (const r of allRows) {
      if (r.ownership !== '처분완료') c['보유']++; else c['매각']++;
      if (c[r.util] != null) c[r.util]++;
      if (r.warnings.length > 0) c['경고있음']++;
      if (r.warnings.some((w) => w.sev === 'high')) c['위험만']++;
      if (r.net > 0) c['미수있음']++;
      if (r.overdueDays >= 90) c['연체90일+']++;
      const insp = dday(r.inspectionTo); if (insp != null && insp <= 30) c['검사임박']++;
      const insE = dday(r.insEnd); if (insE != null && insE <= 30) c['보험임박']++;
      if (r.loanCompany && r.loanCompany !== '현금') c['할부있음']++;
      if (!r.insurer) c['보험없음']++;
    }
    return c;
  }, [allRows]);

  // 기본뷰: 기본 컬럼 + «켜진 필터»에 대응하는 컬럼을 우측에 자동 노출(값 보며 거르기). 전체뷰: 전 컬럼.
  const cols = useMemo(() => {
    if (view === '전체') return FLEET_EXPANDED_COLS;
    const seen = new Set(FLEET_BASIC_COLS.map((c) => c.key));
    const extra: SheetCol<FleetRow>[] = [];
    for (const label of facets) for (const c of (FLEET_REVEAL_COLS[label] || [])) if (!seen.has(c.key)) { seen.add(c.key); extra.push(c); }
    return [...FLEET_BASIC_COLS, ...extra];
  }, [view, facets]);

  // 헤더 필터 결과를 받아 건수·미수합계·CSV에 쓴다(페이지 재계산 금지).
  const [shown, setShown] = useState<FleetRow[]>([]);
  useEffect(() => { setShown(rows); }, [rows]);
  const netTotal = shown.reduce((s, r) => s + Math.max(0, r.net), 0);

  const exportCsv = () => {
    downloadCsv(`운영시트_${view}_${TODAY}`, cols.map((c) => c.label), shown.map((r) => cols.map((c) => (c.text ? c.text(r) : ''))));
  };

  return (
    <FacetPage
      title="운영시트"
      tools={
        <WorkbenchBar
          tabs={VIEWS.map((v) => ({ key: v, label: v }))}
          tab={view}
          onTab={(k) => setView(k as View)}
          /* 대수·미수는 탭이 바꾼 결과라 탭 바로 뒤(mid)에 붙여야 읽힌다. */
          mid={<span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>{`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${shown.length}대${netTotal > 0 ? ` · 미수 ${won(netTotal)}` : ''}`}</span>}
          search={{ value: q, onChange: setQ, placeholder: '차번·차명·계약자·할부사·보험사' }}
          actions={<Btn variant="ghost" onClick={exportCsv} disabled={!shown.length}><Download size={15} /></Btn>}
        />
      }
      rail={!loading ? <FacetRail lensKey="운영시트" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      {loading ? <PageLoading />
        : !rows.length ? <EmptyState>표시할 차량이 없습니다</EmptyState>
          : <ExcelSheet cols={cols} rows={rows} rowKey={(r) => r.plate} onRow={(r) => openCar(r.plate)} onFiltered={setShown} />}
    </FacetPage>
  );
}
