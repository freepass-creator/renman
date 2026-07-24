'use client';
/**
 * 셸 툴바 SSOT — 탭·기간·검색·필터·요약·액션 자리·순서 고정.
 *   모바일 1행 = [회사(전체)] [검색] [필터] — 한 줄·공간 효율. 빠른필터 칩바 없음.
 *
 * Desktop: [tabs?][subTabs?][mid?] ──spacer── [search?][stat?][actions?]
 * Mobile:  1행 [회사][search?][필터?] / 2행 [tabs·sub·mid] / 3행 [stat·actions]
 *
 * search (기본=true · 공통 점프 검색 — 페이지가 빼려면 false):
 *   true/생략 = 점프 SearchBox(차량 360·/search)
 *   { value, onChange, placeholder? } = 목록 인페이지 FilterBox
 *   false = 검색 슬롯 숨김(예외)
 */
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
// ui 배럴(index)은 layout→이 파일을 간접 소비 — 배럴로 끌어오면 순환. tokens/controls만 직수입.
import { SPACE_M, SPACE_GROUP_M } from '@/components/ui/tokens';
import { CompanyFilter, PillTabs } from '@/components/ui/controls';
import { SearchBox, FilterBox } from '@/components/SearchBox';
import { FacetFilterBtn } from '@/components/FacetRail';
import { useFacetFilterApi } from '@/lib/facet-filter-ctx';

export type WorkbenchTab<T extends string = string> = { key: T; label: React.ReactNode; title?: string; badge?: number };
export type WorkbenchSearch = boolean | { value: string; onChange: (q: string) => void; placeholder?: string };

function SearchSlot({ search }: { search: Exclude<WorkbenchSearch, false> }) {
  if (search === true) return <SearchBox />;
  return <FilterBox value={search.value} onChange={search.onChange} placeholder={search.placeholder} />;
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
  /** @deprecated 모바일은 WorkbenchBar가 회사필터를 1행에 둠. 데스크톱은 Page 헤더. */
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
  /** 보기 모드 전환(IconSeg) — 자리는 «검색창 바로 오른쪽» 고정. 페이지마다 다른 데 두지 말 것. */
  view?: React.ReactNode;
  stat?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const resolved: Exclude<WorkbenchSearch, false> | null =
    search === false ? null : (search === true || search == null ? true : search);
  const hasSearch = resolved != null;
  const hasFacet = !!useFacetFilterApi()?.groups.length;
  const tabRow = (
    <>
      {/* 모바일 렌즈(일정·미결·리스크)=lg 터치. sm 강제 금지(웹 축소). */}
      {tabs && tab != null && onTab && <PillTabs tabs={tabs} value={tab} onChange={onTab} size={mobile ? 'lg' : tabSize} />}
      {subTabs && subTab != null && onSubTab && <PillTabs tabs={subTabs} value={subTab} onChange={onSubTab} size={mobile ? 'lg' : 'sm'} />}
      {mid}
    </>
  );
  const trail = (
    <>
      {hasSearch && <SearchSlot search={resolved!} />}
      {hasFacet && <FacetFilterBtn />}{/* 검색창 옆 필터 버튼(erp4식) — 좌측 레일 폐지 */}
      {view}
      {stat}
      {actions}
    </>
  );

  if (mobile) {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, width: '100%', minWidth: 0 }}>
          <CompanyFilter />
          {hasSearch ? (
            <div style={{ flex: 1, minWidth: 0 }}><SearchSlot search={resolved!} /></div>
          ) : (
            <span style={{ flex: 1, minWidth: 0 }} />
          )}
          {hasFacet && <FacetFilterBtn />}
        </div>
        {(tabs || subTabs || mid) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap', overflowX: 'auto' }}>{tabRow}</div>
        )}
        {(view || stat || actions) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap' }}>
            {view}
            {stat}
            {actions}
          </div>
        )}
      </div>
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
