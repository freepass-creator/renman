import './globals.css';
import type { Metadata } from 'next';
import { SessionProvider } from '@/lib/session';
import { AppBarProvider } from '@/lib/appbar';
import TopBar from '@/components/SessionBar';
import { CommandPalette } from '@/components/CommandPalette';
import { CarDrawer } from '@/components/CarDrawer';
import { IngestHost } from '@/components/IngestHost';
import { PrintHost } from '@/components/PrintHost';
import { QuickLogHost } from '@/components/QuickLog';
import ToastHost from '@/components/ToastHost';

export const metadata: Metadata = {
  title: 'renman · 렌터카매니저',
  description: '차(자산)를 중심으로 입력·상태·이탈을 한 화면에서. 관리 by exception.',
};

// 새 틀: 모듈 사이드바 없음. 톱바 + 전폭 단일 화면(app/page.tsx = 앱 그 자체).
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css" />
      </head>
      <body style={{ margin: 0, minHeight: '100vh', background: 'var(--bg-page)' }}>
        <SessionProvider>
          <AppBarProvider>
            <TopBar />
            <div style={{ minHeight: 'calc(100vh - 49px)' }}>{children}</div>
            <CommandPalette />
            <CarDrawer />
            <IngestHost />
            <PrintHost />
            <QuickLogHost />
            <ToastHost />
          </AppBarProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
