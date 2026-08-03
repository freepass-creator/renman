'use client';
/** /m 셸 — 탭루트=하단 5탭 / 스택(검색·리스크·상세·폼)=이전 바. */
import { usePathname } from 'next/navigation';
import { C } from '@/components/ui';
import { MTabBar, TAB_ROOTS } from '@/components/m/MTabBar';
import { MBackBar } from '@/components/m/MBackBar';

export default function MLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const stack = !TAB_ROOTS.includes(pathname);
  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      paddingBottom: 'calc(var(--fp-bar-h) + env(safe-area-inset-bottom))',
    }}>
      {children}
      {stack ? <MBackBar /> : <MTabBar />}
    </div>
  );
}
