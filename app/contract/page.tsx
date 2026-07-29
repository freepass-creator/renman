'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Pencil, Plus, UploadCloud } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { contractMasterRow } from '@/lib/master-ledgers';
import { CONTRACT_DETAIL_SECTIONS, CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { summarizeContractLedgerStats } from '@/lib/ledger-stats';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Badge, Btn, C, FilterChips, LedgerActions, LedgerCreatePanel, LedgerEditPanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PageLoading, PeriodBar, Search, Select, won,
  type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { MigrateDataButton } from '@/components/MigrateDataButton';
import { openIngest, openReceivables } from '@/lib/ui-bus';
import { sendNoticeCert } from '@/lib/docs/send-notice';
import {
  CONTRACT_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import { RENTAL_TYPES } from '@/lib/schema/contract';
import { ContractScheduleEmbed } from '@/components/ledger/ContractScheduleEmbed';

const RENTAL_CHIP_OPTS = [
  { key: '전체' as const, label: '전체' },
  ...RENTAL_TYPES.map((t) => ({ key: t, label: t })),
];
type RentalChip = (typeof RENTAL_CHIP_OPTS)[number]['key'];

const CONTRACT_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '계약 기본정보', open: true, fields: ['contractNo', 'status', 'rentalType', 'contractDate', 'plate', 'carName'] },
  { title: '계약자정보', fields: ['contractorName', 'contractorPhone', 'contractorBirth', 'contractorLicenseNo', 'licenseType', 'contractorAddress'] },
  { title: '기간·차량조건', fields: ['startDate', 'endDate', 'rentalMonths', 'annualMileageLimit', 'pickupPlace', 'returnPlace'] },
  { title: '요금·납부조건', fields: ['monthlyRent', 'deposit', 'reservationFee', 'paymentDay', 'paymentTiming', 'lateFeeRate', 'earlyTerminationRate'] },
  { title: '보험·운전자', fields: ['driverAgeMin', 'insuranceAge', 'cdw', 'deductible', 'superCover', 'additionalDrivers', 'withDriver'] },
];

