'use client';

import { ChevronRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useMemo, useState } from 'react';
import { companyLabel, RENTAL_COMPANY_IDS } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { contractMasterRow } from '@/lib/master-ledgers';
import { normPlate } from '@/lib/plate';
import { buildScheduleLedger } from '@/lib/contracts/schedule-ledger';
import { buildFleetRows } from '@/lib/sheet-rows';
import { useDashboardData } from '@/lib/use-dashboard-data';
import type { EntityRecord } from '@/lib/intake/entities';
import { SheetButton } from '@/components/ui/sheet-controls';
import RebornHeader from '../_components/RebornHeader';
import styles from '../records.module.css';

type LedgerKind = 'vehicle' | 'contract' | 'collection' | 'cash';

const number = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });
const LEDGERS: Array<{ key: LedgerKind; label: string; note: string }> = [
  { key: 'vehicle', label: '차량', note: '취득부터 처분까지' },
  { key: 'contract', label: '계약', note: '현재와 종료 이력' },
  { key: 'collection', label: '수납', note: '회차별 청구와 미수' },
  { key: 'cash', label: '자금', note: '입출금과 연결 상태' },
];

function text(value: unknown, fallback = '—'): string {
  const resolved = String(value ?? '').trim();
  return resolved || fallback;
}

function money(value: unknown): string {
  return `${number.format(Number(value) || 0)}원`;
}

function date(value: unknown): string {
  return String(value || '').slice(0, 10) || '—';
}

function includesQuery(values: unknown[], query: string): boolean {
  if (!query.trim()) return true;
  const needle = query.replace(/\s/g, '').toLowerCase();
  return values.some((value) => String(value ?? '').replace(/\s/g, '').toLowerCase().includes(needle));
}

function vehicleHref(plate: string, companyId = ''): string {
  const company = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return `/sheet/reborn/vehicle/${encodeURIComponent(plate)}${company}`;
}

export default function LedgerHub() {
  const { contracts, vehicles, insurances, bankTx, history, loading, error } = useDashboardData(RENTAL_COMPANY_IDS);
  const [ledger, setLedger] = useState<LedgerKind>('vehicle');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const fleet = useMemo(() => linkFleet(vehicles, contracts, TODAY), [contracts, vehicles]);
  const vehicleRows = useMemo(
    () => buildFleetRows(fleet.vehicles, insurances, fleet.contracts, history, TODAY),
    [fleet, history, insurances],
  );
  const contractRows = useMemo(
    () => contracts.map((record) => contractMasterRow(record, TODAY))
      .sort((left, right) => Number(left.ended) - Number(right.ended) || right.net - left.net || right.startDate.localeCompare(left.startDate)),
    [contracts],
  );
  const collectionRows = useMemo(
    () => buildScheduleLedger(contracts, TODAY)
      .sort((left, right) => Number(right.balance > 0) - Number(left.balance > 0) || right.overdueDays - left.overdueDays || right.dueDate.localeCompare(left.dueDate)),
    [contracts],
  );
  const contractByKey = useMemo(() => new Map(contracts.flatMap((record) => {
    const keys = [record._key, record.id, record.contractNo].map((value) => String(value || '')).filter(Boolean);
    return keys.map((key) => [key, record] as const);
  })), [contracts]);
  const cashRows = useMemo(() => [...bankTx].sort((left, right) => String(right.txDate || '').localeCompare(String(left.txDate || ''))), [bankTx]);

  const counts: Record<LedgerKind, number> = {
    vehicle: vehicleRows.length,
    contract: contractRows.length,
    collection: collectionRows.length,
    cash: cashRows.length,
  };

  return <div className={styles.recordsApp}>
    <RebornHeader active="data" />

    <main className={styles.recordsMain}>
      <div className={styles.recordsTitle}>
        <div><h1>데이터센터</h1><p>차량번호를 중심으로 계약·수납·자금이 연결됩니다.</p></div>
        <label className={styles.recordSearch}>
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="차량번호, 고객, 계약번호, 거래상대 검색" aria-label="데이터센터 검색" />
          {query ? <SheetButton onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={16} /></SheetButton> : null}
        </label>
      </div>

      <nav className={styles.ledgerTabs} aria-label="조회 범위 선택">
        {LEDGERS.map((item) => <SheetButton key={item.key} className={ledger === item.key ? styles.ledgerTabActive : ''} onClick={() => setLedger(item.key)}>
          <span>{item.label}</span><strong>{counts[item.key].toLocaleString('ko-KR')}</strong><small>{item.note}</small>
        </SheetButton>)}
      </nav>

      {loading ? <div className={styles.recordState}><Loader2 size={18} className={styles.spin} />데이터를 불러오는 중</div> : null}
      {!loading && error ? <div className={styles.recordError}>{error}</div> : null}
      {!loading && !error && ledger === 'vehicle' ? <VehicleLedger rows={vehicleRows.filter((row) => includesQuery([row.plate, row.carName, row.vin, row.customer, row.contractNo, row.company], deferredQuery))} /> : null}
      {!loading && !error && ledger === 'contract' ? <ContractLedger rows={contractRows.filter((row) => includesQuery([row.contractNo, row.plate, row.carName, row.contractorName, row.contractorPhone, row.company], deferredQuery))} /> : null}
      {!loading && !error && ledger === 'collection' ? <CollectionLedger rows={collectionRows.filter((row) => includesQuery([row.contractNo, row.plate, row.carName, row.contractorName, row.contractorPhone, row.status], deferredQuery))} /> : null}
      {!loading && !error && ledger === 'cash' ? <CashLedger rows={cashRows.filter((row) => includesQuery([row.txDate, row.counterparty, row.memo, row.note, row.category, row.linkedVehiclePlate], deferredQuery))} contractByKey={contractByKey} /> : null}
    </main>
  </div>;
}

