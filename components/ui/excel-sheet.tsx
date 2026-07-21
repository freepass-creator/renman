'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import { C, thX, thXR, thXPin, tdX, tdXR, tdXPin } from './tokens';
import { ObjCard } from './misc';

/**
 * 엑셀 시트 뷰 — 프리패스 ERP4 엑셀뷰 이식(현황 한눈).
 * 데스크톱 = sticky 헤더·좌측 핀 표. 모바일 = ObjCard(동일 cols SSOT).
 * 페이지 카드/리스트 토글 금지 — 이 원자만 쓰는 전용 페이지(/sheet).
 */
export type SheetCol<T> = {
  key: string;
  label: string;
  align?: 'l' | 'r';
  /** 좌측 틀고정(차번 등) */
  pin?: boolean;
  render: (row: T) => React.ReactNode;
  /** CSV·검색용 평문 */
  text?: (row: T) => string | number;
};

export function ExcelSheet<T>({ cols, rows, onRow, rowKey }: {
  cols: SheetCol<T>[];
  rows: T[];
  onRow?: (row: T) => void;
  rowKey?: (row: T, i: number) => string;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r, i) => (
          <ObjCard
            key={rowKey?.(r, i) ?? i}
            title={cols[0]?.render(r)}
            fields={cols.slice(1, 5).map((c) => [c.label, c.render(r)] as [React.ReactNode, React.ReactNode])}
            onClick={onRow ? () => { haptic.tap(); onRow(r); } : undefined}
          />
        ))}
      </div>
    );
  }
  return (
    <div style={{
      overflow: 'auto', maxHeight: 'calc(100dvh - 160px)',
      border: `1px solid ${C.line}`, borderRadius: 4, background: C.card,
    }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            {cols.map((c) => {
              const base = c.pin ? thXPin : c.align === 'r' ? thXR : thX;
              return <th key={c.key} style={base}>{c.label}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bg = i % 2 ? C.zebra : C.card;
            return (
              <tr
                key={rowKey?.(r, i) ?? i}
                onClick={onRow ? () => onRow(r) : undefined}
                style={{ cursor: onRow ? 'pointer' : 'default', background: bg }}
                onMouseEnter={(e) => { if (onRow) e.currentTarget.style.background = C.hover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
              >
                {cols.map((c) => {
                  const base = c.pin ? { ...tdXPin, background: bg } : c.align === 'r' ? tdXR : tdX;
                  return <td key={c.key} style={base}>{c.render(r)}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
