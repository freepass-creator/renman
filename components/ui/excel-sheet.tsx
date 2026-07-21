'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import { C, R, SH, thX, thXR, thXPin, tdX, tdXR, tdXPin, ctrlH, ctrlFs } from './tokens';
import { ObjCard } from './misc';
import { Search } from './controls';

/**
 * 엑셀 시트 뷰 — 프리패스 ERP4 엑셀뷰 이식(현황 한눈).
 * 데스크톱 = sticky 헤더 표(+헤더 필터). 모바일 = ObjCard(동일 cols SSOT).
 * 페이지 카드/리스트 토글 금지 — 이 원자만 쓰는 전용 페이지(/sheet).
 *
 * 헤더 필터(= ERP4 엑셀 오토필터) 규칙:
 *   · 열 간 AND · 열 안 OR (엑셀과 동일)
 *   · 체크리스트 값 = **셀에 보이는 문자열 그대로**(col.text). 보이는 것만 고를 수 있어야 헷갈리지 않는다.
 *   · 개수는 «다른 열 필터를 반영한» 교차집계 — 내 열만 빼고 센다. 그래야 숫자가 실제 결과와 맞는다.
 *   · 필터는 원자 안에 산다. 페이지는 onFiltered 로 결과만 받아 건수·CSV에 쓴다(집계 손롤 금지).
 */
export type SheetCol<T> = {
  key: string;
  label: string;
  align?: 'l' | 'r';
  /** 좌측 틀고정 — 고정 칸은 자기 배경이 필요해 행 호버가 끊긴다. 꼭 필요할 때만. */
  pin?: boolean;
  render: (row: T) => React.ReactNode;
  /** CSV·검색·헤더필터 공용 평문. 없으면 그 열은 필터 불가. */
  text?: (row: T) => string | number;
  /** 숫자 정렬 허용(정렬 바 노출). 기본=문자 정렬만. */
  sortNum?: boolean;
  /** 한 칸에 값이 여럿(옵션·태그) — 체크리스트를 값 단위로 쪼갠다. */
  values?: (row: T) => string[];
};

type ColSort = { key: string; dir: 'asc' | 'desc' } | null;

const cellText = <T,>(c: SheetCol<T>, r: T): string => {
  const v = c.text ? c.text(r) : '';
  return v === 0 ? '0' : String(v ?? '').trim();
};
/** 매칭·체크리스트용 값 목록. 다중값 열은 쪼개고, 빈 값은 '(없음)' 센티널로 — 빈 것도 고를 수 있어야 한다. */
const cellValues = <T,>(c: SheetCol<T>, r: T): string[] => {
  if (c.values) { const a = c.values(r).filter(Boolean); return a.length ? a : ['(없음)']; }
  const v = cellText(c, r);
  return [v || '(없음)'];
};
const sortVal = <T,>(c: SheetCol<T>, r: T): number | string => {
  if (c.sortNum) return Number(String(c.text ? c.text(r) : '').replace(/[^\d.-]/g, '')) || 0;
  return cellText(c, r);
};

function matchCol<T>(c: SheetCol<T>, r: T, set: Set<string>): boolean {
  if (!set.size) return true;
  return cellValues(c, r).some((v) => set.has(v));
}

/* ── 헤더 필터 팝오버 ── */
function FilterPop<T>({ col, x, y, rows, sel, onSel, sort, onSort, onClose }: {
  col: SheetCol<T>; x: number; y: number; rows: T[];
  sel: Set<string>; onSel: (next: Set<string>) => void;
  sort: ColSort; onSort: (s: ColSort) => void; onClose: () => void;
}) {
  const [q, setQ] = React.useState('');
  // Esc 닫기 — ERP4엔 없던 것. 팝오버는 키보드로도 빠져나갈 수 있어야 한다.
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);

  const entries = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const v of cellValues(col, r)) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'));
  }, [rows, col]);

  const shown = entries.filter(([k]) => !q || k.toLowerCase().includes(q.toLowerCase()));
  const toggle = (v: string) => { const n = new Set(sel); if (n.has(v)) n.delete(v); else n.add(v); onSel(n); };
  const isS = (dir: 'asc' | 'desc') => !!sort && sort.key === col.key && sort.dir === dir;
  const setDir = (dir: 'asc' | 'desc') => onSort(isS(dir) ? null : { key: col.key, dir });

  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1, height: ctrlH(false, 'sm'), fontSize: ctrlFs(false, 'sm'), fontWeight: active ? 700 : 500,
    border: `1px solid ${active ? C.brand : C.line}`, borderRadius: R,
    background: active ? C.brand : C.card, color: active ? C.inverse : C.mute, cursor: 'pointer',
  });

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={onClose} />
      <div role="dialog" aria-label={`${col.label} 필터`}
        style={{
          position: 'fixed', top: y + 2, left: Math.max(6, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 236)),
          width: 230, zIndex: 91, background: C.card, border: `1px solid ${C.line}`,
          borderRadius: R, boxShadow: SH.pop, padding: 8,
        }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={() => setDir('asc')} style={btn(isS('asc'))}>↑ 오름</button>
          <button type="button" onClick={() => setDir('desc')} style={btn(isS('desc'))}>↓ 내림</button>
        </div>
        <Search value={q} onChange={(e) => setQ(e.target.value)} placeholder="값 검색" size="sm" wrapStyle={{ width: '100%', marginBottom: 6 }} />
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {shown.length === 0 ? <div style={{ fontSize: 12, color: C.faint, padding: '10px 4px' }}>값 없음</div>
            : shown.map(([v, n]) => {
              const on = sel.has(v);
              return (
                <button key={v} type="button" onClick={() => toggle(v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                    padding: '5px 6px', border: 'none', borderRadius: R, cursor: 'pointer',
                    background: on ? C.head : 'transparent', fontWeight: on ? 700 : 400,
                    fontSize: 12, color: C.ink,
                  }}>
                  <span style={{ width: 12, color: on ? C.brand : C.line2 }}>{on ? '✓' : ''}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  <span style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
                </button>
              );
            })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button type="button" onClick={() => { onSel(new Set()); onSort(null); }} style={btn(false)}>초기화</button>
          <button type="button" onClick={onClose} style={btn(false)}>닫기</button>
        </div>
      </div>
    </>
  );
}

