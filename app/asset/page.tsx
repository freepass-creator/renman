'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { assetMasterRow, contractMasterRow, type AssetMasterRow } from '@/lib/master-ledgers';
import { ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, LedgerCreatePanel, LedgerFrame, LedgerRecordPanel, Search, Select, toggleStyle,
  type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { TODAY } from '@/lib/dashboard-consts';
import { VEHICLE_DISPOSE_PLAN, VEHICLE_REPAIR } from '@/lib/domain/status';

type AssetOwnershipScope = '보유자산' | '처분자산' | '전체자산';
type AssetQuickFilter = '계약중' | '휴차·정비' | '상품차' | '매각대기';
const ASSET_QUICK_FILTERS: AssetQuickFilter[] = ['계약중', '휴차·정비', '상품차', '매각대기'];
const PRODUCT_READY = new Set(['상품대기', '상품화']);
const IDLE_REPAIR = new Set(['휴차', '유휴', ...VEHICLE_REPAIR]);

function matchesOwnership(row: AssetMasterRow, scope: AssetOwnershipScope): boolean {
  return scope === '전체자산' || (scope === '보유자산' ? !row.disposed : row.disposed);
}

function matchesQuickFilter(row: AssetMasterRow, filter: AssetQuickFilter | null, activeContractPlates: Set<string>): boolean {
  if (!filter) return true;
  if (filter === '계약중') return !row.disposed && activeContractPlates.has(row.plate);
  if (filter === '상품차') return !row.disposed && PRODUCT_READY.has(row.status);
  if (filter === '휴차·정비') return !row.disposed && IDLE_REPAIR.has(row.status);
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
  const rows = useMemo(() => searchedRows.filter((r) =>
    matchesOwnership(r, ownershipScope) && matchesQuickFilter(r, quickFilter, activeContractPlates),
  ), [searchedRows, ownershipScope, quickFilter, activeContractPlates]);
  const held = searchedRows.filter((r) => !r.disposed).length;
  const disposed = searchedRows.filter((r) => r.disposed).length;
  const running = searchedRows.filter((r) => !r.disposed && r.status === '운행').length;
  const attention = searchedRows.filter((r) => !r.disposed && ['휴차', '정비', '사고'].includes(r.status)).length;

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
        <Select
          size="sm"
          aria-label="자산 범위"
          value={ownershipScope}
          onChange={(event) => {
            const next = event.target.value as AssetOwnershipScope;
            setOwnershipScope(next);
            if (next !== '보유자산') setQuickFilter(null);
          }}
        >
          <option value="보유자산">보유자산</option>
          <option value="처분자산">처분자산</option>
          <option value="전체자산">전체자산</option>
        </Select>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }} aria-label="빠른 필터">
          {ASSET_QUICK_FILTERS.map((filter) => {
            const active = quickFilter === filter;
            return (
              <button
                key={filter}
                type="button"
                data-ui="toggle"
                aria-pressed={active}
                onClick={() => {
                  setOwnershipScope('보유자산');
                  setQuickFilter((current) => current === filter ? null : filter);
                }}
                style={toggleStyle(active, 'sm', mobile)}
              >
                {filter}
              </button>
            );
          })}
        </span>
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>보유 <b>{held}</b> · 운행상태 <b style={{ color: C.ok }}>{running}</b> · 휴차/정비/사고 <b style={{ color: C.warn }}>{attention}</b> · 처분 <b>{disposed}</b></span>}
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
