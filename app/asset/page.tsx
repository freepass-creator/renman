'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { assetMasterRow, contractMasterRow, type AssetMasterRow } from '@/lib/master-ledgers';
import { ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, LedgerCreatePanel, LedgerFrame, LedgerRecordPanel, PillTabs, Search,
  type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { TODAY } from '@/lib/dashboard-consts';
import { VEHICLE_DISPOSE_PLAN, VEHICLE_REPAIR } from '@/lib/domain/status';

type AssetScope = '보유자산' | '계약중' | '상품대기' | '휴차·정비' | '매각대기' | '처분자산' | '전체';
const ASSET_SCOPES: AssetScope[] = ['보유자산', '계약중', '상품대기', '휴차·정비', '매각대기', '처분자산', '전체'];
const PRODUCT_READY = new Set(['상품대기', '상품화']);
const IDLE_REPAIR = new Set(['휴차', '유휴', ...VEHICLE_REPAIR]);

function matchesAssetScope(row: AssetMasterRow, scope: AssetScope, activeContractPlates: Set<string>): boolean {
  if (scope === '전체') return true;
  if (scope === '보유자산') return !row.disposed;
  if (scope === '처분자산') return row.disposed;
  if (scope === '계약중') return !row.disposed && activeContractPlates.has(row.plate);
  if (scope === '상품대기') return !row.disposed && PRODUCT_READY.has(row.status);
  if (scope === '휴차·정비') return !row.disposed && IDLE_REPAIR.has(row.status);
  if (scope === '매각대기') return !row.disposed && VEHICLE_DISPOSE_PLAN.has(row.status);
  return false;
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
  const [scope, setScope] = useState<AssetScope>('보유자산');
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
    matchesAssetScope(r, scope, activeContractPlates),
  ), [searchedRows, scope, activeContractPlates]);
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
        <PillTabs
          size="sm"
          value={scope}
          onChange={setScope}
          tabs={ASSET_SCOPES.map((key) => ({ key, label: key }))}
        />
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
