'use client';
/**
 * 필터 레일 공용 — LENS_FILTERS[lensKey] 칩.
 *   형태 = 프리패스 ERP4 facet-filter: 차원 라벨 + 칩 묶음만. 트리·아코디언·채움버튼 기교 없음.
 *   데스크톱 = 좌측 sticky 레일.
 *   모바일 = UI 없음 · 검색 옆 「필터」버튼은 WorkbenchBar(MobileFacetFilterBtn).
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { LENS_FILTERS, type FacetGroup } from '@/lib/lens-filters';
import { useIsMobile } from '@/lib/use-mobile';
import { useRegisterFacetFilter, useFacetFilterApi } from '@/lib/facet-filter-ctx';
import { haptic } from '@/lib/haptics';
import { Btn, C, Drawer, CTRL_M, R } from '@/components/ui';
import { SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';

/** ERP4 facet-chip — 작고 조용. 활성=연한 틴트(브랜드 채움 금지). */
function facetChipStyle(active: boolean, touch?: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    height: touch ? 36 : 24,
    padding: touch ? '0 12px' : '0 8px',
    boxSizing: 'border-box',
    border: `1px solid ${active ? 'rgba(27,42,74,0.25)' : C.line}`,
    borderRadius: R,
    background: active ? 'rgba(27,42,74,0.10)' : 'transparent',
    color: active ? C.brand : C.mute,
    fontSize: touch ? 14 : 12,
    fontWeight: active ? 600 : 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background .12s ease, border-color .12s ease, color .12s ease, box-shadow .12s ease',
    WebkitTapHighlightColor: 'transparent',
  };
}

function FacetGroups({ groups, facets, onToggle, touch }: {
  groups: FacetGroup[];
  facets: Set<string>;
  onToggle: (label: string) => void;
  touch?: boolean;
}) {
  // 기본 펼침. 라벨 클릭으로만 접음(트리·장식 없음).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleDim = (dim: string) => setCollapsed((s) => {
    const n = new Set(s);
    if (n.has(dim)) n.delete(dim); else n.add(dim);
    return n;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: touch ? 10 : 6 }}>
      {groups.map((g) => {
        const folded = collapsed.has(g.dim);
        const nOn = g.chips.filter((c) => facets.has(c.label)).length;
        return (
          <div key={g.dim}>
            <button
              type="button"
              onClick={() => toggleDim(g.dim)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 4,
                padding: touch ? '8px 0' : '4px 0', marginBottom: folded ? 0 : (touch ? 6 : 4),
                border: 'none', background: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <ChevronDown
                size={touch ? 16 : 13}
                color={C.faint}
                style={{ flexShrink: 0, transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}
              />
              <span style={{ fontSize: touch ? 13 : 11, color: C.faint, fontWeight: 600 }}>{g.dim}</span>
              {nOn > 0 && (
                <span style={{ fontSize: 11, color: C.brand, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{nOn}</span>
              )}
            </button>
            {!folded && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: touch ? 6 : 4, paddingLeft: touch ? 2 : 0 }}>
                {g.chips.map((c) => (
                  <button
                    key={`${g.dim}-${c.label}`}
                    type="button"
                    data-ui="facet"
                    aria-pressed={facets.has(c.label)}
                    onClick={() => onToggle(c.label)}
                    style={facetChipStyle(facets.has(c.label), touch)}
                  >{c.label}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 모바일 — 검색창 옆(회사|검색|필터 한 줄). 선택 없으면 아이콘만. */
export function MobileFacetFilterBtn() {
  const mobile = useIsMobile();
  const api = useFacetFilterApi();
  const [open, setOpen] = useState(false);

  if (!mobile || !api?.groups.length) return null;
  const n = api.facets.size;
  return (
    <>
      <button
        type="button"
        data-ui="action"
        onClick={() => { haptic.tap(); setOpen(true); }}
        aria-label="필터"
        title="필터"
        style={{
          height: CTRL_M,
          minWidth: CTRL_M,
          boxSizing: 'border-box',
          padding: '0 10px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: `1px solid ${n > 0 ? 'rgba(27,42,74,0.25)' : C.line}`,
          borderRadius: R,
          background: n > 0 ? 'rgba(27,42,74,0.10)' : '#fff',
          color: n > 0 ? C.brand : C.mute,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <SlidersHorizontal size={17} strokeWidth={2.2} />
      </button>
      {open && (
        <Drawer
          title="필터"
          onClose={() => setOpen(false)}
          footer={
            <>
              <Btn variant="ghost" size="lg" onClick={() => api.onReset()} disabled={n === 0}>초기화</Btn>
              <span style={{ flex: 1 }} />
              <Btn size="lg" onClick={() => setOpen(false)}>적용</Btn>
            </>
          }
        >
          <FacetGroups groups={api.groups} facets={api.facets} onToggle={api.onToggle} touch />
        </Drawer>
      )}
    </>
  );
}

export function FacetRail({ lensKey, groups: groupsProp, facets, onToggle, onReset, top = 49 }: { lensKey?: string; groups?: FacetGroup[]; facets: Set<string>; onToggle: (label: string) => void; onReset: () => void; top?: number }) {
  const mobile = useIsMobile();
  const groups = groupsProp || (lensKey ? LENS_FILTERS[lensKey] : undefined) || [];
  const [hidden, setHidden] = useState(false);
  useEffect(() => { try { setHidden(localStorage.getItem('jpk:rail') === '1'); } catch { /* 무시 */ } }, []);
  const toggleHidden = () => setHidden((h) => { const n = !h; try { localStorage.setItem('jpk:rail', n ? '1' : '0'); } catch { /* 무시 */ } return n; });

  const api = useMemo(
    () => (groups.length ? { groups, facets, onToggle, onReset } : null),
    [groups, facets, onToggle, onReset],
  );
  useRegisterFacetFilter(api);

  // 모바일 = 본문에 빠른필터 없음(등록만). 버튼은 WorkbenchBar.
  if (mobile || !groups.length) return null;

  if (hidden) return (
    <button onClick={toggleHidden} title="필터 보이기"
      style={{ position: 'fixed', left: 0, bottom: 0, zIndex: 40, border: 'none', background: 'none', color: C.faint, cursor: 'pointer', padding: '10px 14px 12px', display: 'inline-flex', alignItems: 'center', opacity: 0.45, transition: 'opacity .12s' }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.45')}
    ><ChevronRight size={16} /></button>
  );
  const h = `calc(100vh - ${top}px)`;
  return (
    <aside style={{ flex: '0 0 200px', boxSizing: 'border-box', borderRight: `1px solid ${C.line}`, background: C.taupeBg, position: 'sticky', top, alignSelf: 'flex-start', height: h, maxHeight: h, display: 'flex', flexDirection: 'column', minHeight: h }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px 10px', flexShrink: 0 }}>
        <SlidersHorizontal size={13} color={C.mute} />
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>필터</span>
        <span style={{ flex: 1 }} />
        {facets.size > 0 && <button onClick={onReset} style={{ border: 'none', background: 'none', color: C.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>초기화</button>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px' }}>
        <FacetGroups groups={groups} facets={facets} onToggle={onToggle} />
      </div>
      <button onClick={toggleHidden} title="필터 숨기기"
        style={{ flexShrink: 0, alignSelf: 'flex-start', border: 'none', background: 'none', color: C.faint, cursor: 'pointer', padding: '10px 14px 12px', display: 'inline-flex', opacity: 0.4 }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}><ChevronLeft size={16} /></button>
    </aside>
  );
}
