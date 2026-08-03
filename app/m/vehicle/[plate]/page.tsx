'use client';
/** /m 자산360 상세 — 스택(MBackBar 자동). 기존 Vehicle360 재사용, /m 셸 안에서. */
import { useParams, useSearchParams } from 'next/navigation';
import { Vehicle360 } from '@/components/Vehicle360';
import { MHead } from '@/components/m/MHead';
import { C } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function MVehicle() {
  const plate = decodeURIComponent(String(useParams().plate));
  const focus = useSearchParams().get('do') || '';
  return (
    <>
      <MHead title={plate} color={C.brand} />
      <div style={{ padding: '4px 0 12px' }}>
        <Vehicle360 plate={plate} focus={focus} />
      </div>
    </>
  );
}
