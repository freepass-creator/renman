'use client';
/** /m 진입 = 운영 탭. 하단 4탭(운영·리스크·업무·업로드)의 기본 루트. */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageLoading } from '@/components/ui';

export default function MHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/m/ops'); }, [router]);
  return <PageLoading />;
}
