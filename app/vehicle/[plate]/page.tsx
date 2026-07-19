'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { DetailShell } from '@/components/ui';
import { Vehicle360 } from '@/components/Vehicle360';

// 동적 렌더 강제 — useSearchParams 정적 프리렌더 bailout(next build 실패) 방지. [plate]는 어차피 동적 라우트.
export const dynamic = 'force-dynamic';

// 차량 상세 = 뎁스. DetailShell → SessionBar 상단 ←·제목 / 하단 탭 숨김. ?do=focus로 온 이유 강조.
export default function Vehicle360Page() {
  const plate = decodeURIComponent(String(useParams().plate));
  const router = useRouter();
  const focus = useSearchParams().get('do') || '';
  return (
    <DetailShell title={plate} onBack={() => router.back()}>
      <Vehicle360 plate={plate} focus={focus} />
    </DetailShell>
  );
}
