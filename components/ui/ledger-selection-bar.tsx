'use client';
/**
 * 원장 선택 액션바 — 행 1건 이상 선택 시에만 표 위 얇은 바.
 *   «N건 선택» + 대량 액션 + [전체선택]·[선택 해제]. 0건=null(평소 조용).
 */
import type { ReactNode } from 'react';
import { Btn } from './controls';
import { C } from './tokens';

export function LedgerSelectionBar({
  count,
  onSelectAll,
  onClear,
  children,
}: {
  count: number;
  /** 현재 뷰의 선택 가능 행 전부. 없으면 버튼 숨김. */
  onSelectAll?: () => void;
  onClear: () => void;
  /** 대량 액션(내용증명 일괄 등). */
  children?: ReactNode;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        flexShrink: 0, padding: '6px 8px', marginBottom: 6,
        border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
        background: C.card, fontSize: 12.5,
      }}
    >
      <span style={{ fontWeight: 800, color: C.ink, whiteSpace: 'nowrap' }}>{count}건 선택</span>
      <span style={{ flex: 1, minWidth: 8 }} />
      {children}
      {onSelectAll ? (
        <Btn size="sm" variant="ghost" onClick={onSelectAll}>전체선택</Btn>
      ) : null}
      <Btn size="sm" variant="ghost" onClick={onClear}>선택 해제</Btn>
    </div>
  );
}
