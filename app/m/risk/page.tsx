'use client';
/** /m 리스크 (B) — 미수·만기·보험·정합성. P2에서 구현, 지금은 골격. */
import { EmptyState, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MRisk() {
  return (
    <>
      <MHead title="리스크" color={C.danger} />
      <div style={{ padding: '40px 16px' }}><EmptyState>준비중 — 미수·만기·보험·정합성 (P2)</EmptyState></div>
    </>
  );
}