type VehicleLedgerRow = ReturnType<typeof buildFleetRows>[number];
function VehicleLedger({ rows }: { rows: VehicleLedgerRow[] }) {
  const visible = rows.slice(0, 400);
  return <section className={styles.ledgerTable}>
    <div className={`${styles.ledgerHead} ${styles.vehicleGrid}`}><span>차량</span><span>상태</span><span>현재 계약</span><span>월 대여료</span><span>미수</span><span>보험·검사</span><span /></div>
    {visible.map((row, index) => <Link className={`${styles.ledgerRow} ${styles.vehicleGrid}`} href={vehicleHref(row.plate, row.companyId)} key={`${row.companyId}:${row.plate}:${index}`}>
      <span className={styles.rowIdentity}><strong>{row.plate}</strong><small>{row.carName || '차종 미등록'} · {row.company}</small></span>
      <span><strong>{row.ownership === '처분완료' ? '처분완료' : row.util || row.status}</strong><small>{row.location}</small></span>
      <span><strong>{row.customer || '계약 없음'}</strong><small>{row.contractNo || '—'}</small></span>
      <span className={styles.rowAmount}>{money(row.rent)}</span>
      <span className={`${styles.rowAmount} ${row.net > 0 ? styles.negative : ''}`}><strong>{row.net > 0 ? money(row.net) : '없음'}</strong><small>{row.net > 0 ? `${row.overdueDays}일 경과` : '정상'}</small></span>
      <span><strong>보험 {date(row.insEnd)}</strong><small>검사 {date(row.inspectionTo)}</small></span>
      <ChevronRight size={16} />
    </Link>)}
    {!rows.length ? <RecordEmpty /> : null}
    {rows.length > visible.length ? <RecordLimit total={rows.length} shown={visible.length} /> : null}
  </section>;
}

type ContractLedgerRow = ReturnType<typeof contractMasterRow>;
function ContractLedger({ rows }: { rows: ContractLedgerRow[] }) {
  const visible = rows.slice(0, 400);
  return <section className={styles.ledgerTable}>
    <div className={`${styles.ledgerHead} ${styles.contractGrid}`}><span>계약</span><span>차량</span><span>계약자</span><span>기간</span><span>월 대여료</span><span>미수</span><span>상태</span></div>
    {visible.map((row, index) => <Link className={`${styles.ledgerRow} ${styles.contractGrid}`} href={vehicleHref(normPlate(row.plate), row.companyId)} key={`${row.companyId}:${row.contractNo}:${index}`}>
      <span className={styles.rowIdentity}><strong>{row.contractNo || '계약번호 없음'}</strong><small>{row.company} · {row.rentalType}</small></span>
      <span><strong>{row.plate || '미배정'}</strong><small>{row.carName || '—'}</small></span>
      <span><strong>{row.contractorName || '미확인'}</strong><small>{row.contractorPhone || '—'}</small></span>
      <span><strong>{date(row.startDate)}</strong><small>~ {date(row.endDate)}</small></span>
      <span className={styles.rowAmount}>{money(row.monthlyRent)}</span>
      <span className={`${styles.rowAmount} ${row.net > 0 ? styles.negative : ''}`}><strong>{row.net > 0 ? money(row.net) : '없음'}</strong><small>{row.unpaidCount ? `${row.unpaidCount}회` : '정상'}</small></span>
      <span><strong>{row.status}</strong><small>{row.riskLabel || (row.ended ? '종료' : '유지')}</small></span>
    </Link>)}
    {!rows.length ? <RecordEmpty /> : null}
    {rows.length > visible.length ? <RecordLimit total={rows.length} shown={visible.length} /> : null}
  </section>;
}

