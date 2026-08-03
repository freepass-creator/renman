import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

/** 개발·샘플 화면은 로컬 개발 환경에서만 존재한다. 운영 배포의 직접 URL 접근도 차단한다. */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
