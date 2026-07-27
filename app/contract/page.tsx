'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { contractMasterRow } from '@/lib/master-ledgers';
import { CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, LedgerCreatePanel, LedgerFrame, LedgerRecordPanel, PillTabs, Search, won,
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
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof contractMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const allRows = useMemo(() => contracts
    .map((record) => contractMasterRow(record, TODAY))
    .sort((a, b) => Number(a.ended) - Number(b.ended) || a.endDate.localeCompare(b.endDate)), [contracts]);
  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.contractNo, r.plate, r.carName, r.contractorName, r.contractorPhone, r.contractorLicenseNo, r.status, r.dataAlert),
  ), [allRows, q]);
  const rows = useMemo(() => searchedRows.filter((r) =>
    scope === '전체' || (scope === '계약유지' ? !r.ended : r.ended),
  ), [searchedRows, scope]);
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
        <PillTabs
          size="sm"
          value={scope}
          onChange={setScope}
          tabs={[
            { key: '계약유지', label: '계약유지', badge: active },
            { key: '계약종료', label: '계약종료', badge: searchedRows.length - active },
            { key: '전체', label: '전체', badge: searchedRows.length },
          ]}
        />
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
