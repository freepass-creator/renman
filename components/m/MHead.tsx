'use client';
/** /m 탭·스택 페이지 상단 헤더 — sticky, 상단 3px 탭색 띠. (설계서 §7) */
import type { ReactNode } from 'react';
import { C } from '@/components/ui';

export function MHead({ title, sub, color = C.brand, right }: {
  title: ReactNode;
  sub?: ReactNode;
  color?: string;
  right?: ReactNode;
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50, background: C.card,
      borderTop: `3px solid ${color}`, borderBottom: `1px solid ${C.line}`,
      padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink, lineHeight: 1.2 }}>{title}</div>
        {sub != null && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </header>
  );
}
