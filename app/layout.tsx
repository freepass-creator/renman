import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '렌터카매니저',
  description: '오늘 할 일',
};

// 대표(2026-08-21): 「핸드폰으로도 확인하기 쉽게 해주고」
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#111418',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        {children}
      </body>
    </html>
  );
}