function ContractLedgerInner() {
  const mobile = useIsMobile();
  const searchParams = useSearchParams();
  const { rows: contracts, loading } = useEntityList('contract');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'계약유지' | '계약종료' | '전체'>('계약유지');
  const [dateBasis, setDateBasis] = useState<'계약일' | '종료일'>('계약일');
  const [riskOnly, setRiskOnly] = useState(false);
  const [rentalChip, setRentalChip] = useState<RentalChip>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(CONTRACT_FILTER_DEFS));
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof contractMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const allRows = useMemo(() => contracts
    .map((record) => contractMasterRow(record, TODAY))
    .sort((a, b) => Number(a.ended) - Number(b.ended) || a.endDate.localeCompare(b.endDate)), [contracts]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (!open || !allRows.length) return;
    const hit = allRows.find((r) =>
      String(r.raw._key || '') === open
      || String(r.raw.id || '') === open
      || r.contractNo === open,
    );
    if (hit) {
      setCreating(false);
      setEditing(false);
      setSelected(hit);
      if (hit.ended) setScope('전체');
    }
  }, [searchParams, allRows]);

  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.contractNo, r.plate, r.carName, r.contractorName, r.contractorPhone, r.contractorLicenseNo, r.status, r.rentalType, r.dataAlert, r.riskLabel),
  ), [allRows, q]);
  const latest = useMemo(() => allRows.reduce((latestDate, row) => {
    const date = dateBasis === '종료일' ? (row.returnedDate || row.endDate) : (row.contractDate || row.startDate);
    return date > latestDate ? date : latestDate;
  }, TODAY), [allRows, dateBasis]);
  const contractFilterMatchers = useMemo(() => ({
    status: eqFilter<ReturnType<typeof contractMasterRow>>((r) => r.status),
    endReason: eqFilter<ReturnType<typeof contractMasterRow>>((r) => r.endReason),
  }), []);
  const rows = useMemo(() => searchedRows.filter((r) => {
    if (!(scope === '전체' || (scope === '계약유지' ? !r.ended : r.ended))) return false;
    if (riskOnly && !r.atRisk) return false;
    if (rentalChip !== '전체' && r.rentalType !== rentalChip) return false;
    if (!matchLedgerFilters(r, detailFilters, contractFilterMatchers)) return false;
    const date = dateBasis === '종료일' ? (r.returnedDate || r.endDate) : (r.contractDate || r.startDate);
    if (range.from && (!date || date < range.from)) return false;
    if (range.to && (!date || date > range.to)) return false;
    return true;
  }), [searchedRows, scope, riskOnly, rentalChip, detailFilters, contractFilterMatchers, dateBasis, range.from, range.to]);
  const contractStatuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort(), [allRows]);
  const endReasons = useMemo(() => [...new Set(allRows.map((r) => r.endReason).filter(Boolean))].sort(), [allRows]);
  const detailFilterCount = countActiveFilters(detailFilters, CONTRACT_FILTER_DEFS);
  const { active, riskCount, riskDebtSum, endedRiskCount, endedRiskDebtSum } = useMemo(
    () => summarizeContractLedgerStats(searchedRows, TODAY),
    [searchedRows],
  );

  return (
    <LedgerFrame
      title="계약관리"
      meta="계약 1건=1행·손님·기간·미수"
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
        ><Plus size={14} /> {creating ? '생성 취소' : '계약 생성'}</Btn>
      </LedgerActions>}
      tools={<LedgerActions aria-label="워크플로">
        <Btn size="sm" variant="ghost" iconOnly tip="계약서·자료 투입 — 데이터관리" onClick={() => openIngest('contract')}>
          <UploadCloud size={14} />
        </Btn>
        <Btn size="sm" variant="ghost" iconOnly tip="미수 회수" onClick={() => openReceivables()}>
          <CircleDollarSign size={14} />
        </Btn>
      </LedgerActions>}
      filters={<>
        <Search size="sm" placeholder="회사·계약번호·차량·계약자·상태·리스크·알람" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 300 }} />
        <LedgerFilterButton open={filterOpen} count={detailFilterCount} onClick={() => setFilterOpen((open) => !open)} />
        <Select size="sm" aria-label="계약 원장 선택" value={scope} onChange={(event) => setScope(event.target.value as typeof scope)}>
          <option value="계약유지">유지계약 원장</option>
          <option value="계약종료">종료계약 원장</option>
          <option value="전체">전체계약 원장</option>
        </Select>
        <Select size="sm" aria-label="계약 날짜 기준" value={dateBasis} onChange={(event) => setDateBasis(event.target.value as typeof dateBasis)}>
          <option value="계약일">계약일 기준</option>
          <option value="종료일">종료일 기준</option>
        </Select>
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
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>유지 <b style={{ color: C.ok }}>{active}</b> · 리스크 <b style={{ color: C.danger }}>{riskCount}건</b>{riskDebtSum > 0 ? <> · 미수 {won(riskDebtSum)}</> : null} · 종료 리스크 <b>{endedRiskCount}건</b>{endedRiskDebtSum > 0 ? <> · 미수 {won(endedRiskDebtSum)}</> : null}</span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty={<>
        등록된 계약이 없습니다. 계약서는 데이터관리에서 담으세요.
        <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
          <Btn size="sm" variant="ghost" onClick={() => openIngest('contract')}><UploadCloud size={14} /> 데이터관리</Btn>
          <MigrateDataButton size="sm" />
        </div>
      </>}
      cols={colView === '기본' ? CONTRACT_MASTER_BASIC_COLS : CONTRACT_MASTER_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.contractNo || `${r.plate}:${r.startDate}`}
      selectedRowKey={selected ? (selected.contractNo || `${selected.plate}:${selected.startDate}`) : null}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setEditing(false);
        setSelected(row);
      }}
      onCloseDetail={() => { setSelected(null); setEditing(false); }}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title="계약 세부 필터"
          onClose={() => setFilterOpen(false)}
          onReset={() => setDetailFilters(emptyFilterValues(CONTRACT_FILTER_DEFS))}
        >
          <LedgerFilterFields
            defs={CONTRACT_FILTER_DEFS}
            values={detailFilters}
            onChange={(key, value) => setDetailFilters((prev) => ({ ...prev, [key]: value }))}
            options={{ status: contractStatuses, endReason: endReasons }}
          />
        </LedgerFilterPanel>
      ) : null}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-contract"
          entityKey="contract"
          title="계약 생성"
          sections={CONTRACT_CREATE_SECTIONS}
          initial={{ status: '대기', paymentTiming: '선납' }}
          onClose={() => setCreating(false)}
        />
      ) : selected && editing ? (
        <LedgerEditPanel
          key={`edit-contract:${selected.contractNo || selected.plate}`}
          entityKey="contract"
          title={`${selected.contractNo || selected.contractorName || '계약'} 수정`}
          sections={CONTRACT_CREATE_SECTIONS}
          record={selected.raw}
          onClose={() => setEditing(false)}
          onSaved={(record) => setSelected(contractMasterRow(record, TODAY))}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.contractNo || selected.contractorName || '계약'}
          identity={`${selected.contractorName || '계약자 미입력'}${selected.plate ? ` · ${selected.plate}` : ''}`}
          statusBadge={<Badge tone={selected.ended ? 'gray' : 'green'}>{selected.status}</Badge>}
          row={selected}
          cols={CONTRACT_MASTER_EXPANDED_COLS}
          sections={CONTRACT_DETAIL_SECTIONS}
          onClose={() => { setSelected(null); setEditing(false); }}
          actions={<>
            <Btn size="sm" onClick={() => setEditing(true)}><Pencil size={14} /> 수정</Btn>
            {selected.net > 0 && (
              <>
                <Btn size="sm" variant="ghost" iconOnly tip="미수 회수" onClick={() => openReceivables()}>
                  <CircleDollarSign size={14} />
                </Btn>
                <Btn
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    void sendNoticeCert({ rec: selected.raw, companyId: String(selected.raw.companyId || '') });
                  }}
                >
                  내용증명
                </Btn>
              </>
            )}
          </>}
        >
          {selected.plate ? <ContractScheduleEmbed plate={selected.plate} /> : null}
        </LedgerRecordPanel>
      ) : null}
    />
  );
}

export default function ContractLedgerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ContractLedgerInner />
    </Suspense>
  );
}
