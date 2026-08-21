'use client';
/**
 * 홈 상단바 — [테넌트] | 업무 · 데이터센터 · 자료올리기 | … [검색] [＋ 기록] [나]
 * '/'는 AppShell 이 TopBar 를 그리지 않으므로(검색창 하나 원칙) 홈이 3앱 입구를 직접 든다.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search as SearchIcon } from 'lucide-react';
import { Btn, C, SP, Search } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ALL_COMPANIES, companyLabel } from '@/lib/companies';
import { DATA_CENTER_TITLE } from '@/lib/data-center-terms';
import { openQuickInput } from '@/lib/ui-bus';
import { TOPBAR_H, TOPBAR_H_M, hairline, PAD_X, PAD_X_M } from './home-styles';

const APPS: Array<{ key: string; label: string; href: string }> = [
  { key: 'work', label: '업무', href: '/' },
  { key: 'data', label: DATA_CENTER_TITLE, href: '/status' },
  { key: 'upload', label: '자료올리기', href: '/ingest' },
];

function Mark({ label }: { label: string }) {
  const initials = label.replace(/[^가-힣A-Za-z0-9]/g, '').slice(0, 2) || 'FP';
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 4, background: C.brand, color: C.inverse,
      fontSize: 9, fontWeight: 800, display: 'grid', placeItems: 'center', letterSpacing: 0, flex: 'none',
    }}>{initials}</span>
  );
}

export function HomeTopBar({ mobile }: { mobile: boolean }) {
  const router = useRouter();
  const { user, companyId } = useSession();
  const [q, setQ] = useState('');
  const tenant = companyId && companyId !== ALL_COMPANIES ? companyLabel(companyId) : '전체 회사';
  const initial = String(user?.name || '?').trim().charAt(0) || '?';
  const go = () => { const s = q.trim(); if (s) router.push(`/search?q=${encodeURIComponent(s)}`); };

  if (mobile) {
    return (
      <div style={{
        height: TOPBAR_H_M, flex: 'none', display: 'flex', alignItems: 'center', gap: SP[2],
        padding: `0 ${PAD_X_M}px`, background: C.card, borderBottom: hairline,
      }}>
        <Mark label={tenant} />
        <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{tenant}</span>
        <span style={{ flex: 1 }} />
        <Btn variant="ghost" size="sm" iconOnly tip="검색" href="/m/search"><SearchIcon size={16} /></Btn>
        <Btn size="sm" iconOnly tip="기록" onClick={openQuickInput}><Plus size={16} /></Btn>
      </div>
    );
  }

  return (
    <div style={{
      height: TOPBAR_H, flex: 'none', display: 'flex', alignItems: 'center', gap: 0,
      padding: `0 ${SP[3] + 2}px 0 ${PAD_X - SP[1]}px`, background: C.card, borderBottom: hairline,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: SP[2], fontWeight: 700, fontSize: 13, color: C.ink,
        paddingRight: SP[4], marginRight: SP[1] + 2, borderRight: hairline, height: 22,
      }}>
        <Mark label={tenant} />
        <span>{tenant}</span>
      </div>
      <nav style={{ display: 'flex', height: TOPBAR_H }} aria-label="앱">
        {APPS.map((a) => {
          const on = a.key === 'work';
          return (
            <Link key={a.key} href={a.href} style={{
              padding: `0 ${SP[3]}px`, display: 'inline-flex', alignItems: 'center', position: 'relative',
              color: on ? C.ink : C.sub, fontWeight: on ? 600 : 500, fontSize: 12, textDecoration: 'none',
            }}>
              {a.label}
              {on && <span style={{ position: 'absolute', left: SP[3], right: SP[3], bottom: -1, height: 2, background: C.ink }} />}
            </Link>
          );
        })}
      </nav>
      <span style={{ flex: 1 }} />
      <Search
        size="sm"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
        placeholder="차량번호 · 계약자 · 무엇이든"
        wrapStyle={{ width: 300, marginRight: SP[2] }}
      />
      <Btn size="sm" onClick={openQuickInput}><Plus size={14} /> 기록</Btn>
      <span
        title={user?.name || ''}
        style={{
          width: 24, height: 24, borderRadius: '50%', background: C.ink, color: C.inverse, fontSize: 11, fontWeight: 700,
          display: 'grid', placeItems: 'center', marginLeft: SP[2] + 2, flex: 'none',
        }}
      >{initial}</span>
    </div>
  );
}
