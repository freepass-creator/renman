'use client';
/**
 * 모바일 하단탭 SSOT — 후보·기본값·사용자별 고르기.
 *   티어 = PAGE_IA / pageTier. 라이트 기본 = 홈·마이·자산·계약·설정.
 *   스탠다드+ 기본 = 홈·마이·비즈니스·미수관리·설정. 그룹명「비즈니스」= NAV_GROUPS.
 *   저장: localStorage jpk:mobile-tabs:<uid>.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Home, LayoutDashboard, Search, Upload, Settings, LayoutGrid, Car,
  ReceiptText, Wallet, FileText, Inbox, TrendingUp, ShieldAlert,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { moveBefore } from '@/lib/use-sec-order';
import { pageTier } from '@/lib/nav';
import { tierIncludes, type Tier } from '@/lib/tier';
import { Btn, C, SPACE_M } from '@/components/ui';
import { toggleStyle } from '@/components/ui/tokens';

export type MobileTabId =
  | 'home' | 'mydesk' | 'search' | 'upload' | 'settings'
  | 'dispatch' | 'asset' | 'receivables' | 'finance' | 'contract'
  | 'inbox' | 'penalty' | 'payments' | 'pnl' | 'integrity';

export type MobileTabDef = {
  id: MobileTabId;
  label: string;
  href: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  group: string;
  tier: Tier;
};

export const MOBILE_TAB_DEFS: MobileTabDef[] = [
  { id: 'home', label: '홈', href: '/', icon: Home, match: (p) => p === '/', group: '기본', tier: pageTier('/') },
  { id: 'mydesk', label: '마이', href: '/ops', icon: LayoutDashboard, match: (p) => p.startsWith('/ops'), group: '기본', tier: pageTier('/ops') },
  { id: 'search', label: '검색', href: '/search', icon: Search, match: (p) => p.startsWith('/search'), group: '기본', tier: pageTier('/search') },
  { id: 'upload', label: '자료등록', href: '/ingest', icon: Upload, match: (p) => p.startsWith('/ingest'), group: '비즈니스', tier: pageTier('/ingest') },
  { id: 'settings', label: '설정', href: '/settings', icon: Settings, match: (p) => p.startsWith('/settings'), group: '기본', tier: pageTier('/settings') },
  { id: 'dispatch', label: '비즈니스', href: '/work', icon: LayoutGrid, match: (p) =>
      p === '/work' || p.startsWith('/work/') || p.startsWith('/dispatch') || p.startsWith('/receivables') || p.startsWith('/repair')
      || p.startsWith('/penalty') || p.startsWith('/payments') || p.startsWith('/ingest') || p.startsWith('/inbox')
      || p.startsWith('/field') || p === '/m', group: '비즈니스', tier: pageTier('/work') },
  { id: 'asset', label: '자산', href: '/asset', icon: Car, match: (p) => p.startsWith('/asset'), group: '현황', tier: pageTier('/asset') },
  { id: 'contract', label: '계약', href: '/contract', icon: FileText, match: (p) => p.startsWith('/contract'), group: '현황', tier: pageTier('/contract') },
  { id: 'finance', label: '재무', href: '/finance', icon: Wallet, match: (p) => p.startsWith('/finance'), group: '현황', tier: pageTier('/finance') },
  { id: 'receivables', label: '미수관리', href: '/receivables', icon: ReceiptText, match: (p) => p.startsWith('/receivables'), group: '비즈니스', tier: pageTier('/receivables') },
  { id: 'penalty', label: '과태료관리', href: '/penalty', icon: ReceiptText, match: (p) => p.startsWith('/penalty'), group: '비즈니스', tier: pageTier('/penalty') },
  { id: 'inbox', label: '증빙수집', href: '/inbox', icon: Inbox, match: (p) => p.startsWith('/inbox'), group: '비즈니스', tier: pageTier('/inbox') },
  { id: 'payments', label: '자금일보', href: '/payments', icon: Wallet, match: (p) => p.startsWith('/payments'), group: '비즈니스', tier: pageTier('/payments') },
  { id: 'pnl', label: '손익', href: '/pnl', icon: TrendingUp, match: (p) => p.startsWith('/pnl'), group: '경영', tier: pageTier('/pnl') },
  { id: 'integrity', label: '정합성', href: '/integrity', icon: ShieldAlert, match: (p) => p.startsWith('/integrity'), group: '시스템', tier: pageTier('/integrity') },
];

export const MOBILE_TAB_MAP: Record<string, MobileTabDef> = Object.fromEntries(MOBILE_TAB_DEFS.map((t) => [t.id, t]));

/** 라이트 코어 — 홈·마이·현황·설정. 스탠다드+=비즈니스 허브·미수를 기본에 포함(막힘 없이 진입). */
const PREFERRED_LIGHT: MobileTabId[] = ['home', 'mydesk', 'asset', 'contract', 'settings'];
const PREFERRED_STANDARD: MobileTabId[] = ['home', 'mydesk', 'dispatch', 'receivables', 'settings'];

