'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { ChevronRight } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { C, R, th, thR, td, tdR } from './tokens';

/* 데이터 그리드 · 금액 포맷 — 표 원자. */

export type Col<T> = { key: string; label: string; align?: 'l' | 'r'; render: (row: T) => React.ReactNode };
/* 데이터 그리드 — 단일클릭=행 선택, 더블클릭=상세(onRow). 엑셀/ERP 관례. */
export function DataTable<T>({ cols, rows, onRow }: { cols: Col<T>[]; rows: T[]; onRow?: (row: T) => void }) {
  const [sel, setSel] = React.useState(-1);
  const mobile = useIsMobile();
  const bgOf = (i: number) => (sel === i ? '#d9e4f5' : i % 2 ? C.zebra : '#fff');
  // 좁은 화면 = 같은 객체를 카드로(엑셀 표 대신). 필드 정의(cols)는 동일 SSOT.
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
        {rows.map((r, i) => (
          <div key={i} onClick={() => { if (onRow) { haptic.tap(); onRow(r); } }} tabIndex={onRow ? 0 : -1}
            onKeyDown={(e) => { if (onRow && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); haptic.tap(); onRow(r); } }}
            style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: '#fff', padding: '12px 14px', cursor: onRow ? 'pointer' : 'default', outline: 'none', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>{cols[0]?.render(r)}</div>
              {onRow && <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />}
            </div>
            {cols.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 7 }}>
                {cols.slice(1).map((c) => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                    <span style={{ color: C.mute, flex: '0 0 auto' }}>{c.label}</span>
                    <span style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden', fontWeight: 600 }}>{c.render(r)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ overflowX: 'auto', marginTop: 10, border: `1px solid ${C.line}`, borderRadius: R, background: '#fff' }}>
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
