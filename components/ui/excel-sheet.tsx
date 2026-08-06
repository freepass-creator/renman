'use client';
import React from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { haptic } from '@/lib/haptics';
import { C, R, SH, NUM, thX, thXR, thXC, thXPin, tdX, tdXR, tdXC, tdXPin, ctrlH, ctrlFs } from './tokens';
import { ObjCard, Cards, type ObjCardProps } from './misc';
import { Btn, Search } from './controls';
import { money } from './table';

/**
 * 엑셀 시트 뷰 — 프리패스 ERP4 엑셀뷰 이식(현황 한눈).
 * 데스크톱 = sticky 헤더 표(+헤더 필터). 모바일 = ObjCard(동일 cols SSOT).
 * 보기 모드(mode) = 같은 cols로 표/카드. 페이지가 토글을 «손롤»하지 말고 IconSeg를 WorkbenchBar view에 넘긴다.
 *
 * 헤더 필터(= ERP4 엑셀 오토필터) 규칙:
 *   · 열 간 AND · 열 안 OR (엑셀과 동일)
 *   · 체크리스트 키 = col.text 평문(매칭·CSV). 표시는 formatFilterLabel 로 셀과 같은 말(금액 콤마 등).
 *   · 개수는 «다른 열 필터를 반영한» 교차집계 — 내 열만 빼고 센다. 그래야 숫자가 실제 결과와 맞는다.
 *   · 필터는 원자 안에 산다. 페이지는 onView 로 보이는 rows·cols 를 받아 건수·엑셀에 쓴다(집계 손롤 금지).
 *
 * 회사열: key=`company` 는 다회사(scopeAll)만. 단일회사 세션은 ExcelSheet가 숨김(페이지 손롤 금지).
 */
