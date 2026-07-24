'use client';
import type { LucideIcon } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { Btn } from './controls';
import { C } from './tokens';

/**
 * 페이지 상단 툴바 SSOT (= freepass ERP4 PageToolBar).
 *   아이콘+라벨 균등 행 → 탭 시 시트. 회사칩·사각 아이콘 버튼 행 금지.
 */
export type PageToolItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeTone?: 'brand' | 'accent';
  active?: boolean;
  pressed?: boolean;
  accent?: boolean;
  onClick: () => void;
};

function ToolBadge({ n, tone = 'brand' }: { n: number; tone?: 'brand' | 'accent' }) {
  const bg = tone === 'accent' ? 'var(--blue-bg)' : C.brand;
  const fg = tone === 'accent' ? 'var(--blue-text)' : C.inverse;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 16, height: 16, padding: '0 5px', borderRadius: 4,
      background: bg, color: fg, fontSize: 10, fontWeight: 800, lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
    }}>{n > 99 ? '99+' : n}</span>
  );
}

export function PageToolBar({
  tools,
  hints,
  onClearHints,
  clearLabel = '해제',
}: {
  tools: PageToolItem[];
  hints?: string[];
  onClearHints?: () => void;
  clearLabel?: string;
}) {
  if (!tools.length) return null;
  return (
    <div className="fp-page-toolbar is-page-tools">
      <div className="fp-page-tool-row">
        {tools.map((t) => {
          const Icon = t.icon;
          const on = !!(t.active || t.pressed || t.accent);
          const badge = t.badge != null && t.badge > 0 ? t.badge : undefined;
          return (
            <button
              key={t.key}
              type="button"
              className="fp-page-tool"
              aria-label={badge != null ? `${t.label} ${badge}` : t.label}
              aria-pressed={!!t.pressed}
              data-active={on ? '1' : undefined}
              onClick={() => { haptic.tap(); t.onClick(); }}
            >
              <Icon size={18} strokeWidth={on ? 2.4 : 2} />
              <span>{t.label}</span>
              {badge != null ? (
                <span className="fp-page-tool-badge"><ToolBadge n={badge} tone={t.badgeTone} /></span>
              ) : null}
            </button>
          );
        })}
      </div>
      {hints && hints.length > 0 ? (
        <div className="fp-page-tool-hints" title={hints.join(' · ')}>
          <span className="fp-page-tool-hints-label">적용</span>
          <span className="fp-page-tool-hints-text">{hints.join(' · ')}</span>
          {onClearHints ? (
            <Btn variant="ghost" size="sm" onClick={() => { haptic.select(); onClearHints(); }}>{clearLabel}</Btn>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
