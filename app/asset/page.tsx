'use client';

import { useMemo, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { assetMasterRow, contractMasterRow, type AssetMasterRow } from '@/lib/master-ledgers';
import { ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, LedgerCreatePanel, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PeriodBar, Search, Select, toggleStyle,
  type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { TODAY } from '@/lib/dashboard-consts';
import { VEHICLE_DISPOSE_PLAN } from '@/lib/domain/status';

type AssetOwnershipScope = '보유자산' | '처분자산' | '전체자산';
type AssetQuickFilter = '계약중' | '휴차' | '매각대기';
type AllAssetQuickFilter = '보유' | '처분';
type AssetDateBasis = '취득일' | '처분일';
const ASSET_QUICK_FILTERS: AssetQuickFilter[] = ['계약중', '휴차', '매각대기'];
const ASSET_QUICK_FILTER_LABEL: Record<AssetQuickFilter, string> = {
  계약중: '계약중',
  휴차: '휴차중',
  매각대기: '매각대기중',
};

function matchesOwnership(row: AssetMasterRow, scope: AssetOwnershipScope): boolean {
  return scope === '전체자산' || (scope === '보유자산' ? !row.disposed : row.disposed);
}

function matchesQuickFilter(row: AssetMasterRow, filter: AssetQuickFilter | null, activeContractPlates: Set<string>): boolean {
  if (!filter) return true;
  if (filter === '계약중') return !row.disposed && activeContractPlates.has(row.plate);
  if (filter === '휴차') {
    return !row.disposed && !activeContractPlates.has(row.plate) && !VEHICLE_DISPOSE_PLAN.has(row.status);
  }
  return !row.disposed && VEHICLE_DISPOSE_PLAN.has(row.status);
}

const ASSET_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '기본·등록정보', open: true, fields: ['plate', 'status', 'carName', 'vin', 'ownerName', 'firstReg', 'inspectionTo'] },
  { title: '제조·출고정보', fields: ['maker', 'modelLine', 'subModel', 'trim', 'modelYear', 'dealerAgency', 'dealerContact', 'dealerPhone'] },
  { title: '취득정보', fields: ['supplier', 'purchasedDate', 'acquisitionDate', 'acquisitionPrice', 'consumerPrice', 'optionPrice', 'optionDiscount'] },
  { title: '금융·할부정보', fields: ['loanCashOnly', 'loanCompany', 'loanMonths', 'loanPrincipal', 'loanRate', 'loanStartDate'] },
  { title: '보험·GPS', fields: ['insuranceCompany', 'insurancePolicyNo', 'insuranceExpiryDate', 'gpsProvider', 'gpsDeviceId', 'gpsInstalledDate', 'gpsControl'] },
];