type CollectionLedgerRow = ReturnType<typeof buildScheduleLedger>[number];
function CollectionLedger({ rows }: { rows: CollectionLedgerRow[] }) {
  const visible = rows.slice(0, 400);
  return <section className={styles.ledgerTable}>
    <div className={`${styles.ledgerHead} ${styles.collectionGrid}`}><span>납부기일</span><span>차량·계약자</span><span>계약</span><span>회차</span><span>청구</span><span>납부</span><span>잔액</span><span>상태</span></div>
    {visible.map((row) => <Link className={`${styles.ledgerRow} ${styles.collectionGrid}`} href={vehicleHref(normPlate(row.plate), row.companyId)} key={row.id}>
      <span><strong>{date(row.dueDate)}</strong><small>{row.overdueDays ? `${row.overdueDays}일 경과` : row.kind}</small></span>
      <span className={styles.rowIdentity}><strong>{row.plate || '차량 미배정'}</strong><small>{row.contractorName || '계약자 미확인'}</small></span>
      <span><strong>{row.contractNo || '—'}</strong><small>{row.carName || '—'}</small></span>
      <span>{row.seq}/{row.seqTotal}</span>
      <span className={styles.rowAmount}>{money(row.charge)}</span>
      <span className={styles.rowAmount}>{money(row.paid)}</span>
      <span className={`${styles.rowAmount} ${row.balance > 0 ? styles.negative : ''}`}>{money(row.balance)}</span>
      <span><strong>{row.status}</strong><small>{row.method || '—'}</small></span>
    </Link>)}
    {!rows.length ? <RecordEmpty /> : null}
    {rows.length > visible.length ? <RecordLimit total={rows.length} shown={visible.length} /> : null}
  </section>;
}

type CashRow = ReturnType<typeof useDashboardData>['bankTx'][number];
function CashLedger({ rows, contractByKey }: { rows: CashRow[]; contractByKey: Map<string, EntityRecord> }) {
  const visible = rows.slice(0, 400);
  return <section className={styles.ledgerTable}>
    <div className={`${styles.ledgerHead} ${styles.cashGrid}`}><span>거래일</span><span>거래상대</span><span>내용</span><span>입금</span><span>출금</span><span>잔액</span><span>연결</span></div>
    {visible.map((row, index) => {
      const contract = row.matchedContractId ? contractByKey.get(String(row.matchedContractId)) : undefined;
      const plate = normPlate(row.linkedVehiclePlate || contract?.plate);
      const content = <>
        <span><strong>{date(row.txDate)}</strong><small>{text(row.source, '계좌')}</small></span>
        <span className={styles.rowIdentity}><strong>{text(row.counterparty, '거래상대 미확인')}</strong><small>{text(row.linkedCustomerName, '')}</small></span>
        <span><strong>{text(row.memo || row.note)}</strong><small>{text(row.subject || row.category)}</small></span>
        <span className={`${styles.rowAmount} ${Number(row.amount) > 0 ? styles.positive : ''}`}>{Number(row.amount) ? money(row.amount) : '—'}</span>
        <span className={`${styles.rowAmount} ${Number(row.withdraw) > 0 ? styles.negative : ''}`}>{Number(row.withdraw) ? money(row.withdraw) : '—'}</span>
        <span className={styles.rowAmount}>{row.balance == null ? '—' : money(row.balance)}</span>
        <span><strong>{plate || (row.matchedContractId ? '계약 연결' : '미연결')}</strong><small>{row.matchedScheduleSeq ? `${row.matchedScheduleSeq}회차` : '—'}</small></span>
      </>;
      const className = `${styles.ledgerRow} ${styles.cashGrid}`;
      return plate
        ? <Link className={className} href={vehicleHref(plate, String(row.companyId || ''))} key={`${text(row._key || row.id, String(index))}:${index}`}>{content}</Link>
        : <div className={className} key={`${text(row._key || row.id, String(index))}:${index}`}>{content}</div>;
    })}
    {!rows.length ? <RecordEmpty /> : null}
    {rows.length > visible.length ? <RecordLimit total={rows.length} shown={visible.length} /> : null}
  </section>;
}

function RecordEmpty() {
  return <div className={styles.recordEmpty}>조건에 맞는 내역이 없습니다.</div>;
}

function RecordLimit({ total, shown }: { total: number; shown: number }) {
  return <div className={styles.recordLimit}>{total.toLocaleString('ko-KR')}건 중 {shown.toLocaleString('ko-KR')}건 표시 · 검색하면 전체 데이터에서 찾습니다.</div>;
}