export function ExcelSheet<T>({ cols, rows, onRow, rowKey, onFiltered }: {
  cols: SheetCol<T>[];
  rows: T[];
  onRow?: (row: T) => void;
  rowKey?: (row: T, i: number) => string;
  /** 필터·정렬 적용 결과 — 페이지 건수·CSV가 이걸 쓴다. */
  onFiltered?: (rows: T[]) => void;
}) {
  const mobile = useIsMobile();
  // 훅은 조건부 return 앞에서 — 모바일 분기보다 위.
  const [hover, setHover] = React.useState<number | null>(null);
  const [colFilter, setColFilter] = React.useState<Record<string, Set<string>>>({});
  const [colSort, setColSort] = React.useState<ColSort>(null);
  const [openCol, setOpenCol] = React.useState<{ key: string; x: number; y: number } | null>(null);
  const byKey = React.useMemo(() => new Map(cols.map((c) => [c.key, c])), [cols]);

  const view = React.useMemo(() => {
    const active = Object.entries(colFilter).filter(([, s]) => s.size);
    let out = active.length
      ? rows.filter((r) => active.every(([k, s]) => { const c = byKey.get(k); return !c || matchCol(c, r, s); }))
      : rows;
    const sc = colSort && byKey.get(colSort.key);
    if (sc) {
      const dir = colSort!.dir === 'asc' ? 1 : -1;
      out = [...out].sort((a, b) => {
        const va = sortVal(sc, a), vb = sortVal(sc, b);
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
        return String(va).localeCompare(String(vb), 'ko') * dir;
      });
    }
    return out;
  }, [rows, colFilter, colSort, byKey]);

  React.useEffect(() => { onFiltered?.(view); }, [view, onFiltered]);

  if (mobile) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {view.map((r, i) => (
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

  const openC = openCol && byKey.get(openCol.key);
  // 팝오버 개수는 «내 열을 뺀» 나머지 필터 결과로 센다 — 내 선택 때문에 목록이 쪼그라들지 않게(엑셀 동작).
  const popRows = openCol
    ? rows.filter((r) => Object.entries(colFilter).every(([k, s]) => {
      if (k === openCol.key || !s.size) return true;
      const c = byKey.get(k); return !c || matchCol(c, r, s);
    }))
    : [];

  return (
    <>
      <div style={{
        overflow: 'auto', maxHeight: 'calc(100dvh - 160px)',
        border: `1px solid ${C.line}`, borderRadius: 4, background: C.card,
      }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 12, width: 'max-content', minWidth: '100%' }}>
          <thead>
            <tr>
              {cols.map((c) => {
                const base = c.pin ? thXPin : c.align === 'r' ? thXR : thX;
                const canFilter = !!c.text;
                const on = !!colFilter[c.key]?.size || (colSort?.key === c.key);
                return (
                  <th key={c.key}
                    style={{ ...base, cursor: canFilter ? 'pointer' : 'default', color: on ? C.brand : base.color, userSelect: 'none' }}
                    title={canFilter ? `${c.label} 필터` : undefined}
                    onClick={canFilter ? (e) => {
                      const rc = e.currentTarget.getBoundingClientRect();
                      setOpenCol((o) => (o?.key === c.key ? null : { key: c.key, x: rc.left, y: rc.bottom }));
                    } : undefined}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {c.label}
                      {colSort?.key === c.key && <span style={{ fontSize: 9 }}>{colSort.dir === 'asc' ? '↑' : '↓'}</span>}
                      {!!colFilter[c.key]?.size && <span style={{ fontSize: 9 }}>▼</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const bg = i % 2 ? C.zebra : C.card;
              // 고정(pin) 칸은 가로스크롤 시 뒤 내용을 가려야 해서 «자기 배경»이 필요하다.
              // 그래서 행 배경만 바꾸면 그 칸만 호버가 안 먹는다 → hover 행은 여기서 함께 계산한다.
              const rowBg = hover === i && onRow ? C.hover : bg;
              return (
                <tr
                  key={rowKey?.(r, i) ?? i}
                  onClick={onRow ? () => onRow(r) : undefined}
                  style={{ cursor: onRow ? 'pointer' : 'default', background: rowBg }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                >
                  {cols.map((c) => {
                    const base = c.pin ? { ...tdXPin, background: rowBg } : c.align === 'r' ? tdXR : tdX;
                    return <td key={c.key} style={base}>{c.render(r)}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {openCol && openC && (
        <FilterPop
          col={openC} x={openCol.x} y={openCol.y} rows={popRows}
          sel={colFilter[openCol.key] || new Set()}
          onSel={(next) => setColFilter((f) => {
            const nf = { ...f };
            if (next.size) nf[openCol.key] = next; else delete nf[openCol.key];
            return nf;
          })}
          sort={colSort} onSort={setColSort}
          onClose={() => setOpenCol(null)}
        />
      )}
    </>
  );
}
