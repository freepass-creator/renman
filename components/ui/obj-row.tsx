'use client';
/**
 * ObjRow + Rows — 훑는 동종 목록의 키스톤 원자 (통일 규격 설계서 §2).
 *   jpkerp5 ContractListItem 해부 → renman 토큰 번역. grouped ObjCard 목록의 대체재.
 *   규칙: 행마다 박스 금지 — 테두리·radius·bg는 Rows 컨테이너 전유, 행은 헤어라인 구분.
 *         레일 3px 솔리드(RailTone, none=렌더 생략). 행 안 버튼·input 금지(행동=드릴인/패널).
 *   드릴인: ObjRow는 라우팅 무지. 호출부가 onClick={() => openCar(plate)} — 자산360.
 */
import React from 'react';
import { ChevronRight, ChevronDown, Check } from 'lucide-react';
import { C, NUM, R } from './tokens';
import { Badge, CompanyBadge, type BadgeTone, type RailTone } from './misc';
import { useIsMobile } from '@/lib/use-mobile';

// 레일 솔리드 색 — ObjCard의 유령레일(opacity)과 달리 항상 불투명. 전부 C 토큰.
const RAIL_C: Record<Exclude<RailTone, 'none'>, string> = {
  brand: C.brand, danger: C.danger, violet: C.violet, warn: C.warn, ok: C.ok, mute: C.faint,
};
// Rows 그룹헤더 톤 — Badge와 같은 --{tone}-text/-bg 브릿지(gray=zinc).
const HEAD_TONE: Record<BadgeTone, [string, string]> = {
  gray: ['var(--zinc-text)', 'var(--zinc-bg)'], green: ['var(--green-text)', 'var(--green-bg)'],
  red: ['var(--red-text)', 'var(--red-bg)'], amber: ['var(--amber-text)', 'var(--amber-bg)'],
  blue: ['var(--blue-text)', 'var(--blue-bg)'], orange: ['var(--orange-text)', 'var(--orange-bg)'],
  purple: ['var(--purple-text)', 'var(--purple-bg)'], teal: ['var(--teal-text)', 'var(--teal-bg)'],
};
const CAP = 3; // 2행 fields 표시 상한 → ＋n

function useHover() {
  const [h, setH] = React.useState(false);
  return { h, on: { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) } };
}

export interface ObjRowProps {
  rail?: RailTone;                     // 좌측 3px 상태띠 (기본 none=미렌더)
  co?: string;                         // CompanyBadge
  plate?: string;                      // 차번 앵커(모노·무잘림)
  name?: React.ReactNode;              // 비차량 주체 앵커 (plate 없을 때)
  badge?: React.ReactNode; badgeTone?: BadgeTone;
  meta?: React.ReactNode;              // 1행 보조(차종·고객명)
  sub?: React.ReactNode;               // 2행 자유문 (fields보다 우선)
  fields?: [React.ReactNode, React.ReactNode][];   // 2행 라벨·값 (상한 3 + ＋n)
  right?: React.ReactNode;             // 우측 수치(모노)
  rightTone?: 'ink' | 'danger' | 'ok' | 'warn';    // 미수>0 = danger
  onClick?: () => void;                // 드릴인 (있으면 체브론 렌더)
  selectable?: boolean; selected?: boolean; onToggle?: () => void;  // bulk 선택(행동 아님)
}

