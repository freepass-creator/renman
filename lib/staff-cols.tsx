/**
 * 경영관리 · 직원 탭 컬럼 SSOT — 행 문법: 회사 · 신원 · 분류 · 상태 · 수치/기한.
 */
'use client';

import { Badge, type SheetCol } from '@/components/ui';
import { companyLabel } from '@/lib/companies';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { LEDGER_LABEL } from './ledger-labels';

export type StaffKind = '본사' | '법인' | '권한미부여';
export type StaffLiveStatus = '정상' | '정지' | '미로그인' | '계정없음';

export type StaffSheetRow = {
  id: string;            // uid 또는 roster:id
  uid: string;           // Auth uid (없으면 '')
  email: string;
  name: string;
  department: string;
  companyId: string | null;
  company: string;       // 표시
  kind: StaffKind;
  status: StaffLiveStatus;
  lastSignInAt: string;  // ISO or ''
  lastSignInLabel: string;
  daysSinceLogin: number | null;
  disabled: boolean;
  provider: string;
  rosterId: string;      // 대장 id (없으면 '')
  hasAuth: boolean;
};

function kindTone(k: StaffKind): 'purple' | 'blue' | 'gray' {
  if (k === '본사') return 'purple';
  if (k === '법인') return 'blue';
  return 'gray';
}

function statusTone(s: StaffLiveStatus): 'green' | 'red' | 'amber' | 'gray' {
  if (s === '정상') return 'green';
  if (s === '정지') return 'red';
  if (s === '미로그인') return 'amber';
  return 'gray';
}

export const STAFF_COLS: SheetCol<StaffSheetRow>[] = [
  {
    key: 'company', label: LEDGER_LABEL.company, priority: 1,
    render: (r) => r.company || LEDGER_EMPTY.dash,
    text: (r) => r.company,
  },
  {
    // 표에서는 2줄 셀을 쓰지 않는다(행 높이 고정·조밀). 이메일은 별도 컬럼.
    key: 'name', label: '이름', priority: 1,
    render: (r) => r.name || r.email || LEDGER_EMPTY.dash,
    text: (r) => r.name || r.email || '',
  },
  {
    key: 'email', label: '이메일', priority: 1,
    render: (r) => r.email || LEDGER_EMPTY.dash,
    text: (r) => r.email || '',
  },
  {
    key: 'kind', label: '직원분류', priority: 1,
    render: (r) => <Badge tone={kindTone(r.kind)}>{r.kind}</Badge>,
    text: (r) => r.kind,
  },
  {
    key: 'status', label: '직원상태', priority: 1,
    render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'lastSignIn', label: '마지막 로그인', priority: 2,
    render: (r) => r.lastSignInLabel || LEDGER_EMPTY.dash,
    text: (r) => r.lastSignInLabel,
  },
  {
    key: 'department', label: '부서', priority: 3,
    render: (r) => r.department || LEDGER_EMPTY.dash,
    text: (r) => r.department,
  },
];

export function staffCompanyLabel(companyId: string | null, kind: StaffKind): string {
  if (kind === '본사') return '전 법인';
  if (!companyId) return LEDGER_EMPTY.dash;
  return companyLabel(companyId) || companyId;
}

/** lastSignInAt → D+N 라벨 · 미로그인(90일+) 판정용 days. */
export function loginAge(lastSignInAt: string, today = new Date()): { days: number | null; label: string } {
  if (!lastSignInAt) return { days: null, label: '기록없음' };
  const t = Date.parse(lastSignInAt);
  if (!Number.isFinite(t)) return { days: null, label: '기록없음' };
  const days = Math.floor((today.getTime() - t) / 86_400_000);
  // ★KST 로 자른다 — UTC 로 자르면 KST 00~09시 로그인이 「어제」로 표시된다.
  const ymd = new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
  if (days <= 0) return { days: 0, label: `${ymd} · 오늘` };
  return { days, label: `${ymd} · D+${days}` };
}
