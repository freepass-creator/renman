'use client';
/**
 * 운영현황 — 차량 1대=1행 통합 원장 (LedgerFrame 규격).
 * 기본 스코프 = isVehicleHeld(실물 보유). 필터 = 검색 + 칩1군 + 기간.
 */
import { useMemo, useState } from 'react';
import { Car, CalendarClock, FileText } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { isVehicleHeld, linkFleet } from '@/lib/domain/model';
import { buildFleetRows, fleetRail, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_DETAIL_SECTIONS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { summarizeFleetStatusStats, latestDateOf } from '@/lib/ledger-stats';
import { workRailStyle } from '@/lib/work-rail';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, FilterChips, LedgerActions, LedgerFrame, LedgerRecordPanel,
  PeriodBar, Search, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

type ScopeChip = '전체' | '운행' | '정비' | '휴차' | '리스크';

const SCOPE_OPTS: { key: ScopeChip; label: string }[] = [
  { key: '전체', label: '전체' },
  { key: '운행', label: '운행' },
  { key: '정비', label: '정비' },
  { key: '휴차', label: '휴차' },
  { key: '리스크', label: '리스크' },
];

export default function StatusPage() {
  const mobile = useIsMobile();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeChip>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<FleetRow | null>(null);

  const allRows = useMemo(() => {
    const fleet = linkFleet(vs, cs, TODAY);
    return buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY)
      .sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [vs, cs, ins, hs]);

  /** 기본 스코프 = 보유(실물). 검색은 이 안에서. */
  const heldRows = useMemo(() => allRows.filter(isVehicleHeld), [allRows]);

  const searched = useMemo(() => heldRows.filter((r) =>
    textMatch(q, r.company, r.plate, r.carName, r.maker, r.customer, r.phone, r.status, r.util, r.location),
  ), [heldRows, q]);

  const latest = useMemo(
    () => latestDateOf(heldRows, (r) => r.start || r.acqDate, TODAY),
    [heldRows],
  );

  const rows = useMemo(() => searched.filter((r) => {
    if (scope === '운행' || scope === '정비' || scope === '휴차') {
      if (r.util !== scope) return false;
    } else if (scope === '리스크') {
      if (!(r.net > 0 || r.warnings.length > 0 || (r.dday != null && r.dday < 0))) return false;
    }
    if (range.from || range.to) {
      const s = (r.start || '').slice(0, 10);
      const e = (r.end || '').slice(0, 10);
      if (!s && !e) return false;
      if (range.from && e && e < range.from) return false;
      if (range.to && s && s > range.to) return false;
    }
    return true;
  }), [searched, scope, range.from, range.to]);

  const { heldN, utilPct, netSum, inspSoon } = useMemo(
    () => summarizeFleetStatusStats(searched, rows),
    [searched, rows],
  );

  return (
    <LedgerFrame
      title="운영현황"
      meta="차량 1대=1행·자산+계약+미수·조회 전용"
      tools={<LedgerActions aria-label="워크플로">
        <Btn size="sm" variant="ghost" iconOnly tip="자산 원장" href="/asset"><Car size={14} /></Btn>
        <Btn size="sm" variant="ghost" iconOnly tip="계약 원장" href="/contract"><FileText size={14} /></Btn>
        <Btn size="sm" variant="ghost" iconOnly tip="리스크관리" href="/risk"><CalendarClock size={14} /></Btn>
      </LedgerActions>}
      filters={<>
        <Search
          size="sm"
          placeholder="회사·차량·차명·계약자·상태"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? '100%' : 280 }}
        />
        <FilterChips
          value={scope}
          onChange={(v) => setScope(v ?? '전체')}
          options={SCOPE_OPTS}
        />
        <PeriodBar latest={latest} initial="전체" size="sm" onRange={setRange} />
      </>}
      stats={
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12, flexWrap: 'wrap' }}>
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