export function ObjRow({
  rail = 'none', co, plate, name, badge, badgeTone = 'gray', meta, sub, fields,
  right, rightTone = 'ink', onClick, selectable, selected, onToggle,
}: ObjRowProps) {
  const mobile = useIsMobile();
  const { h, on } = useHover();
  const rc = rightTone === 'danger' ? C.danger : rightTone === 'ok' ? C.ok : rightTone === 'warn' ? C.warn : C.ink;
  const usingFields = sub == null && !!fields && fields.length > 0;
  const shown = usingFields ? fields!.slice(0, CAP) : [];
  const moreN = usingFields ? fields!.length - shown.length : 0;
  const anchor = plate != null
    ? <span style={{ flex: '0 0 auto', whiteSpace: 'nowrap', fontFamily: NUM, fontSize: mobile ? 14 : 13, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink }}>{plate}</span>
    : name != null
      ? <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 14 : 13, fontWeight: 700, color: C.ink }}>{name}</span>
      : null;
  const kb = onClick ? {
    role: 'button', tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } },
  } : {};
  return (
    <div onClick={onClick} {...on} {...kb} style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
      minHeight: mobile ? 52 : 44, padding: mobile ? '8px 14px' : '6px 12px 6px 14px',
      background: h && !!onClick ? C.hover : 'transparent',
      cursor: onClick ? 'pointer' : 'default', transition: 'background .12s ease',
      WebkitTapHighlightColor: 'transparent',
    }}>
      {rail !== 'none' && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: RAIL_C[rail] }} />}
      {selectable && (
        <span onClick={(e) => { e.stopPropagation(); onToggle?.(); }} style={{
          flex: '0 0 auto', width: 18, height: 18, borderRadius: 4,
          border: `1.5px solid ${selected ? C.brand : C.line}`, background: selected ? C.brand : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>{selected && <Check size={12} strokeWidth={3} color={C.inverse} />}</span>
      )}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, overflow: 'hidden' }}>
          {co ? <span style={{ flex: '0 0 auto' }}><CompanyBadge co={co} /></span> : null}
          {badge != null && <span style={{ flex: '0 0 auto' }}><Badge tone={badgeTone}>{badge}</Badge></span>}
          {anchor}
          {meta != null && <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 12.5 : 12, color: C.mute }}>{meta}</span>}
        </div>
        {(sub != null || usingFields) && (usingFields
          ? <div style={{ display: 'flex', alignItems: 'baseline', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', marginTop: 2, fontSize: mobile ? 12 : 11.5, color: C.faint }}>
              {shown.map(([l, v], i) => <span key={i} style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}>{l != null && <span style={{ color: C.mute }}>{l} </span>}<span style={{ color: C.ink, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{v}</span>{i < shown.length - 1 && <span style={{ color: C.faint, margin: '0 5px' }}>·</span>}</span>)}
              {moreN > 0 && <span style={{ flex: '0 0 auto', color: C.faint, marginLeft: 6 }}>＋{moreN}</span>}
            </div>
          : <div style={{ marginTop: 2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: mobile ? 12 : 11.5, color: C.faint }}>{sub}</div>
        )}
      </div>
      {right != null && <div style={{ flex: '0 0 auto', fontFamily: NUM, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: mobile ? 13.5 : 12.5, whiteSpace: 'nowrap', color: rc }}>{right}</div>}
      {onClick && <ChevronRight size={14} strokeWidth={2.5} style={{ flexShrink: 0, color: C.faint }} />}
    </div>
  );
}

export function Rows({ title, tone = 'gray', n, right, collapsible, defaultOpen = true, id, children }: {
  title?: React.ReactNode;    // 그룹헤더 라벨 (생략 시 헤더 없는 민박스)
  tone?: BadgeTone;           // 헤더 톤
  n?: number;                 // 건수
  right?: React.ReactNode;    // 헤더 우측 = TextLink '더보기' 전용
  collapsible?: boolean;      // 헤더 탭 → 접기/펴기 (제목 있을 때만)
  defaultOpen?: boolean;      // 기본 펼침
  id?: string;                // 접힘 상태 기억 키 (없으면 제목 문자열)
  children: React.ReactNode;  // ObjRow[]
}) {
  const mobile = useIsMobile();
  const items = React.Children.toArray(children);
  const hasHead = title != null;
  const ht = HEAD_TONE[tone] || HEAD_TONE.gray;
  const canCollapse = !!collapsible && hasHead;
  const storeKey = canCollapse ? `jpk:mrows:${id ?? (typeof title === 'string' ? title : '')}` : '';
  const [open, setOpen] = React.useState(defaultOpen);
  React.useEffect(() => {
    if (!storeKey) return;
    try { const v = localStorage.getItem(storeKey); if (v != null) setOpen(v === '1'); } catch { /* noop */ }
  }, [storeKey]);
  const toggle = () => setOpen((o) => {
    const nv = !o;
    try { if (storeKey) localStorage.setItem(storeKey, nv ? '1' : '0'); } catch { /* noop */ }
    return nv;
  });

  const head = hasHead && (
    <div
      {...(canCollapse ? { role: 'button', tabIndex: 0, 'aria-expanded': open, onClick: toggle, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } } : {})}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, minHeight: mobile ? 36 : 30,
        padding: mobile ? '0 14px' : '0 12px', fontSize: mobile ? 12 : 11.5, fontWeight: 700,
        borderBottom: open ? `1px solid ${C.line2}` : undefined,
        background: tone === 'gray' ? C.head : ht[1], color: tone === 'gray' ? C.mute : ht[0],
        cursor: canCollapse ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
      }}>
      <span>{title}</span>
      {n != null && <span style={{ fontFamily: NUM, marginLeft: 2 }}>{n}</span>}
      {right != null && <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{right}</span>}
      {canCollapse && <ChevronDown size={15} style={{ marginLeft: right != null ? 6 : 'auto', flexShrink: 0, transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s ease' }} />}
    </div>
  );

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: R, background: C.card, overflow: 'hidden' }}>
      {head}
      {(!canCollapse || open) && items.map((child, i) => (
        <div key={i} style={{ borderTop: i > 0 ? `1px solid ${C.line2}` : undefined }}>{child}</div>
      ))}
    </div>
  );
}
