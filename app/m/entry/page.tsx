'use client';
/** /m 입력 (D) — 데이터센터·현장 폼 타일. P2에서 구현, 지금은 골격. */
import { EmptyState } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MEntry() {
  return (
    <>
      <MHead title="입력" color="var(--indigo-text)" />
      <div style={{ padding: '40px 16px' }}><EmptyState>준비중 — 촬영·엑셀·직접 입력 (P2)</EmptyState></div>
    </>
  );
}