export type SheetCol<T> = {
  key: string;
  label: string;
  align?: 'l' | 'c' | 'r';
  /**
   * 기본보기 반응형 중요도. 1은 항상 유지하고, 숫자가 클수록 표 영역이
   * 좁아질 때 먼저 숨긴다. 전체보기에서는 이 값과 무관하게 모두 표시한다.
   */
  priority?: 1 | 2 | 3 | 4;
  /** 좌측 틀고정 — 고정 칸은 자기 배경이 필요해 행 호버가 끊긴다. 꼭 필요할 때만. */
  pin?: boolean;
  render: (row: T) => React.ReactNode;
  /** CSV·검색·헤더필터·엑셀 공용 평문. 없으면 그 열은 필터·내보내기 불가. */
  text?: (row: T) => string | number;
  /** 숫자 정렬 허용(정렬 바 노출). 기본=문자 정렬만. */
  sortNum?: boolean;
  /** 한 칸에 값이 여럿(옵션·태그) — 체크리스트를 값 단위로 쪼갠다. */
  values?: (row: T) => string[];
  /** 엑셀 셀 서식. 화면 render에 영향 없음. 없으면 text() 타입으로 추론. */
  xf?: 'money' | 'int' | 'rate' | 'date' | 'text';
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

const PURE_NUM = /^-?\d+(\.\d+)?$/;
const isNumKey = (v: string) => v !== '(없음)' && PURE_NUM.test(v);
const colIsNumeric = <T,>(c: SheetCol<T>, keys: string[]): boolean => {
  if (c.sortNum || c.xf === 'money' || c.xf === 'int' || c.xf === 'rate') return true;
  const vals = keys.filter((k) => k !== '(없음)');
  return vals.length > 0 && vals.every(isNumKey);
};
/** 필터 체크리스트 표시 — 매칭 키(text)는 그대로 두고, 금액·숫자는 셀과 같이 콤마. */
const formatFilterLabel = <T,>(c: SheetCol<T>, v: string): string => {
  if (v === '(없음)') return '(없음)';
  if (c.xf === 'money') return money(v);
  if ((c.xf === 'int' || c.xf === 'rate' || c.sortNum || PURE_NUM.test(v)) && isNumKey(v)) {
    return Number(v).toLocaleString('ko-KR');
  }
  return v;
};
const sortVal = <T,>(c: SheetCol<T>, r: T): number | string => {
  const raw = String(c.text ? c.text(r) : '').trim();
  if (c.sortNum || c.xf === 'money' || c.xf === 'int' || c.xf === 'rate') {
    return Number(raw.replace(/[^\d.-]/g, '')) || 0;
  }
  if (PURE_NUM.test(raw)) return Number(raw);
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
    const list = [...m.entries()];
    const numeric = colIsNumeric(col, list.map(([k]) => k));
    list.sort((a, b) => {
      if (numeric) {
        const na = a[0] === '(없음)' ? Number.NEGATIVE_INFINITY : Number(a[0]);
        const nb = b[0] === '(없음)' ? Number.NEGATIVE_INFINITY : Number(b[0]);
        return na - nb || b[1] - a[1];
      }
      return b[1] - a[1] || a[0].localeCompare(b[0], 'ko');
    });
    return list;
  }, [rows, col]);

  const qNorm = q.replace(/,/g, '').trim().toLowerCase();
  const shown = entries.filter(([k]) => {
    if (!qNorm) return true;
    const label = formatFilterLabel(col, k);
    return k.toLowerCase().includes(qNorm)
      || label.toLowerCase().includes(q.toLowerCase())
      || label.replace(/,/g, '').toLowerCase().includes(qNorm);
  });
  const numericList = colIsNumeric(col, entries.map(([k]) => k));
  const toggle = (v: string) => { haptic.select(); const n = new Set(sel); if (n.has(v)) n.delete(v); else n.add(v); onSel(n); };
  const isS = (dir: 'asc' | 'desc') => !!sort && sort.key === col.key && sort.dir === dir;
  const setDir = (dir: 'asc' | 'desc') => { haptic.select(); onSort(isS(dir) ? null : { key: col.key, dir }); };

  const btn = (active: boolean): React.CSSProperties => ({
    flex: 1, height: ctrlH(false, 'sm'), fontSize: ctrlFs(false, 'sm'), fontWeight: 600, boxSizing: 'border-box',
    border: `1px solid ${active ? C.brand : C.line}`, borderRadius: R,
    background: active ? C.brand : C.card, color: active ? C.inverse : C.mute, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
  });

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={onClose} />
      <div role="dialog" aria-label={`${col.label} 필터`}
        style={{
          position: 'fixed', top: y + 2, left: Math.max(6, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 264)),
          width: 248, zIndex: 91, background: C.card, border: `1px solid ${C.line}`,
          borderRadius: R, boxShadow: SH.pop, padding: 8,
        }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button type="button" onClick={() => setDir('asc')} style={btn(isS('asc'))}><ChevronUp size={12} strokeWidth={2.4} aria-hidden /> 오름</button>
          <button type="button" onClick={() => setDir('desc')} style={btn(isS('desc'))}><ChevronDown size={12} strokeWidth={2.4} aria-hidden /> 내림</button>
        </div>
        <Search autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="값 검색" size="sm" wrapStyle={{ width: '100%', marginBottom: 6 }} />
        <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {shown.length === 0 ? <div style={{ fontSize: 12, color: C.faint, padding: '10px 4px' }}>값 없음</div>
            : shown.map(([v, n]) => {
              const on = sel.has(v);
              const label = formatFilterLabel(col, v);
              return (
                <button key={v} type="button" onClick={() => toggle(v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                    padding: '5px 6px', border: 'none', borderRadius: R, cursor: 'pointer',
                    background: on ? C.head : 'transparent', fontWeight: 600,
                    fontSize: 12, color: C.ink,
                  }}>
                  <span style={{ width: 12, color: on ? C.brand : C.line2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{on ? <Check size={12} strokeWidth={2.6} aria-hidden /> : null}</span>
                  <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontFamily: numericList && isNumKey(v) ? NUM : undefined,
                    fontVariantNumeric: numericList && isNumKey(v) ? 'tabular-nums' : undefined,
                    textAlign: numericList && isNumKey(v) ? 'right' : 'left',
                  }}>{label}</span>
                  <span style={{ fontSize: 11, color: C.faint, fontVariantNumeric: 'tabular-nums', fontFamily: NUM, minWidth: 18, textAlign: 'right' }}>{n}</span>
                </button>
              );
            })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 8 }}>
          <Btn size="sm" variant="ghost" onClick={() => { onSel(new Set()); onSort(null); }}>초기화</Btn>
          <Btn size="sm" variant="ghost" onClick={onClose}>닫기</Btn>
        </div>
      </div>
    </>
  );
}

