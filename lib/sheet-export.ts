/**
 * 화면 목록 → 엑셀 행렬(순수). xlsx import 금지 — vitest node 통과.
 * 4행 프리앰블(타이틀·메타·공백·헤더) + 데이터. 스타일 셀 없음(CDN xlsx 0.20.3).
 */
import type { SheetCol } from '@/components/ui/excel-sheet';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { PII_MASKERS, looksLikePhone, looksLikeResident, maskPhone, maskResident } from '@/lib/pii';

export type XCell = { v: string | number; t: 's' | 'n'; z?: string };
export type SheetExportMeta = {
  title: string;
  company: string;
  filterLine: string;
  today: string;
  sumLine?: string;
};

export type SheetXf = 'money' | 'int' | 'rate' | 'date' | 'text';

const EMPTY_DISPLAY = new Set<string>([
  LEDGER_EMPTY.dash,
  LEDGER_EMPTY.unassigned,
  LEDGER_EMPTY.none,
  LEDGER_EMPTY.unmatched,
  LEDGER_EMPTY.noContract,
  '',
]);

function parseNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(String(v).replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function inferXf(col: SheetCol<unknown>, raw: unknown): SheetXf {
  const xf = (col as SheetCol<unknown> & { xf?: SheetXf }).xf;
  if (xf) return xf;
  if (typeof raw === 'number') return col.align === 'r' ? 'int' : 'int';
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) return 'date';
  return 'text';
}

function applyMask(key: string, v: unknown, mask: boolean): unknown {
  if (!mask) {
    // 최종 방어선 — mask:false 여도 휴대폰·주민 패턴은 가림
    if (looksLikePhone(v)) {
      if (process.env.NODE_ENV !== 'production' && !PII_MASKERS[key]) {
        console.warn(`[sheet-export] 미등록 PII 열(전화 패턴): ${key}`);
      }
      return maskPhone(v);
    }
    if (looksLikeResident(v)) {
      if (process.env.NODE_ENV !== 'production' && !PII_MASKERS[key]) {
        console.warn(`[sheet-export] 미등록 PII 열(주민 패턴): ${key}`);
      }
      return maskResident(v);
    }
    return v;
  }
  const fn = PII_MASKERS[key];
  if (fn) return fn(v);
  if (looksLikePhone(v)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[sheet-export] 미등록 PII 열: ${key}`);
    }
    return maskPhone(v);
  }
  if (looksLikeResident(v)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[sheet-export] 미등록 PII 열: ${key}`);
    }
    return maskResident(v);
  }
  return v;
}

export function toCell<T>(col: SheetCol<T>, row: T, mask: boolean): XCell | null {
  if (!col.text) {
    if (process.env.NODE_ENV !== 'production') {
      // text 없는 열 = 빈 셀 (cash card* 보강 전 방어)
    }
    return null;
  }
  let raw: unknown = col.text(row);
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && EMPTY_DISPLAY.has(raw.trim())) return null;

  raw = applyMask(col.key, raw, mask);

  const xf = inferXf(col as SheetCol<unknown>, raw);

  if (xf === 'money' || xf === 'int' || xf === 'rate') {
    const n = parseNum(raw);
    if (n === null) return null;
    if (xf === 'rate') return { v: n, t: 'n', z: '0.0' };
    return { v: n, t: 'n', z: '#,##0' };
  }
  if (xf === 'date') {
    const s = String(raw ?? '').slice(0, 10);
    if (!s || EMPTY_DISPLAY.has(s)) return null;
    return { v: s, t: 's' };
  }
  const s = String(raw ?? '').trim();
  if (!s || EMPTY_DISPLAY.has(s)) return null;
  return { v: s, t: 's' };
}

function colWidth(col: SheetCol<unknown>): number {
  const labelLen = [...col.label].length;
  const xf = (col as { xf?: SheetXf }).xf;
  if (xf === 'money') return Math.max(12, labelLen + 2);
  if (xf === 'date') return Math.max(12, labelLen + 2);
  if (xf === 'int' || xf === 'rate') return Math.max(10, labelLen + 2);
  return Math.max(10, Math.min(28, labelLen + 4));
}

function safeSheetName(title: string): string {
  const s = title.replace(/[\\/?*[\]]/g, '').trim() || 'Sheet';
  return s.slice(0, 31);
}

export function buildSheetMatrix<T>(
  cols: SheetCol<T>[],
  rows: T[],
  meta: SheetExportMeta,
  opt?: { mask?: boolean; fileName?: string },
): {
  aoa: XCell[][];
  widths: number[];
  headerRow: 3;
  ncols: number;
  sheetName: string;
  fileName: string;
} {
  const mask = opt?.mask !== false;
  const ncols = Math.max(1, cols.length);
  const widths = cols.map((c) => colWidth(c as SheetCol<unknown>));

  const metaParts = [
    meta.company,
    meta.filterLine,
    `${rows.length}건`,
    meta.sumLine,
    `기준일 ${meta.today}`,
  ].filter(Boolean);
  const metaLine = metaParts.join(' · ');

  const aoa: XCell[][] = [];
  // 0 타이틀
  aoa.push([{ v: meta.title, t: 's' }, ...Array.from({ length: ncols - 1 }, () => ({ v: '', t: 's' as const }))]);
  // 1 메타
  aoa.push([{ v: metaLine, t: 's' }, ...Array.from({ length: ncols - 1 }, () => ({ v: '', t: 's' as const }))]);
  // 2 공백
  aoa.push(Array.from({ length: ncols }, () => ({ v: '', t: 's' as const })));
  // 3 헤더
  aoa.push(cols.map((c) => ({ v: c.label, t: 's' as const })));

  for (const row of rows) {
    const line: XCell[] = cols.map((c) => toCell(c, row, mask) ?? { v: '', t: 's' });
    aoa.push(line);
  }

  const ymd = meta.today.replace(/-/g, '');
  const companySlug = meta.company.replace(/\s+/g, '').slice(0, 20) || '전체';
  const fileName = opt?.fileName
    || `${meta.title}-${companySlug}-${ymd}.xlsx`.replace(/[\\/:*?"<>|]/g, '');

  return {
    aoa,
    widths,
    headerRow: 3,
    ncols,
    sheetName: safeSheetName(meta.title),
    fileName,
  };
}
