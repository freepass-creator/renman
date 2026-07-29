'use client';

import { useMemo, useState } from 'react';
import { Pencil, Plus, UploadCloud } from 'lucide-react';
import { assetMasterRow, type AssetMasterRow } from '@/lib/master-ledgers';
import {
  ASSET_DETAIL_SECTIONS, ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS,
  ASSET_MAINT_BASIC_COLS, assetRail, assetRailStyle,
} from '@/lib/master-ledger-cols';
import { fleetMaintRanking } from '@/lib/asset-econ';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, FilterChips, LedgerActions, LedgerCreatePanel, LedgerEditPanel, LedgerFilterSelects, LedgerFrame, LedgerRecordPanel, PeriodBar, PillTabs, Search, Select,
  type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet, type Fleet } from '@/lib/domain/model';
import { normPlate } from '@/lib/plate';
import { latestDateOf, summarizeAssetLedgerStats } from '@/lib/ledger-stats';
import { MigrateDataButton } from '@/components/MigrateDataButton';
import { openIngest } from '@/lib/ui-bus';
import {
  ASSET_FILTER_DEFS, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
type AssetOwnershipScope = '보유자산' | '처분자산' | '전체자산';
type AssetQuickFilter = '계약중' | '휴차' | '매각대기';
type AllAssetQuickFilter = '보유' | '처분';
type AssetDateBasis = '취득일' | '처분일';
type AssetSheetView = '기본' | '전체' | '정비비';
const ASSET_QUICK_FILTERS: AssetQuickFilter[] = ['계약중', '휴차', '매각대기'];
const ASSET_QUICK_FILTER_LABEL: Record<AssetQuickFilter, string> = {
  계약중: '계약중',
  휴차: '휴차중',
  매각대기: '매각대기중',
};

function matchesOwnership(row: AssetMasterRow, scope: AssetOwnershipScope): boolean {
  return scope === '전체자산' || (scope === '보유자산' ? !row.disposed : row.disposed);
}

/** 가동·처분예정 = linkFleet(ownership·utilization) SSOT — status 원장과 동일. */
function matchesQuickFilter(row: AssetMasterRow, filter: AssetQuickFilter | null, fleet: Fleet): boolean {
  if (!filter) return true;
  const node = fleet.byPlate.get(normPlate(row.plate));
  if (!node) return false;
  if (filter === '계약중') return node.ownership === '보유중' && node.utilization === '운행';
  if (filter === '휴차') return node.ownership === '보유중' && node.utilization === '휴차';
  return node.ownership === '처분예정';
}

const ASSET_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '등록·상태', open: true, fields: ['plate', 'status', 'carName', 'vin', 'ownerName', 'firstReg', 'inspectionTo'] },
  { title: '제조·제원', fields: ['maker', 'modelLine', 'subModel', 'trim', 'modelYear', 'dealerAgency', 'dealerContact', 'dealerPhone'] },
  { title: '취득정보', fields: ['supplier', 'purchasedDate', 'acquisitionDate', 'acquisitionPrice', 'consumerPrice', 'optionPrice', 'optionDiscount'] },
  { title: '금융·할부', fields: ['loanCashOnly', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRate', 'loanStartDate'] },
  { title: '보험·GPS', fields: ['insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate', 'gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl'] },
];

export default function AssetLedgerPage() {
  const mobile = useIsMobile();
  const { data: [vehicles = [], contracts = [], history = []], loading } = useEntityLists(['vehicle', 'contract', 'history']);
  const [q, setQ] = useState('');
  const [ownershipScope, setOwnershipScope] = useState<AssetOwnershipScope>('보유자산');
  const [quickFilter, setQuickFilter] = useState<AssetQuickFilter | null>(null);
  const [allAssetQuickFilter, setAllAssetQuickFilter] = useState<AllAssetQuickFilter | null>(null);
  const [dateBasis, setDateBasis] = useState<AssetDateBasis>('취득일');
  const [range, setRange] = useState({ from: '', to: '' });
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(ASSET_FILTER_DEFS));
  const [sheetView, setSheetView] = useState<AssetSheetView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof assetMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const maintByPlate = useMemo(() => {
    const map = new Map(fleetMaintRanking(vehicles, history).map((m) => [m.plate, m]));
    return map;
  }, [vehicles, history]);

  const allRows = useMemo(() => vehicles.map((raw) => {
    const row = assetMasterRow(raw);
    const m = maintByPlate.get(row.plate);
    if (!m) return row;
    return {
      ...row,
      maintCost: m.maintCost,
      maintCount: m.maintCount,
      maintLastDate: m.maintLastDate,
      maintVsAvg: m.vsAvg,
    };
  }).sort((a, b) => (
    sheetView === '정비비'
      ? (b.maintCost - a.maintCost || a.plate.localeCompare(b.plate, 'ko'))
      : a.plate.localeCompare(b.plate, 'ko')
  )), [vehicles, maintByPlate, sheetView]);

  const fleet = useMemo(() => linkFleet(vehicles, contracts, TODAY), [vehicles, contracts]);
  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.assetCode, r.plate, r.status, r.carName, r.maker, r.modelLine, r.subModel, r.trim, r.vin, r.ownerName),
  ), [allRows, q]);
  const latest = useMemo(
    () => latestDateOf(
      allRows,
      (row) => (dateBasis === '처분일' ? row.saleDate : (row.acquisitionDate || row.purchasedDate || row.firstReg)),
      TODAY,
    ),
    [allRows, dateBasis],
  );
  const assetFilterMatchers = useMemo(() => ({
    status: eqFilter<AssetMasterRow>((r) => r.status),
    maker: eqFilter<AssetMasterRow>((r) => r.maker),
  }), []);
  const rows = useMemo(() => searchedRows.filter((r) => {
    if (!matchesOwnership(r, ownershipScope) || !matchesQuickFilter(r, quickFilter, fleet)) return false;
    if (!matchLedgerFilters(r, detailFilters, assetFilterMatchers)) return false;
    if (ownershipScope === '전체자산' && allAssetQuickFilter === '보유' && r.disposed) return false;
    if (ownershipScope === '전체자산' && allAssetQuickFilter === '처분' && !r.disposed) return false;
    const date = dateBasis === '처분일' ? r.saleDate : (r.acquisitionDate || r.purchasedDate || r.firstReg);
    if (range.from && (!date || date < range.from)) return false;
    if (range.to && (!date || date > range.to)) return false;
    return true;
  }), [searchedRows, ownershipScope, quickFilter, fleet, allAssetQuickFilter, detailFilters, assetFilterMatchers, dateBasis, range.from, range.to]);
  const assetStatuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort(), [allRows]);
  const assetMakers = useMemo(() => [...new Set(allRows.map((r) => r.maker).filter(Boolean))].sort(), [allRows]);
  const { held, disposed, contracted, idle, salePending } = useMemo(
    () => summarizeAssetLedgerStats(searchedRows, fleet),
    [searchedRows, fleet],
  );

  const sheetCols = sheetView === '정비비'
    ? ASSET_MAINT_BASIC_COLS
    : sheetView === '기본'
      ? ASSET_MASTER_BASIC_COLS
      : ASSET_MASTER_EXPANDED_COLS;

  return (
    <LedgerFrame
      title="자산관리"
      meta="차량 원장"
      right={<LedgerActions aria-label="쓰기">
        <Btn
          size="sm"
          variant="solid"
          aria-pressed={creating}
          onClick={() => {
            setSelected(null);
            setEditing(false);
            setCreating((open) => !open);
          }}
        ><Plus size={14} /> {creating ? '생성 취소' : '자산 생성'}</Btn>
      </LedgerActions>}
      tools={<LedgerActions aria-label="워크플로">
        <Btn size="sm" variant="ghost" iconOnly tip="등록증·자료 투입 — 데이터관리" onClick={() => openIngest('vehicle')}>
          <UploadCloud size={14} />
        </Btn>
      </LedgerActions>}
      filters={<>
        <Search size="sm" placeholder="차량번호·VIN·차명·소유자·상태" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 300 }} />
        <LedgerFilterSelects
          defs={ASSET_FILTER_DEFS}
          values={detailFilters}
          onChange={(key, value) => setDetailFilters((prev) => ({ ...prev, [key]: value }))}
          options={{ status: assetStatuses, maker: assetMakers }}
        />
        <Select
          size="sm"
          aria-label="자산 범위"
          value={ownershipScope}
          onChange={(event) => {
            const next = event.target.value as AssetOwnershipScope;
            setOwnershipScope(next);
            setDateBasis(next === '처분자산' ? '처분일' : '취득일');
            if (next !== '보유자산') setQuickFilter(null);
            setAllAssetQuickFilter(null);
          }}
        >
          <option value="보유자산">보유자산</option>
          <option value="처분자산">처분자산</option>
          <option value="전체자산">전체자산</option>
        </Select>
        {ownershipScope === '처분자산' && (
          <Select size="sm" aria-label="자산 날짜 기준" value={dateBasis} onChange={(event) => setDateBasis(event.target.value as AssetDateBasis)}>
            <option value="취득일">취득일 기준</option>
            <option value="처분일">처분일 기준</option>
          </Select>
        )}
        {ownershipScope === '보유자산' && (
          <FilterChips
            allowOff
            value={quickFilter}
            onChange={setQuickFilter}
            options={ASSET_QUICK_FILTERS.map((filter) => ({ key: filter, label: ASSET_QUICK_FILTER_LABEL[filter] }))}
          />
        )}
        {ownershipScope === '전체자산' && (
          <FilterChips
            allowOff
            value={allAssetQuickFilter}
            onChange={(next) => {
              setAllAssetQuickFilter(next);
              setDateBasis(next === '처분' ? '처분일' : '취득일');
            }}
            options={[
              { key: '보유', label: '보유' },
              { key: '처분', label: '처분' },
            ]}
          />
        )}
        <PeriodBar latest={latest} initial="전체" size="sm" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>보유 <b>{held}</b> · 계약중 <b style={{ color: C.ok }}>{contracted}</b> · 휴차 <b style={{ color: C.warn }}>{idle}</b> · 매각대기 <b>{salePending}</b> · 처분 <b>{disposed}</b></span>}
      showColView={false}
      colView={sheetView === '기본' ? '기본' : '전체'}
      view={(
        <PillTabs
          size="sm"
          value={sheetView}
          onChange={(v) => setSheetView((v as AssetSheetView) || '기본')}
          tabs={[
            { key: '기본', label: '기본' },
            { key: '전체', label: '전체' },
            { key: '정비비', label: '정비비' },
          ]}
        />
      )}
      loading={loading}
      empty={<>
        등록된 자산이 없습니다. 등록증은 데이터관리에서 담으세요.
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Btn size="sm" variant="ghost" onClick={() => openIngest('vehicle')}><UploadCloud size={14} /> 데이터관리</Btn>
          <MigrateDataButton size="sm" />
        </div>
      </>}
      cols={sheetCols}
      rows={rows}
      rowKey={(r) => r.plate}
      selectedRowKey={selected?.plate}
      rowStyle={(r) => assetRailStyle(assetRail(r))}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setEditing(false);
        setSelected(row);
      }}
      onCloseDetail={() => { setSelected(null); setEditing(false); }}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-asset"
          entityKey="vehicle"
          title="자산 생성"
          sections={ASSET_CREATE_SECTIONS}
          initial={{ status: '등록대기' }}
          onClose={() => setCreating(false)}
        />
      ) : selected && editing ? (
        <LedgerEditPanel
          key={`edit-asset:${selected.plate}`}
          entityKey="vehicle"
          title={`${selected.plate} 수정`}
          sections={ASSET_CREATE_SECTIONS}
          record={selected.raw}
          onClose={() => setEditing(false)}
          onSaved={(record) => setSelected(assetMasterRow(record))}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.carName || '차명 미입력'}
          identity={selected.plate || LEDGER_EMPTY.unassigned}
          statusBadge={ASSET_MASTER_EXPANDED_COLS.find((c) => c.key === 'status')?.render(selected)}
          row={selected}
          cols={ASSET_MASTER_EXPANDED_COLS}
          sections={ASSET_DETAIL_SECTIONS}
          onClose={() => { setSelected(null); setEditing(false); }}
          actions={<>
            <Btn size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 수정</Btn>
          </>}
        />
      ) : null}
    />
  );
}
