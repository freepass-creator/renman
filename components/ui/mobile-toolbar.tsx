'use client';
import React from 'react';
import { SPACE_M } from './tokens';
import { PageToolBar, type PageToolItem } from './page-toolbar';

/**
 * 모바일 툴바 골격 — ERP4 MobilePageShell 툴 영역과 동일 계층.
 *   1) PageToolBar(균등 아이콘+라벨)  2) tabs wrap  3) stat/actions
 * sticky·height는 Page 헤더(layout) 소유.
 */
export function MobileToolbar({
  tools,
  tabs,
  stat,
  actions,
  hints,
  onClearHints,
}: {
  tools: PageToolItem[];
  tabs?: React.ReactNode;
  stat?: React.ReactNode;
  actions?: React.ReactNode;
  hints?: string[];
  onClearHints?: () => void;
}) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <PageToolBar tools={tools} hints={hints} onClearHints={onClearHints} />
      {tabs && <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap', padding: '8px 14px 0', background: 'var(--bg-page)' }}>{tabs}</div>}
      {(stat || actions) && <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, flexWrap: 'wrap', padding: '8px 14px', background: 'var(--bg-page)' }}>{stat}{actions}</div>}
    </div>
  );
}

export type { PageToolItem };
