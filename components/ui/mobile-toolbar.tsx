'use client';
import React from 'react';
import { SPACE_M } from './tokens';

/**
 * 모바일 툴바 원자 — 슬롯 레이아웃만. sticky·height·overflow 없음(Page 헤더 layout.tsx가 sticky 소유).
 * 1행 컨트롤 [회사][검색 flex:1][정렬][보기][필터] · 탭은 아래 wrap(가로 스크롤러 금지 — 줄바꿈).
 * 가로스크롤 원천봉쇄: 신축 자식(search)만 minWidth:0, 나머지 flexShrink:0.
 */
export function MobileToolbar({ company, search, sort, view, filter, tabs, stat, actions }: {
  company?: React.ReactNode; search?: React.ReactNode; sort?: React.ReactNode;
  view?: React.ReactNode; filter?: React.ReactNode; tabs?: React.ReactNode;
  stat?: React.ReactNode; actions?: React.ReactNode;
}) {
  const s0 = { flexShrink: 0 } as const;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, width: '100%', minWidth: 0 }}>
        {company && <span style={s0}>{company}</span>}
        {search ? <div style={{ flex: 1, minWidth: 0 }}>{search}</div> : <span style={{ flex: 1, minWidth: 0 }} />}
        {sort && <span style={s0}>{sort}</span>}
        {view && <span style={s0}>{view}</span>}
        {filter && <span style={s0}>{filter}</span>}
      </div>
      {/* 탭 = wrap(줄바꿈으로 높이만 늘림). paddingTop = 코너 배지(top:-6) 여유 */}
      {tabs && <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap', paddingTop: 6 }}>{tabs}</div>}
      {(stat || actions) && <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap' }}>{stat}{actions}</div>}
    </div>
  );
}
