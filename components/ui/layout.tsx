'use client';
import React from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { useAppBar } from '@/lib/appbar';
import { FacetFilterProvider } from '@/lib/facet-filter-ctx';
import { ChevronDown, ChevronLeft, EyeOff, GripVertical } from 'lucide-react';
import { C, R, NUM, SH, ctrlH } from './tokens';
import { PAGE_PAD_M, PAGE_HEAD_PB_M, SPACE_M, SPACE_GROUP_M } from './tokens';
import { CompanyFilter, Btn } from './controls';

/* 페이지 골격 · 패널 · 섹션 · 세부 진입 껍데기 — 레이아웃 원자. */

export function Page({ title, meta, left, mid, right, tools, children, fill, frame, back, noCompany }: {
  title?: React.ReactNode; meta?: React.ReactNode; left?: React.ReactNode; mid?: React.ReactNode; right?: React.ReactNode;
  /** 셸 툴바 SSOT — WorkbenchBar. title 옆(또는 모바일 전폭). mid/right 손롤 툴바 대신 이걸 쓴다. */
  tools?: React.ReactNode;
  /** 전체회사 셀렉터 숨김 — 회사 스코프가 무의미한 페이지(개발도구 등)용. */
  noCompany?: boolean;
  /** 엑셀 시트 모드 — 본문(children)이 뷰포트를 꽉 채우고 자체 스크롤(헤더 틀고정). 페이지 스크롤 없음. */
  frame?: boolean;
  children: React.ReactNode; fill?: boolean; back?: () => void;
}) {
  const mobile = useIsMobile();
  const frameMode = !!frame && !mobile;
  const hasTitle = title != null && title !== '';
  // 모바일: 제목을 상단바 헤더로. 웹: 제목은 본문 헤더행 h1(통상 ERP — 제목이 그 페이지 툴바와 한 덩어리).
  useAppBar(
    back || (mobile && hasTitle) ? { ...(back ? { back } : {}), ...(mobile && hasTitle ? { title } : {}) } : null,
    [mobile, back, typeof title === 'string' ? title : 0],
  );
  // 모바일: meta는 상단바에 제목만 — 본문 헤더에 붙이면 회사필터/툴바 옆에 쌩뚱맞게 붙음.
  const shellOwnsCompany = mobile && (tools != null || left != null);
  const showMeta = meta != null && !mobile;
  return (
    <main style={{
      // fill(업무=FacetPage 레일 모드)=폭 꽉 채움+좌우 대칭. frame(엑셀 시트)=뷰포트 꽉 채워 본문 자체 스크롤(헤더 틀고정)·페이지 스크롤 없음. 비-fill=캡+가운데(가독).
      padding: mobile ? PAGE_PAD_M : (frameMode ? '16px 24px 20px' : '16px 24px 60px'),
      ...(fill ? { flex: 1, minWidth: 0 } : { maxWidth: 1680, margin: '0 auto' }),
      ...(frameMode ? { height: 'calc(100vh - 49px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' } : {}),
    }}>
      <div style={{ display: 'flex', flexWrap: mobile ? 'nowrap' : 'wrap', alignItems: 'center', gap: mobile ? SPACE_M : 10, paddingBottom: mobile ? PAGE_HEAD_PB_M : 14, minHeight: mobile ? 0 : 36, flexShrink: 0 }}>
        {!mobile && hasTitle && <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, flexShrink: 0 }}>{title}</h1>}
        {!shellOwnsCompany && !noCompany && <CompanyFilter />}
        {left != null ? (
          <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? SPACE_M : 10, minWidth: 0, flexWrap: mobile ? 'nowrap' : 'wrap', flex: 1 }}>
            {showMeta ? <span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap', flexShrink: 0 }}>{meta}</span> : null}
            {mid}
            {tools != null && <div style={{ flex: 1, minWidth: 0 }}>{tools}</div>}
          </div>
        )}
        {right != null && <><span style={{ flex: tools != null ? 0 : 1, minWidth: tools != null ? 0 : 8 }} />{right}</>}
      </div>
      {frameMode ? <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div> : children}
    </main>
  );
}

