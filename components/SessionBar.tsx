'use client';
import { useState, useEffect, type CSSProperties } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, Menu, X, Home, Search as SearchIcon } from 'lucide-react';
import { useSession, roleLabel } from '@/lib/session';
import { useAppBarSlots } from '@/lib/appbar';
import { useIsMobile } from '@/lib/use-mobile';
import { MobileTabBar } from '@/components/MobileTabBar';
import { haptic } from '@/lib/haptics';
import { C, SCRIM, ctrlH, IconBtn } from '@/components/ui';
import { NAV_GROUPS } from '@/lib/nav';
import { tierIncludes } from '@/lib/tier';
import { TopSearch } from '@/components/TopSearch';

// 상단 좌측 브랜드 = 이 ERP를 쓰는 운영사(테넌트) 이름. 임시 하드코딩 — 추후 로그인 유저의 소속회사로.
const OPERATOR_BRAND = 'teamjpk';
// 배포 표시버전 SSOT — 메뉴 하단 노출. 배포 때 SemVer로 올림: MAJOR(풀체인지)·MINOR(구조개편)·PATCH(소소). package.json과 별개(레포 내부값).
const APP_VERSION = '6.0.0';

// 메뉴 = lib/nav NAV_GROUPS SSOT (현황=보기 · 업무=손대기 · 경영=지표).
//   hqOnly 항목(개발도구 등)은 본사(마스터)에게만 노출 — 직원 계정엔 숨김.
const navGroups = (isOperator: boolean) => NAV_GROUPS
  .map((g) => ({ ...g, items: g.items.filter((it) => tierIncludes(it.tier ?? '라이트') && (!it.hqOnly || isOperator)) }))
  .filter((g) => g.items.length > 0);

