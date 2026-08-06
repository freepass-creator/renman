'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Pencil, Plus, UploadCloud, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { contractMasterRow } from '@/lib/master-ledgers';
import { CONTRACT_DETAIL_SECTIONS, CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS, SCHEDULE_LEDGER_ALL_COLS, SCHEDULE_LEDGER_COLS } from '@/lib/master-ledger-cols';
import { latestDateOf, summarizeContractLedgerStats } from '@/lib/ledger-stats';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Badge, Btn, C, ContextMenu, type ContextMenuItem, LedgerActions, LedgerActiveFilters, LedgerCreatePanel, LedgerEditPanel, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, Message, PageLoading, PeriodBar, PillTabs, Search, Select, useSheetExport, won,
  type LedgerFormSection,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { openIngest, openReceivables } from '@/lib/ui-bus';
import { sendNoticeCert } from '@/lib/docs/send-notice';
import {
  CONTRACT_FILTER_DEFS, countActiveFilters, emptyFilterValues, eqFilter, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import { RENTAL_TYPES } from '@/lib/schema/contract';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { depositView } from '@/lib/deposit';
import {
  buildScheduleLedger, summarizeScheduleLedger, type ScheduleLedgerRow,
} from '@/lib/contract-ops';
import { NotifyDialog } from '@/components/NotifyDialog';
import { notifyRecipients } from '@/lib/notify/recipients';
import { hydrateContractsWithDepositReceipts } from '@/lib/payments/deposit-receipts';

type RentalChip = '전체' | (typeof RENTAL_TYPES)[number];
/** 계약범위 — 전체·진행·만기임박·미납·종료 (riskLabel·net·dday 판정). */
type ContractBucket = '전체' | '진행' | '만기임박' | '미납' | '종료';
type ContractSheetView = '기본' | '전체' | '회차';
const CONTRACT_BUCKETS: ContractBucket[] = ['진행', '만기임박', '미납', '종료'];
const ROW_DISPLAY_CAP = 200;

function matchContractBucket(r: ReturnType<typeof contractMasterRow>, bucket: ContractBucket): boolean {
  if (bucket === '전체') return true;
  if (bucket === '종료') return r.ended;
  if (bucket === '미납') return r.net > 0 || r.unpaidCount > 0 || r.riskLabel.includes('미수');
  if (bucket === '만기임박') {
    if (r.ended) return false;
    const d = dday(r.endDate);
    return d != null && d >= 0 && d <= 30;
  }
  // 진행 = 종료 아닌 유지 계약
  return !r.ended;
}

const CONTRACT_CREATE_SECTIONS: LedgerFormSection[] = [
  { title: '계약 기본', open: true, fields: ['contractNo', 'status', 'rentalType', 'contractDate', 'plate', 'carName'] },
  { title: '계약자', fields: ['contractorName', 'contractorPhone', 'contractorBirth', 'contractorLicenseNo', 'contractorLicenseExpiry', 'licenseType', 'contractorAddress'] },
  { title: '기간·인도', fields: ['startDate', 'endDate', 'rentalMonths', 'annualMileageLimit', 'pickupPlace', 'returnPlace'] },
  { title: '요금·납부', fields: ['monthlyRent', 'deposit', 'depositReceived', 'depositReceivedDate', 'reservationFee', 'paymentDay', 'paymentTiming', 'lateFeeRate', 'earlyTerminationRate', 'overMileageRate'] },
  { title: '보험·특약', fields: ['driverAgeMin', 'insuranceAge', 'cdw', 'deductible', 'superCover', 'additionalDrivers', 'withDriver'] },
];

function ContractLedgerInner() {
  const mobile = useIsMobile();
  const { isOperator } = useSession();
  const searchParams = useSearchParams();
  const { data: [storedContracts = [], bankTransactions = []], loading, error: loadError, reload } = useEntityLists(['contract', 'bank_tx']);
  const contracts = useMemo(
    () => hydrateContractsWithDepositReceipts(storedContracts, bankTransactions),
    [bankTransactions, storedContracts],
  );
  const [q, setQ] = useState('');
  const [bucket, setBucket] = useState<ContractBucket>('진행');
  const [dateBasis, setDateBasis] = useState<'계약일' | '종료일'>('계약일');
  const [rentalChip, setRentalChip] = useState<RentalChip>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(CONTRACT_FILTER_DEFS));
  const [filterOpen, setFilterOpen] = useState(false);
  const [sheetView, setSheetView] = useState<ContractSheetView>('기본');
  useEffect(() => {
    if (mobile && sheetView === '전체') setSheetView('기본');
  }, [mobile, sheetView]);
  const [selected, setSelected] = useState<ReturnType<typeof contractMasterRow> | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState<ReturnType<typeof notifyRecipients>>([]);
  const allRows = useMemo(() => contracts
    .map((record) => contractMasterRow(record, TODAY))
    .sort((a, b) => Number(a.ended) - Number(b.ended) || a.endDate.localeCompare(b.endDate)), [contracts]);

  useEffect(() => {
    const open = searchParams.get('open');
    const depositQ = searchParams.get('deposit');
    if (depositQ === '1') {
      setDetailFilters((prev) => ({ ...prev, deposit: '보증금미반환' }));
      setBucket('종료');
      setFilterOpen(true);
    }
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
      if (hit.ended) setBucket('종료');
    }
  }, [searchParams, allRows]);

  const searchedRows = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.contractNo, r.plate, r.carName, r.contractorName, r.contractorPhone, r.contractorLicenseNo, r.status, r.rentalType, r.dataAlert, r.riskLabel),
  ), [allRows, q]);
  const latest = useMemo(
    () => latestDateOf(
      allRows,
      (row) => (dateBasis === '종료일' ? (row.returnedDate || row.endDate) : (row.contractDate || row.startDate)),
      TODAY,
    ),
    [allRows, dateBasis],
  );
  const contractFilterMatchers = useMemo(() => ({
    status: eqFilter<ReturnType<typeof contractMasterRow>>((r) => r.status),
    endReason: eqFilter<ReturnType<typeof contractMasterRow>>((r) => r.endReason),
    deposit: (r: ReturnType<typeof contractMasterRow>, value: string) => {
      if (!value) return true;
      if (value === '보증금미반환') return depositView(r.raw, TODAY).pendingRefund;
      return true;
    },
  }), []);
  const rows = useMemo(() => searchedRows.filter((r) => {
    const depositOnly = detailFilters.deposit === '보증금미반환';
    if (!depositOnly && !matchContractBucket(r, bucket)) return false;
    if (rentalChip !== '전체' && r.rentalType !== rentalChip) return false;
    if (!matchLedgerFilters(r, detailFilters, contractFilterMatchers)) return false;
    const date = dateBasis === '종료일' ? (r.returnedDate || r.endDate) : (r.contractDate || r.startDate);
    if (range.from && (!date || date < range.from)) return false;
    if (range.to && (!date || date > range.to)) return false;
    return true;
  }), [searchedRows, bucket, rentalChip, detailFilters, contractFilterMatchers, dateBasis, range.from, range.to]);

  const scheduleAll = useMemo(
    () => (sheetView === '회차' ? buildScheduleLedger(contracts, TODAY) : []),
    [contracts, sheetView],
  );
  const scheduleRows = useMemo(() => {
    if (sheetView !== '회차') return [] as ScheduleLedgerRow[];
    return scheduleAll.filter((r) => {
      if (detailFilters.scheduleStatus && r.status !== detailFilters.scheduleStatus) return false;
      if (range.from && (!r.dueDate || r.dueDate < range.from)) return false;
      if (range.to && (!r.dueDate || r.dueDate > range.to)) return false;
      return textMatch(q, r.company, r.contractNo, r.contractorName, r.plate, r.kind, r.status, r.dueDate);
    });
  }, [sheetView, scheduleAll, detailFilters.scheduleStatus, range.from, range.to, q]);
  const scheduleStats = useMemo(() => summarizeScheduleLedger(scheduleRows), [scheduleRows]);
  const scheduleDisplay = useMemo(
    () => (scheduleRows.length > ROW_DISPLAY_CAP ? scheduleRows.slice(0, ROW_DISPLAY_CAP) : scheduleRows),
    [scheduleRows],
  );
  const scheduleMore = Math.max(0, scheduleRows.length - ROW_DISPLAY_CAP);

  const contractStatuses = useMemo(() => [...new Set(allRows.map((r) => r.status).filter(Boolean))].sort(), [allRows]);
  const endReasons = useMemo(() => [...new Set(allRows.map((r) => r.endReason).filter(Boolean))].sort(), [allRows]);
  const { active, riskCount, riskDebtSum, endedRiskCount, endedRiskDebtSum } = useMemo(
    () => summarizeContractLedgerStats(searchedRows, TODAY),
    [searchedRows],
  );

  const xl = useSheetExport<ReturnType<typeof contractMasterRow> | ScheduleLedgerRow>({
    title: sheetView === '회차' ? '회차별청구' : '계약관리',
    filterSummary: () => {
      if (sheetView === '회차') {
        const parts: string[] = [];
        if (detailFilters.scheduleStatus) parts.push(detailFilters.scheduleStatus);
        if (range.from || range.to) parts.push(`${range.from || '…'}~${range.to || '…'}`);
        if (q.trim()) parts.push('검색');
        return parts.join(' · ') || '전체';
      }
      const parts = [bucket === '전체' ? '' : bucket, rentalChip === '전체' ? '' : rentalChip].filter(Boolean);
      if (range.from || range.to) parts.push(`${range.from || '…'}~${range.to || '…'}`);
      if (q.trim()) parts.push('검색');
      return parts.join(' · ') || '전체';
    },
    sumLine: () => (sheetView === '회차'
      ? `청구 ${won(scheduleStats.charge)} · 납부 ${won(scheduleStats.paid)} · 잔액 ${won(scheduleStats.balance)}`
      : (riskDebtSum ? `미수합 ${won(riskDebtSum)}` : '')),
  });
  const ctxItems: ContextMenuItem[] = [
    xl.exportItem(),
    ...(isOperator ? [xl.exportItem({ unmasked: true })] : []),
  ];

  const activeContractFilterDefs = sheetView === '회차'
    ? CONTRACT_FILTER_DEFS.filter((def) => def.key === 'scheduleStatus')
    : CONTRACT_FILTER_DEFS.filter((def) => def.key !== 'scheduleStatus');
  const activeFilterValues = {
    ...detailFilters,
    // '진행'은 계약 원장의 기본 업무 범위다. 사용자가 건 필터로 세지 않는다.
    bucket: sheetView === '회차' || bucket === '전체' || bucket === '진행' ? '' : bucket,
    rentalType: sheetView === '회차' || rentalChip === '전체' ? '' : rentalChip,
  };
  const filterCount = countActiveFilters(activeFilterValues, activeContractFilterDefs);

  const isSchedule = sheetView === '회차';
  const frameCols = isSchedule
    ? SCHEDULE_LEDGER_COLS
    : (sheetView === '전체' ? CONTRACT_MASTER_EXPANDED_COLS : CONTRACT_MASTER_BASIC_COLS);
  const frameRows = isSchedule ? scheduleDisplay : rows;

  return (
    <>
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
        >{creating ? <X size={14} /> : <Plus size={14} />} {creating ? '생성 취소' : '계약 생성'}</Btn>
      </LedgerActions>}
      filters={<>
        <Search
          size="sm"
          placeholder="회사·계약번호·차량·계약자·상태·리스크·알람"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
        />
        <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
        {!filterOpen && <LedgerActiveFilters
          defs={activeContractFilterDefs}
          values={activeFilterValues}
          onClear={(key) => {
            if (key === 'bucket') { setBucket('진행'); setDetailFilters((prev) => ({ ...prev, bucket: '' })); return; }
            if (key === 'rentalType') { setRentalChip('전체'); setDetailFilters((prev) => ({ ...prev, rentalType: '' })); return; }
            setDetailFilters((prev) => ({ ...prev, [key]: '' }));
          }}
          onClearAll={() => {
            setDetailFilters(emptyFilterValues(CONTRACT_FILTER_DEFS));
            setBucket('진행');
            setRentalChip('전체');
            setDateBasis('계약일');
          }}
        />}
        <PeriodBar key={sheetView} latest={latest} initial={isSchedule ? '월간' : '전체'} size="sm" onRange={setRange} />
      </>}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title={isSchedule ? '회차 필터' : '계약 필터'}
          onReset={() => {
            setDetailFilters(emptyFilterValues(CONTRACT_FILTER_DEFS));
            setBucket('진행');
            setRentalChip('전체');
            setDateBasis('계약일');
          }}
          onClose={() => setFilterOpen(false)}
        >
          <LedgerFilterFields
            defs={activeContractFilterDefs}
            values={{
              ...detailFilters,
              bucket: bucket === '전체' ? '' : bucket,
              rentalType: rentalChip === '전체' ? '' : rentalChip,
            }}
            onChange={(key, value) => {
              if (key === 'bucket') {
                setBucket((value || '전체') as ContractBucket);
                setDetailFilters((prev) => ({ ...prev, bucket: value }));
                return;
              }
              if (key === 'rentalType') {
                setRentalChip((value || '전체') as RentalChip);
                setDetailFilters((prev) => ({ ...prev, rentalType: value }));
                return;
              }
              setDetailFilters((prev) => ({ ...prev, [key]: value }));
            }}
            options={{
              bucket: CONTRACT_BUCKETS,
              rentalType: [...RENTAL_TYPES],
              status: contractStatuses,
              endReason: endReasons,
              deposit: ['보증금미반환'],
              scheduleStatus: ['예정', '연체', '부분납', '완료', '면제'],
            }}
          />
          {!isSchedule && (
          <label>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>날짜 기준</span>
            <Select value={dateBasis} onChange={(event) => setDateBasis(event.target.value as typeof dateBasis)} style={{ width: '100%' }}>
              <option value="계약일">계약일 기준</option>
              <option value="종료일">종료일 기준</option>
            </Select>
          </label>
          )}
        </LedgerFilterPanel>
      ) : null}
      hint={isSchedule && scheduleMore > 0 ? (
        <Message variant="warning">
          표는 상위 {ROW_DISPLAY_CAP}건만 표시합니다 (외 {scheduleMore.toLocaleString('ko-KR')}건). 월간·검색으로 좁히면 전부 볼 수 있습니다.
        </Message>
      ) : null}
      stats={isSchedule ? (
        <span style={{ fontSize: 12.5, color: C.mute }}>
          회차 <b>{scheduleStats.count}</b>
          {' · '}청구 <b>{won(scheduleStats.charge)}</b>
          {' · '}납부 <b style={{ color: C.ok }}>{won(scheduleStats.paid)}</b>
          {' · '}잔액 <b style={{ color: scheduleStats.balance ? C.danger : C.ink }}>{won(scheduleStats.balance)}</b>
          {' · '}연체 <b style={{ color: scheduleStats.overdueCount ? C.danger : C.ink }}>{scheduleStats.overdueCount}</b>
        </span>
      ) : (
        <span style={{ fontSize: 12.5, color: C.mute }}>진행 계약 <b style={{ color: C.ok }}>{active}건</b> · 진행 리스크 <b style={{ color: C.danger }}>{riskCount}건</b>{riskDebtSum > 0 ? <> · 계약유지 미수 {won(riskDebtSum)}</> : null} · 종료 후 리스크 <b>{endedRiskCount}건</b>{endedRiskDebtSum > 0 ? <> · 계약종료 미수 {won(endedRiskDebtSum)}</> : null}</span>
      )}
      showColView={false}
      colView={sheetView === '전체' ? '전체' : '기본'}
      view={(
        <PillTabs
          size="sm"
          value={sheetView}
          onChange={(v) => setSheetView((v as ContractSheetView) || '기본')}
          tabs={mobile ? [
            { key: '기본', label: '목록' },
            { key: '회차', label: '회차' },
          ] : [
            { key: '기본', label: '기본' },
            { key: '전체', label: '전체' },
            { key: '회차', label: '회차' },
          ]}
        />
      )}
      loading={loading}
      error={loadError}
      empty={isSchedule
        ? '해당 기간에 도래하는 회차 없음'
        : <>
          등록된 계약이 없습니다. 계약서는 데이터센터에 먼저 담으세요.
          <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center', gap: 8 }}>
            <Btn size="sm" variant="ghost" onClick={() => openIngest('contract')}><UploadCloud size={14} /> 데이터센터</Btn>
          </div>
        </>}
      cols={frameCols as typeof CONTRACT_MASTER_BASIC_COLS}
      rows={frameRows as typeof rows}
      exportRows={(isSchedule ? scheduleRows : undefined) as typeof rows | undefined}
      rowKey={(r) => {
        if (isSchedule) return (r as unknown as ScheduleLedgerRow).id;
        const c = r as ReturnType<typeof contractMasterRow>;
        return String(c.raw._key || c.contractNo || '');
      }}
      selectedRowKey={selected ? String(selected.raw._key || selected.contractNo || '') : null}
      mobileCard={(row) => {
        if (isSchedule) {
          const schedule = row as unknown as ScheduleLedgerRow;
          return {
            co: isOperator ? schedule.companyId : undefined,
            badge: schedule.status,
            badgeTone: schedule.status === '연체' ? 'red' : schedule.status === '부분납' || schedule.status === '예정' ? 'amber' : 'green',
            plate: schedule.plate || LEDGER_EMPTY.unassigned,
            carType: `${schedule.contractorName || LEDGER_EMPTY.none} · ${schedule.seq}/${schedule.seqTotal}회차`,
            fields: [['납기', schedule.dueDate || LEDGER_EMPTY.dash], ['구분', schedule.kind]],
            right: won(schedule.balance > 0 ? schedule.balance : schedule.charge),
            rail: schedule.status === '연체' ? 'danger' as const : 'none' as const,
          };
        }
        const contract = row as ReturnType<typeof contractMasterRow>;
        return {
          co: isOperator ? contract.companyId : undefined,
          badge: contract.status,
          badgeTone: contract.atRisk ? 'red' as const : contract.ended ? 'gray' as const : 'green' as const,
          plate: contract.plate || LEDGER_EMPTY.unassigned,
          carType: contract.contractorName || contract.carName || LEDGER_EMPTY.none,
          fields: [
            ['계약', contract.contractNo || LEDGER_EMPTY.dash],
            ['만기', contract.endDate || LEDGER_EMPTY.dash],
            ...(contract.riskLabel ? [['확인', contract.riskLabel] as [string, string]] : []),
          ],
          right: contract.net > 0 ? won(contract.net) : won(contract.monthlyRent),
          rail: contract.atRisk ? 'danger' as const : 'none' as const,
        };
      }}
      onView={xl.onView as (v: { rows: typeof rows; cols: typeof CONTRACT_MASTER_BASIC_COLS }) => void}
      onRowContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
      }}
      onRowDoubleClick={(row) => {
        setCreating(false);
        setEditing(false);
        if (isSchedule) {
          setSelected(contractMasterRow((row as unknown as ScheduleLedgerRow).rec, TODAY));
        } else {
          setSelected(row as ReturnType<typeof contractMasterRow>);
        }
      }}
      onCloseDetail={() => { setSelected(null); setEditing(false); }}
      sidePanel={creating ? (
        <LedgerCreatePanel
          key="new-contract"
          entityKey="contract"
          title="계약 생성"
          sections={CONTRACT_CREATE_SECTIONS}
          initial={{ status: '대기', paymentTiming: '선납' }}
          fileIngest={{ label: '파일로 투입 (데이터센터)', onClick: () => openIngest('contract') }}
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
          identity={`${selected.contractorName || LEDGER_EMPTY.none}${selected.plate ? ` · ${selected.plate}` : ''}`}
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
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSmsRecipients(notifyRecipients([selected.raw], TODAY));
                    setSmsOpen(true);
                  }}
                >
                  문자
                </Btn>
              </>
            )}
          </>}
        />
      ) : null}
    />
    <ContextMenu
      open={ctxMenu.open}
      x={ctxMenu.x}
      y={ctxMenu.y}
      onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
      items={ctxItems}
    />
    {smsOpen && (
      <NotifyDialog
        onClose={() => setSmsOpen(false)}
        recipients={smsRecipients}
        initialLabel="대여료 청구"
        onSent={reload}
      />
    )}
    </>
  );
}

export default function ContractLedgerPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ContractLedgerInner />
    </Suspense>
  );
}