export function ExcelSheet<T>({
  cols, rows, exportRows, onRow, onRowDoubleClick, rowKey, selectedRowKey,
  onView, mode = 'excel', fit = false, rowClickable,
  selectedKeys,
  onRowMouseDown, onRowClickEvent, onRowContextMenu, mobileCard,
}: {
  cols: SheetCol<T>[];
  rows: T[];
  /** 화면 성능상 rows를 자를 때 내보내기·헤더필터에는 사용할 전체 행. */
  exportRows?: T[];
  onRow?: (row: T) => void;
  /**
   * 상세 진입. 데스크톱=더블클릭 · 모바일 카드=한 번 탭.
   * onRow와 같이 쓰면 클릭은 선택(onRow), 더블클릭만 진입.
   */
  onRowDoubleClick?: (row: T) => void;
  rowKey?: (row: T, i: number) => string;
  selectedRowKey?: string | null;
  /** 헤더필터·정렬·회사열 규칙이 반영된 «지금 보이는» rows·cols. */
  onView?: (v: { rows: T[]; cols: SheetCol<T>[] }) => void;
  /** 보기 모드 — 같은 cols로 표/카드를 그린다. 모바일은 항상 카드(표는 손가락으로 못 읽는다). */
  mode?: 'excel' | 'card';
  /** 기본보기: 가로 스크롤 없이 현재 표 영역에 맞추고 낮은 중요도 열을 자동 숨김. */
  fit?: boolean;
  /** false면 클릭 비활성(하위 장식행). 기본 true. */
  rowClickable?: (row: T) => boolean;
  /** 다중 선택 하이라이트(--bg-selected). 체크박스 없음. */
  selectedKeys?: ReadonlySet<string>;
  /** jpkerp5 rowSel — Shift 텍스트선택 방지. */
  onRowMouseDown?: (e: React.MouseEvent, row: T, index: number) => void;
  /** jpkerp5 rowSel — 클릭=단일·Shift=범위·Ctrl=토글. 있으면 onRow보다 우선. */
  onRowClickEvent?: (e: React.MouseEvent, row: T, index: number) => void;
  /** 우클릭 메뉴. */
  onRowContextMenu?: (e: React.MouseEvent, row: T, index: number) => void;
  /** Mobile task card identity, status and priority values; independent of desktop column order. */
  mobileCard?: (row: T) => Omit<ObjCardProps, 'onClick' | 'style'>;
}) {
  const mobile = useIsMobile();
  const { scopeAll } = useSession();
  /** 단일회사 = 회사열 숨김. 다회사(합본)만 표시. */
  const visibleCols = React.useMemo(
    () => (scopeAll ? cols : cols.filter((c) => c.key !== 'company')),
    [cols, scopeAll],
  );
  // 훅은 조건부 return 앞에서 — 모바일 분기보다 위.
  const [hover, setHover] = React.useState<number | null>(null);
  const [colFilter, setColFilter] = React.useState<Record<string, Set<string>>>({});
  const [colSort, setColSort] = React.useState<ColSort>(null);
  const [openCol, setOpenCol] = React.useState<{ key: string; x: number; y: number } | null>(null);
  const [mobileLimit, setMobileLimit] = React.useState(25);
  const clickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const byKey = React.useMemo(() => new Map(visibleCols.map((c) => [c.key, c])), [visibleCols]);

  React.useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
  }, []);

  const applyView = React.useCallback((sourceRows: T[]) => {
    const active = Object.entries(colFilter).filter(([, s]) => s.size);
    let out = active.length
      ? sourceRows.filter((r) => active.every(([k, s]) => { const c = byKey.get(k); return !c || matchCol(c, r, s); }))
      : sourceRows;
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
  }, [colFilter, colSort, byKey]);
  const view = React.useMemo(() => applyView(rows), [applyView, rows]);
  const exportView = React.useMemo(
    () => (exportRows ? applyView(exportRows) : view),
    [applyView, exportRows, view],
  );

  React.useEffect(() => { onView?.({ rows: exportView, cols: visibleCols }); }, [exportView, visibleCols, onView]);
  React.useEffect(() => { setMobileLimit(25); }, [rows, colFilter, colSort]);

  if (mobile || mode === 'card') {
    // 목록 = 그룹 카드 규격(Cards). 체크박스 없음.
    return (
      <Cards>
        {view.slice(0, mobileLimit).map((r, i) => {
          const key = rowKey?.(r, i) ?? String(i);
          const multi = !!selectedKeys?.has(key);
          const mobileProps = mobileCard?.(r);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <ObjCard
                  {...(mobileProps ?? {
                    title: visibleCols[0]?.render(r),
                    fields: visibleCols.slice(1, 5).map((c) => [c.label, c.render(r)] as [React.ReactNode, React.ReactNode]),
                  })}
                  style={multi ? { background: 'var(--bg-selected)' } : undefined}
                  onClick={(onRowDoubleClick || onRow) ? () => {
                    haptic.tap();
                    (onRowDoubleClick || onRow)?.(r);
                  } : undefined}
                />
              </div>
            </div>
          );
        })}
        {view.length > mobileLimit && (
          <button
            type="button"
            className="excel-sheet__load-more"
            onClick={() => setMobileLimit((limit) => Math.min(limit + 25, view.length))}
          >
            {Math.min(25, view.length - mobileLimit)}개 더 보기
            <span>{mobileLimit.toLocaleString()} / {view.length.toLocaleString()}</span>
          </button>
        )}
      </Cards>
    );
  }

  const openC = openCol && byKey.get(openCol.key);
  const filterSourceRows = exportRows ?? rows;
  // 팝오버 개수는 «내 열을 뺀» 나머지 필터 결과로 센다 — 내 선택 때문에 목록이 쪼그라들지 않게(엑셀 동작).
  const popRows = openCol
    ? filterSourceRows.filter((r) => Object.entries(colFilter).every(([k, s]) => {
      if (k === openCol.key || !s.size) return true;
      const c = byKey.get(k); return !c || matchCol(c, r, s);
    }))
    : [];

  return (
    <>
      {/* frame(Page frame 모드)=부모 flex-column 채움 → 내부 스크롤 하나·헤더(thX sticky top:0) 틀고정.
          비-frame=block(높이=내용)이라 flex:1 무시·페이지 스크롤. 어느 쪽이든 이중 스크롤·하단 갭 없음. */}
      <div
        className={`excel-sheet${fit ? ' excel-sheet--fit' : ' excel-sheet--full'}`}
        style={{
          flex: '1 1 auto', minHeight: 0,
          border: `1px solid ${C.line}`, borderRadius: 4, background: C.card,
        }}
      >
        <table style={{
          borderCollapse: 'separate', borderSpacing: 0, fontSize: 12,
          width: fit ? '100%' : 'max-content',
          minWidth: '100%',
          tableLayout: fit ? 'fixed' : 'auto',
        }}>
          <thead>
            <tr>
              {visibleCols.map((c, colIndex) => {
                const base = c.pin ? thXPin : c.align === 'r' ? thXR : c.align === 'c' ? thXC : thX;
                const canFilter = !!c.text;
                const on = !!colFilter[c.key]?.size || (colSort?.key === c.key);
                return (
                  <th
                    key={c.key}
                    className={`excel-sheet__col excel-sheet__col--p${c.priority ?? Math.min(4, Math.floor(colIndex / 3) + 1)}`}
                    style={{ ...base, color: on ? C.brand : base.color, userSelect: 'none' }}>
                    {canFilter ? (
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      aria-expanded={openCol?.key === c.key}
                      title={`${c.label} 필터`}
                      onClick={(event) => {
                        haptic.tap();
                        const rc = event.currentTarget.getBoundingClientRect();
                        setOpenCol((current) => (current?.key === c.key ? null : { key: c.key, x: rc.left, y: rc.bottom }));
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: c.align === 'r' ? 'flex-end' : c.align === 'c' ? 'center' : 'flex-start',
                        width: '100%', minWidth: 0, padding: 0, border: 'none', background: 'transparent',
                        color: 'inherit', cursor: 'pointer', font: 'inherit', fontWeight: 'inherit', textAlign: c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left',
                      }}
                    >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {c.label}
                      {colSort?.key === c.key && (colSort.dir === 'asc'
                        ? <ChevronUp size={11} strokeWidth={2.4} aria-hidden />
                        : <ChevronDown size={11} strokeWidth={2.4} aria-hidden />)}
                      {!!colFilter[c.key]?.size && <ChevronDown size={10} strokeWidth={2.4} aria-hidden />}
                    </span>
                    </button>
                    ) : <span>{c.label}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const rowId = rowKey?.(r, i) ?? String(i);
              const hasClick = !!(onRow || onRowClickEvent || onRowDoubleClick);
              const clickable = hasClick ? (rowClickable ? rowClickable(r) : true) : false;
              const selected = (selectedRowKey != null && rowId === selectedRowKey)
                || !!selectedKeys?.has(rowId);
              const bg = i % 2 ? C.zebra : C.card;
              const rowBg = selected
                ? 'var(--bg-selected)'
                : (hover === i && clickable ? C.hover : bg);
              return (
                <tr
                  key={rowId}
                  aria-selected={selected || undefined}
                  tabIndex={clickable ? 0 : undefined}
                  title={onRowDoubleClick ? '클릭=선택 · 더블클릭=상세 · 우클릭=메뉴' : undefined}
                  onMouseDown={onRowMouseDown ? (e) => onRowMouseDown(e, r, i) : undefined}
                  onContextMenu={onRowContextMenu ? (e) => onRowContextMenu(e, r, i) : undefined}
                  onClick={clickable ? (e) => {
                    if (onRowClickEvent) {
                      onRowClickEvent(e, r, i);
                      if (!onRowDoubleClick) onRow?.(r);
                      return;
                    }
                    if (!onRow) return;
                    if (!onRowDoubleClick) {
                      onRow(r);
                      return;
                    }
                    if (clickTimer.current) clearTimeout(clickTimer.current);
                    clickTimer.current = setTimeout(() => {
                      onRow(r);
                      clickTimer.current = null;
                    }, 280);
                  } : undefined}
                  onDoubleClick={clickable && onRowDoubleClick ? (event) => {
                    event.preventDefault();
                    if (clickTimer.current) {
                      clearTimeout(clickTimer.current);
                      clickTimer.current = null;
                    }
                    window.getSelection()?.removeAllRanges();
                    haptic.tap();
                    onRowDoubleClick(r);
                  } : undefined}
                  onKeyDown={clickable && onRowDoubleClick ? (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onRowDoubleClick(r);
                    }
                  } : undefined}
                  style={{
                    cursor: clickable ? 'pointer' : 'default',
                    background: rowBg,
                    userSelect: onRowDoubleClick ? 'none' : undefined,
                    ...(hover === i && clickable ? { background: C.hover } : {}),
                  }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                >
                  {visibleCols.map((c, colIndex) => {
                    const base = c.pin ? { ...tdXPin, background: rowBg } : c.align === 'r' ? tdXR : c.align === 'c' ? tdXC : tdX;
                    return (
                      <td
                        key={c.key}
                        className={`excel-sheet__col excel-sheet__col--p${c.priority ?? Math.min(4, Math.floor(colIndex / 3) + 1)}`}
                        style={{ ...base, textOverflow: fit ? 'ellipsis' : undefined }}
                      >
                        {c.render(r)}
                      </td>
                    );
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
