import type { ReactNode } from 'react';

/** 본사 전용 개발도구. 화면별 권한과 파괴 작업의 운영 잠금은 내부에서 각각 검증한다. */
export default function DevLayout({ children }: { children: ReactNode }) {
  return children;
}
