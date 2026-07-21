'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import { C, R, th, thR, td, tdR } from './tokens';
import { ObjCard } from './misc';

/* 데이터 그리드 · 금액 포맷 — 표 원자. */

export type Col<T> = { key: string; label: string; align?: 'l' | 'r'; render: (row: T) => React.ReactNode };
/* 데이터 그리드 — 단일클릭=행 선택(+상세 onRow). 엑셀/ERP 관례.
 * 모바일 = ObjCard(목록 규격 min72). 필드 정의(cols)는 동일 SSOT. */
export function DataTable<T>({ cols, rows, onRow }: { cols: Col<T>[]; rows: T[]; onRow?: (row: T) => void }) {
  const [sel, setSel] = React.useState(-1);
  const mobile = useIsMobile();
  const bgOf = (i: number) => (sel === i ? 'var(--bg-selected)' : i % 2 ? C.zebra : C.card);
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {rows.map((r, i) => (
          <ObjCard
            key={i}
            title={cols[0]?.render(r)}
            fields={cols.slice(1).map((c) => [c.label, c.render(r)] as [React.ReactNode, React.ReactNode])}
            onClick={onRow ? () => { haptic.tap(); onRow(r); } : undefined}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto', marginTop: 10, border: `1px solid ${C.line}`, borderRadius: R, background: C.card }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12.5, width: '100%' }}>
        <thead><tr>{cols.map((c) => <th key={c.key} style={c.align === 'r' ? thR : th}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}
              onClick={() => { setSel(i); if (onRow) onRow(r); }}
              onKeyDown={(e) => { if (onRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onRow(r); } }}
              tabIndex={onRow ? 0 : -1} role={onRow ? 'button' : undefined}
              style={{ borderTop: `1px solid ${C.line2}`, cursor: onRow ? 'pointer' : 'default', background: bgOf(i), userSelect: 'none', outline: 'none' }}
              onMouseEnter={(e) => { if (sel !== i) e.currentTarget.style.background = C.hover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = bgOf(i); }}>
              {cols.map((c) => <td key={c.key} style={c.align === 'r' ? tdR : td}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function won(n: unknown): string { const x = Number(n); return isNaN(x) ? '—' : '₩' + x.toLocaleString(); }
