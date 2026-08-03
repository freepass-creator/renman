'use client';

/**
 * 테이블 행 선택 상태 — jpkerp5 use-table-selection 이식.
 *   selectedIds 변경 시 객체 ref 갱신. toggle/selectAll/clear는 stable.
 */

import { useState, useMemo, useCallback } from 'react';

export type TableSelection = {
  selectedIds: Set<string>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggleRow: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clear: () => void;
  size: number;
};

export function useTableSelection(): TableSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return useMemo(() => ({
    selectedIds,
    setSelectedIds,
    toggleRow,
    selectAll,
    clear,
    size: selectedIds.size,
  }), [selectedIds, toggleRow, selectAll, clear]);
}
