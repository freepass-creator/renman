'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { contractMasterRow } from '@/lib/master-ledgers';
import { CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, LedgerCreatePanel, LedgerFilterButton, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, PeriodBar, Search, Select, toggleStyle, won,
  type LedgerColView, type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

const CONTRACT_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '계약 기본정보', open: true, fields: ['contractNo', 'status', 'contractDate', 'plate', 'carName'] },
  { title: '계약자정보', fields: ['contractorName', 'contractorPhone', 'contractorBirth', 'contractorLicenseNo', 'licenseType', 'contractorAddress'] },
  { title: '기간·차량조건', fields: ['startDate', 'endDate', 'rentalMonths', 'annualMileageLimit', 'pickupPlace', 'returnPlace'] },
  { title: '요금·납부조건', fields: ['monthlyRent', 'deposit', 'reservationFee', 'paymentDay', 'paymentTiming', 'lateFeeRate', 'earlyTerminationRate'] },
  { title: '보험·운전자', fields: ['driverAgeMin', 'insuranceAge', 'cdw', 'deductible', 'superCover', 'additionalDrivers', 'withDriver'] },
];

export default function ContractLedgerPage() {
  const mobile = useIsMobile();
  const { rows: contracts, loading } = useEntityList('contract');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'계약유지' | '계약종료' | '전체'>('계약유지');
  const [dateBasis, setDateBasis] = useState<'계약일' | '종료일'>('계약일');
  const [receivableOnly, setReceivableOnly] = useState(false);
  const [range, setRange] = useState({ from: '', to: '' });
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailStatus, setDetailStatus] = useState('');
  const [detailEndReason, setDetailEndReason] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof contractMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const allRows = useMemo(() => contracts
    .map((record) => contractMasterRow(record, TODAY))
    .sort((a, b) => Number(a.ended) - Number(b.ended) || a.endDate.localeCompare(b.endDate)), [contracts]);
  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.contractNo, r.plate, r.carName, r.contractorName, r.contractorPhone, r.contractorLicenseNo, r.status, r.dataAlert),
  ), [allRows, q]);
  const latest = useMemo(() => allRows.reduce((latestDate, row) => {
    const date = dateBasis === '종료일' ? (row.returnedDate || row.endDate) : (row.contractDate || row.startDate);
    return date > latestDate ? date : latestDate;
  }, TODAY), [allRows, dateBasis]);
  const rows = useMemo(() => searchedRows.filter((r) => {
    if (!(scope === '전체' || (scope === '계약유지' ? !r.ended : r.ended))) return false;
    if (receivableOnly && r.net <= 0) return false;
    if (detailStatus && r.status !== detailStatus) return false;
    if (detailEndReason && r.endReason !== detailEndReason) return false;
    const date = dateBasis === '종료일' ? (r.returnedDate || r.endDate) : (r.contractDate || r.startDate);
    if (range.from && (!date || date < range.from)) return false;
    if (range.to && (!date || date > range.to)) return false;
    return true;
  }), [searchedRows, scope, receivableOnly, detailStatus, detailEndReason, dateBasis, range.from, range.to]);
  const contractStatuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort(), [allRows]);
  const endReasons = useMemo(() => [...new Set(allRows.map((r) => r.endReason).filter(Boolean))].sort(), [allRows]);
  const detailFilterCount = Number(!!detailStatus) + Number(!!detailEndReason);
  const active = searchedRows.filter((r) => !r.ended).length;
  // 실미수 = 현재 진행 계약 중 결제일이 도래한 미납만.
  // 종료 계약의 남은 채권은 회수대상 잔존채권으로 분리하고 실미수 KPI에 합치지 않는다.
  const debt = searchedRows.filter((r) => !r.ended && r.net > 0);
  const debtSum = debt.reduce((sum, r) => sum + r.net, 0);
  const endedDebt = searchedRows.filter((r) => r.ended && r.net > 0);
  const endedDebtSum = endedDebt.reduce((sum, r) => sum + r.net, 0);

  return (
    <LedgerFrame
      title="계약관리"
      meta="계약 1건 1행 · 계약자·차량·기간·납부조건·반납·미수"
      right={<Btn size="sm" variant={creating ? 'ghost' : 'solid'} aria-pressed={creating} onClick={() => {
        setSelected(null);
        setCreating((open) => !open);
      }}><Plus size={14} /> {creating ? '생성 취소' : '계약 생성'}</Btn>}
      filters={<>
        <Search size="sm" placeholder="회사·계약번호·차량·계약자·상태·알람" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 300 }} />
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
        <button type="button" data-ui="toggle" aria-pressed={receivableOnly} onClick={() => setReceivableOnly((active) => !active)} style={toggleStyle(receivableOnly, 'sm', mobile)}>미수</button>
        <PeriodBar latest={latest} initial="전체" onRange={setRange} />
      </>}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>유지 <b style={{ color: C.ok }}>{active}</b> · 실미수 <b style={{ color: C.danger }}>{debt.length}건 {won(debtSum)}</b> · 계약종료 미수 <b>{endedDebt.length}건 {won(endedDebtSum)}</b></span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty="등록된 계약이 없습니다."
      cols={colView === '기본' ? CONTRACT_MASTER_BASIC_COLS : CONTRACT_MASTER_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.contractNo || `${r.plate}:${r.startDate}`}
      selectedRowKey={selected ? (selected.contractNo || `${selected.plate}:${selected.startDate}`) : null}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setSelected(row);
      }}
      onCloseDetail={() => setSelected(null)}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel title="계약 세부 필터" onClose={() => setFilterOpen(false)} onReset={() => { setDetailStatus(''); setDetailEndReason(''); }}>
          <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>계약상태</span><Select value={detailStatus} onChange={(e) => setDetailStatus(e.target.value)} style={{ width: '100%' }}><option value="">전체</option>{contractStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
          <label><span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>종료사유</span><Select value={detailEndReason} onChange={(e) => setDetailEndReason(e.target.value)} style={{ width: '100%' }}><option value="">전체</option>{endReasons.map((value) => <option key={value} value={value}>{value}</option>)}</Select></label>
        </LedgerFilterPanel>
      ) : null}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-contract"
          entityKey="contract"
          title="계약 생성"
          sections={CONTRACT_CREATE_SECTIONS}
          initial={{ status: '대기', paymentTiming: '선불' }}
          onClose={() => setCreating(false)}
        />
      ) : selected ? (
        <LedgerRecordPanel
          title={selected.contractNo || selected.contractorName}
          subtitle={`${selected.contractorName || '계약자 미입력'} · ${selected.plate || '차량 미입력'}`}
          row={selected}
          cols={CONTRACT_MASTER_EXPANDED_COLS}
          onClose={() => setSelected(null)}
        />
      ) : null}
    />
  );
}
