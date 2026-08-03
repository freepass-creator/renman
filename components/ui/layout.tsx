'use client';
import React, { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useIsMobile } from '@/lib/use-mobile';
import { useAppBar } from '@/lib/appbar';
import { FacetFilterProvider } from '@/lib/facet-filter-ctx';
import { ChevronDown, ChevronLeft, EyeOff, GripVertical, type LucideIcon } from 'lucide-react';
import { C, R, NUM, SH, ctrlH } from './tokens';
import { PAGE_PAD_M, PAGE_HEAD_PB_M, SPACE_M, SPACE_GROUP_M } from './tokens';
import { CompanyFilter, Btn } from './controls';
import { ErrorState, PageLoading } from './misc';
import { navIconForPath } from '@/lib/nav';

/* 페이지 골격 · 패널 · 섹션 · 세부 진입 껍데기 — 레이아웃 원자. */

export function Page({ title, meta, left, mid, right, tools, children, fill, frame, back, noCompany, loading, error, icon }: {
  title?: React.ReactNode; meta?: React.ReactNode; left?: React.ReactNode; mid?: React.ReactNode; right?: React.ReactNode;
  /** 셸 툴바 SSOT — WorkbenchBar. title 옆(또는 모바일 전폭). mid/right 손롤 툴바 대신 이걸 쓴다. */
  tools?: React.ReactNode;
  /** 전체회사 셀렉터 숨김 — 회사 스코프가 무의미한 페이지(개발도구 등)용. */
  noCompany?: boolean;
  /** 엑셀 시트 모드 — 본문(children)이 뷰포트를 꽉 채우고 자체 스크롤(헤더 틀고정). 페이지 스크롤 없음. */
  frame?: boolean;
  /** ERP 목록 로딩 — 제목·셸 유지, 본문만 PageLoading(작업영역 정중앙). children은 무시. */
  loading?: boolean;
  /**
   * 조회 실패 메시지 — 본문 위에 오류 배너. «0건·0원»으로 위장되는 거짓 안심 방지(QA 중요).
   * 목록이 비어 보이는 게 «없음»이 아니라 «못 읽음»임을 알려야 한다. children은 그대로 렌더.
   */
  error?: string | null;
  /**
   * 타이틀 앞 nav 아이콘. 생략=현재 경로의 nav icon(SSOT=lib/nav).
   * false=숨김 · LucideIcon=강제 지정.
   */
  icon?: LucideIcon | false;
  children?: React.ReactNode; fill?: boolean; back?: () => void;
}) {
  const mobile = useIsMobile();
  const pathname = usePathname() || '/';
  const frameMode = !!frame && !mobile;
  const hasTitle = title != null && title !== '';
  const NavIcon = icon === false
    ? undefined
    : (icon || (typeof title === 'string' ? navIconForPath(pathname) : undefined));
  const titleNode: React.ReactNode = NavIcon && typeof title === 'string'
    ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: frameMode ? 5 : 8 }}>
        <NavIcon size={frameMode ? 13 : 18} strokeWidth={2.2} aria-hidden color={C.ink} />
        {title}
      </span>
    )
    : title;
  // 모바일: 제목→TopBar 상태창(ERP4). 웹: 본문 h1.
  useAppBar(
    mobile && hasTitle
      ? { ...(back ? { back } : {}), title: titleNode }
      : (back ? { back } : null),
    [mobile, back, typeof title === 'string' ? title : 0, NavIcon, pathname],
  );
  // frame: 창(html/body) 스크롤 잠금 — 상단바 고정 · 스크롤은 본문/패널 안만.
  useEffect(() => {
    if (!frameMode) return;
    const html = document.documentElement;
    const prevHtml = html.style.overflow;
    const prevBody = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, [frameMode]);
  // 모바일: 회사=PageToolBar «회사» 툴(시트). meta/회사칩을 본문 헤더에 붙이지 않음.
  const shellOwnsCompany = mobile && (tools != null || left != null);
  const showMeta = meta != null && !mobile;
  const mobileChrome = mobile && shellOwnsCompany; // TopBar + PageToolBar 2단
  const showHead = !!(
    mobileChrome
    || (!mobile && hasTitle)
    || (!shellOwnsCompany && !noCompany)
    || left != null || mid != null || tools != null || right != null || showMeta
  );
  return (
    <main style={{
      // frame(엑셀 시트)=전폭·뷰포트 꽉 채워 자체 스크롤(헤더 틀고정)·페이지 스크롤 없음.
      // 그 외(카드·문서)=1680 캡+가운데 — 가로형 카드가 뷰포트 전체로 늘어나 «표»처럼 보이지 않게.
      // 모바일 2단 크롬: body paddingTop=TopBar · 본문 padTop 0 → 툴바가 상단바 바로 아래(ERP4).
      padding: mobileChrome ? '0 14px 48px' : (mobile ? PAGE_PAD_M : (frameMode ? '12px 20px 10px' : '16px 24px 60px')),
      ...(frameMode
        ? { flex: 1, minWidth: 0, height: 'calc(100vh - var(--fp-bar-h) - var(--fp-dock-h, 0px))', maxHeight: 'calc(100vh - var(--fp-bar-h) - var(--fp-dock-h, 0px))', overflow: 'hidden', display: 'flex', flexDirection: 'column' }
        : fill
          ? { flex: 1, minWidth: 0, maxWidth: 1680, margin: '0 auto', width: '100%' }
          : { maxWidth: 1680, margin: '0 auto' }),
    }}>
      {/* 모바일: TopBar(fixed) 바로 아래 PageToolBar sticky — 두 줄이 한 크롬(ERP4).
          좌우만 bleed. 상단 음수마진 금지(상단바와 겹침). */}
      {showHead && (
      <div style={{ display: 'flex', flexWrap: mobile ? 'nowrap' : (frameMode ? 'nowrap' : 'wrap'), alignItems: mobileChrome ? 'stretch' : 'center', gap: mobile ? SPACE_M : 10,
        minHeight: mobile ? 0 : (frameMode ? 'var(--ledger-head-h)' : 36),
        height: !mobile && frameMode ? 'var(--ledger-head-h)' : undefined,
        maxHeight: !mobile && frameMode ? 'var(--ledger-head-h)' : undefined,
        overflow: !mobile && frameMode ? 'hidden' : undefined,
        flexShrink: 0, boxSizing: 'border-box',
        ...(mobileChrome
          ? { position: 'sticky' as const, top: 'var(--fp-bar-h)', zIndex: 20, background: 'var(--bg-page)', margin: '0 -14px', padding: 0, borderBottom: 'none', width: 'calc(100% + 28px)' }
          : mobile
            ? { paddingBottom: PAGE_HEAD_PB_M }
            : { paddingBottom: frameMode ? 0 : 14 }),
      }}>
        {!mobile && hasTitle && (
          <h1 style={{
            fontSize: frameMode ? 12 : 18,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: 0,
            flexShrink: 0,
            lineHeight: 1.2,
            whiteSpace: frameMode ? 'nowrap' : undefined,
          }}>{titleNode}</h1>
        )}
        {!shellOwnsCompany && !noCompany && <CompanyFilter />}
        {left != null ? (
          <div style={{ flex: 1, minWidth: 0, width: '100%' }}>{left}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? SPACE_M : 10, minWidth: 0, flexWrap: mobile ? 'nowrap' : 'wrap', flex: 1, width: mobileChrome ? '100%' : undefined }}>
            {showMeta ? <span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap', flexShrink: 0 }}>{meta}</span> : null}
            {mid}
            {tools != null && <div style={{ flex: 1, minWidth: 0, width: mobileChrome ? '100%' : undefined }}>{tools}</div>}
          </div>
        )}
        {right != null && <><span style={{ flex: tools != null ? 0 : 1, minWidth: tools != null ? 0 : 8 }} />{right}</>}
      </div>
      )}
      {error ? (
        <div style={{ padding: mobile ? '0 12px 8px' : '0 0 10px' }}>
          <ErrorState variant="sec" message={`${error} — 아래 숫자는 불완전합니다`} />
        </div>
      ) : null}
      {frameMode
        ? <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{loading ? <PageLoading /> : children}</div>
        : loading ? <PageLoading /> : children}
    </main>
  );
}

