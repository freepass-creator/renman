'use client';
/**
 * 경영관리 — 하단 그룹 단일 페이지.
 *   탭: 법인(CompanyMaster) · 계좌(bank_account SSOT) · 임대차(lease) · 직원(Auth).
 *   첫 판 = 골격 + 법인 우선. 과설계 금지.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Badge, Btn, C, LedgerActions, LedgerFrame, LedgerRecordPanel, PillTabs, Search, won,
  type LedgerColView, type SheetCol,
} from '@/components/ui';
import { COMPANY_DEFS, companyLabel } from '@/lib/companies';
import { loadMaster, type CompanyMaster } from '@/lib/company-master';
import { useEntityList } from '@/lib/use-entity-lists';
import { buildBankAccountLedger, type BankAccountRow } from '@/lib/finance/cash-ledger';
import { ACCOUNT_BASIC_COLS, ACCOUNT_ALL_COLS } from '@/lib/finance/account-cols';
import { dday, TODAY } from '@/lib/dashboard-consts';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { textMatch } from '@/lib/search-match';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { StaffTab } from '@/components/management/StaffTab';
import { openIngest } from '@/lib/ui-bus';

type Tab = '법인' | '계좌' | '임대차' | '직원';

type CompanyRow = {
  id: string;
  name: string;
  ceo: string;
  bizNo: string;
  address: string;
  phone: string;
  garages: number;
  master: CompanyMaster;
};

type LeaseRow = {
  id: string;
  landlord: string;
  address: string;
  deposit: number;
  monthlyRent: number;
  startDate: string;
  endDate: string;
  due: string;
  status: string;
  raw: Record<string, unknown>;
};

const COMPANY_COLS: SheetCol<CompanyRow>[] = [
  { key: 'name', label: '회사명', priority: 1, pin: true, render: (r) => <b>{r.name}</b>, text: (r) => r.name },
  { key: 'ceo', label: '대표', priority: 2, render: (r) => r.ceo || LEDGER_EMPTY.dash, text: (r) => r.ceo },
  { key: 'bizNo', label: '사업자번호', priority: 2, render: (r) => r.bizNo || LEDGER_EMPTY.dash, text: (r) => r.bizNo },
  { key: 'phone', label: '전화', priority: 3, render: (r) => r.phone || LEDGER_EMPTY.dash, text: (r) => r.phone },
  { key: 'address', label: '본점', priority: 3, render: (r) => r.address || LEDGER_EMPTY.dash, text: (r) => r.address },
  { key: 'garages', label: '차고지', align: 'r', priority: 3, render: (r) => `${r.garages}곳`, text: (r) => r.garages },
];

const LEASE_COLS: SheetCol<LeaseRow>[] = [
  { key: 'landlord', label: '임대인', priority: 1, render: (r) => r.landlord || LEDGER_EMPTY.none, text: (r) => r.landlord },
  { key: 'address', label: '소재지', priority: 1, render: (r) => r.address || LEDGER_EMPTY.dash, text: (r) => r.address },
  { key: 'deposit', label: '보증금', align: 'r', priority: 2, render: (r) => r.deposit ? won(r.deposit) : LEDGER_EMPTY.dash, text: (r) => r.deposit },
  { key: 'monthlyRent', label: '월세', align: 'r', priority: 2, render: (r) => r.monthlyRent ? won(r.monthlyRent) : LEDGER_EMPTY.dash, text: (r) => r.monthlyRent },
  { key: 'startDate', label: '시작일', priority: 2, render: (r) => r.startDate || LEDGER_EMPTY.dash, text: (r) => r.startDate },
  { key: 'endDate', label: '만기일', priority: 1, render: (r) => r.endDate || LEDGER_EMPTY.dash, text: (r) => r.endDate },
  {
    key: 'status', label: '임대차상태', priority: 1,
    render: (r) => <Badge tone={r.status.includes('경과') || r.status.includes('임박') ? 'amber' : 'gray'}>{r.status}</Badge>,
    text: (r) => r.status,
  },
];

function leaseStatus(end: string): string {
  const d = dday(end);
  if (d == null) return '—';
  if (d < 0) return `${-d}일 경과`;
  if (d === 0) return 'D-Day';
  if (d <= 30) return `D-${d} 임박`;
  return `D-${d}`;
}

export default function ManagementPage() {
  const mobile = useIsMobile();
  const { isOperator } = useSession();
  const [tab, setTab] = useState<Tab>('법인');
  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selectedCo, setSelectedCo] = useState<CompanyRow | null>(null);
  const [selectedAcct, setSelectedAcct] = useState<BankAccountRow | null>(null);
  const [selectedLease, setSelectedLease] = useState<LeaseRow | null>(null);
  const [masterTick, setMasterTick] = useState(0);

  const { rows: accountRecords, loading: acctLoading, error: acctError } = useEntityList('bank_account');
  const { rows: leaseRecords, loading: leaseLoading, error: leaseError } = useEntityList('lease');

  useEffect(() => {
    const on = () => setMasterTick((n) => n + 1);
    window.addEventListener('jpk:master-change', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('jpk:master-change', on);
      window.removeEventListener('storage', on);
    };
  }, []);

  // 본사가 아니면 직원 탭 진입 불가
  useEffect(() => {
    if (tab === '직원' && !isOperator) setTab('법인');
  }, [tab, isOperator]);

  const companyRows = useMemo(() => {
    void masterTick;
    return COMPANY_DEFS.map((c) => {
      const m = loadMaster(c.id);
      return {
        id: c.id,
        name: companyLabel(c.id),
        ceo: String(m.ceo || ''),
        bizNo: String(m.bizNo || ''),
        address: String(m.address || ''),
        phone: String(m.phone || ''),
        garages: m.garages?.length || 0,
        master: m,
      } satisfies CompanyRow;
    });
  }, [masterTick]);

  const accountRows = useMemo(
    () => buildBankAccountLedger(accountRecords, [], [], []),
    [accountRecords],
  );

  const leaseRows = useMemo(() => leaseRecords.map((r) => {
    const end = String(r.endDate || '').slice(0, 10);
    return {
      id: String(r._key || r.leaseNo || ''),
      landlord: String(r.landlord || ''),
      address: String(r.address || ''),
      deposit: Number(r.deposit) || 0,
      monthlyRent: Number(r.monthlyRent) || 0,
      startDate: String(r.startDate || '').slice(0, 10),
      endDate: end,
      due: end,
      status: leaseStatus(end),
      raw: r,
    } satisfies LeaseRow;
  }).sort((a, b) => a.endDate.localeCompare(b.endDate)), [leaseRecords]);

  const shownCompanies = useMemo(
    () => companyRows.filter((r) => textMatch(q, r.name, r.ceo, r.bizNo, r.address, r.phone)),
    [companyRows, q],
  );
  const shownAccounts = useMemo(
    () => accountRows.filter((r) => textMatch(q, r.bankName, r.accountNumber, r.accountAlias, r.accountHolder, r.accountType)),
    [accountRows, q],
  );
  const shownLeases = useMemo(
    () => leaseRows.filter((r) => textMatch(q, r.landlord, r.address, r.status, r.endDate)),
    [leaseRows, q],
  );

  const loading = tab === '계좌' ? acctLoading : tab === '임대차' ? leaseLoading : false;

  const tabBar: ReactNode = (
    <PillTabs
      size="sm"
      value={tab}
      onChange={(v) => {
        setTab(v as Tab);
        setSelectedCo(null);
        setSelectedAcct(null);
        setSelectedLease(null);
      }}
      tabs={[
        { key: '법인', label: '법인' },
        { key: '계좌', label: '계좌' },
        { key: '임대차', label: '임대차' },
        ...(isOperator ? [{ key: '직원', label: '직원' }] : []),
      ]}
    />
  );

  if (tab === '직원' && isOperator) {
    return <StaffTab view={tabBar} />;
  }

  return (
    <LedgerFrame
      title="경영관리"
      meta="법인 · 계좌 · 임대차 · 직원"
      right={(
        <LedgerActions aria-label="관리 작업">
          {tab === '법인' ? <Btn size="sm" variant="ghost" href="/admin">관리 회사 설정</Btn> : null}
          {tab === '계좌' ? <Btn size="sm" variant="ghost" href="/cash">자금관리에서 계좌 등록</Btn> : null}
          {tab === '임대차' ? <Btn size="sm" variant="solid" onClick={() => openIngest('lease')}>임대차 계약 담기</Btn> : null}
        </LedgerActions>
      )}
      view={tabBar}
      showColView={tab !== '법인'}
      colView={colView}
      onColView={setColView}
      filters={(
        <Search
          size="sm"
          placeholder={tab === '법인' ? '법인·대표·사업자' : tab === '계좌' ? '은행·계좌·예금주' : '임대인·소재지'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
        />
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute }}>
          {tab === '법인' && <>법인 <b>{shownCompanies.length}</b></>}
          {tab === '계좌' && <>계좌 <b>{shownAccounts.length}</b></>}
          {tab === '임대차' && <>임대차 <b>{shownLeases.length}</b> · 기준 {TODAY}</>}
        </span>
      )}
      loading={loading}
      error={tab === '계좌' ? acctError : tab === '임대차' ? leaseError : null}
      empty={tab === '법인'
        ? '등록된 법인이 없습니다 — 법인 정보 설정에서 기본정보를 입력하세요'
        : tab === '계좌'
          ? '계좌 없음 — 자금관리에서 등록하세요'
          : '임대차 계약 없음 — 데이터센터에서 계약서를 먼저 담으세요'}
      cols={(
        tab === '법인' ? COMPANY_COLS
          : tab === '계좌' ? (colView === '기본' ? ACCOUNT_BASIC_COLS : ACCOUNT_ALL_COLS)
            : LEASE_COLS
      ) as SheetCol<CompanyRow>[]}
      rows={(
        tab === '법인' ? shownCompanies
          : tab === '계좌' ? shownAccounts
            : shownLeases
      ) as CompanyRow[]}
      rowKey={(r) => String((r as { id: string }).id)}
      selectedRowKey={
        tab === '법인' ? selectedCo?.id ?? null
          : tab === '계좌' ? selectedAcct?.id ?? null
            : selectedLease?.id ?? null
      }
      onRowDoubleClick={(r) => {
        if (tab === '법인') setSelectedCo(r as unknown as CompanyRow);
        else if (tab === '계좌') setSelectedAcct(r as unknown as BankAccountRow);
        else setSelectedLease(r as unknown as LeaseRow);
      }}
      onCloseDetail={() => {
        setSelectedCo(null);
        setSelectedAcct(null);
        setSelectedLease(null);
      }}
      sidePanel={
        tab === '법인' && selectedCo ? (
          <LedgerRecordPanel
            title={selectedCo.name}
            identity={selectedCo.bizNo || '사업자번호 미등록'}
            statusBadge={<Badge tone="blue">법인</Badge>}
            row={selectedCo}
            cols={COMPANY_COLS}
            onClose={() => setSelectedCo(null)}
            actions={<Btn size="sm" variant="ghost" href="/settings">설정에서 편집</Btn>}
          />
        ) : tab === '계좌' && selectedAcct ? (
          <LedgerRecordPanel
            title={selectedAcct.accountAlias || selectedAcct.bankName}
            identity={selectedAcct.accountNumber}
            statusBadge={<Badge tone="gray">{selectedAcct.status || '계좌'}</Badge>}
            row={selectedAcct}
            cols={ACCOUNT_ALL_COLS}
            onClose={() => setSelectedAcct(null)}
            actions={<Btn size="sm" variant="ghost" href="/cash">자금관리</Btn>}
          />
        ) : tab === '임대차' && selectedLease ? (
          <LedgerRecordPanel
            title={selectedLease.landlord || '임대차'}
            identity={selectedLease.address}
            statusBadge={<Badge tone={selectedLease.status.includes('임박') || selectedLease.status.includes('경과') ? 'amber' : 'gray'}>{selectedLease.status}</Badge>}
            row={selectedLease}
            cols={LEASE_COLS}
            onClose={() => setSelectedLease(null)}
          />
        ) : null
      }
    />
  );
}
