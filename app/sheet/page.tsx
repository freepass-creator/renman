'use client';
/**
 * 운영시트 — 차량 1대 = 1행 통합 마스터(엑셀 전용, 웹 데스크톱).
 * 한 줄에 자산 + (활성)계약/손님 + 미수. [기본]↔[전체] = 기본 열 그대로 + 부가 열이 우측에 쭉.
 * 좌측 사이드필터(FacetRail) 상시 — 기본 '보유' 선택(매각/처분은 명시 선택 시). 헤더 자동필터도 병행.
 * 행 클릭 → 차량360. 금액·상태·미수는 computeContractView/linkFleet 파생(재계산 손롤 금지).
 *   열 문법 = lib/sheet-cols SSOT(FLEET_BASIC_COLS/FLEET_EXPANDED_COLS).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Download } from 'lucide-react';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS, FLEET_REVEAL_COLS } from '@/lib/sheet-cols';
import type { SheetCol } from '@/components/ui';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { FacetPage, ExcelSheet, Btn, EmptyState, PageLoading, won, C } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type View = '기본' | '상세';
const VIEWS: View[] = ['기본', '상세'];
// 기간(월) 구간 선택 입력 — 툴바 컨트롤 높이(32) 규격.
const MONTH_INPUT: CSSProperties = { height: 32, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 7, padding: '0 6px', fontSize: 12, background: 'var(--bg-card)', color: 'inherit', fontFamily: 'inherit' };
// 기본 정렬 우선순위(사장님 지정): 인도예정 > 만기경과 > 휴차 > 마감임박 > 운행중 > 정비 등 > 처분.
function statusRank(r: FleetRow): number {
  if (r.ownership === '처분완료') return 8;
  if (r.ownership === '처분예정') return 7;
  if (r.ownership === '구매예정' || r.ownership === '등록예정') return 0;  // 인도(입고)예정
  if (r.dday != null && r.dday < 0) return 1;                             // 만기경과(반납지남)
  if (r.util === '휴차') return 2;                                        // 휴차
  if (r.dday != null && r.dday >= 0 && r.dday <= 30) return 3;            // 마감임박(만기임박)
  if (r.util === '운행') return 4;                                        // 운행중
  return 5;                                                                // 정비 등 기타
}

export default function SheetPage() {
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [view, setView] = useState<View>('기본');
  const [fromM, setFromM] = useState('');  // 기간뷰 시작월(YYYY-MM, 빈값=무제한)
  const [toM, setToM] = useState('');      // 기간뷰 종료월
  const [facets, setFacets] = useState<Set<string>>(new Set(['보유'])); // 기본: 보유차량만(단일선택 라디오의 기본 눌린 값)
  // 보유/전체/매각 = 단일선택(라디오) — 하나만. 나머지 칩은 다중 토글.
  const OWN = ['보유', '전체', '매각'];
  const toggleFacet = (label: string) => setFacets((s) => {
    const n = new Set(s);
    if (OWN.includes(label)) { OWN.forEach((o) => n.delete(o)); n.add(label); }
    else { n.has(label) ? n.delete(label) : n.add(label); }
    return n;
  });
  const resetFacets = () => setFacets(new Set(['보유']));   // 초기화 = 기본(보유)

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);
  const allRows = useMemo(() => buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY), [fleet, ins, hs]);

  const rows = useMemo(() => {
    const util = ['운행', '휴차', '정비'].filter((x) => facets.has(x));
    const misu = ['미수있음', '연체90일+'].filter((x) => facets.has(x));
    const due = ['검사임박', '보험임박'].filter((x) => facets.has(x));
    const debt = ['할부있음', '보험없음'].filter((x) => facets.has(x));
    const warn = ['경고있음', '위험만'].filter((x) => facets.has(x));
    const ct = ['만기임박', '반납지남', '계약없음'].filter((x) => facets.has(x));
    return allRows.filter((r) => {
      const held = r.ownership !== '처분완료';
      // 보유(기본·미선택 포함)=처분완료 제외 · 전체=전부 · 매각=처분완료만.
      if (facets.has('전체')) { /* 전부 표시 */ }
      else if (facets.has('매각')) { if (held) return false; }
      else if (!held) return false;
      if (util.length && !util.includes(r.util)) return false;
      if (misu.length && !((misu.includes('미수있음') && r.net > 0) || (misu.includes('연체90일+') && r.overdueDays >= 90))) return false;
      if (due.length) {
        const insp = dday(r.inspectionTo), insE = dday(r.insEnd);
        if (!((due.includes('검사임박') && insp != null && insp <= 30) || (due.includes('보험임박') && insE != null && insE <= 30))) return false;
      }
      if (debt.length && !((debt.includes('할부있음') && r.loanCompany && r.loanCompany !== '현금') || (debt.includes('보험없음') && !r.insurer))) return false;
      if (warn.length && !((warn.includes('경고있음') && r.warnings.length > 0) || (warn.includes('위험만') && r.warnings.some((w) => w.sev === 'high')))) return false;
      if (ct.length && !(
        (ct.includes('만기임박') && r.dday != null && r.dday >= 0 && r.dday <= 30)
        || (ct.includes('반납지남') && r.dday != null && r.dday < 0)
        || (ct.includes('계약없음') && !r.customer)
      )) return false;
      // 기간(월) 구간뷰 — 계약기간[시작,만기]이 [fromM,toM]과 겹치는 차량만(계약 없으면 제외).
      if (fromM || toM) {
        const s = r.start.slice(0, 7), e = r.end.slice(0, 7);
        if (!s) return false;                       // 계약 없음 → 기간뷰 제외
        if (toM && s > toM) return false;            // 계약 시작이 구간보다 뒤
        if (fromM && e && e < fromM) return false;   // 계약 만기가 구간보다 앞(만기 없으면 진행중 통과)
      }
      return true;
    }).sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [allRows, facets, fromM, toM]);

  // 칩별 매칭 건수(erp3식 '라벨(N)') — 전체 데이터 정적 집계(교차필터 아님). 필터 술어와 동일 기준.
  const counts = useMemo(() => {
    const c: Record<string, number> = { 보유: 0, 전체: 0, 매각: 0, 운행: 0, 휴차: 0, 정비: 0, 만기임박: 0, 반납지남: 0, 계약없음: 0, 경고있음: 0, 위험만: 0, 미수있음: 0, '연체90일+': 0, 검사임박: 0, 보험임박: 0, 할부있음: 0, 보험없음: 0 };
    for (const r of allRows) {
      c['전체']++;
      if (r.ownership !== '처분완료') c['보유']++; else c['매각']++;
      if (c[r.util] != null) c[r.util]++;
      if (r.dday != null && r.dday >= 0 && r.dday <= 30) c['만기임박']++;
      if (r.dday != null && r.dday < 0) c['반납지남']++;
      if (!r.customer && r.ownership !== '처분완료' && r.status !== '차량없음') c['계약없음']++;
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
    if (view === '상세') return FLEET_EXPANDED_COLS;
    const seen = new Set(FLEET_BASIC_COLS.map((c) => c.key));
    const extra: SheetCol<FleetRow>[] = [];
    for (const label of facets) for (const c of (FLEET_REVEAL_COLS[label] || [])) if (!seen.has(c.key)) { seen.add(c.key); extra.push(c); }
    return [...FLEET_BASIC_COLS, ...extra];
  }, [view, facets]);

  // 헤더 필터 결과를 받아 건수·미수합계·CSV에 쓴다(페이지 재계산 금지).
  const [shown, setShown] = useState<FleetRow[]>([]);
  useEffect(() => { setShown(rows); }, [rows]);
  const netTotal = shown.reduce((s, r) => s + Math.max(0, r.net), 0);
  const heldCnt = shown.reduce((n, r) => n + (r.ownership !== '처분완료' ? 1 : 0), 0);   // 보유대수
  const idleCnt = shown.reduce((n, r) => n + (r.util === '휴차' ? 1 : 0), 0);            // 휴차

  const exportCsv = () => {
    downloadCsv(`운영시트_${view}_${TODAY}`, cols.map((c) => c.label), shown.map((r) => cols.map((c) => (c.text ? c.text(r) : ''))));
  };

  return (
    <FacetPage
      frame
      title="운영시트"
      tools={
        <WorkbenchBar
          tabs={VIEWS.map((v) => ({ key: v, label: v }))}
          tab={view}
          onTab={(k) => setView(k as View)}
          /* 요약 = 보유대수·휴차·미수만 딱. 탭이 바꾼 결과라 탭 바로 뒤(mid). */
          mid={
            <span style={{ fontSize: 12.5, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, alignItems: 'baseline' }}>
              <span>보유 <b>{heldCnt}</b></span>
              <span>휴차 <b>{idleCnt}</b></span>
              {netTotal > 0 && <span>미수 <b style={{ color: C.danger }}>{won(netTotal)}</b></span>}
            </span>
          }
          search={false}
          actions={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="계약기간이 이 구간과 겹치는 차량만 표시">
                <input type="month" value={fromM} max={toM || undefined} onChange={(e) => setFromM(e.target.value)} style={MONTH_INPUT} aria-label="기간 시작월" />
                <span style={{ color: C.faint, fontSize: 12 }}>~</span>
                <input type="month" value={toM} min={fromM || undefined} onChange={(e) => setToM(e.target.value)} style={MONTH_INPUT} aria-label="기간 종료월" />
                {(fromM || toM) && <Btn variant="ghost" size="sm" onClick={() => { setFromM(''); setToM(''); }}>전체</Btn>}
              </span>
              <Btn variant="ghost" onClick={exportCsv} disabled={!shown.length}><Download size={15} /></Btn>
            </span>
          }
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
