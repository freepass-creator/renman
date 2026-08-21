'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import { AppBarProvider } from '@/lib/appbar';
import { ConfirmProvider } from '@/components/ui/confirm';
import TopBar from '@/components/SessionBar';
import { CommandPalette } from '@/components/CommandPalette';
import { CarDrawer } from '@/components/CarDrawer';
import { PrintHost } from '@/components/PrintHost';
import { QuickLogHost } from '@/components/QuickLog';
import { QuickInputHost } from '@/components/QuickInput';
import ToastHost from '@/components/ToastHost';

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const standaloneSheet = pathname === '/sheet' || pathname.startsWith('/sheet/');
  const standaloneUpload = pathname === '/ingest';
  /* ★홈은 «검색창 하나»다 — 상단바·사이드레일·메뉴버튼을 그리지 않는다.
     사장님 지시 2026-08-09 「사이드바 이런거 메뉴버튼 이런거 없어. 그냥 구글 검색창 방식.」
     메뉴로 «어디로 갈지» 고르게 하면 사용자가 ERP 분류를 먼저 배워야 한다.
     찾을 것을 치면 거기로 간다. 저장·확인·알림 엔진은 그대로 유지한다. */
  const standaloneHome = pathname === '/';
  const standalone360 = pathname.startsWith('/vehicle/');

  // 새 시트 UI는 기존 앱 셸과 분리하되, 인증·회사 스코프·ERP 저장 엔진은 그대로 쓴다.
  if (standaloneSheet) return <SessionProvider>{children}</SessionProvider>;
  // 홈·360·자료올리기 — 전역 메뉴만 제외. 360은 인쇄·빠른기록이 필요해서 호스트를 같이 둔다.
  if (standaloneHome || standaloneUpload || standalone360) return (
    <SessionProvider>
      <AppBarProvider>
        <ConfirmProvider>
          {children}
          <PrintHost />
          <QuickLogHost />
          <QuickInputHost />
          <ToastHost />
        </ConfirmProvider>
      </AppBarProvider>
    </SessionProvider>
  );

  return (
    <SessionProvider>
      <AppBarProvider>
        <ConfirmProvider>
          <TopBar />
          <div style={{ minHeight: 'calc(100vh - var(--fp-bar-h) - var(--fp-dock-h, 0px))' }}>{children}</div>
          <CommandPalette />
          <CarDrawer />
          <PrintHost />
          <QuickLogHost />
          <QuickInputHost />
          <ToastHost />
        </ConfirmProvider>
      </AppBarProvider>
    </SessionProvider>
  );
}
