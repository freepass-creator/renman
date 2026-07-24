'use client';
// 모바일 하단 탭바 — 루트·스택목록 1차 네비. 뎁스(depth)에서는 SessionBar가 숨김(이전·액션=하단 액션바).
//   고른 탭 = useMobileTabs SSOT (기본: 홈 · 마이 · 검색 · 업로드 · 설정).
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { haptic } from '@/lib/haptics';
import { useMobileTabs } from '@/lib/mobile-tabs';
import { C } from '@/components/ui/tokens';

export function MobileTabBar() {
  const pathname = usePathname();
  const { tabs } = useMobileTabs();
  // 탭바 높이를 --fp-tabbar-h로 발행 → 하단 액션바(그 위 스택)·콘텐츠 도크가 var 하나로 정합. 언마운트=0.
  useEffect(() => {
    const r = document.documentElement;
    if (tabs.length) r.style.setProperty('--fp-tabbar-h', 'calc(var(--fp-bar-h) + env(safe-area-inset-bottom, 0px))');
    return () => r.style.setProperty('--fp-tabbar-h', '0px');
  }, [tabs.length]);
  if (!tabs.length) return null;
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 56, display: 'flex',
      background: C.card, borderTop: `1px solid ${C.line}`,
      paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -3px 14px rgba(15,23,42,0.07)',   // 바닥 바 = 위로 뜨는 그림자(erp4)
    }}>
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link key={t.id} href={t.href} onClick={() => haptic.nav()} aria-label={t.label}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              minHeight: 'var(--fp-bar-h)', justifyContent: 'center', textDecoration: 'none',
              color: active ? C.brand : C.mute, WebkitTapHighlightColor: 'transparent',
            }}>
            <t.icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 800 : 600, letterSpacing: '-0.01em' }}>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
