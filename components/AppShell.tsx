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

  // 새 시트 UI는 기존 앱 셸과 분리하되, 인증·회사 스코프·ERP 저장 엔진은 그대로 쓴다.
  if (standaloneSheet) return <SessionProvider>{children}</SessionProvider>;
  // 새 업무 공간의 자료 투입구. 기존 전역 메뉴만 제외하고 저장·확인·알림 엔진은 유지한다.
  if (standaloneUpload) return (
    <SessionProvider>
      <AppBarProvider>
        <ConfirmProvider>
          {children}
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
