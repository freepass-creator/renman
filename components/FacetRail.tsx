'use client';
/**
 * 필터 레일 공용 — LENS_FILTERS[lensKey] 칩.
 *   칩 = ToggleChips SSOT (ERP4: 웹28 · 모바일40 · brand 채움).
 *   데스크톱 = 좌측 sticky 레일.
 *   모바일 = UI 없음 · 검색 옆 「필터」버튼은 WorkbenchBar(MobileFacetFilterBtn).
 */
import { useMemo, useState } from 'react';
import { LENS_FILTERS, type FacetGroup } from '@/lib/lens-filters';
import { useIsMobile } from '@/lib/use-mobile';
import { useRegisterFacetFilter, useFacetFilterApi, useFacetFilterOpen } from '@/lib/facet-filter-ctx';
import { haptic } from '@/lib/haptics';
import { C, R, NUM, ToggleChips, ctrlH } from '@/components/ui';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';

/** 선택 개수 박스 — freepasserp4 CountPill 스펙 그대로.
 *   brand 배경 · taupeBg(=--bg-card) 글자 · fontSize 10 · fontWeight 600 · R(4) · mono · mobile 18/16·desktop 16/15.
 *   tone: 'brand'=총합(전체 선택수) · 'accent'=섹션(그룹별 선택수) — 색으로 구분. */
function CountPill({ n, tone = 'brand', ring }: { n: number; tone?: 'brand' | 'accent'; ring?: boolean }) {
  const mobile = useIsMobile();
  if (!n) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
      minWidth: mobile ? 18 : 16, height: mobile ? 16 : 15, boxSizing: 'border-box',
      padding: '0 5px', borderRadius: R,   // 둥근 사각(erp4 CountPill 스펙)
      background: tone === 'accent' ? C.accent : C.brand, color: C.taupeBg,
      fontSize: 10, fontWeight: 600, lineHeight: 1,
      fontFamily: NUM, fontVariantNumeric: 'tabular-nums', textAlign: 'center',
      ...(ring ? { boxShadow: '0 0 0 2px var(--bg-page)' } : null),
    }}>
      {/* 숫자 baseline 보정 — flex 중앙정렬이 폰트 특성상 살짝 아래로 앉는 걸 0.5px 위로. */}
      <span style={{ display: 'block', transform: 'translateY(-0.5px)' }}>{n > 99 ? '99+' : n}</span>
    </span>
  );
}

