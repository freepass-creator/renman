'use client';
// 모바일 하단 탭바 — 루트·스택목록 1차 네비. 뎁스(depth)에서는 SessionBar가 숨김(이전은 상단←만).
//   고른 탭 = useMobileTabs SSOT (기본: 홈 · 마이 · 검색 · 업로드 · 설정).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { haptic } from '@/lib/haptics';
import { useMobileTabs } from '@/lib/mobile-tabs';

export function MobileTabBar() {
  const pathname = usePathname();
  const { tabs } = useMobileTabs();
  if (!tabs.length) return null;
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 56, display: 'flex',
      background: 'rgba(255,255,255,0.94)', backdropFilter: 'saturate(180%) blur(12px)', WebkitBackdropFilter: 'saturate(180%) blur(12px)',
      borderTop: '1px solid var(--border)', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: 'var(--shadow-sm)',
    }}>
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.id} href={t.href} onClick={() => haptic.nav()} aria-label={t.label}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minHeight: 54, justifyContent: 'center', textDecoration: 'none', color: active ? 'var(--brand)' : 'var(--text-weak)', WebkitTapHighlightColor: 'transparent' }}>
            <t.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: '-0.01em' }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