/** FacetRail 워크벤치 셸 — 데스크톱=좌측 레일 · 모바일=섹션 스크롤(필터는 검색 옆 버튼). */
export function FacetPage({ title, meta, left, mid, right, tools, rail, frame, back, children }: {
  title?: React.ReactNode; meta?: React.ReactNode; left?: React.ReactNode; mid?: React.ReactNode; right?: React.ReactNode;
  tools?: React.ReactNode; rail?: React.ReactNode | null; frame?: boolean; back?: () => void; children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const hasRail = rail != null;
  /* 필터 = 인-플로우(오버레이 아님). 데스크톱=좌측 열이 콘텐츠를 민다(flex row) · 모바일=콘텐츠 위 블록.
     열림은 FacetFilterBtn(검색창 옆) 토글 → 닫히면 FacetRail이 null 반환 → 콘텐츠 전폭(fill).
     undefined = 필터 안 씀(손익·부가세=maxWidth 가운데). */
  const usesRail = rail !== undefined;
  const page = (
    <Page title={title} meta={meta} left={left} mid={mid} right={right} tools={tools} fill={usesRail && !mobile} frame={frame} back={back}>
      {mobile && hasRail ? rail : null}{/* 모바일: 인-플로우 블록(닫히면 null) */}
      {children}
    </Page>
  );
  return (
    <FacetFilterProvider>
      {mobile || !usesRail ? page : (
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - 49px)' }}>
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
export function Sec({ id, title, n, desc, tone, right, hideable = true, onReorder, order, children }: { id?: string; title: React.ReactNode; n?: number; desc?: React.ReactNode; tone?: 'ink' | 'danger' | 'ok' | 'warn'; right?: React.ReactNode; hideable?: boolean; onReorder?: (fromId: string, toId: string) => void; order?: number; children: React.ReactNode }) {
  const mobile = useIsMobile();
  const key = id ? `jpk:sec:${id}` : '';
  const [state, setState] = React.useState<'open' | 'collapsed' | 'hidden'>('open');
  const [over, setOver] = React.useState(false);
  React.useEffect(() => {
    if (!key || !id) return;
    const sid = id;
    const s = localStorage.getItem(key);
    if (s === 'collapsed') setState('collapsed');
    else if (s === 'hidden') { setState('hidden'); hiddenReg.set(sid, title); emitSec(); }
    function onShow(e: Event) { if ((e as CustomEvent).detail === sid) { setState('open'); localStorage.setItem(key, 'open'); hiddenReg.delete(sid); emitSec(); } }
    window.addEventListener('jpk:sec-show', onShow);
    return () => { window.removeEventListener('jpk:sec-show', onShow); hiddenReg.delete(sid); emitSec(); };
  }, [key, id]);
  const set = (s: 'open' | 'collapsed' | 'hidden') => { setState(s); if (key) localStorage.setItem(key, s); if (id) { if (s === 'hidden') hiddenReg.set(id, title); else hiddenReg.delete(id); emitSec(); } };
  const nc = tone === 'danger' ? C.danger : tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.sub;
  if (state === 'hidden') return null;
  const canReorder = !!(id && onReorder);
  const canDrag = canReorder && state === 'collapsed';
  const hit = mobile ? 40 : 22;
  // 모바일: 무리끼리 SPACE_GROUP_M · 무리 안(제목↔본문·버튼) SPACE_M
  const mt = mobile ? SPACE_GROUP_M : 22;
  const hasTrail = (state !== 'collapsed' && right != null) || canDrag || (!!hideable && !!id);
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
        <button onClick={() => set(state === 'open' ? 'collapsed' : 'open')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'none', cursor: 'pointer', padding: 0, minHeight: mobile ? 32 : undefined, maxWidth: '100%', WebkitTapHighlightColor: 'transparent' }}>
          <ChevronDown size={mobile ? 18 : 15} color={C.sub} style={{ flexShrink: 0, transform: state === 'open' ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }} />
          <span style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink }}>{title}</span>
          {n != null && <span style={{ fontSize: mobile ? 15 : 13, fontWeight: 800, color: nc, fontFamily: NUM, fontVariantNumeric: 'tabular-nums' }}>{n}</span>}
          {tone === 'danger' && n != null && n > 0 && <span className="attn-dot" style={{ marginLeft: 4 }} title="처리 필요" />}
        </button>
        {desc && !mobile ? <span style={{ fontSize: 11.5, color: C.faint, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{desc}</span> : null}
        {hasTrail && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: mobile ? SPACE_M : 6, marginLeft: 'auto', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {state !== 'collapsed' && right}
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
            {hideable && id && <button onClick={() => set('hidden')} title="이 섹션 숨기기(맨 아래로)" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: hit, height: hit, border: 'none', background: 'none', cursor: 'pointer', color: C.faint, WebkitTapHighlightColor: 'transparent' }}><EyeOff size={mobile ? 16 : 13} /></button>}
          </span>
        )}
      </div>
      {state === 'open' && children}
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
 *   라우트 뎁스(차량·손님): SessionBar 상단 ←·제목·액션 / 하단 없음(탭 숨김). depth=true.
 *   fixed 오버레이: SessionBar 밖 → 모바일은 하단만 이전+액션(상단 이전 중복 X).
 */
export function DetailShell({ title, meta, onBack, actions, fixed, maxWidth = 1000, children }: { title?: React.ReactNode; meta?: React.ReactNode; onBack?: () => void; actions?: React.ReactNode; fixed?: boolean; maxWidth?: number; children: React.ReactNode }) {
  const mobile = useIsMobile();
  useAppBar(fixed ? null : { back: onBack, depth: true, title, actions, contentMax: maxWidth, contentPad: mobile ? 12 : 16 }, [fixed, mobile, maxWidth, title]);
  if (!fixed) {
    return (
      <div style={{ maxWidth, margin: '0 auto', padding: mobile ? '10px 14px 28px' : '14px 16px 48px' }}>
        {title != null && !mobile && <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: '2px 0 14px' }}>{title}</h1>}
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
