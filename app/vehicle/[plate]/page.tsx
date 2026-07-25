'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Page } from '@/components/ui';
import { Vehicle360 } from '@/components/Vehicle360';
import { useAppBar } from '@/lib/appbar';

// 동적 렌더 강제 — useSearchParams 정적 프리렌더 bailout(next build 실패) 방지.
export const dynamic = 'force-dynamic';

/**
 * 차량 상세 = /dev/car-desk 시안과 동일 셸.
 *   · Page frame = 뷰포트 전폭·높이 고정 · 창스크롤 잠금 · 패널 안만 스크롤
 *   · 앱바 depth = ←·번호판 · contentMax 사실상 전폭
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
