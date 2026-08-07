'use client';
/** /m 하단 4탭 — 운영 · 리스크 · 업무 · 업로드. 설정·계정은 웹 햄버거(메뉴). */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, TriangleAlert, ListTodo, Upload } from 'lucide-react';
import { C } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export const TAB_ROOTS = ['/m/ops', '/m/risk', '/m/work', '/m/entry'];

const TABS = [
  { href: '/m/ops', label: '운영현황', icon: LayoutGrid, color: C.brand },
  { href: '/m/risk', label: '리스크', icon: TriangleAlert, color: C.danger },
  { href: '/m/work', label: '업무관리', icon: ListTodo, color: C.warn },
  { href: '/m/entry', label: '업로드', icon: Upload, color: 'var(--indigo-text)' },
] as const;

function active(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + '/');
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
