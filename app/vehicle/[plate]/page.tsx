'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DetailShell } from '@/components/ui';
import { Vehicle360 } from '@/components/Vehicle360';

// 동적 렌더 강제 — useSearchParams 정적 프리렌더 bailout(next build 실패) 방지.
export const dynamic = 'force-dynamic';

/**
 * 차량 360 — 홈과 같이 사이드·상단바 없이 독립.
 *   이전 = DetailShell. 엔진은 Vehicle360 그대로.
 */
export default function Vehicle360Page() {
  const plate = decodeURIComponent(String(useParams().plate));
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get('do') || '';
  const targetCompanyId = searchParams.get('company') || '';
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/');
  };

  return (
    <DetailShell title={plate} onBack={goBack} fixed>
      <Vehicle360 plate={plate} focus={focus} companyId={targetCompanyId} />
    </DetailShell>
  );
}
