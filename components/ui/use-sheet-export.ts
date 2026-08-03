'use client';
/**
 * 화면 목록 엑셀 내보내기 — 페이지가 쓰는 유일한 API.
 * LedgerFrame onView 에 onView 를 꽂고, 우클릭 메뉴에 exportItem() 을 push.
 */
import { useCallback, useRef, useState } from 'react';
import type { SheetCol } from './excel-sheet';
import type { ContextMenuItem } from './context-menu';
import { useConfirm } from './confirm';
import { buildSheetMatrix, type SheetExportMeta } from '@/lib/sheet-export';
import { useSession } from '@/lib/session';
import { companyLabel } from '@/lib/companies';
import { todayKST } from '@/lib/contracts/dates';
import { toast } from '@/lib/toast';

type ViewSnap<T> = { rows: T[]; cols: SheetCol<T>[] };

async function downloadMatrix(matrix: ReturnType<typeof buildSheetMatrix>): Promise<void> {
  const XLSX = await import('xlsx');
  const { aoa, widths, headerRow, ncols, sheetName, fileName } = matrix;
  const ws: Record<string, unknown> = {};
  const lastR = aoa.length - 1;
  const lastC = Math.max(0, ncols - 1);

  for (let r = 0; r < aoa.length; r++) {
    const line = aoa[r] || [];
    for (let c = 0; c < ncols; c++) {
      const cell = line[c];
      if (!cell) continue;
      if (cell.t === 's' && cell.v === '' && r > headerRow) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const out: { v: string | number; t: string; z?: string } = { v: cell.v, t: cell.t };
      if (cell.z) out.z = cell.z;
      ws[addr] = out;
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastR, c: lastC } });
  ws['!cols'] = widths.map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 26 }, { hpt: 16 }, { hpt: 8 }, { hpt: 22 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastC } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastC } },
  ];
  if (lastR >= headerRow) {
    const endCol = XLSX.utils.encode_col(lastC);
    ws['!autofilter'] = { ref: `A${headerRow + 1}:${endCol}${lastR + 1}` };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName, { bookType: 'xlsx', compression: true });
}

export function useSheetExport<T>(o: {
  title: string;
  filterSummary?: () => string;
  sumLine?: () => string;
  fileName?: string;
  /** 기본 true. false 는 코드에서 직접 켜지 말고 원문 메뉴(본사+확인)만. */
  mask?: boolean;
}): {
  onView: (v: { rows: T[]; cols: SheetCol<T>[] }) => void;
  exportItem: (opt?: { selected?: T[]; unmasked?: boolean }) => ContextMenuItem;
  count: number;
} {
  const confirm = useConfirm();
  const { companyId, isOperator, scopeAll } = useSession();
  const snap = useRef<ViewSnap<T>>({ rows: [], cols: [] });
  const [count, setCount] = useState(0);

  const onView = useCallback((v: { rows: T[]; cols: SheetCol<T>[] }) => {
    snap.current = v;
    setCount(v.rows.length);
  }, []);

  const runExport = useCallback(async (rows: T[], cols: SheetCol<T>[], mask: boolean) => {
    if (!cols.length || !rows.length) {
      toast('내보낼 행이 없습니다', 'info');
      return;
    }
    const meta: SheetExportMeta = {
      title: o.title,
      company: scopeAll ? '전 법인' : companyLabel(companyId),
      filterLine: o.filterSummary?.() || '전체',
      today: todayKST(),
      sumLine: o.sumLine?.(),
    };
    const matrix = buildSheetMatrix(cols, rows, meta, { mask, fileName: o.fileName });
    try {
      await downloadMatrix(matrix);
      toast(`${matrix.fileName} 저장`, 'success');
    } catch (e) {
      toast((e as Error).message || '엑셀 저장 실패', 'error');
    }
  }, [o, companyId, scopeAll]);

  const exportItem = useCallback((opt?: { selected?: T[]; unmasked?: boolean }): ContextMenuItem => {
    const selected = opt?.selected;
    const unmasked = opt?.unmasked === true;
    const n = selected?.length ?? snap.current.rows.length;
    const label = unmasked
      ? (selected?.length ? `선택 ${n}건 원문 엑셀` : `목록 원문 엑셀 (${n}건)`)
      : (selected?.length ? `선택 ${n}건만 엑셀로` : `목록 엑셀로 (${n}건)`);

    if (unmasked && !isOperator) {
      return { label: '원문 엑셀 (본사 전용)', disabled: true, onClick: () => {} };
    }

    return {
      label,
      danger: unmasked,
      disabled: n === 0,
      onClick: () => {
        void (async () => {
          if (unmasked) {
            if (!(await confirm({
              message: '전화·면허·주소 등 개인정보 원문이 파일로 나갑니다. 외부 공유에 주의하세요. 계속?',
              danger: true,
            }))) return;
          }
          const cols = snap.current.cols;
          const rows = selected?.length ? selected : snap.current.rows;
          const mask = unmasked ? false : (o.mask !== false);
          await runExport(rows, cols, mask);
        })();
      },
    };
  }, [confirm, isOperator, o.mask, runExport]);

  return { onView, exportItem, count };
}
