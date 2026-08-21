'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { ALL_COMPANIES, COMPANY_DEFS, RENTAL_COMPANY_IDS } from '@/lib/companies';
import { useSession } from '@/lib/session';
import { SheetSelect } from '@/components/ui/sheet-controls';
import styles from './reborn-header.module.css';

type Workspace = 'work' | 'data' | 'upload';

const NAV: Array<{ key: Workspace; label: string; href: string }> = [
  { key: 'work', label: '할 일 확인', href: '/sheet/reborn' },
  { key: 'data', label: '데이터센터', href: '/sheet/reborn/ledgers' },
  { key: 'upload', label: '자료올리기', href: '/ingest' },
];

export default function RebornHeader({ active }: { active: Workspace }) {
  const { user, companyId, setCompanyId, isOperator } = useSession();
  const companies = [
    { id: ALL_COMPANIES, label: '스위치플랜 + 프라임구독' },
    ...COMPANY_DEFS.filter((company) => RENTAL_COMPANY_IDS.includes(company.id as typeof RENTAL_COMPANY_IDS[number])),
  ];
  const userName = String(user?.name || '직원').trim() || '직원';
  const selectedCompanyId = companies.some((company) => company.id === companyId) ? companyId : ALL_COMPANIES;

  return <header className={styles.header}>
    <div className={styles.headerInner}>
      <div className={styles.identity}>
        <span className={styles.mark} aria-hidden="true" />
        <div className={styles.companySelect}>
          <label htmlFor={`reborn-company-${active}`}>WORKSPACE</label>
          <SheetSelect id={`reborn-company-${active}`} value={selectedCompanyId} onChange={(event) => setCompanyId(event.target.value)} disabled={!isOperator}>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.label}</option>)}
          </SheetSelect>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
      </div>

      <nav className={styles.navigation} aria-label="주요 화면">
        {NAV.map((item) => <Link
          key={item.key}
          href={item.href}
          className={active === item.key ? styles.active : undefined}
          aria-current={active === item.key ? 'page' : undefined}
        >{item.label}</Link>)}
      </nav>

      <div className={styles.userBlock} title={`${userName} · ${user?.email || ''}`}>
        <span className={styles.userName}>{userName}</span>
        <span className={styles.user}>{userName.slice(0, 1)}</span>
      </div>
    </div>
  </header>;
}