export default function AssetLedgerPage() {
  const mobile = useIsMobile();
  const { rows: vehicles, loading } = useEntityList('vehicle');
  const { rows: contracts, loading: contractsLoading } = useEntityList('contract');
  const [q, setQ] = useState('');
  const [ownershipScope, setOwnershipScope] = useState<AssetOwnershipScope>('보유자산');
  const [quickFilter, setQuickFilter] = useState<AssetQuickFilter | null>(null);
  const [allAssetQuickFilter, setAllAssetQuickFilter] = useState<AllAssetQuickFilter | null>(null);
  const [dateBasis, setDateBasis] = useState<AssetDateBasis>('취득일');
  const [range, setRange] = useState({ from: '', to: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailStatus, setDetailStatus] = useState('');
  const [detailMaker, setDetailMaker] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof assetMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const allRows = useMemo(() => vehicles.map(assetMasterRow).sort((a, b) => a.plate.localeCompare(b.plate, 'ko')), [vehicles]);
  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.assetCode, r.plate, r.status, r.carName, r.maker, r.modelLine, r.subModel, r.trim, r.vin, r.ownerName),
  ), [allRows, q]);
  const activeContractPlates = useMemo(() => new Set(
    contracts.map((contract) => contractMasterRow(contract, TODAY)).filter((contract) => !contract.ended).map((contract) => contract.plate),
  ), [contracts]);
  const latest = useMemo(() => allRows.reduce((latestDate, row) => {
    const date = dateBasis === '처분일' ? row.saleDate : (row.acquisitionDate || row.purchasedDate || row.firstReg);
    return date > latestDate ? date : latestDate;
  }, TODAY), [allRows, dateBasis]);
  const rows = useMemo(() => searchedRows.filter((r) => {
    if (!matchesOwnership(r, ownershipScope) || !matchesQuickFilter(r, quickFilter, activeContractPlates)) return false;
    if (detailStatus && r.status !== detailStatus) return false;
    if (detailMaker && r.maker !== detailMaker) return false;
    if (ownershipScope === '전체자산' && allAssetQuickFilter === '보유' && r.disposed) return false;
    if (ownershipScope === '전체자산' && allAssetQuickFilter === '처분' && !r.disposed) return false;
    const date = dateBasis === '처분일' ? r.saleDate : (r.acquisitionDate || r.purchasedDate || r.firstReg);
    if (range.from && (!date || date < range.from)) return false;
    if (range.to && (!date || date > range.to)) return false;
    return true;
  }), [searchedRows, ownershipScope, quickFilter, allAssetQuickFilter, activeContractPlates, detailStatus, detailMaker, dateBasis, range.from, range.to]);
  const assetStatuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort(), [allRows]);
  const assetMakers = useMemo(() => [...new Set(allRows.map((r) => r.maker).filter(Boolean))].sort(), [allRows]);
  const detailFilterCount = Number(!!detailStatus) + Number(!!detailMaker);
  const held = searchedRows.filter((r) => !r.disposed).length;
  const disposed = searchedRows.filter((r) => r.disposed).length;
  const contracted = searchedRows.filter((r) => !r.disposed && activeContractPlates.has(r.plate)).length;
  const idle = searchedRows.filter((r) =>
    !r.disposed && !activeContractPlates.has(r.plate) && !VEHICLE_DISPOSE_PLAN.has(r.status),
  ).length;
  const salePending = searchedRows.filter((r) => !r.disposed && VEHICLE_DISPOSE_PLAN.has(r.status)).length;

  return (
    <LedgerFrame
      title="자산관리"
      meta="차량 1대 1행 · 등록·소유·제원·취득·검사·금융·보험"
      right={<Btn size="sm" variant={creating ? 'ghost' : 'solid'} aria-pressed={creating} onClick={() => {
        setSelected(null);
        setCreating((open) => !open);
      }}><Plus size={14} /> {creating ? '생성 취소' : '자산 생성'}</Btn>}
      filters={<>
        <Search size="sm" placeholder="차량번호·VIN·차명·소유자·상태" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 300 }} />
        <Btn size="sm" variant={filterOpen ? 'solid' : 'ghost'} aria-pressed={filterOpen} onClick={() => setFilterOpen((open) => !open)}>
          <SlidersHorizontal size={14} /> 필터{detailFilterCount ? ` ${detailFilterCount}` : ''}
        </Btn>
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
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }} aria-label="빠른 필터">
            {ASSET_QUICK_FILTERS.map((filter) => {
              const active = quickFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  data-ui="toggle"
                  aria-pressed={active}
                  onClick={() => setQuickFilter((current) => current === filter ? null : filter)}
                  style={toggleStyle(active, 'sm', mobile)}
                >
                  {ASSET_QUICK_FILTER_LABEL[filter]}
                </button>
              );
            })}
          </span>
        )}
        {ownershipScope === '전체자산' && (
          <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }} aria-label="전체자산 빠른 필터">
            {(['보유', '처분'] as AllAssetQuickFilter[]).map((filter) => {
              const active = allAssetQuickFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  data-ui="toggle"
                  aria-pressed={active}
                  onClick={() => {
                    const next = active ? null : filter;
                    setAllAssetQuickFilter(next);
                    setDateBasis(next === '처분' ? '처분일' : '취득일');
                  }}
                  style={toggleStyle(active, 'sm', mobile)}
                >
                  {filter}
                </button>
              );
            })}
          </span>
        )}
        <PeriodBar latest={latest} initial="전체" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>보유 <b>{held}</b> · 계약중 <b style={{ color: C.ok }}>{contracted}</b> · 휴차 <b style={{ color: C.warn }}>{idle}</b> · 매각대기 <b>{salePending}</b> · 처분 <b>{disposed}</b></span>}
      colView={colView}
      onColView={setColView}
      loading={loading || contractsLoading}
      empty="등록된 자산이 없습니다."
      cols={colView === '기본' ? ASSET_MASTER_BASIC_COLS : ASSET_MASTER_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.plate}
      selectedRowKey={selected?.plate}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setSelected(row);
      }}
      onCloseDetail={() => setSelected(null)}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel title="자산 세부 필터" onClose={() => setFilterOpen(false)} onReset={() => { setDetailStatus(''); setDetailMaker(''); }}>
          <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>차량상태</span><Select value={detailStatus} onChange={(e) => setDetailStatus(e.target.value)} style={{ width: '100%' }}><option value="">전체</option>{assetStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
          <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>제조사</span><Select value={detailMaker} onChange={(e) => setDetailMaker(e.target.value)} style={{ width: '100%' }}><option value="">전체</option>{assetMakers.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
        </LedgerFilterPanel>
      ) : null}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-asset"
          entityKey="vehicle"
          title="자산 생성"
          sections={ASSET_CREATE_SECTIONS}
          initial={{ status: '등록대기' }}
          onClose={() => setCreating(false)}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.plate}
          subtitle={`${selected.carName || '차명 미입력'} · ${selected.status}`}
          row={selected}
          cols={ASSET_MASTER_EXPANDED_COLS}
          onClose={() => setSelected(null)}
        />
      ) : null}
    />
  );
}
