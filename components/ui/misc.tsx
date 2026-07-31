'use client';
import React from 'react';
import { Check, AlertTriangle, type LucideIcon } from 'lucide-react';
import { companyTone, companyShort } from '@/lib/companies';
import { type CrosscheckResult } from '@/lib/ocr-crosscheck';
import { useIsMobile } from '@/lib/use-mobile';
import { C, R, NUM, SH, METRIC_FS, GAP_M, SPACE_M, TOUCH, CELL_SUB_FS, INDENT_UNIT } from './tokens';
import { Spinner } from '../Spinner';

/* 카드·지표·상태/이슈 어휘 등 — UI 키트의 "나머지" 원자 모음. */

/** ERP 작업영역 로딩 — 남은 본문 칸을 채우고 그 안 정중앙.
 *  풀스크린/페이지 바깥 덮기 금지(세션 Gate·LoadingOverlay). */
export function PageLoading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div
      style={{
        flex: 1,
        alignSelf: 'stretch',
        width: '100%',
        minHeight: 'min(50vh, 360px)',
        position: 'relative',
      }}
    >
      <div role="status" aria-busy="true" aria-live="polite"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 20,
          boxSizing: 'border-box',
        }}>
        <Spinner size={28} stroke={2.5} color={C.brand} />
        <div style={{ fontSize: 12.5, color: C.mute }}>{label}</div>
      </div>
    </div>
  );
}

