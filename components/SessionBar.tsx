'use client';
import { useState, useEffect, useLayoutEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, Menu, PanelLeft, PanelLeftClose, Plus, X, LayoutDashboard } from 'lucide-react';
import { useSession, roleLabel } from '@/lib/session';
import { useAppBarSlots } from '@/lib/appbar';
import { useIsMobile } from '@/lib/use-mobile';
import { MobileTabBar } from '@/components/MobileTabBar';
import { MobileActionBar } from '@/components/MobileActionBar';
import { haptic } from '@/lib/haptics';
import { C, SCRIM, ctrlH, IconBtn } from '@/components/ui';
import { NAV_GROUPS, PAGE_IA } from '@/lib/nav';
import { tierIncludes } from '@/lib/tier';
import { TopSearch } from '@/components/TopSearch';
import { openQuickInput } from '@/lib/ui-bus';

// 상단 좌측 브랜드 = 이 ERP를 쓰는 운영사(테넌트) 이름. 임시 하드코딩 — 추후 로그인 유저의 소속회사로.
const OPERATOR_BRAND = 'teamjpk';
// 배포 표시버전 SSOT — 메뉴 하단 노출. 배포 때 SemVer로 올림: MAJOR(풀체인지)·MINOR(구조개편)·PATCH(소소). package.json과 별개(레포 내부값).
const APP_VERSION = '6.0.0';

// 메뉴 = lib/nav NAV_GROUPS SSOT (현황=보기 · 업무=손대기 · 경영=지표).
//   hqOnly 항목은 본사(마스터)에게만, devOnly 항목은 개발 빌드에서만 노출.
const navGroups = (isOperator: boolean, mobile = false) => NAV_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((it) => tierIncludes(it.tier ?? '라이트') && (!it.hqOnly || isOperator) && (!it.devOnly || process.env.NODE_ENV !== 'production') && !(mobile && it.webOnly)) }))
  .filter((g) => g.items.length > 0);

function navActive(href: string, path: string) {
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

function currentLabel(path: string): string {
  let best: { href: string; label: string } | undefined;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.href === '/') {
        if (path === '/') return it.label;
        continue;
      }
      if (path === it.href || path.startsWith(`${it.href}/`)) {
        if (!best || it.href.length > best.href.length) best = it;
      }
    }
  }
  if (best) return best.label;
  let iaBest: { href: string; label: string } | undefined;
  for (const p of PAGE_IA) {
    const stem = p.href.replace(/\[.*?\]/g, '').replace(/\/$/, '') || '/';
    const match = p.href.includes('[')
      ? path === stem || path.startsWith(`${stem}/`)
      : path === p.href;
    if (!match) continue;
    if (!iaBest || stem.length > iaBest.href.length) iaBest = { href: stem, label: p.label.replace(/\(딥링크\)$/, '') };
  }
  return iaBest?.label || '';
}

function DesktopRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { isOperator } = useSession();
  const pathname = usePathname();
  const groups = navGroups(isOperator);
  return (
    <aside className="rm-rail" aria-label="주 메뉴">
      <Link href="/" className="rm-rail__brand" title={OPERATOR_BRAND}>
        <span className="rm-rail__mark"><LayoutDashboard size={14} /></span>
        <span className="rm-rail__text">{OPERATOR_BRAND}</span>
      </Link>
      <nav className="rm-rail__nav">
        {groups.map((g, gi) => (
          <div key={gi}>
            {g.title ? <div className="rm-rail__label">{g.title}</div> : null}
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                title={collapsed ? it.label : undefined}
                className={`rm-rail__item${navActive(it.href, pathname) ? ' is-active' : ''}`}
              >
                <it.icon size={16} />
                <span className="rm-rail__text">{it.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="rm-rail__foot">
        <IconBtn title={collapsed ? '메뉴 펼치기' : '메뉴 접기'} onClick={onToggle}>
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
        </IconBtn>
        <span className="rm-rail__text">{OPERATOR_BRAND} · v{APP_VERSION}</span>
      </div>
    </aside>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isOperator } = useSession();
  const line = 'var(--border)', ink = 'var(--text-main)', mute = 'var(--text-sub)', weak = 'var(--text-weak)';
  if (!open) return null;
  // 상단바(z80) 아래에서만 — ERP4 NavMenu. 스크림·패널 모두 top=bar-h.
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', top: 'var(--fp-bar-h)', left: 0, right: 0, bottom: 0, zIndex: 70, background: SCRIM, animation: 'fadeIn .15s ease' }} />
      <div style={{
        position: 'fixed', top: 'var(--fp-bar-h)', left: 0, right: 0, bottom: 0, zIndex: 71,
        overflowY: 'auto', overscrollBehavior: 'contain', background: C.taupeBg,
        animation: 'menuDrop .18s ease', WebkitOverflowScrolling: 'touch',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ padding: '4px 0 16px' }}>
          {navGroups(isOperator, true).map((g, gi) => (
            <div key={gi} style={{ padding: '3px 0', borderTop: gi ? `1px solid ${line}` : 'none' }}>
              {g.title && <div style={{ fontSize: 11.5, color: weak, fontWeight: 700, padding: '9px 20px 3px', letterSpacing: '0.02em' }}>{g.title}</div>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => { haptic.nav(); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 15.5, fontWeight: 600, color: ink, textDecoration: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  <it.icon size={19} color={mute} /> {it.label}
                </Link>
              ))}
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${line}`, margin: '4px 20px 0', padding: '12px 0 4px', fontSize: 12, color: weak, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
            {OPERATOR_BRAND} · v{APP_VERSION}
          </div>
        </div>
      </div>
    </>
  );
}

export default function TopBar() {
  const { user } = useSession();
  const line = 'var(--border)', ink = 'var(--text-main)', mute = 'var(--text-sub)';
  const slots = useAppBarSlots();
  const mobile = useIsMobile();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const customMobileShell = pathname === '/m' || pathname.startsWith('/m/') || pathname === '/dev/preview';
  // 모바일 크롬 SSOT — 허브=메뉴·탭 / 뎁스=상단 제목(ERP4 TopBar) · 하단 이전+액션(탭 숨김).
  const depth = !!slots.depth;
  const showBottom = !!(slots.back || slots.actions);
  const showActionBar = !!(slots.back || slots.actions || slots.depth);   // 모바일 하단 액션바(이전+주액션)
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useLayoutEffect(() => {
    try { setRailCollapsed(localStorage.getItem('jpk:rail') === '1'); } catch { /* noop */ }
  }, []);
  useLayoutEffect(() => {
    document.documentElement.setAttribute(
      'data-rm-rail',
      customMobileShell || mobile ? 'off' : (railCollapsed ? 'collapsed' : 'on'),
    );
  }, [customMobileShell, mobile, railCollapsed]);
  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('jpk:rail', next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };
  useEffect(() => {
    // Menu links mount only after the popover opens, so their default prefetch starts too late.
    // Warm the four primary ledgers up front to prevent the previous page lingering on navigation.
    ['/asset', '/contract', '/cash', '/work'].forEach((href) => router.prefetch(href));
  }, [router]);
  useEffect(() => {
    if (customMobileShell) {
      // /m은 자체 상·하단 셸을 가진다. 렌더가 null이어도 웹 TopBar 여백을 남기지 않는다.
      document.body.style.paddingTop = '0px';
      document.body.style.paddingLeft = '0px';
      document.body.style.paddingBottom = '0px';
      document.documentElement.style.setProperty('--fp-dock-h', '0px');
      return () => {
        document.body.style.paddingTop = '';
        document.body.style.paddingLeft = '';
        document.body.style.paddingBottom = '';
        document.documentElement.style.setProperty('--fp-dock-h', '0px');
      };
    }
    // 상단바=fixed(웹·모바일) → body paddingTop으로 본문 시작 맞춤.
    // 웹 뎁스: 하단 이전/홈 바 높이 → --fp-dock-h (Page frame이 빼서 페이지 스크롤 방지).
    document.body.style.paddingTop = 'var(--fp-bar-h)';
    document.body.style.paddingLeft = mobile ? '' : 'var(--rm-rail-w)';
    const dock = showBottom ? 'calc(var(--fp-bar-h) + 8px)' : '0px';
    document.documentElement.style.setProperty('--fp-dock-h', mobile ? '0px' : dock);
    document.body.style.paddingBottom = mobile
      ? (depth
          ? (showActionBar ? 'calc(var(--fp-bar-h) + env(safe-area-inset-bottom))' : 'env(safe-area-inset-bottom)')
          : (showActionBar ? 'calc(2 * var(--fp-bar-h) + env(safe-area-inset-bottom))' : 'calc(var(--fp-bar-h) + env(safe-area-inset-bottom))'))
      : (showBottom ? dock : '');
    return () => {
      document.body.style.paddingTop = '';
      document.body.style.paddingLeft = '';
      document.body.style.paddingBottom = '';
      document.documentElement.style.setProperty('--fp-dock-h', '0px');
    };
  }, [showBottom, showActionBar, mobile, depth, customMobileShell]);
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => { const n = new Date(); setTodayLabel(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')} (${['일', '월', '화', '수', '목', '금', '토'][n.getDay()]})`); }, []);
  const goBack = () => { haptic.back(); if (slots.back) slots.back(); else router.back(); };
  const bh = ctrlH(false);
  const barBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, height: bh, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${line}`, borderRadius: 'var(--radius)', background: C.taupeBg, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: ink, textDecoration: 'none' };

  // /m·/dev/preview는 자체 셸만 사용 — 웹 상단바·레일·모바일 메뉴 숨김.
  if (customMobileShell) return null;

  if (mobile) {
    // ERP4: 메뉴 열림 → 상태창이「☰ 메뉴」로 바뀌고 우측 X · 패널은 bar 아래 펼침.
    const status = slots.title ?? OPERATOR_BRAND;
    const mh = ctrlH(true);
    return (
      <>
        <header style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 80,
          height: 'var(--fp-bar-h)', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 10px 0 var(--fp-bar-pad-x, 14px)',
          background: C.taupeBg, borderBottom: `1px solid ${line}`,
        }}>
          {/* 좌측 = 제목/브랜드 고정 (erp4 동일 — 메뉴 열려도 제목 유지). 열기·닫기는 «우측 햄버거↔X» 하나로. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            {slots.left != null && <span style={{ flex: '0 0 auto' }}>{slots.left}</span>}
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: ink, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{status}</span>
          </div>
          <button
            type="button"
            aria-label={menuOpen ? '메뉴 닫기' : '메뉴'}
            aria-expanded={menuOpen}
            onClick={() => { haptic.tap(); setMenuOpen((o) => !o); }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: mh, height: mh, marginRight: -6, flexShrink: 0,
              border: 'none', background: 'none', color: ink, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {menuOpen ? <X size={24} /> : <Menu size={23} />}
          </button>
        </header>
        {!depth && <MobileTabBar />}
        <MobileActionBar />
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </>
    );
  }

  return (
    <>
      <DesktopRail collapsed={railCollapsed} onToggle={toggleRail} />
      <div
        className="rm-shell-top"
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 16px', background: C.taupeBg, borderBottom: `1px solid ${line}`,
          position: 'fixed', top: 0, right: 0, zIndex: 80,
          height: 'var(--fp-bar-h)', boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: mute, whiteSpace: 'nowrap' }}>{currentLabel(pathname)}</span>
        <TopSearch />
        <IconBtn title="빠른 입력" onClick={openQuickInput}>
          <Plus size={16} />
        </IconBtn>
        <span style={{ fontSize: 12, color: mute, fontWeight: 600, marginRight: 2, fontVariantNumeric: 'tabular-nums' }}>{todayLabel}</span>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, paddingLeft: 2, whiteSpace: 'nowrap' }} title={user.email}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{user.name}</span>
          <span style={{ fontSize: 11.5, color: mute }}>{roleLabel(user.role)}</span>
        </div>
      </div>
      {showBottom && (
        <div className="rm-shell-dock" style={{ position: 'fixed', right: 0, bottom: 0, zIndex: 55, background: C.taupeBg, borderTop: `1px solid ${line}`, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ maxWidth: slots.contentMax ?? 1480, margin: '0 auto', padding: `8px ${slots.contentPad ?? 20}px`, display: 'flex', alignItems: 'center', gap: 8, boxSizing: 'border-box' }}>
            <button onClick={goBack} title="이전" style={barBtn}><ChevronLeft size={15} /> 이전</button>
            <Link href="/" title="대시보드" style={barBtn}><LayoutDashboard size={15} /> 대시보드</Link>
            <span style={{ flex: 1 }} />
            {slots.actions}
          </div>
        </div>
      )}
    </>
  );
}
