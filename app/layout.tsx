import './globals.css';
import type { Metadata } from 'next';
import AppShell from '@/components/AppShell';

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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
