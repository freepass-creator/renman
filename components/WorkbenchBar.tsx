'use client';
/**
 * 셸 툴바 SSOT — 탭·기간·검색·필터·요약·액션 자리·순서 고정.
 *   모바일 = ERP4: TopBar(제목·메뉴) + PageToolBar 균등 [검색|필터|보기|회사] → 시트.
 *
 * Desktop: [tabs?][subTabs?][mid?] ──spacer── [search?][stat?][actions?]
 * Mobile:  PageToolBar · tabs · stat/actions
 *
 * search (기본=true · 공통 점프 검색 — 페이지가 빼려면 false):
 *   true/생략 = 점프 SearchBox(차량 360·/search)
 *   { value, onChange, placeholder? } = 목록 인페이지 FilterBox
 *   false = 검색 슬롯 숨김(예외)
 */
import React from 'react';
import { Search, SlidersHorizontal, Building2, LayoutGrid, Check } from 'lucide-react';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { haptic } from '@/lib/haptics';
import { SPACE_M, C } from '@/components/ui/tokens';
import { PillTabs } from '@/components/ui/controls';
import { SearchBox, FilterBox } from '@/components/SearchBox';
import { FacetFilterBtn } from '@/components/FacetRail';
import { MobileToolbar } from '@/components/ui/mobile-toolbar';
import type { PageToolItem } from '@/components/ui/page-toolbar';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useFacetFilterApi, useFacetFilterOpen } from '@/lib/facet-filter-ctx';
import { ALL_COMPANIES, COMPANIES, companyLabel } from '@/lib/companies';

export type WorkbenchTab<T extends string = string> = { key: T; label: React.ReactNode; title?: string; badge?: number };
export type WorkbenchSearch = boolean | { value: string; onChange: (q: string) => void; placeholder?: string };

type SheetKind = 'search' | 'company' | 'view' | null;

function SearchSlot({ search }: { search: Exclude<WorkbenchSearch, false> }) {
  if (search === true) return <SearchBox />;
  return <FilterBox value={search.value} onChange={search.onChange} placeholder={search.placeholder} />;
}

