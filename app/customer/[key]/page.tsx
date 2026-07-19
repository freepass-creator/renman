'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { DetailShell } from '@/components/ui';
import { Customer360 } from '@/components/Customer360';

// 손님(고객) 상세 = 뎁스 페이지. 제목은 로드 후 이름(모바일 상단바·웹 h1).
export default function CustomerPage() {
  const ckey = decodeURIComponent(String(useParams().key));
  const router = useRouter();
  const [title, setTitle] = useState('고객');
  return (
    <DetailShell title={title} onBack={() => router.back()}>
      <Customer360 ckey={ckey} onTitle={setTitle} />
    </DetailShell>
  );
}
