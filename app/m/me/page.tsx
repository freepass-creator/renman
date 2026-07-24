'use client';
/** /m 설정 (F) — 계정·회사·화면. P2에서 구현, 지금은 골격. */
import { EmptyState, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MMe() {
  return (
    <>
      <MHead title="설정" color={C.mute} />
      <div style={{ padding: '40px 16px' }}><EmptyState>준비중 — 계정·회사·화면 설정 (P2)</EmptyState></div>
    </>
  );
}
