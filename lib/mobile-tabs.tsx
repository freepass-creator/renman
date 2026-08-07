'use client';
/**
 * 모바일 하단탭 SSOT — 후보·기본값·사용자별 고르기.
 *   기본 4탭 = 운영 · 리스크 · 업무 · 업로드. 설정·계정은 상단 햄버거(메뉴).
 *   티어 = PAGE_IA / pageTier. 저장: localStorage jpk:mobile-tabs:<uid>.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Upload, CarFront, ListTodo,
  Wallet, FileText, TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { moveBefore } from '@/lib/use-sec-order';
import { pageTier } from '@/lib/nav';
import { tierIncludes, type Tier } from '@/lib/tier';
import { Btn, C, SPACE_M, toggleStyle } from '@/components/ui';

export type MobileTabId =
  | 'operations' | 'money' | 'work'
  | 'home' | 'status' | 'risk' | 'desk' | 'mydesk' | 'search' | 'upload' | 'settings'
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
  { id: 'home', label: '대시보드', href: '/', icon: LayoutDashboard, match: (p) => p === '/', group: '허브', tier: pageTier('/') },
  { id: 'status', label: '운영현황', href: '/status', icon: LayoutDashboard, match: (p) => p.startsWith('/status'), group: '허브', tier: pageTier('/status') },
  { id: 'risk', label: '리스크', href: '/risk', icon: TriangleAlert, match: (p) => p.startsWith('/risk') || p.startsWith('/desk'), group: '허브', tier: pageTier('/risk') },
  { id: 'upload', label: '업로드', href: '/ingest', icon: Upload, match: (p) => p.startsWith('/ingest'), group: '허브', tier: pageTier('/ingest') },
  { id: 'asset', label: '자산', href: '/asset', icon: CarFront, match: (p) => p.startsWith('/asset'), group: '원장', tier: pageTier('/asset') },
  { id: 'contract', label: '계약', href: '/contract', icon: FileText, match: (p) => p.startsWith('/contract'), group: '원장', tier: pageTier('/contract') },
  { id: 'money', label: '자금', href: '/cash', icon: Wallet, match: (p) => p.startsWith('/cash'), group: '원장', tier: pageTier('/cash') },
  { id: 'work', label: '업무관리', href: '/work', icon: ListTodo, match: (p) => p.startsWith('/work'), group: '원장', tier: pageTier('/work') },
];

export const MOBILE_TAB_MAP: Record<string, MobileTabDef> = Object.fromEntries(MOBILE_TAB_DEFS.map((t) => [t.id, t]));

/** 현장 루프 4탭 — 설정은 햄버거. */
const PREFERRED_LIGHT: MobileTabId[] = ['status', 'risk', 'work', 'upload'];
const PREFERRED_STANDARD: MobileTabId[] = PREFERRED_LIGHT;

export const MAX_MOBILE_TABS = 5;
export const MOBILE_TAB_GROUPS = ['허브', '원장'] as const;

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

const STORE_PREFIX = 'jpk:mobile-tabs:v2:';

function normalizeIds(raw: unknown): MobileTabId[] {
  if (!Array.isArray(raw)) return defaultMobileTabs();
  const mapped = (raw as string[]).map((id) => (
    id === 'field' ? 'dispatch'
      : id === 'desk' || id === 'mydesk' ? 'risk'
        : id
  ));
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
        하단 탭을 최대 <b>{max}개</b>까지. 기본은 운영 · 리스크 · 업무 · 업로드. 설정·계정은 상단 메뉴(햄버거). 담은 순서가 표시 순서입니다.
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