function NavMenu() {
  const [open, setOpen] = useState(false);
  const { isOperator } = useSession();
  const line = 'var(--border)', ink = 'var(--text-main)', mute = 'var(--text-sub)', weak = 'var(--text-weak)';
  return (
    <div style={{ position: 'relative' }}>
      <IconBtn title="메뉴" active={open} onClick={() => setOpen((o) => !o)}>
        <Menu size={17} />
      </IconBtn>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 44 }} />
        <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', width: 220, background: C.taupeBg, border: `1px solid ${line}`, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 45, overflow: 'hidden' }}>
          {navGroups(isOperator).map((g, gi) => (
            <div key={gi} style={{ borderTop: gi ? `1px solid ${line}` : 'none', padding: '5px 0' }}>
              {g.title && <div style={{ fontSize: 11, color: weak, fontWeight: 700, padding: '3px 13px', letterSpacing: '0.02em' }}>{g.title}</div>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 13px', fontSize: 12.5, color: ink, textDecoration: 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.hover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <it.icon size={14} color={mute} /> {it.label}
                </Link>
              ))}
            </div>
          ))}
          {/* 배포 버전 — 메뉴 하단(erp4식). 배포 확인용. APP_VERSION SSOT. */}
          <div style={{ borderTop: `1px solid ${line}`, padding: '7px 14px', fontSize: 11, color: weak, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
            {OPERATOR_BRAND} · v{APP_VERSION}
          </div>
        </div>
      </>)}
    </div>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isOperator } = useSession();
  const line = 'var(--border)', ink = 'var(--text-main)', mute = 'var(--text-sub)', weak = 'var(--text-weak)';
  if (!open) return null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', top: 54, left: 0, right: 0, bottom: 0, zIndex: 58, background: SCRIM, animation: 'fadeIn .15s ease' }} />
      <div style={{ position: 'fixed', top: 54, left: 0, right: 0, zIndex: 59, maxHeight: 'calc(100dvh - 54px)', overflowY: 'auto', overscrollBehavior: 'contain', background: C.taupeBg, borderBottom: `1px solid ${line}`, boxShadow: 'var(--shadow-lg)', animation: 'menuDrop .18s cubic-bezier(.2,.8,.2,1)', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ padding: '4px 0 16px' }}>
          {navGroups(isOperator).map((g, gi) => (
            <div key={gi} style={{ padding: '3px 0' }}>
              {g.title && <div style={{ fontSize: 11.5, color: weak, fontWeight: 700, padding: '9px 20px 3px', letterSpacing: '0.02em' }}>{g.title}</div>}
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} onClick={() => { haptic.nav(); onClose(); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', fontSize: 15.5, fontWeight: 600, color: ink, textDecoration: 'none', WebkitTapHighlightColor: 'transparent' }}>
                  <it.icon size={19} color={mute} /> {it.label}
                </Link>
              ))}
            </div>
          ))}
          {/* 배포 버전 — 메뉴 하단(erp4식). */}
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
  // 모바일 크롬 SSOT — 허브=메뉴·탭 / 뎁스=상단←만(하단 이전 중복 금지).
  const depth = !!slots.depth;
  const showBottom = !!(slots.back || slots.actions);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.paddingBottom = mobile
      ? (depth ? 'env(safe-area-inset-bottom)' : 'calc(54px + env(safe-area-inset-bottom))')
      : (showBottom ? '54px' : '');
    return () => { document.body.style.paddingBottom = ''; };
  }, [showBottom, mobile, depth]);
  const [todayLabel, setTodayLabel] = useState('');
  useEffect(() => { const n = new Date(); setTodayLabel(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')} (${['일', '월', '화', '수', '목', '금', '토'][n.getDay()]})`); }, []);
  const goBack = () => { haptic.back(); if (slots.back) slots.back(); else router.back(); };
  const bh = ctrlH(false);
  const barBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, height: bh, boxSizing: 'border-box', padding: '0 12px', border: `1px solid ${line}`, borderRadius: 'var(--radius)', background: C.taupeBg, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: ink, textDecoration: 'none' };

  if (mobile) {
    const tapTarget: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, flexShrink: 0, border: 'none', background: 'none', cursor: 'pointer', color: ink, WebkitTapHighlightColor: 'transparent' };
    const showBack = !!(slots.back || depth);
    const headTitle = showBack ? (slots.title ?? '') : (slots.title ?? OPERATOR_BRAND);
    return (
      <>
        <header style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', minHeight: 54, background: 'rgba(255,255,255,0.94)', backdropFilter: 'saturate(180%) blur(12px)', WebkitBackdropFilter: 'saturate(180%) blur(12px)', borderBottom: `1px solid ${line}`, position: 'sticky', top: 0, zIndex: 30 }}>
          {showBack ? (
            <button onClick={goBack} aria-label="이전" style={tapTarget}><ChevronLeft size={27} /></button>
          ) : (
            <button onClick={() => { haptic.tap(); setMenuOpen((o) => !o); }} aria-label="메뉴" style={tapTarget}>{menuOpen ? <X size={23} /> : <Menu size={23} />}</button>
          )}
          <span style={{ flex: 1, minWidth: 0, fontSize: headTitle === OPERATOR_BRAND ? 19 : 17, fontWeight: 800, letterSpacing: '-0.03em', color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {headTitle}
          </span>
          {!showBack && <button onClick={() => router.push('/search')} aria-label="검색" style={tapTarget}><SearchIcon size={21} /></button>}
          {showBack
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{slots.actions}</span>
            : <span style={{ fontSize: 12.5, fontWeight: 700, color: ink, padding: '0 8px', whiteSpace: 'nowrap' }} title={user.email}>{user.name}</span>}
        </header>
        {/* 허브=탭 · 뎁스=하단 없음(이전은 상단←만) */}
        {!depth && <MobileTabBar />}
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
      </>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: C.taupeBg, borderBottom: `1px solid ${line}`, position: 'sticky', top: 0, zIndex: 30, minHeight: 48, boxSizing: 'border-box', flexWrap: 'wrap' }}>
        <NavMenu />
        <a href="/" style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.03em', color: ink, textDecoration: 'none' }}>{OPERATOR_BRAND}</a>
        {/* 가운데 = 전역 검색(검색 전용 인라인 타입어헤드 — 창 안 뜨고 밑에 결과 바로). */}
        <TopSearch />
        <span style={{ fontSize: 12, color: mute, fontWeight: 600, marginRight: 2, fontVariantNumeric: 'tabular-nums' }}>{todayLabel}</span>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, paddingLeft: 2, whiteSpace: 'nowrap' }} title={user.email}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>{user.name}</span>
          <span style={{ fontSize: 11.5, color: mute }}>{roleLabel(user.role)}</span>
        </div>
      </div>
      {showBottom && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55, background: C.taupeBg, borderTop: `1px solid ${line}`, boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ maxWidth: slots.contentMax ?? 1480, margin: '0 auto', padding: `8px ${slots.contentPad ?? 20}px`, display: 'flex', alignItems: 'center', gap: 8, boxSizing: 'border-box' }}>
            <button onClick={goBack} title="이전" style={barBtn}><ChevronLeft size={15} /> 이전</button>
            <Link href="/" title="홈" style={barBtn}><Home size={15} /> 홈</Link>
            <span style={{ flex: 1 }} />
            {slots.actions}
          </div>
        </div>
      )}
    </>
  );
}
