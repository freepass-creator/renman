'use client';
/**
 * 운영현황 — 차량 1대=1행 통합 원장 (LedgerFrame 규격).
 * 데이터 = linkFleet → buildFleetRows · 열 = FLEET_*_COLS. 옛 FacetPage/OpsLens 금지.
 */
import { useMemo, useState } from 'react';
import { Car, CalendarClock, FileText } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_DETAIL_SECTIONS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { summarizeFleetStatusStats } from '@/lib/ledger-stats';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, FilterChips, LedgerActions, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel,
  PeriodBar, Search, Select, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import {
  FLEET_FILTER_DEFS, countActiveFilters, emptyFilterValues, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import { RENTAL_TYPES } from '@/lib/schema/contract';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

const RENTAL_CHIP_OPTS = [
  { key: '전체' as const, label: '전체' },
  ...RENTAL_TYPES.map((t) => ({ key: t, label: t })),
];
type RentalChip = (typeof RENTAL_CHIP_OPTS)[number]['key'];

type OwnScope = '보유' | '전체' | '매각';
type UtilChip = '운행' | '휴차' | '정비';

export default function StatusPage() {
  const mobile = useIsMobile();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [q, setQ] = useState('');
  const [own, setOwn] = useState<OwnScope>('보유');
  const [utilChip, setUtilChip] = useState<UtilChip | null>(null);
  const [riskOnly, setRiskOnly] = useState(false);
  const [rentalChip, setRentalChip] = useState<RentalChip>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(FLEET_FILTER_DEFS));
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<FleetRow | null>(null);

  const allRows = useMemo(() => {
    const fleet = linkFleet(vs, cs, TODAY);
    return buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY)
      .sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [vs, cs, ins, hs]);

  const searched = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.plate, r.carName, r.maker, r.customer, r.phone, r.status, r.util, r.location, r.rentalType),
  ), [allRows, q]);

  const latest = useMemo(() => allRows.reduce((acc, r) => {
    const d = r.start || r.acqDate;
    return d > acc ? d : acc;
  }, TODAY), [allRows]);

  const fleetFilterMatchers = useMemo(() => ({
    contract: (r: FleetRow, value: string) => {
      const held = r.ownership !== '처분완료';
      if (value === '만기임박') return r.dday != null && r.dday >= 0 && r.dday <= 30;
      if (value === '반납지남') return r.dday != null && r.dday < 0;
      if (value === '계약없음') return !r.customer && held && r.status !== '차량없음';
      return true;
    },
    warn: (r: FleetRow, value: string) => {
      if (value === '경고있음') return r.warnings.length > 0;
      if (value === '위험만') return r.warnings.some((w) => w.sev === 'high');
      return true;
    },
  }), []);

  const rows = useMemo(() => searched.filter((r) => {
    const held = r.ownership !== '처분완료';
    if (own === '보유' && !held) return false;
    if (own === '매각' && held) return false;
    if (utilChip && r.util !== utilChip) return false;
    if (riskOnly && !(r.net > 0 || r.warnings.length > 0 || (r.dday != null && r.dday < 0))) return false;
    if (rentalChip !== '전체' && r.rentalType !== rentalChip) return false;
    if (!matchLedgerFilters(r, detailFilters, fleetFilterMatchers)) return false;
    if (range.from || range.to) {
      const s = (r.start || '').slice(0, 10);
      const e = (r.end || '').slice(0, 10);
      if (!s && !e) return false;
      if (range.from && e && e < range.from) return false;
      if (range.to && s && s > range.to) return false;
    }
    return true;
  }), [searched, own, utilChip, riskOnly, rentalChip, detailFilters, fleetFilterMatchers, range.from, range.to]);

  const detailFilterCount = countActiveFilters(detailFilters, FLEET_FILTER_DEFS);
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
        <LedgerFilterButton open={filterOpen} count={detailFilterCount} onClick={() => setFilterOpen((o) => !o)} />
        <Select size="sm" aria-label="보유 범위" value={own} onChange={(e) => setOwn(e.target.value as OwnScope)}>
          <option value="보유">보유</option>
          <option value="전체">전체</option>
          <option value="매각">매각</option>
        </Select>
        <FilterChips
          allowOff
          value={utilChip}
          onChange={setUtilChip}
          options={[
            { key: '운행', label: '운행' },
            { key: '휴차', label: '휴차' },
            { key: '정비', label: '정비' },
          ]}
        />
        <FilterChips
          allowOff
          value={riskOnly ? '리스크' : null}
          onChange={(v) => setRiskOnly(v === '리스크')}
          options={[{ key: '리스크', label: '리스크' }]}
        />
        <FilterChips
          value={rentalChip}
          onChange={(v) => setRentalChip(v ?? '전체')}
          options={RENTAL_CHIP_OPTS}
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
      onRowDoubleClick={(row) => setSelected(row)}
      onCloseDetail={() => setSelected(null)}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title="운영 세부 필터"
          onClose={() => setFilterOpen(false)}
          onReset={() => setDetailFilters(emptyFilterValues(FLEET_FILTER_DEFS))}
        >
          <LedgerFilterFields
            defs={FLEET_FILTER_DEFS}
            values={detailFilters}
            onChange={(key, value) => setDetailFilters((prev) => ({ ...prev, [key]: value }))}
            options={{
              contract: ['만기임박', '반납지남', '계약없음'],
              warn: ['경고있음', '위험만'],
            }}
          />
        </LedgerFilterPanel>
      ) : null}
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
