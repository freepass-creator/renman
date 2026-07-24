/**
 * FLEET_DEF — 운영시트(/sheet) 정의. E-grid 원형. (설계서 §6 표)
 *   기존 app/sheet/page.tsx의 필터·카운트·요약·정렬을 그대로 이관 — WebPage 렌더러가 소비.
 *   도메인(linkFleet·buildFleetRows) 불변, 여기선 배열·필터만.
 */
import { useMemo } from 'react';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, statusRank, fleetRail, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_EXPANDED_COLS, FLEET_REVEAL_COLS } from '@/lib/sheet-cols';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar } from '@/lib/ui-bus';
import { won } from '@/components/ui';
import type { PageDef } from '@/lib/pagedef/types';

const OWN = ['보유', '전체', '매각'];

const netTotal = (rows: FleetRow[]) => rows.reduce((s, r) => s + Math.max(0, r.net), 0);

export const FLEET_DEF: PageDef<FleetRow> = {
  href: '/sheet',
  archetype: 'E-grid',
  title: '운영시트',
  rowKey: (r) => r.plate,
  drill: (r) => openCar(r.plate),

  // 모바일 리스트 — 상태 레일 + 차번 + 차종/고객 + 우측 미수(danger). 상태별 그룹.
  row: (r) => ({
    rail: fleetRail(r),
    co: r.companyId,
    plate: r.plate,
    meta: r.carName,
    sub: `${r.customer || '계약없음'}${r.end ? ` · 만기 ${r.end.slice(2)}` : ''}`,
    right: r.net > 0 ? won(r.net) : undefined,
    rightTone: 'danger',
  }),
  groups: [
    { key: 'deliver', label: '인도예정', tone: 'blue', match: (r) => statusRank(r) === 0 },
    { key: 'overdue', label: '만기경과', tone: 'red', match: (r) => statusRank(r) === 1 },
    { key: 'idle', label: '휴차', tone: 'purple', match: (r) => statusRank(r) === 2 },
    { key: 'soon', label: '마감임박', tone: 'amber', match: (r) => statusRank(r) === 3 },
    { key: 'run', label: '운행중', tone: 'green', match: (r) => statusRank(r) === 4 },
    { key: 'etc', label: '기타', tone: 'gray', match: (r) => statusRank(r) >= 5 },
  ],

  useData() {
    const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
    const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);
    const rows = useMemo(() => buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY), [fleet, ins, hs]);
    return { rows, loading };
  },

  colSets: [
    { key: '기본', label: '기본', cols: FLEET_BASIC_COLS },
    { key: '상세', label: '상세', cols: FLEET_EXPANDED_COLS },
  ],
  revealCols: FLEET_REVEAL_COLS,
  lensKey: '운영시트',
  radioKeys: OWN,
  facetDefault: ['보유'],
  period: 'month',
  csvName: (view) => `운영시트_${view}_${TODAY}`,
  sort: (a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'),

  // app/sheet/page.tsx rows useMemo 술어 그대로.
  filter: (r, facets, range) => {
    const util = ['운행', '휴차', '정비'].filter((x) => facets.has(x));
    const misu = ['미수있음', '연체90일+'].filter((x) => facets.has(x));
    const due = ['검사임박', '보험임박'].filter((x) => facets.has(x));
    const debt = ['할부있음', '보험없음'].filter((x) => facets.has(x));
    const warn = ['경고있음', '위험만'].filter((x) => facets.has(x));
    const ct = ['만기임박', '반납지남', '계약없음'].filter((x) => facets.has(x));
    const held = r.ownership !== '처분완료';
    if (facets.has('전체')) { /* 전부 */ }
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
    if (range.from || range.to) {
      const s = r.start.slice(0, 7), e = r.end.slice(0, 7);
      if (!s) return false;
      if (range.to && s > range.to) return false;
      if (range.from && e && e < range.from) return false;
    }
    return true;
  },

  counts: (allRows) => {
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
  },

  summary: [
    { key: 'held', label: '보유', value: (rows) => rows.reduce((n, r) => n + (r.ownership !== '처분완료' ? 1 : 0), 0) },
    { key: 'idle', label: '휴차', value: (rows) => rows.reduce((n, r) => n + (r.util === '휴차' ? 1 : 0), 0) },
    { key: 'net', label: '미수', tone: 'danger', show: (rows) => netTotal(rows) > 0, value: (rows) => won(netTotal(rows)) },
  ],
};
