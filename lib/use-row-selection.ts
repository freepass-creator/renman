'use client';

/**
 * 행 선택 공용 hook — jpkerp5 use-row-selection 이식.
 *   평클릭=단일 · Ctrl/Cmd=토글 · Shift=범위 · 우클릭=미선택이면 선택 후 메뉴.
 *   체크박스 컬럼 없는 시대의 대체 패턴.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { TableSelection } from './use-table-selection';

export type RowSelection = {
  onRowMouseDown: (e: React.MouseEvent) => void;
  onRowClick: (e: React.MouseEvent, id: string, index: number) => void;
  onRowContextMenu: (
    e: React.MouseEvent,
    id: string,
    index: number,
    showCtxMenu: () => void,
  ) => void;
  ids: string[];
};

export function useRowSelection({
  ids, selection,
}: {
  ids: string[];
  selection: TableSelection;
}): RowSelection {
  const lastIdxRef = useRef<number | null>(null);

  const onRowMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.shiftKey) e.preventDefault();
  }, []);

  const onRowClick = useCallback((e: React.MouseEvent, id: string, index: number) => {
    if (e.shiftKey && lastIdxRef.current != null) {
      const [a, b] = lastIdxRef.current < index
        ? [lastIdxRef.current, index]
        : [index, lastIdxRef.current];
      const next = new Set(selection.selectedIds);
      for (let i = a; i <= b; i++) {
        const rid = ids[i];
        if (rid) next.add(rid);
      }
      selection.setSelectedIds(next);
      if (typeof window !== 'undefined') window.getSelection()?.removeAllRanges();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      selection.toggleRow(id);
      lastIdxRef.current = index;
      return;
    }
    selection.setSelectedIds(new Set([id]));
    lastIdxRef.current = index;
  }, [ids, selection]);

  const onRowContextMenu = useCallback((
    e: React.MouseEvent, id: string, index: number, showCtxMenu: () => void,
  ) => {
    e.preventDefault();
    if (!selection.selectedIds.has(id)) {
      selection.setSelectedIds(new Set([id]));
      lastIdxRef.current = index;
    }
    showCtxMenu();
  }, [selection]);

  return { onRowMouseDown, onRowClick, onRowContextMenu, ids };
}

/** Ctrl/Cmd+A — 보이는 행 전체 선택 토글. input/textarea/dialog 안에서는 무시. */
export function useCtrlASelectAll(rowSel: RowSelection, selection: TableSelection): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const tag = tgt.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tgt.isContentEditable) return;
      if (tgt.closest('[role="dialog"]')) return;
      e.preventDefault();
      const allSelected = rowSel.ids.length > 0 && rowSel.ids.every((id) => selection.selectedIds.has(id));
      if (allSelected) selection.clear();
      else selection.selectAll(rowSel.ids);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rowSel.ids, selection]);
}