/** 전폭 워크벤치 셸. 홈·업무 등 FacetRail 쓰는 면 — 좌측 인-플로우 필터(콘텐츠를 민다).
 *  원장(LedgerFrame)은 상단 필터줄만 쓰므로 rail 안 넘김. */
export function FacetPage({ title, meta, left, mid, right, tools, rail, frame, back, loading, error, children, icon }: {
  title?: React.ReactNode; meta?: React.ReactNode; left?: React.ReactNode; mid?: React.ReactNode; right?: React.ReactNode;
  tools?: React.ReactNode; rail?: React.ReactNode | null; frame?: boolean; back?: () => void;
  loading?: boolean; error?: string | null; children?: React.ReactNode; icon?: LucideIcon | false;
}) {
  const mobile = useIsMobile();
  const hasRail = rail != null;
  /* 필터 = 인-플로우(오버레이 아님). 데스크톱=좌측 열이 콘텐츠를 민다(flex row) · 모바일=콘텐츠 위 블록.
     열림은 FacetFilterBtn(검색창 옆) 토글 → 닫히면 FacetRail이 null 반환 → 콘텐츠 전폭(fill).
     undefined = 필터 안 씀(손익·부가세=maxWidth 가운데). */
  const usesRail = rail !== undefined;
  const page = (
    <Page title={title} meta={meta} left={left} mid={mid} right={right} tools={tools} fill={usesRail && !mobile} frame={frame} back={back} loading={loading} error={error} icon={icon}>
      {mobile && hasRail ? rail : null}{/* 모바일: 인-플로우 블록(닫히면 null) */}
      {children}
    </Page>
  );
  return (
    <FacetFilterProvider>
      {mobile || !usesRail ? page : (
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - var(--fp-bar-h))' }}>
          {/* 데스크톱: 좌측 인-플로우 열(닫히면 null→전폭). 로딩중(rail=null)엔 200px 자리를 잡아 완료 시 흔들림 방지
              — open은 마운트마다 true로 시작하므로 로딩 자리(200)와 완료 레일(200)이 일치 = shift 0. */}
          {hasRail ? rail : <div aria-hidden style={{ flex: '0 0 200px', borderRight: '1px solid var(--border)', background: 'var(--bg-card)' }} />}
          {page}
        </div>
      )}
    </FacetFilterProvider>
  );
}

