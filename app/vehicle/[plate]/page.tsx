'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Page } from '@/components/ui';
import { Vehicle360 } from '@/components/Vehicle360';
import { useAppBar } from '@/lib/appbar';

// 동적 렌더 강제 — useSearchParams 정적 프리렌더 bailout(next build 실패) 방지.
export const dynamic = 'force-dynamic';

/**
 * 차량 상세 — freepass식 고정 스크롤 4장(지금 · 이 차 · 수납·정산 · 이력).
 *   · Page frame · 앱바 depth(← · 번호판)
 *   · DnD/탭렌즈 없음 · 엔진은 useVehicleDetail
 */
export default function Vehicle360Page() {
  const plate = decodeURIComponent(String(useParams().plate));
  const router = useRouter();
  const focus = useSearchParams().get('do') || '';
  const goBack = () => router.back();

  useAppBar({
    back: goBack,
    depth: true,
    contentMax: 10000,
    contentPad: 20,
  }, [plate]);

  return (
    <Page frame noCompany>
      <Vehicle360 plate={plate} focus={focus} />
    </Page>
  );
}
