'use client';

import { ArrowLeft, ChevronDown, ChevronRight, Loader2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ALL_COMPANIES, COMPANY_DEFS, companyLabel } from '@/lib/companies';
import { normPlate } from '@/lib/plate';
import { useSession } from '@/lib/session';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { RENTAL_COMPANY_IDS } from '@/lib/companies';
import { SheetButton, SheetSelect } from '@/components/ui/sheet-controls';
import styles from './fleet.module.css';

type FleetFilter = 'all' | 'running' | 'idle';

const won = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 0 });

function value(input: unknown, fallback = '—'): string {
  const resolved = String(input ?? '').trim();
  return resolved || fallback;
}

function date(input: unknown): string {
  return String(input || '').slice(0, 10) || '—';
}

function money(input: unknown): string {
  return `${won.format(Number(input) || 0)}원`;
}

function includesQuery(values: unknown[], query: string): boolean {
  const needle = query.replace(/\s/g, '').toLowerCase();
  return values.some((item) => String(item ?? '').replace(/\s/g, '').toLowerCase().includes(needle));
}

export default function FleetOverview() {
  const { user, companyId, setCompanyId, isOperator } = useSession();
  const { D, loading, error } = useDashboardData(RENTAL_COMPANY_IDS);
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedPlate, setSelectedPlate] = useState('');

  const companies = useMemo(() => [
    { id: ALL_COMPANIES, label: '스위치플랜 + 프라임구독' },
    ...COMPANY_DEFS.filter((company) => ['switchplan', 'prime'].includes(company.id)),
  ], []);

  const rows = useMemo(() => D.inFleet
    .filter((row) => filter === 'all' || (filter === 'running' ? row.status === '운행' : row.status !== '운행'))
    .filter(({ v, av }) => !query.trim() || includesQuery([
      v.plate,
      v.carName,
      v.vin,
      av?.rec?.contractNo,
      av?.rec?.contractorName,
      av?.rec?.contractorPhone,
    ], query))
    .sort((left, right) => {
      const status = Number(right.status === '운행') - Number(left.status === '운행');
      return status || normPlate(left.v.plate).localeCompare(normPlate(right.v.plate), 'ko');
    }), [D.inFleet, filter, query]);

  const debtVehicleCount = D.inFleet.filter(({ av }) => (Number(av?.net) || 0) > 0).length;

  return <div className={styles.app}>
    <header className={styles.header}>
      <div className={styles.identity}>
        <div className={styles.mark} aria-hidden="true">{companyLabel(companyId).slice(0, 1)}</div>
        <div className={styles.companySelect}>
          <label htmlFor="fleet-company">관리 회사</label>
          <SheetSelect id="fleet-company" value={companyId} onChange={(event) => setCompanyId(event.target.value)} disabled={!isOperator}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.label}</option>)}
          </SheetSelect>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </div>
      <div className={styles.user} title={`${user.name} · ${user.email}`}>{value(user.name, '직원').slice(0, 1)}</div>
    </header>

    <main className={styles.main}>
      <div className={styles.pageHead}>
        <div>
          <Link href="/sheet/reborn"><ArrowLeft size={16} />운영 홈</Link>
          <h1>보유차량</h1>
        </div>
        <span>매각 완료 차량은 제외한 현재 자산</span>
      </div>

      <section className={styles.metrics} aria-label="차량 요약">
        <SheetButton className={filter === 'all' ? styles.metricActive : ''} onClick={() => setFilter('all')}><span>현재 보유</span><strong>{D.summary.held}대</strong></SheetButton>
        <SheetButton className={filter === 'running' ? styles.metricActive : ''} onClick={() => setFilter('running')}><span>운행</span><strong>{D.summary.running}대</strong><small>가동률 {D.summary.util}%</small></SheetButton>
        <SheetButton className={filter === 'idle' ? styles.metricActive : ''} onClick={() => setFilter('idle')}><span>휴차</span><strong>{D.summary.idle}대</strong></SheetButton>
        <div><span>미수 차량</span><strong>{debtVehicleCount}대</strong><small>{money(D.summary.misuActive)}</small></div>
      </section>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={18} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="차량번호, 고객, 계약번호 검색" aria-label="보유차량 검색" />
          {query ? <SheetButton onClick={() => setQuery('')} aria-label="검색어 지우기"><X size={16} /></SheetButton> : null}
        </label>
        <strong>{rows.length}대</strong>
      </div>

      {loading ? <div className={styles.message}><Loader2 size={18} className={styles.spin} />불러오는 중</div> : null}
      {!loading && error ? <div className={styles.error}>{error}</div> : null}
      {!loading && !error ? <section className={styles.table}>
        <div className={styles.tableHead}><span>차량</span><span>상태</span><span>현재 계약</span><span>월 대여료</span><span>현재 미수</span><span>보험 · 검사</span><span /></div>
        {rows.map(({ v, av, status }, index) => {
          const plate = normPlate(v.plate);
          const open = selectedPlate === plate;
          const debt = Math.max(0, Number(av?.net) || 0);
          return <div className={styles.rowGroup} key={`${value(v._key || v.id, plate)}:${index}`}>
            <SheetButton className={`${styles.tableRow} ${open ? styles.rowOpen : ''}`} onClick={() => setSelectedPlate(open ? '' : plate)}>
              <span className={styles.vehicle}><strong>{plate || '차량번호 미확인'}</strong><small>{value(v.carName, '차종 미확인')}</small></span>
              <span className={`${styles.status} ${status === '운행' ? styles.running : styles.idle}`}>{status}</span>
              <span className={styles.contract}><strong>{value(av?.rec?.contractorName, '활성 계약 없음')}</strong><small>{value(av?.rec?.contractNo)}</small></span>
              <span className={styles.amount}>{money(av?.rec?.monthlyRent)}</span>
              <span className={`${styles.amount} ${debt > 0 ? styles.debt : ''}`}><strong>{debt > 0 ? money(debt) : '없음'}</strong><small>{debt > 0 ? `${Number(av?.count) || 1}건 · ${Number(av?.overdueDays) || 0}일` : '정상'}</small></span>
              <span className={styles.expiry}><strong>보험 {date(v.insuranceExpiryDate || v.insEnd)}</strong><small>검사 {date(v.inspectionTo)}</small></span>
              <ChevronRight size={17} className={open ? styles.chevronOpen : ''} />
            </SheetButton>
            {open ? <div className={styles.detail}>
              <Fact label="차대번호" main={value(v.vin)} sub={`연식 ${value(v.modelYear || v.year)}`} />
              <Fact label="계약기간" main={`${date(av?.rec?.startDate)} ~ ${date(av?.rec?.endDate)}`} sub={`결제일 ${value(av?.rec?.paymentDay)}`} />
              <Fact label="취득" main={money(v.acquisitionPrice)} sub={`${date(v.acquisitionDate)} · ${value(v.loanType || v.acquisitionType)}`} />
              <Fact label="금융" main={money(v.loanRemainingPrincipal || v.loanBalance || v.remainingPrincipal)} sub={value(v.loanCompany)} />
              <Fact label="주행거리" main={`${won.format(Number(v.mileage) || 0)}km`} sub={companyLabel(v.companyId || '')} />
            </div> : null}
          </div>;
        })}
        {!rows.length ? <div className={styles.message}>조건에 맞는 차량이 없습니다.</div> : null}
      </section> : null}
    </main>
  </div>;
}

function Fact({ label, main, sub }: { label: string; main: string; sub: string }) {
  return <div className={styles.fact}><span>{label}</span><strong>{main}</strong><small>{sub}</small></div>;
}
