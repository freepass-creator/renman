'use client';
/** /m 하단 5탭 — 홈·운영·리스크·입력·설정 (고정). jpkerp5 모델. (설계서 §7) */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, TriangleAlert, SquarePen, Settings } from 'lucide-react';
import { C } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export const TAB_ROOTS = ['/m', '/m/ops', '/m/risk', '/m/entry', '/m/me'];

const TABS = [
  { href: '/m', label: '홈', icon: Home, color: C.ok },
  { href: '/m/ops', label: '운영', icon: LayoutGrid, color: C.brand },
  { href: '/m/risk', label: '리스크', icon: TriangleAlert, color: C.danger },
  { href: '/m/entry', label: '입력', icon: SquarePen, color: 'var(--indigo-text)' },
  { href: '/m/me', label: '설정', icon: Settings, color: C.mute },
] as const;

function active(pathname: string, href: string) {
  return href === '/m' ? pathname === '/m' : pathname === href || pathname.startsWith(href + '/');
}

export function MTabBar() {
  const pathname = usePathname();
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 56, display: 'flex',
      background: C.card, borderTop: `1px solid ${C.line}`, paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map((t) => {
        const a = active(pathname, t.href);
        return (
          <Link key={t.href} href={t.href} onClick={() => haptic.nav()} aria-label={t.label} style={{
            position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, minHeight: 'var(--fp-bar-h)', textDecoration: 'none',
            color: a ? t.color : C.faint, WebkitTapHighlightColor: 'transparent',
          }}>
            {a && <span style={{ position: 'absolute', top: 0, left: '25%', right: '25%', height: 2.5, borderRadius: 2, background: t.color }} />}
            <t.icon size={21} strokeWidth={a ? 2.5 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: a ? 800 : 600, letterSpacing: '-0.01em' }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
