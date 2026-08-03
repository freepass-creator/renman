/**
 * Sec 파이프 — 섹션 → 메뉴(업무·현황) 페이지.
 *   · 손롤 <a href> 금지. PIPE + jpk:navigate SSOT.
 *   · Sec right={<WorkPipe to="payments" />}
 */
'use client';
import { TextLink } from '@/components/ui';
import { PIPE, openPipe, type PipeId } from '@/lib/work-hub';

export function WorkPipe({ to, label, query }: { to: PipeId; label?: string; query?: string }) {
  const p = PIPE[to];
  return (
    <TextLink onClick={() => openPipe(to, query)} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
      {label || `${p.label} →`}
    </TextLink>
  );
}