// Panel = 무박스 타이틀 섹션(Sec와 같은 규격). 박스·그림자 제거 → 원자(카드/폼)가 직접 흐름. 규격통일.
export function Panel({ title, action, children }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  const mobile = useIsMobile();
  return (
    <div style={{ marginTop: mobile ? SPACE_GROUP_M : 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: mobile ? SPACE_M : 8, marginBottom: mobile ? SPACE_M : 9, flexWrap: 'wrap' }}>
        <div style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink }}>{title}</div>
        {action && <div>{action}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

/* ── 카드 우선 레이아웃 — 박스 그룹 대신 "섹션 텍스트 + 카드들". 모든 데이터=카드 객체. ── */
// 섹션 = 박스 없는 텍스트 타이틀 + 카드 흐름
// 순서 변경 = 접힌 섹션을 드래그앤드롭만(↑↓ 버튼 금지). onReorder(fromId, toId) = toId 앞에 삽입.
// 숨긴 섹션 레지스트리 — 숨기면 맨 아래 HiddenSecs 바에 모임(인라인 X)
const hiddenReg = new Map<string, React.ReactNode>();
const emitSec = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('jpk:sec-change')); };
const SEC_DND = 'text/jpk-sec-id';
export function Sec({ id, title, n, desc, tone, right, hideable = true, collapsible = true, onReorder, order, children }: {
  id?: string; title: React.ReactNode; n?: number; desc?: React.ReactNode; tone?: 'ink' | 'danger' | 'ok' | 'warn';
  right?: React.ReactNode; hideable?: boolean; /** false면 접기/셰브론 없음(항상 펼침). 대시보드 등. */
  collapsible?: boolean; onReorder?: (fromId: string, toId: string) => void; order?: number; children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const key = id ? `jpk:sec:${id}` : '';
  const [state, setState] = React.useState<'open' | 'collapsed' | 'hidden'>('open');
  const [over, setOver] = React.useState(false);
  React.useEffect(() => {
    if (!collapsible || !key || !id) return;
    const sid = id;
    const s = localStorage.getItem(key);
    if (s === 'collapsed') setState('collapsed');
    else if (s === 'hidden') { setState('hidden'); hiddenReg.set(sid, title); emitSec(); }
    function onShow(e: Event) { if ((e as CustomEvent).detail === sid) { setState('open'); localStorage.setItem(key, 'open'); hiddenReg.delete(sid); emitSec(); } }
    window.addEventListener('jpk:sec-show', onShow);
    return () => { window.removeEventListener('jpk:sec-show', onShow); hiddenReg.delete(sid); emitSec(); };
  }, [key, id, collapsible]);
  const set = (s: 'open' | 'collapsed' | 'hidden') => { setState(s); if (key) localStorage.setItem(key, s); if (id) { if (s === 'hidden') hiddenReg.set(id, title); else hiddenReg.delete(id); emitSec(); } };
  const nc = tone === 'danger' ? C.danger : tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.sub;
  if (collapsible && state === 'hidden') return null;
  const open = !collapsible || state === 'open';
  const canReorder = !!(collapsible && id && onReorder);
  const canDrag = canReorder && state === 'collapsed' && !mobile;   // 모바일=드래그 재정렬 숨김(헤더 잡동사니 제거)
  const hit = mobile ? 40 : 22;
  // 모바일: 무리끼리 SPACE_GROUP_M · 무리 안(제목↔본문·버튼) SPACE_M
  const mt = mobile ? SPACE_GROUP_M : 22;
  const canHide = collapsible && hideable && !!id && !mobile;
  const hasTrail = (open && right != null) || canDrag || canHide;
  return (
    <section id={id} style={{ marginTop: mt, scrollMarginTop: mobile ? 68 : 62, outline: over ? `2px solid ${C.accent}` : 'none', outlineOffset: 6, borderRadius: R, transition: 'outline-color .1s', order }}
      onDragOver={canReorder ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!over) setOver(true); } : undefined}
      onDragLeave={canReorder ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false); } : undefined}
      onDrop={canReorder ? (e) => {
        e.preventDefault(); setOver(false);
        const from = e.dataTransfer.getData(SEC_DND);
        if (from && from !== id) onReorder!(from, id!);
      } : undefined}
    >
      {/* 웹=한 줄 고정(nowrap) — 접기/펼치기 때 오른쪽 버튼이 2번째 줄로 «튀어» 헤더 높이가 확 바뀌던 것 제거.
          desc가 flex:1 말줄임으로 폭을 흡수, 버튼은 flexShrink:0으로 제자리. 모바일은 wrap 유지(터치·스택). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? SPACE_M : 8, marginBottom: mobile ? SPACE_M : 9, flexWrap: mobile ? 'wrap' : 'nowrap', minHeight: ctrlH(mobile) }}>
        {collapsible ? (
          <button type="button" onClick={() => set(state === 'open' ? 'collapsed' : 'open')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'none', cursor: 'pointer', padding: 0, minHeight: mobile ? 44 : undefined, maxWidth: '100%', WebkitTapHighlightColor: 'transparent' }}>
            <ChevronDown size={mobile ? 18 : 15} color={C.sub} style={{ flexShrink: 0, transform: state === 'open' ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
            <span style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink }}>{title}</span>
            {n != null && <span style={{ fontSize: mobile ? 15 : 13, fontWeight: 800, color: nc, fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{n}</span>}
            {tone === 'danger' && n != null && n > 0 && <span className="attn-dot" style={{ marginLeft: 4 }} title="처리 필요" />}
          </button>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
            <span style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink }}>{title}</span>
            {n != null && <span style={{ fontSize: mobile ? 15 : 13, fontWeight: 800, color: nc, fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{n}</span>}
            {tone === 'danger' && n != null && n > 0 && <span className="attn-dot" style={{ marginLeft: 4 }} title="처리 필요" />}
          </div>
        )}
        {desc && !mobile ? <span style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span> : null}
        {hasTrail && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: mobile ? SPACE_M : 6, marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {open && right}
            {canDrag && (
              <span
                draggable
                title="끌어 순서 변경"
                onDragStart={(e) => { e.dataTransfer.setData(SEC_DND, id!); e.dataTransfer.effectAllowed = 'move'; }}
                onDragEnd={() => setOver(false)}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: hit, height: hit, cursor: 'grab', color: C.faint, touchAction: 'none' }}
              >
                <GripVertical size={mobile ? 18 : 15} />
              </span>
            )}
            {canHide && <button type="button" onClick={() => set('hidden')} title="이 섹션 숨기기(맨 아래로)" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: hit, height: hit, border: 'none', background: 'none', cursor: 'pointer', color: C.faint, WebkitTapHighlightColor: 'transparent' }}><EyeOff size={mobile ? 16 : 13} /></button>}
          </span>
        )}
      </div>
      {open && children}
    </section>
  );
}
// 숨긴 섹션 복원 바 — 페이지 맨 아래
export function HiddenSecs() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => { const on = () => force(); window.addEventListener('jpk:sec-change', on); return () => window.removeEventListener('jpk:sec-change', on); }, []);
  const items = Array.from(hiddenReg.entries());
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 30, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ fontSize: 11.5, color: C.faint }}>숨긴 섹션</span>
      {items.map(([hid, htitle]) => <Btn key={hid} size="sm" variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('jpk:sec-show', { detail: hid }))}><EyeOff size={12} /> {htitle} · 표시</Btn>)}
    </div>
  );
}

/**
 * 세부 진입 통일 껍데기.
 *   라우트 뎁스(차량·손님): SessionBar 상단 제목 · 하단 이전+액션 / 탭 숨김. depth=true.
 *   fixed 오버레이: SessionBar 밖 → 모바일은 하단만 이전+액션(상단 이전 중복 X).
 */
export function DetailShell({ title, meta, onBack, actions, fixed, maxWidth = 1000, fill, children }: {
  title?: React.ReactNode; meta?: React.ReactNode; onBack?: () => void; actions?: React.ReactNode;
  fixed?: boolean; maxWidth?: number;
  /** ERP 워크벤치 — 중복 h1 없음. 여백·폭은 원장 Page와 동일(16/24 · 1680). */
  fill?: boolean;
  children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  // 원장 Page SSOT: 웹 padding 16px 24px · maxWidth 1680 · contentPad 24
  const deskPad = '16px 24px 60px';
  const shellMax = fill ? 1680 : maxWidth;
  useAppBar(fixed ? null : {
    back: onBack, depth: true, title, actions,
    contentMax: shellMax,
    contentPad: fill ? (mobile ? 14 : 24) : (mobile ? 12 : 16),
  }, [fixed, mobile, shellMax, title, fill]);
  if (!fixed) {
    return (
      <div style={{
        maxWidth: shellMax,
        width: '100%',
        margin: '0 auto',
        padding: fill
          ? (mobile ? '10px 14px 48px' : deskPad)
          : (mobile ? '10px 14px 28px' : '14px 16px 48px'),
        minHeight: fill && !mobile ? 'calc(100vh - 52px)' : undefined,
        boxSizing: 'border-box',
      }}>
        {title != null && !mobile && !fill && <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0 14px' }}>{title}</h1>}
        {children}
      </div>
    );
  }
  // 오버레이 — 모바일: 제목만 위, 이전+액션은 하단 1곳.
  const backBtn = onBack ? <Btn variant="ghost" onClick={onBack}><ChevronLeft size={15} /> 이전</Btn> : null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg-page)', overflowY: 'auto', overscrollBehavior: 'contain' }}>
      <div style={{ maxWidth, margin: '0 auto', padding: mobile ? '0 12px 76px' : '0 16px 48px' }}>
        {mobile ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '12px 2px 4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</span>
            {meta && <span style={{ fontSize: 12, color: C.faint }}>{meta}</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', flexWrap: 'wrap', position: 'sticky', top: 0, background: 'var(--bg-page)', zIndex: 10 }}>
            {backBtn}
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', marginLeft: 6 }}>{title}</span>
            {meta && <span style={{ fontSize: 12.5, color: C.faint }}>{meta}</span>}
            <span style={{ flex: 1 }} />
            {actions}
          </div>
        )}
        {children}
      </div>
      {mobile && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 70, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', background: C.taupeBg, borderTop: `1px solid ${C.line}`, boxShadow: SH.card }}>
          {backBtn}
          <span style={{ flex: 1 }} />
          {actions}
        </div>
      )}
    </div>
  );
}

/* 상세 — 섹션 컨테이너(제목 + 박스). */
export function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <h2 style={{ fontSize: 12, fontWeight: 700, color: C.mute, marginBottom: 6 }}>{title}</h2>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', background: C.taupeBg }}>{children}</div>
    </div>
  );
}
