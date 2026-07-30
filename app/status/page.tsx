'use client';
/**
 * 운영현황 — 차량 1대=1행 통합 원장 (LedgerFrame 규격).
 * 기본 스코프 = isVehicleHeld(실물 보유). 필터줄 = 검색·☰필터·기간.
 */
import { useMemo, useState } from 'react';
import { TODAY } from '@/lib/dashboard-consts';
import { isVehicleHeld, linkFleet } from '@/lib/domain/model';
import { buildFleetRows, fleetRail, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_DETAIL_SECTIONS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { summarizeFleetStatusStats, latestDateOf } from '@/lib/ledger-stats';
import { workRailStyle } from '@/lib/work-rail';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  C, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel,
  PeriodBar, Search, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import {
  FLEET_FILTER_DEFS, countActiveFilters, emptyFilterValues, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';

type ScopeChip = '전체' | '운행' | '정비' | '휴차' | '리스크';
const SCOPE_OPTS = ['전체', '운행', '정비', '휴차', '리스크'] as const;

export default function StatusPage() {
  const mobile = useIsMobile();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeChip>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<FleetRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(FLEET_FILTER_DEFS));

  const allRows = useMemo(() => {
    const fleet = linkFleet(vs, cs, TODAY);
    return buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY)
      .sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [vs, cs, ins, hs]);

  const heldRows = useMemo(() => allRows.filter(isVehicleHeld), [allRows]);

  const searched = useMemo(() => heldRows.filter((r) =>
    textMatch(q, r.company, r.plate, r.carName, r.maker, r.customer, r.phone, r.status, r.util, r.location),
  ), [heldRows, q]);

  const latest = useMemo(
    () => latestDateOf(heldRows, (r) => r.start || r.acqDate, TODAY),
    [heldRows],
  );

  const activeScope = (detailFilters.scope || scope || '전체') as ScopeChip;

  const rows = useMemo(() => searched.filter((r) => {
    if (activeScope === '운행' || activeScope === '정비' || activeScope === '휴차') {
      if (r.util !== activeScope) return false;
    } else if (activeScope === '리스크') {
      if (!(r.net > 0 || r.warnings.length > 0 || (r.dday != null && r.dday < 0))) return false;
    }
    if (range.from || range.to) {
      const s = (r.start || '').slice(0, 10);
      const e = (r.end || '').slice(0, 10);
      if (!s && !e) return false;
      if (range.from && e && e < range.from) return false;
      if (range.to && s && s > range.to) return false;
    }
    return matchLedgerFilters(r, detailFilters, {
      scope: () => true,
      contract: (row, v) => (v === '있음' ? !!row.customer : v === '없음' ? !row.customer : true),
      warn: (row, v) => (v === '있음' ? row.warnings.length > 0 : v === '없음' ? row.warnings.length === 0 : true),
    });
  }), [searched, activeScope, range.from, range.to, detailFilters]);

  const { heldN, utilPct, netSum, inspSoon } = useMemo(
    () => summarizeFleetStatusStats(searched, rows),
    [searched, rows],
  );

  const filterCount = countActiveFilters(
    { ...detailFilters, scope: activeScope === '전체' ? '' : activeScope },
    FLEET_FILTER_DEFS,
  );

  return (
    <LedgerFrame
      title="운영현황"
      meta="차량 1대=1행·자산+계약+미수·조회 전용"
      filters={<>
        <Search
          size="sm"
          placeholder="회사·차량·차명·계약자·상태"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
        />
        <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
        <PeriodBar latest={latest} initial="전체" size="sm" onRange={setRange} />
      </>}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title="운영 필터"
          onReset={() => {
            setDetailFilters(emptyFilterValues(FLEET_FILTER_DEFS));
            setScope('전체');
          }}
          onClose={() => setFilterOpen(false)}
        >
          <LedgerFilterFields
            defs={FLEET_FILTER_DEFS}
            values={{ ...detailFilters, scope: activeScope === '전체' ? '' : activeScope }}
            onChange={(key, value) => {
              if (key === 'scope') {
                setScope((value || '전체') as ScopeChip);
                setDetailFilters((prev) => ({ ...prev, scope: value }));
                return;
              }
              setDetailFilters((prev) => ({ ...prev, [key]: value }));
            }}
            options={{
              scope: SCOPE_OPTS.filter((s) => s !== '전체'),
              contract: ['있음', '없음'],
              warn: ['있음', '없음'],
            }}
          />
        </LedgerFilterPanel>
      ) : null}
      stats={
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12 }}>
          <span>보유 <b style={{ color: C.ink }}>{heldN}</b></span>
          <span>가동률 <b style={{ color: utilPct >= 70 ? 'var(--green-text)' : utilPct < 50 ? C.warn : C.ink }}>{utilPct}%</b></span>
          {netSum > 0 && <span>미수 <b style={{ color: C.danger }}>{won(netSum)}</b></span>}
          {inspSoon > 0 && <span>검사임박 <b style={{ color: C.warn }}>{inspSoon}</b></span>}
        </span>
      }
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty="표시할 차량이 없습니다."
      cols={colView === '기본' ? FLEET_BASIC_COLS : FLEET_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.plate || `${r.companyId}:${r.customer}`}
      selectedRowKey={selected?.plate ?? null}
      rowStyle={(r) => workRailStyle(fleetRail(r))}
      onRowDoubleClick={(row) => setSelected(row)}
      onCloseDetail={() => setSelected(null)}
      sidePanel={selected ? (
        <LedgerRecordPanel
          title={selected.carName || selected.status || '차량'}
          identity={`${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customer || LEDGER_EMPTY.noContract}`}
          statusBadge={FLEET_EXPANDED_COLS.find((c) => c.key === 'status')?.render(selected)}
          row={selected}
          cols={FLEET_EXPANDED_COLS}
          sections={FLEET_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
        />
      ) : null}
    />
  );
}
