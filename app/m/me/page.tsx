'use client';
/** /m 설정 (F) — 메뉴 리스트. 상세 설정은 기존 /settings 연결(전용 화면은 P2 후반). */
import { useRouter } from 'next/navigation';
import { Rows, ObjRow, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MMe() {
  const router = useRouter();
  return (
    <>
      <MHead title="설정" color={C.mute} />
      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Rows title="설정">
          <ObjRow name="화면 · 초기화면" onClick={() => router.push('/settings')} />
          <ObjRow name="회사 · 계정" onClick={() => router.push('/settings')} />
          <ObjRow name="데스크톱으로 보기" onClick={() => router.push('/')} />
        </Rows>
        <div style={{ textAlign: 'center', fontSize: 10.5, color: C.faint }}>renman</div>
      </div>
    </>
  );
}