export const MAX_MOBILE_TABS = 5;
export const MOBILE_TAB_GROUPS = ['기본', '현황', '비즈니스', '경영', '시스템'] as const;

function allowedTab(id: string): id is MobileTabId {
  const t = MOBILE_TAB_MAP[id];
  return !!t && tierIncludes(t.tier);
}

export function defaultMobileTabs(): MobileTabId[] {
  const preferred = tierIncludes('스탠다드') ? PREFERRED_STANDARD : PREFERRED_LIGHT;
  return preferred.filter(allowedTab).slice(0, MAX_MOBILE_TABS);
}

/** @deprecated defaultMobileTabs() 사용 */
export const DEFAULT_MOBILE_TABS: MobileTabId[] = defaultMobileTabs();

const STORE_PREFIX = 'jpk:mobile-tabs:';

function normalizeIds(raw: unknown): MobileTabId[] {
  if (!Array.isArray(raw)) return defaultMobileTabs();
  const mapped = (raw as string[]).map((id) => (id === 'field' ? 'dispatch' : id));
  const ids = mapped.filter(allowedTab);
  const uniq = [...new Set(ids)];
  return uniq.length ? uniq.slice(0, MAX_MOBILE_TABS) : defaultMobileTabs();
}

export function useMobileTabs() {
  const { user } = useSession();
  const storeKey = `${STORE_PREFIX}${user.uid}`;
  const [ids, setIds] = useState<MobileTabId[]>(() => defaultMobileTabs());

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(storeKey);
        setIds(raw ? normalizeIds(JSON.parse(raw)) : defaultMobileTabs());
      } catch { setIds(defaultMobileTabs()); }
    };
    load();
    window.addEventListener('jpk:mobile-tabs-change', load);
    return () => window.removeEventListener('jpk:mobile-tabs-change', load);
  }, [storeKey]);

  const save = (next: MobileTabId[]) => {
    const cleaned = normalizeIds(next);
    setIds(cleaned);
    try { localStorage.setItem(storeKey, JSON.stringify(cleaned)); } catch { /* 무시 */ }
    window.dispatchEvent(new Event('jpk:mobile-tabs-change'));
  };

  const toggle = (id: MobileTabId) => {
    if (!allowedTab(id)) return;
    if (ids.includes(id)) {
      if (ids.length <= 1) return;
      save(ids.filter((x) => x !== id));
      return;
    }
    if (ids.length >= MAX_MOBILE_TABS) return;
    save([...ids, id]);
  };

  const reorder = (fromId: string, toId: string) => {
    const next = moveBefore(ids, fromId, toId);
    if (next !== ids) save(next as MobileTabId[]);
  };

  const reset = () => save(defaultMobileTabs());
  const tabs = useMemo(() => ids.map((id) => MOBILE_TAB_MAP[id]).filter(Boolean) as MobileTabDef[], [ids]);
  const pickedSet = useMemo(() => new Set(ids), [ids]);
  const catalog = useMemo(() => MOBILE_TAB_DEFS.filter((t) => tierIncludes(t.tier)), []);

  return { ids, tabs, pickedSet, toggle, reorder, reset, max: MAX_MOBILE_TABS, catalog };
}

/** 설정 본문 — Panel 없이(설정 페이지 ListBox 펼침 안에서 씀). */
export function MobileTabsSettings() {
  const mobile = useIsMobile();
  const { ids, pickedSet, toggle, reorder, reset, max, catalog } = useMobileTabs();
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div style={{ padding: '4px 0 6px' }}>
      <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.7 }}>
        하단 탭을 최대 <b>{max}개</b>까지. 기본은 홈 · 마이 · 비즈니스 · 미수관리 · 설정(스탠다드+). 담은 순서가 표시 순서입니다.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE_M, marginBottom: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: C.faint }}>담은 탭 · {ids.length}/{max}</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={reset}>기본으로</Btn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M, marginBottom: 14, minHeight: 28 }}>
        {ids.map((id) => {
          const t = MOBILE_TAB_MAP[id];
          if (!t) return null;
          return (
            <button
              key={id}
              type="button"
              draggable
              onDragStart={() => setDragId(id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) reorder(dragId, id); setDragId(null); }}
              onDragEnd={() => setDragId(null)}
              style={{ ...toggleStyle(true, 'sm', mobile), display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'grab' }}
            >
              <t.icon size={13} strokeWidth={2.2} /> {t.label}
            </button>
          );
        })}
      </div>
      {MOBILE_TAB_GROUPS.map((g) => {
        const items = catalog.filter((t) => t.group === g);
        if (!items.length) return null;
        return (
          <div key={g} style={{ marginTop: SPACE_M }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.sub, marginBottom: 7, letterSpacing: '0.02em' }}>{g}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
              {items.map((t) => {
                const on = pickedSet.has(t.id);
                const full = !on && ids.length >= max;
                return (
                  <button key={t.id} type="button" onClick={() => toggle(t.id)} disabled={full}
                    style={{ ...toggleStyle(on, 'sm', mobile), opacity: full ? 0.45 : 1, cursor: full ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <t.icon size={13} strokeWidth={on ? 2.2 : 1.8} /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