function CompanySheetBody({ onDone }: { onDone: () => void }) {
  const { companyId, setCompanyId, isOperator } = useSession();
  if (!isOperator) {
    return <div style={{ fontSize: 15, fontWeight: 700, color: C.ink, padding: '8px 4px' }}>{companyLabel(companyId)}</div>;
  }
  const options = [ALL_COMPANIES, ...COMPANIES];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {options.map((c) => {
        const on = companyId === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => { haptic.tap(); setCompanyId(c); onDone(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48,
              padding: '12px 4px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
              borderBottom: `1px solid ${C.line}`, WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{ width: 18, flexShrink: 0 }}>{on ? <Check size={16} color={C.accent} /> : null}</span>
            <span style={{ fontSize: 16, fontWeight: on ? 800 : 600, color: C.ink }}>
              {c === ALL_COMPANIES ? '전체 (모든 회사)' : companyLabel(c)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkbenchBar<T extends string = string>({
  company: _company,
  tabs,
  tab,
  onTab,
  tabSize = 'md',
  subTabs,
  subTab,
  onSubTab,
  mid,
  search = true,
  view,
  stat,
  actions,
}: {
  /** @deprecated 모바일은 PageToolBar «회사» 툴. 데스크톱은 Page 헤더. */
  company?: boolean;
  tabs?: WorkbenchTab<T>[];
  tab?: T;
  onTab?: (k: T) => void;
  tabSize?: 'sm' | 'md';
  subTabs?: WorkbenchTab<string>[];
  subTab?: string;
  onSubTab?: (k: string) => void;
  mid?: React.ReactNode;
  /** 기본 true(점프 검색). 목록 필터는 객체. 숨기려면 false. */
  search?: WorkbenchSearch;
  /** 보기 모드 전환(IconSeg) — 모바일=«보기» 툴→시트. 웹=검색 오른쪽. */
  view?: React.ReactNode;
  stat?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const { companyId, isOperator } = useSession();
  const [sheet, setSheet] = React.useState<SheetKind>(null);
  const facetApi = useFacetFilterApi();
  const { open: filterOpen, setOpen: setFilterOpen } = useFacetFilterOpen();
  const resolved: Exclude<WorkbenchSearch, false> | null =
    search === false ? null : (search === true || search == null ? true : search);
  const hasSearch = resolved != null;
  const hasFacet = !!facetApi?.groups.length;
  const toggleSheet = (k: Exclude<SheetKind, null>) => setSheet((s) => (s === k ? null : k));

  const tabRow = (
    <>
      {tabs && tab != null && onTab && <PillTabs tabs={tabs} value={tab} onChange={onTab} size={tabSize} />}
      {subTabs && subTab != null && onSubTab && <PillTabs tabs={subTabs} value={subTab} onChange={onSubTab} size="sm" />}
      {mid}
    </>
  );
  const trail = (
    <>
      {hasSearch && <SearchSlot search={resolved!} />}
      {hasFacet && <FacetFilterBtn />}
      {view}
      {stat}
      {actions}
    </>
  );

  if (mobile) {
    const searchActive = !!(resolved && resolved !== true && resolved.value.trim());
    const VIEW_SCOPE = ['보유', '전체', '매각'];
    const filterN = facetApi
      ? [...facetApi.facets].filter((f) => !VIEW_SCOPE.includes(f)).length
      : 0;
    const companyOn = isOperator && companyId !== ALL_COMPANIES;
    const tools: PageToolItem[] = [];
    if (hasSearch) {
      tools.push({
        key: 'search', label: '검색', icon: Search,
        badge: searchActive ? 1 : undefined, active: searchActive, pressed: sheet === 'search',
        onClick: () => { setFilterOpen(false); toggleSheet('search'); },
      });
    }
    if (hasFacet) {
      tools.push({
        key: 'filter', label: '필터', icon: SlidersHorizontal,
        badge: filterN || undefined, badgeTone: 'accent',
        active: filterN > 0, pressed: filterOpen,
        onClick: () => { setSheet(null); setFilterOpen((o) => !o); },
      });
    }
    if (view != null) {
      tools.push({
        key: 'view', label: '보기', icon: LayoutGrid,
        pressed: sheet === 'view',
        onClick: () => { setFilterOpen(false); toggleSheet('view'); },
      });
    }
    tools.push({
      key: 'company', label: '회사', icon: Building2,
      active: companyOn, pressed: sheet === 'company',
      badge: companyOn ? 1 : undefined,
      onClick: () => { setFilterOpen(false); toggleSheet('company'); },
    });

    return (
      <>
        <MobileToolbar
          tools={tools}
          tabs={(tabs || subTabs || mid) ? tabRow : undefined}
          stat={stat}
          actions={actions}
        />
        {hasSearch && (
          <BottomSheet
            open={sheet === 'search'}
            onClose={() => setSheet(null)}
            title="검색"
            maxHeight="auto"
            pad={false}
            footer="std"
            clearLabel="지우기"
            closeLabel="닫기"
            onClear={
              resolved && resolved !== true
                ? () => { resolved.onChange(''); haptic.select(); }
                : undefined
            }
          >
            <div style={{ padding: '4px 16px 8px' }}>
              <SearchSlot search={resolved!} />
            </div>
          </BottomSheet>
        )}
        <BottomSheet open={sheet === 'company'} onClose={() => setSheet(null)} title="회사 선택" footer="std" closeLabel="닫기">
          <CompanySheetBody onDone={() => setSheet(null)} />
        </BottomSheet>
        {view != null && (
          <BottomSheet open={sheet === 'view'} onClose={() => setSheet(null)} title="보기" footer="std" closeLabel="닫기" maxHeight="auto">
            <div style={{ display: 'flex', justifyContent: 'center', padding: `${SPACE_M}px 0` }}>{view}</div>
          </BottomSheet>
        )}
      </>
    );
  }

  return (
    <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {tabRow}
      <span style={{ flex: 1, minWidth: 8 }} />
      {trail}
    </div>
  );
}
