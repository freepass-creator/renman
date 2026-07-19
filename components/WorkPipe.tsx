/**
 * Sec 파이프 — 섹션 → 메뉴(업무·현황) 페이지.
 *   · 손롤 <a href> 금지. PIPE + jpk:navigate SSOT.
 *   · Sec right={<WorkPipe to="payments" />}
 */
'use client';
import { C } from '@/components/ui';
import { PIPE, openPipe, type PipeId } from '@/lib/work-hub';

export function WorkPipe({ to, label, query }: { to: PipeId; label?: string; query?: string }) {
  const p = PIPE[to];
  return (
    <button
      type="button"
      data-ui="action"
      onClick={() => openPipe(to, query)}
      style={{
        border: 'none', background: 'none', padding: 0, margin: 0,
        fontSize: 12, color: C.accent, fontWeight: 700, cursor: 'pointer',
        fontFamily: 'inherit', whiteSpace: 'nowrap',
      }}
    >
      {label || `${p.label} →`}
    </button>
  );
}