/* 생애주기 스테퍼 — 자산 상태 기계를 가로로. done/current/todo. 목록에선 StatusTag로 투영. */
export type Step = { label: string; date?: string; state: 'done' | 'current' | 'todo'; note?: string };
export function Stepper({ steps }: { steps: Step[] }) {
  const mobile = useIsMobile();
  const dotColor = (s: Step['state']) => s === 'done' ? 'var(--green-text)' : s === 'current' ? C.brand : C.line;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', border: `1px solid ${C.line}`, borderRadius: R, background: C.card, padding: mobile ? '10px 10px' : '14px 18px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: mobile ? 56 : 88, maxWidth: mobile ? 72 : undefined, flex: mobile ? '1 0 auto' : '0 0 auto' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800,
              background: s.state === 'done' ? 'var(--green-text)' : s.state === 'current' ? C.brand : C.card,
              color: s.state === 'todo' ? C.lineStrong : C.inverse, border: `2px solid ${dotColor(s.state)}`,
              boxShadow: s.state === 'current' ? `0 0 0 3px color-mix(in srgb, ${C.brand} 18%, transparent)` : 'none' }}>
              {s.state === 'done' ? <Check size={12} strokeWidth={2.6} aria-hidden /> : i + 1}
            </div>
            <div style={{ marginTop: 6, fontSize: mobile ? 10.5 : 12, fontWeight: s.state === 'current' ? 800 : 600, color: s.state === 'todo' ? C.faint : C.ink, textAlign: 'center', lineHeight: 1.25, whiteSpace: mobile ? 'normal' : 'nowrap' }}>{s.label}</div>
            {!mobile && <div style={{ fontSize: 10.5, color: C.faint, fontFamily: NUM, fontVariantNumeric: 'tabular-nums', minHeight: 13 }}>{s.date || ''}</div>}
            {s.note && <div style={{ fontSize: 10, color: C.warn, fontWeight: 700 }}>{s.note}</div>}
          </div>
          {i < steps.length - 1 && <div style={{ flex: mobile ? '0 0 8px' : 1, minWidth: mobile ? 8 : 24, height: 2, marginTop: 10, background: steps[i + 1].state === 'todo' ? C.line : 'var(--green-text)', borderRadius: 2 }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// 목록 뷰어 = 카드 하나(전환·리스트/엑셀 없음). PC·모바일 동일 정책.
// fit(지표줄): 웹=가로 wrap · 모바일=2열 그리드(웹 축소 금지).
export function Cards({ min = 240, fit, children }: { min?: number; fit?: boolean; children: React.ReactNode }) {
  const mobile = useIsMobile();
  if (fit) {
    if (mobile) return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: GAP_M }}>{children}</div>;
    return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>{children}</div>;
  }
  // 모바일 목록 = erp4 상세식 «그룹 박스»(한 테두리 + 구분선 행). 개별 카드 박스 흩뿌림 제거 → 플랫폼식 «박스 나열» 탈피.
  if (mobile) return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', overflow: 'hidden', background: C.card }}>
      <CardGroupContext.Provider value={true}>
        {React.Children.map(children, (c, i) => (
          <div style={{ borderTop: i ? `1px solid ${C.line2}` : undefined }}>{c}</div>
        ))}
      </CardGroupContext.Provider>
    </div>
  );
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${min}px), 1fr))`, gap: 8, alignItems: 'start' }}>{children}</div>;
}
// 그룹 카드 컨텍스트 — 그룹 박스 안 ObjCard는 개별 테두리·그림자 제거(구분선은 그룹이 그림). erp4 상세 «box + 행» 규격.
const CardGroupContext = React.createContext(false);
// 카드 공통 — 살짝 뜬 그림자 + 자연스러운 통일 호버(떠오름). 절제(눈 안 아프게). 그림자=SH SSOT.
function useHover() { const [h, setH] = React.useState(false); return { h, on: { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) } }; }
function cardStyle(h: boolean, click: boolean): React.CSSProperties {
  return { border: `1px solid ${h && click ? C.line : C.line}`, borderRadius: 'var(--radius)', background: C.card, boxShadow: h && click ? SH.hover : SH.rest, transition: 'box-shadow .15s ease, border-color .15s ease', cursor: click ? 'pointer' : 'default' };
}
// 지표 카드 (가동률·미수 등) — 라벨 + 숫자 + 선택 hint(기준 한 줄). 색은 숫자에만. 숫자 크기=METRIC_FS.
export function Metric({ label, value, hint, tone, onClick }: { label: React.ReactNode; value: React.ReactNode; hint?: React.ReactNode; tone?: 'ink' | 'danger' | 'ok' | 'warn'; onClick?: () => void }) {
  const mobile = useIsMobile();
  const color = tone === 'danger' ? C.danger : tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.ink;
  const { h, on } = useHover();
  return (
    <div onClick={onClick} {...on} style={{
      ...cardStyle(h, !!onClick),
      padding: mobile ? '10px 12px' : '9px 13px',
      flex: mobile ? undefined : '0 0 auto',
      minWidth: 0,
      minHeight: mobile ? 64 : 54,
      boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 11, color: C.mute, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: mobile ? 16 : METRIC_FS, fontWeight: 800, color, fontFamily: NUM, fontVariantNumeric: 'tabular-nums', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      {hint != null && hint !== '' && <div style={{ fontSize: 10.5, color: C.faint, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hint}</div>}
    </div>
  );
}
// 객체 카드 = 목록의 단일 원자(2행 신원카드). 웹·모바일 높이 56(= freepass ERP4 ObjCard).
//  1행 신원: [회사][상태배지][차량번호(모노·무잘림) 또는 이름][차종(축소가능)] …[우측 핵심수치]
//  2행 원자: fields(라벨-값, 우선순위 상위 3 + ＋n) 또는 sub(자유문). 상태색=배지만. 행배경·좌측점·세로선 금지.
//  호출부는 "필요한 원자만" 넘긴다. 차번=plate, 비차량 주체(자금 상대방·고객)=name, 부가식별=carType.
// RailTone — 모바일 ObjRow 잔여. 원장 ExcelSheet 행 틴트에는 쓰지 않음.
export type RailTone = 'none' | 'brand' | 'danger' | 'warn' | 'violet' | 'ok' | 'mute';
export function railToneColor(tone: Exclude<RailTone, 'none'>): string {
  return tone === 'brand' ? C.brand
    : tone === 'danger' ? C.danger
    : tone === 'warn' ? C.warn
    : tone === 'violet' ? C.violet
    : tone === 'ok' ? C.ok
    : C.faint;
}

/**
 * 엑셀 2줄 셀 SSOT — main(12)·sub(`CELL_SUB_FS`). ellipsis 내장.
 * 컬럼 render에서 fontSize/lineHeight/flex 손롤 금지 → 이것만.
 */
export function TwoLineCell({
  main, sub, mono,
}: {
  main: React.ReactNode;
  sub?: React.ReactNode;
  /** 차번 등 모노 강조 */
  mono?: boolean;
}) {
  if (main == null || main === '') {
    return <span style={{ color: C.mute }}>{sub ?? '—'}</span>;
  }
  return (
    <div style={{ minWidth: 0, lineHeight: 1.25 }}>
      <div style={{
        fontFamily: mono ? NUM : undefined,
        fontWeight: mono ? 700 : 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{main}</div>
      {sub != null && sub !== '' && (
        <div style={{
          fontSize: CELL_SUB_FS, color: C.mute,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</div>
      )}
    </div>
  );
}

/** 트리/CMS 하위행 들여쓰기 — `INDENT_UNIT`만. */
export function TreeIndent({ children, depth = 1 }: { children: React.ReactNode; depth?: number }) {
  return <span style={{ color: C.mute, paddingLeft: INDENT_UNIT * depth }}>{children}</span>;
}

/** 아이콘+건수(경고 열 등). 컬럼에서 flex/gap 손롤 금지 → 이것만. */
export function IconCount({
  icon: Icon, count, tone = 'warn', title,
}: {
  icon: LucideIcon;
  count: number;
  tone?: 'danger' | 'warn' | 'mute';
  title?: string;
}) {
  const color = tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : C.faint;
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        color, fontWeight: 800, whiteSpace: 'nowrap', cursor: title ? 'help' : undefined,
      }}
    >
      <Icon size={13} aria-hidden />{count}
    </span>
  );
}
const ATOM_CAP = 3; // 2행 원자 표시 상한 — 넘으면 ＋n(우선순위 상위만 생존, 픽셀측정 대신 count-cap)
export function ObjCard({ badge, badgeTone = 'gray', co, rail = 'none', plate, name, carType, title, sub, right, fields, onClick, style }: {
  badge?: React.ReactNode; badgeTone?: BadgeTone; co?: string; rail?: RailTone;
  plate?: string; name?: React.ReactNode; carType?: React.ReactNode; title?: React.ReactNode;
  sub?: React.ReactNode; right?: React.ReactNode; fields?: [React.ReactNode, React.ReactNode][]; onClick?: () => void;
  /** 선택 하이라이트 등 — 상태 틴트 금지(배지만). */
  style?: React.CSSProperties;
}) {
  const mobile = useIsMobile();
  const { h, on } = useHover();
  const grouped = React.useContext(CardGroupContext);   // 그룹 박스 안 → 개별 테두리·그림자 제거
  const usingFields = sub == null && !!fields && fields.length > 0;
  const shown = usingFields ? fields!.slice(0, ATOM_CAP) : [];
  const moreN = usingFields ? fields!.length - shown.length : 0;
  const row2: React.ReactNode = sub != null ? sub
    : usingFields
      ? <>{shown.map(([l, v], i) => <span key={i} style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{l != null && <span style={{ color: C.mute }}>{l} </span>}<span style={{ color: C.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v}</span>{i < shown.length - 1 && <span style={{ color: C.faint, margin: '0 5px' }}>·</span>}</span>)}{moreN > 0 && <span style={{ flex: '0 0 auto', color: C.faint, marginLeft: 6 }}>＋{moreN}</span>}</>
      : null;
  const anchor = plate != null
    ? <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontFamily: NUM, fontSize: mobile ? 15 : 13, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink }}>{plate}</span>
    : name != null
      ? <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 15 : 13, fontWeight: 700, color: C.ink }}>{name}</span>
      : <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 14 : 12.5, fontWeight: 600, color: C.ink }}>{title}</span>;
  // rail danger 틴트는 잔여(모바일). 상태 신호의 SSOT는 Badge.
  const tintBg = style?.background ?? (rail === 'danger' ? 'var(--danger-tint)' : undefined);
  return (
    <div onClick={onClick} {...on} style={{
      ...(grouped
        ? { background: h && !!onClick ? C.hover : (tintBg ?? 'transparent'), cursor: onClick ? 'pointer' : 'default', transition: 'background .12s ease' }
        : {
            ...cardStyle(h, !!onClick),
            ...(!h && tintBg ? { background: tintBg } : {}),
          }),
      position: 'relative', overflow: 'hidden',
      height: mobile ? 'auto' : 56, minHeight: mobile ? 60 : 56,
      padding: mobile ? '10px 14px' : '0 12px 0 14px',
      display: 'flex', alignItems: 'center', minWidth: 0,
      WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
          {co ? <span style={{ flex: '0 0 auto' }}><CompanyBadge co={co} /></span> : null}
          {badge != null && <span style={{ flex: '0 0 auto' }}><Badge tone={badgeTone}>{badge}</Badge></span>}
          {anchor}
          {carType != null && <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 13 : 12, color: C.mute }}>{carType}</span>}
        </div>
        {(row2 != null || right != null) && <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          {usingFields
            ? <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', fontSize: mobile ? 12.5 : 11.5, color: C.faint }}>{row2}</div>
            : <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 12.5 : 11.5, color: C.faint }}>{row2}</div>}
          {right != null && <div style={{ flex: '0 0 auto', fontSize: mobile ? 15 : 13, fontWeight: 700, fontFamily: NUM, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: C.ink }}>{right}</div>}
        </div>}
      </div>
    </div>
  );
}

// OCR 교차검증 경고 — 추출값 내부정합 검산 결과(⚠). 저장은 막지 않고 "이 건만 재확인" 신호.
export function OcrCrosscheck({ result }: { result?: CrosscheckResult | null }) {
  if (!result || result.level === 'ok' || !result.issues?.length) return null;
  const color = result.level === 'error' ? C.danger : C.warn;
  return (
    <div style={{ marginTop: 8, padding: '9px 11px', border: `1px solid ${color}`, borderRadius: R, background: 'var(--bg-card)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 5, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <AlertTriangle size={13} strokeWidth={2.2} aria-hidden /> OCR 재확인 권장 · 신뢰도 {result.confidence}%
      </div>
      <ul style={{ margin: 0, paddingLeft: 17 }}>
        {result.issues.map((it, i) => <li key={i} style={{ fontSize: 11.5, color: C.mute, lineHeight: 1.55 }}>{it.message}</li>)}
      </ul>
    </div>
  );
}

/**
 * 빈 상태 SSOT — 손롤 div 금지.
 *   · page  페이지·필터 전체 없음(+CTA). 박스 센터.
 *   · page  기본. 본문 빈 목록(박스+안내).
 *   · sheet 원장 시트 칸(필터 아래·패널 옆). 남은 높이 채우고 가운데 — 패널과 높이 맞춤.
 *   · sec   Sec 안 목록 없음. 조용한 한 줄(현황 생애·상세 하위).
 *   · ok    미결/리스크 큐가 비어 있음 = 정상. 초록 체크(홈·업무).
 */
export type EmptyVariant = 'page' | 'sheet' | 'sec' | 'ok';
export function EmptyState({ children, variant = 'page' }: { children: React.ReactNode; variant?: EmptyVariant }) {
  if (variant === 'ok') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.ok, padding: '2px 0' }}>
        <Check size={13} strokeWidth={2.5} /> {children}
      </div>
    );
  }
  if (variant === 'sec') {
    return <div style={{ fontSize: 12.5, color: C.faint, padding: '2px 0' }}>{children}</div>;
  }
  if (variant === 'sheet') {
    // 원장·데이터센터 작업칸 — 패널과 같은 1px 카드로 남은 높이 채움(어정쩡한 상단 박스 금지).
    return (
      <div role="status" style={{
        flex: 1,
        alignSelf: 'stretch',
        width: '100%',
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 24px',
        textAlign: 'center',
        color: C.mute,
        border: `1px solid ${C.line}`,
        borderRadius: R,
        background: C.card,
        fontSize: 13,
        lineHeight: 1.55,
        boxSizing: 'border-box',
      }}>
        {children}
      </div>
    );
  }
  return (
    <div style={{
      marginTop: 12, padding: '36px 24px', textAlign: 'center', color: C.mute,
      border: `1px solid ${C.line}`, borderRadius: R, background: C.card, fontSize: 13, lineHeight: 1.55,
    }}>
      {children}
    </div>
  );
}

/** @deprecated EmptyState variant="ok" 사용. 홈 레지스트리 호환 alias. */
export function Ok({ children }: { children: React.ReactNode }) {
  return <EmptyState variant="ok">{children}</EmptyState>;
}

/** 2열 액션 타일. 손롤 금지(높이·간격 토큰). */
export function ActionTile({
  icon, label, desc, onClick,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  desc?: React.ReactNode;
  onClick?: () => void;
}) {
  const mobile = useIsMobile();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: SPACE_M,
        minHeight: mobile ? Math.max(88, TOUCH * 2) : 88,
        padding: mobile ? '14px' : '12px 14px',
        border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
        background: C.taupeBg, cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
        WebkitTapHighlightColor: 'transparent', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%',
      }}
    >
      {icon != null ? <span style={{ display: 'inline-flex', color: C.brand }}>{icon}</span> : null}
      <span style={{ fontSize: mobile ? 15 : 13.5, fontWeight: 800, color: C.ink, letterSpacing: '-0.02em' }}>{label}</span>
      {desc != null ? <span style={{ fontSize: 12, color: C.faint, lineHeight: 1.35 }}>{desc}</span> : null}
    </button>
  );
}

/** 2열 액션 그리드. */
export function ActionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: SPACE_M,
    }}>
      {children}
    </div>
  );
}

export type MessageVariant = 'info' | 'success' | 'warning' | 'danger';
export function Message({ variant = 'info', children }: { variant?: MessageVariant; children: React.ReactNode }) {
  const palette: Record<MessageVariant, { bg: string; border: string; color: string }> = {
    info: { bg: 'var(--blue-bg)', border: 'var(--blue-border)', color: 'var(--blue-text)' },
    success: { bg: 'var(--green-bg)', border: 'var(--green-border)', color: 'var(--green-text)' },
    warning: { bg: 'var(--amber-bg)', border: 'var(--amber-border)', color: 'var(--amber-text)' },
    danger: { bg: 'var(--red-bg)', border: 'var(--red-border)', color: 'var(--red-text)' },
  };
  const p = palette[variant];
  return (
    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: R, border: `1px solid ${p.border}`, background: p.bg, color: p.color, fontSize: 13, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

/* 상태/라벨 — 각진 플랫 태그. 이슈 종류별로 구분되게 8색(기업톤, 알록달록 아님). */
export type BadgeTone = 'gray' | 'green' | 'red' | 'amber' | 'blue' | 'orange' | 'purple' | 'teal';
/* [글자, 배경, 테두리] — globals.css의 --{tone}-text/-bg/-border 삼종. 테마 5종 + 다크에서 함께 스왑된다. */
const BADGE: Record<BadgeTone, [string, string, string]> = {
  gray: ['var(--zinc-text)', 'var(--zinc-bg)', 'var(--zinc-border)'],
  green: ['var(--green-text)', 'var(--green-bg)', 'var(--green-border)'],
  red: ['var(--red-text)', 'var(--red-bg)', 'var(--red-border)'],
  amber: ['var(--amber-text)', 'var(--amber-bg)', 'var(--amber-border)'],
  blue: ['var(--blue-text)', 'var(--blue-bg)', 'var(--blue-border)'],
  orange: ['var(--orange-text)', 'var(--orange-bg)', 'var(--orange-border)'],
  purple: ['var(--purple-text)', 'var(--purple-bg)', 'var(--purple-border)'],
  teal: ['var(--teal-text)', 'var(--teal-bg)', 'var(--teal-border)'],
};
export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: BadgeTone }) {
  const mobile = useIsMobile();
  const m = BADGE[tone] || BADGE.gray;
  return <span style={{ display: 'inline-flex', alignItems: 'center', height: mobile ? 22 : 18, boxSizing: 'border-box', fontSize: mobile ? 11.5 : 10.5, fontWeight: 700, padding: mobile ? '0 8px' : '0 6px', borderRadius: 'var(--radius-badge)', color: m[0], background: m[1], border: `1px solid ${m[2]}`, whiteSpace: 'nowrap', letterSpacing: '.01em', lineHeight: 1 }}>{children}</span>;
}
// 회사(법인) 뱃지 = 아웃라인 + 색점. 상태 뱃지(채움형)와 스타일로 확실히 구분 — 색이 겹쳐도 정체성 vs 상태 안 헷갈림.
export function CompanyBadge({ co }: { co: string }) {
  const mobile = useIsMobile();
  const m = BADGE[companyTone(co)] || BADGE.gray;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: mobile ? 22 : 18, boxSizing: 'border-box', padding: mobile ? '0 8px 0 6px' : '0 6px 0 5px', borderRadius: 'var(--radius-badge)', border: `1px solid ${m[2]}`, background: C.card, color: m[0], fontSize: mobile ? 11.5 : 10.5, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1 }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: m[0], flex: '0 0 auto' }} />{companyShort(co)}
  </span>;
}

/* 상태 = 점(dot) + 텍스트. pill 남발 대신 절제된 기업형 상태표시. */
type Tone = 'gray' | 'green' | 'red' | 'amber' | 'blue';
export function Status({ label, tone = 'gray' }: { label: React.ReactNode; tone?: Tone }) {
  const dot = { gray: C.faint, green: C.ok, red: C.danger, amber: C.warn, blue: C.accent }[tone];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.ink, whiteSpace: 'nowrap' }}>
    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flex: '0 0 7px' }} />{label}
  </span>;
}

/* ── 상태·이슈 어휘 SSOT — 전 페이지가 같은 색·라벨을 쓴다(통일) ── */
export const STATUS_TONE: Record<string, Tone> = {
  운행: 'green', 대기: 'blue', 반납: 'gray', 해지: 'gray', 채권: 'red',
  구매대기: 'gray', 등록대기: 'gray', 상품화: 'blue', 상품대기: 'blue',
  연장대기: 'amber', 종료대기: 'amber', 휴차: 'gray', 정비: 'amber', 사고: 'amber',
  매각대기: 'gray', 매각: 'gray', 말소: 'gray',
};
/** 계약/차량 상태 — 어디서나 동일한 점+색. */
export function StatusTag({ value }: { value: unknown }) {
  const s = String(value || '');
  return s ? <Status label={s} tone={STATUS_TONE[s] || 'gray'} /> : <span style={{ color: C.faint }}>—</span>;
}

export const RISK_TONE: Record<string, Tone> = {
  미수: 'red', 보험불일치: 'red', 반납지남: 'amber', 필수누락: 'red',
  보험만료: 'red', 보험임박: 'amber', 검사만료: 'red', 검사임박: 'amber',
  plate고아: 'amber', 날짜역전: 'red', 위반: 'amber', 사고: 'red',
};
/** 리스크/이슈 구분 — 어디서나 동일한 뱃지 색. */
export function RiskTag({ kind }: { kind: string }) {
  return <Badge tone={RISK_TONE[kind] || 'gray'}>{kind}</Badge>;
}
/** 위험도(위험/주의). */
export function SevTag({ high }: { high: boolean }) {
  return <Badge tone={high ? 'red' : 'amber'}>{high ? '위험' : '주의'}</Badge>;
}