function FacetGroups({ groups, facets, onToggle, touch }: {
  groups: FacetGroup[];
  facets: Set<string>;
  onToggle: (label: string) => void;
  counts?: Record<string, number>;   // (호환용 — 더는 칩에 안 쓰임. erp4식: 숫자는 그룹 헤더 선택개수 CountPill만.)
  touch?: boolean;
}) {
  const mobile = useIsMobile();
  const dimH = ctrlH(touch ?? mobile);
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
            {/* dim 헤더 = 접기 토글(왼쪽 대부분) + 선택시 그룹 「해제」(오른쪽) — erp4 정렬. */}
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: folded ? 0 : (touch ? 6 : 4) }}>
              <button
                type="button"
                onClick={() => toggleDim(g.dim)}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6,
                  padding: touch ? '10px 0' : '8px 0',
                  minHeight: dimH, border: 'none', background: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <ChevronDown
                  size={touch ? 18 : 15}
                  color={C.faint}
                  style={{ flexShrink: 0, transform: folded ? 'rotate(-90deg)' : 'none', transition: 'transform .12s' }}
                />
                <span style={{ fontSize: touch ? 15 : 13, color: C.ink, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{g.dim}</span>
                <CountPill n={nOn} tone="accent" />{/* 섹션 선택수(accent) — 총합(brand)과 색 구분 */}
              </button>
              {nOn > 0 && (
                <button
                  type="button"
                  onClick={() => g.chips.forEach((c) => { if (facets.has(c.label)) onToggle(c.label); })}
                  style={{ flexShrink: 0, border: 'none', background: 'none', color: C.accent, fontSize: touch ? 12.5 : 11, fontWeight: 700, cursor: 'pointer', padding: '0 0 0 8px', WebkitTapHighlightColor: 'transparent' }}
                >해제</button>
              )}
            </div>
            {/* erp4 동일: 칩은 라벨만(매치 카운트 '(N)' 제거) · 숫자는 그룹 헤더 CountPill(선택 개수)로만. */}
            {!folded && (
              <ToggleChips
                selected={facets}
                onToggle={onToggle}
                options={g.chips.map((c) => ({ key: c.label, label: c.label }))}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 검색창 옆 필터 버튼 — 인-플로우 필터 패널(FacetRail)을 토글. 오버레이/팝업 아님(콘텐츠를 민다). 선택수 CountPill(총합·brand). */
export function FacetFilterBtn() {
  const mobile = useIsMobile();
  const api = useFacetFilterApi();
  const { open, setOpen } = useFacetFilterOpen();

  if (!api?.groups.length) return null;
  const n = api.facets.size;
  const h = ctrlH(mobile);
  // 아이콘만 정사각 토글 — 열림=꽉 찬 다크(brand). 선택 총합은 우상단 모서리 뱃지(accent · ring으로 버튼과 분리).
  return (
    <button
      type="button" title="필터" aria-label="필터" aria-pressed={open}
      onClick={() => { haptic.select(); setOpen((o) => !o); }}
      style={{
        position: 'relative', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: h, height: h, boxSizing: 'border-box', padding: 0,
        borderRadius: R, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        border: `1px solid ${open ? C.brand : C.line}`,
        background: open ? C.brand : C.card,
        color: open ? C.inverse : C.mute,
      }}
    >
      <SlidersHorizontal size={mobile ? 18 : 16} strokeWidth={2.2} />
      {n > 0 && (
        <span style={{ position: 'absolute', top: -6, right: -6 }}>
          <CountPill n={n} tone="accent" ring />
        </span>
      )}
    </button>
  );
}
/** @deprecated 이름 하위호환 — FacetFilterBtn 사용(데스크톱·모바일 공통). */
export const MobileFacetFilterBtn = FacetFilterBtn;

/** 인-플로우 필터 패널 — 오버레이/팝업 아님(콘텐츠를 민다). 데스크톱=좌측 열(sticky) · 모바일=콘텐츠 위 블록.
 *   열림은 FacetFilterBtn(검색창 옆) 토글. 닫히면 null → 콘텐츠 전폭. */
export function FacetRail({ lensKey, groups: groupsProp, facets, onToggle, onReset, counts, top = 49 }: { lensKey?: string; groups?: FacetGroup[]; facets: Set<string>; onToggle: (label: string) => void; onReset: () => void; counts?: Record<string, number>; top?: number }) {
  const mobile = useIsMobile();
  const groups = groupsProp || (lensKey ? LENS_FILTERS[lensKey] : undefined) || [];
  const { open } = useFacetFilterOpen();
  const api = useMemo(
    () => (groups.length ? { groups, facets, onToggle, onReset, counts } : null),
    [groups, facets, onToggle, onReset, counts],
  );
  useRegisterFacetFilter(api);
  if (!groups.length || !open) return null;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: mobile ? '4px 2px 8px' : '12px 14px 10px', flexShrink: 0 }}>
      <SlidersHorizontal size={13} color={C.mute} />
      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>필터</span>
      <span style={{ flex: 1 }} />
      {facets.size > 0 && <button onClick={onReset} style={{ border: 'none', background: 'none', color: C.accent, fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0 }}>초기화</button>}
    </div>
  );

  // 모바일 = 콘텐츠 위 인-플로우 블록(오버레이 아님).
  if (mobile) return (
    <div style={{ borderBottom: `1px solid ${C.line}`, marginBottom: 10, paddingBottom: 8 }}>
      {header}
      <FacetGroups groups={groups} facets={facets} onToggle={onToggle} counts={counts} touch />
    </div>
  );

  // 데스크톱 = 좌측 인-플로우 열(sticky). 콘텐츠를 민다(FacetPage flex row).
  const hgt = `calc(100vh - ${top}px)`;
  return (
    <aside style={{ flex: '0 0 200px', boxSizing: 'border-box', borderRight: `1px solid ${C.line}`, background: C.taupeBg, position: 'sticky', top, alignSelf: 'flex-start', height: hgt, maxHeight: hgt, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {header}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px' }}>
        <FacetGroups groups={groups} facets={facets} onToggle={onToggle} counts={counts} />
      </div>
    </aside>
  );
}
