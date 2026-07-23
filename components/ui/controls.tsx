'use client';
import React from 'react';
import { Search as SearchIcon, ChevronLeft, ChevronRight, Building2, ChevronDown, Check } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import {
  C, R, SH, fieldStyle, selectStyle, toggleStyle, SPACE_M,
  ctrlH, ctrlFs, ctrlInputFs, ctrlChipH, type CtrlSize,
} from './tokens';
import { Drawer } from './overlays';
import { type Period, PERIODS, periodRange, shiftPeriod, periodTitle } from '@/lib/finance/period';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { ALL_COMPANIES, COMPANIES, companyLabel, companyShort } from '@/lib/companies';

/* 입력·버튼·탭·칩 — 인터랙션 컨트롤 원자. 높이·폰트 = CTRL (ERP4 동기). */

// 회사(법인) 필터 — 셸 툴바 SSOT. 웹32 · 모바일40.
export function CompanyFilter() {
  const { companyId, setCompanyId, isOperator } = useSession();
  const mobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  if (!isOperator) {
    return <span style={{ fontSize: mobile ? 16 : 13, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>{companyLabel(companyId)}</span>;
  }
  const trigger =
    companyId === ALL_COMPANIES ? (mobile ? '전체' : '전체 회사')
      : mobile ? companyShort(companyId) : companyLabel(companyId);
  const options = [ALL_COMPANIES, ...COMPANIES];
  const pick = (c: string) => { haptic.tap(); setCompanyId(c); setOpen(false); };
  const h = ctrlH(mobile);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" data-ui="action" onClick={() => { haptic.tap(); setOpen((o) => !o); }} title="보는 회사"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, boxSizing: 'border-box', padding: mobile ? '0 14px' : '0 11px', border: `1px solid ${C.line}`, borderRadius: R, background: C.card, cursor: 'pointer', fontSize: ctrlFs(mobile), fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: SH.rest, WebkitTapHighlightColor: 'transparent' }}>
        <Building2 size={mobile ? 16 : 14} color={C.mute} style={{ flexShrink: 0 }} />
        {trigger}
        <ChevronDown size={mobile ? 15 : 13} color={C.mute} style={{ flexShrink: 0 }} />
      </button>
      {open && mobile && (
        <Drawer title="회사 선택" onClose={() => setOpen(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {options.map((c) => {
              const on = companyId === c;
              return (
                <button key={c} type="button" onClick={() => pick(c)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 48, padding: '12px 4px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: `1px solid var(--border-soft)`, WebkitTapHighlightColor: 'transparent' }}>
                  <span style={{ width: 18, flexShrink: 0 }}>{on ? <Check size={16} color={C.accent} /> : null}</span>
                  <span style={{ fontSize: 16, fontWeight: on ? 800 : 600, color: C.ink }}>{c === ALL_COMPANIES ? '전체 (모든 회사)' : companyLabel(c)}</span>
                </button>
              );
            })}
          </div>
        </Drawer>
      )}
      {open && !mobile && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', minWidth: 200, background: C.card, border: `1px solid ${C.line}`, borderRadius: R, boxShadow: SH.pop, zIndex: 45, overflow: 'hidden' }}>
            {options.map((c) => (
              <button key={c} type="button" onClick={() => pick(c)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: C.ink, textAlign: 'left', whiteSpace: 'nowrap' }}>
                <span style={{ width: 14, flexShrink: 0 }}>{companyId === c && <Check size={13} color={C.accent} />}</span>
                {c === ALL_COMPANIES ? '전체 (모든 회사)' : companyLabel(c)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// PillTabs — 룩=toggleStyle. 모바일=CTRL.md(40)+16px (ERP4). lg는 위저드 CTA만.
export function PillTabs<T extends string>({ tabs, value, onChange, size = 'md' }: { tabs: { key: T; label: React.ReactNode; title?: string; badge?: number }[]; value: T; onChange: (k: T) => void; size?: 'sm' | 'md' | 'lg' }) {
  const mobile = useIsMobile();
  const s: 'sm' | 'md' | 'lg' = size === 'lg' ? 'lg' : (size === 'sm' ? 'sm' : 'md');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
      {tabs.map((t) => {
        // 뱃지 = 그 탭에 «쌓여 있는 건수». 0이면 안 붙인다 — 0을 보여주면 없는 일도 있는 것처럼 읽힌다.
        const n = t.badge && t.badge > 0 ? t.badge : 0;
        return (
          <button key={t.key} type="button" data-ui="toggle" aria-pressed={value === t.key} onClick={() => onChange(t.key)}
            title={t.title} style={{ ...toggleStyle(value === t.key, s, mobile), position: 'relative', overflow: 'visible' }}>
            {t.label}
            {n > 0 && (
              <span aria-label={`${n}건`} style={{
                position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 999, background: C.danger, color: C.inverse, boxSizing: 'border-box',
                fontSize: 10, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
                fontVariantNumeric: 'tabular-nums', boxShadow: `0 0 0 2px ${C.bg}`,
              }}>{n > 99 ? '99+' : n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 아이콘 세그먼트 (= ERP4 IconSeg) — 보기 모드 전환 SSOT.
 *   카드 ↔ 엑셀 같은 «같은 데이터, 다른 표현» 전환에만 쓴다. 자리는 검색창 오른쪽(WorkbenchBar view).
 *   ⚠ 이걸 페이지에서 손롤하지 말 것 — 화면마다 다른 토글이 생기는 게 원래 금지된 것이고,
 *     원자 하나를 공유하는 건 그 금지의 취지에 맞다.
 */
export function IconSeg<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T; onChange: (k: T) => void;
  options: { key: T; label: string; icon: React.ReactNode }[];
  size?: CtrlSize;
}) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile, size);
  return (
    <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', flexShrink: 0 }}>
      {options.map((o, i) => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => onChange(o.key)} title={o.label} aria-label={o.label} aria-pressed={on}
            style={{
              height: h, width: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: 'none', borderLeft: i ? `1px solid ${C.line}` : 'none',
              background: on ? C.brand : C.taupeBg, color: on ? C.inverse : C.mute, padding: 0,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}

/* 다중선택 필터칩 — FacetRail·ToggleChips SSOT (= ERP4). 웹28 · 모바일40. */
export function ToggleChips<T extends string>({ selected, onToggle, options, size = 'md' }: { selected: Set<T>; onToggle: (v: T) => void; options: { key: T; label: string; count?: number }[]; size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  const h = ctrlChipH(mobile);
  const fs = ctrlFs(mobile, size);
  const pad = mobile ? '0 18px' : (size === 'sm' ? '0 11px' : '0 12px');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
      {options.map((o) => {
        const on = selected.has(o.key);
        return (
          <button key={o.key} type="button" data-ui="toggle" onClick={() => { haptic.select(); onToggle(o.key); }} aria-pressed={on}
            style={{ display: 'inline-flex', alignItems: 'center', height: h, boxSizing: 'border-box', padding: pad, fontSize: fs, fontWeight: on ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, borderRadius: R, border: `1px solid ${on ? C.brand : C.taupeLine}`, background: on ? C.brand : C.taupeBg, color: on ? C.inverse : C.mute, lineHeight: 1, WebkitTapHighlightColor: 'transparent' }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* 퀵필터 — 단일선택. 칩 높이 = ctrlChipH (웹28 · 모바일40). */
export type ChipOpt<T extends string> = { key: T; label: string; count?: number };
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: ChipOpt<T>[] }) {
  const mobile = useIsMobile();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6, marginTop: 0 }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" data-ui="toggle" onClick={() => { haptic.select(); onChange(o.key); }} aria-pressed={active} style={toggleStyle(active, 'sm', mobile)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 정사각 아이콘 버튼 — 모바일 필터·툴바 (= ERP4 IconBtn). */
export function IconBtn({ children, onClick, title, active, disabled }: { children: React.ReactNode; onClick?: () => void; title?: string; active?: boolean; disabled?: boolean }) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile);
  return (
    <button type="button" data-ui="action" onClick={onClick ? () => { haptic.tap(); onClick(); } : undefined} disabled={disabled} title={title} aria-label={title} aria-pressed={active || undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        height: h, width: h, boxSizing: 'border-box', padding: 0, borderRadius: R,
        border: `1px solid ${active ? C.brand : C.line}`,
        background: active ? C.brand : C.taupeBg, color: active ? C.inverse : C.mute,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        WebkitTapHighlightColor: 'transparent', flexShrink: 0,
      }}>
      {children}
    </button>
  );
}

export function Btn({ children, onClick, variant = 'solid', size = 'md', disabled, href, block }: { children: React.ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; href?: string; block?: boolean }) {
  const mobile = useIsMobile();
  const lg = size === 'lg'; // 현장 위저드 푸터(터치 48) — ERP4엔 없고 renman 유지
  const cs: CtrlSize = size === 'sm' ? 'sm' : 'md';
  const h = lg ? 48 : ctrlH(mobile, cs);
  const fs = lg ? 15 : ctrlFs(mobile, cs);
  const pad = lg ? '0 18px' : mobile ? '0 18px' : (size === 'sm' ? '0 11px' : '0 14px');
  const s: React.CSSProperties = {
    height: h, boxSizing: 'border-box', padding: pad, borderRadius: R,
    fontWeight: lg || mobile ? 700 : 600, fontSize: fs, letterSpacing: '-0.01em', lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: `1px solid ${disabled ? C.line : variant === 'solid' ? C.brand : variant === 'danger' ? 'var(--red-border)' : C.line}`,
    background: variant === 'solid' ? (disabled ? C.line : C.brand) : C.taupeBg,
    color: variant === 'solid' ? C.inverse : variant === 'danger' ? 'var(--red-text)' : C.ink,
    boxShadow: disabled ? 'none' : variant === 'solid' ? SH.card : SH.rest,
    textDecoration: 'none', display: block ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap',
    width: block ? '100%' : undefined,
    transition: 'filter .12s ease, box-shadow .12s ease',
    pointerEvents: disabled ? 'none' : 'auto',
  };
  return href ? <a href={href} data-ui="action" data-clickable="" style={s}>{children}</a> : <button type="button" data-ui="action" onClick={onClick ? () => { haptic.tap(); onClick(); } : undefined} disabled={disabled} style={{ ...s, WebkitTapHighlightColor: 'transparent' }}>{children}</button>;
}

export function Input({ size = 'md', style, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return <input {...rest} style={{ ...fieldStyle(size === 'sm', mobile), ...style }} />;
}
export function Select({ size = 'md', style, children, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return <select {...rest} style={{ ...selectStyle(size === 'sm', mobile), ...style }}>{children}</select>;
}

export function PeriodBar({ latest, initial = '월간', onRange }: { latest?: string; initial?: Period; onRange: (r: { from: string; to: string }) => void }) {
  const mobile = useIsMobile();
  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [period, setPeriod] = React.useState<Period>(initial);
  const [ref, setRef] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const refDate = ref ?? latest ?? today;
  const range = custom ?? periodRange(refDate, period);
  const isAll = !custom && period === '전체';
  const canNav = !custom && period !== '전체';
  const onRangeRef = React.useRef(onRange); onRangeRef.current = onRange;
  React.useEffect(() => { onRangeRef.current(range); }, [range.from, range.to]);
  const nh = ctrlH(mobile);
  const nav: React.CSSProperties = { height: nh, width: nh, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: R, background: C.card, cursor: 'pointer', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: mobile ? SPACE_M : 8, flexWrap: 'wrap' }}>
      <Select size="md" value={custom ? '직접' : period}
        onChange={(e) => { const v = e.target.value; if (v === '직접') setCustom({ from: range.from || refDate, to: range.to || refDate }); else { setCustom(null); setPeriod(v as Period); setRef(null); } }}>
        {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="직접">기간 지정</option>
      </Select>
      {custom ? (
        <>
          <Input size="md" type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ from: e.target.value, to: c?.to || e.target.value }))} />
          <span style={{ color: C.faint }}>~</span>
          <Input size="md" type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ from: c?.from || e.target.value, to: e.target.value }))} />
        </>
      ) : isAll ? (
        <span style={{ fontSize: ctrlFs(mobile), fontWeight: 700, color: C.ink }}>전체 기간</span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, -1))} aria-label="이전 기간"><ChevronLeft size={mobile ? 18 : 16} /></button>
          <span style={{ fontSize: ctrlFs(mobile), fontWeight: 700, color: C.ink, minWidth: 104, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{periodTitle(refDate, period)}</span>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, 1))} aria-label="다음 기간"><ChevronRight size={mobile ? 18 : 16} /></button>
          <button type="button" onClick={() => setRef(today)} title="오늘이 포함된 기간으로" style={{ height: nh, boxSizing: 'border-box', padding: '0 11px', marginLeft: 5, border: `1px solid ${C.line}`, borderRadius: R, background: C.taupeBg, cursor: 'pointer', color: C.mute, fontSize: mobile ? 14 : 12, fontWeight: 700, flexShrink: 0 }}>오늘</button>
        </span>
      )}
    </div>
  );
}

/** 표·카드 안 인라인 링크 버튼 — 번호판·임차인·EmptyState CTA. 손롤 `<button style>` 금지. */
export type TextLinkTone = 'accent' | 'ink' | 'ok';
export function TextLink({
  onClick, children, mono, stop, tone = 'accent', disabled, style, title,
}: {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  mono?: boolean;
  /** 행 onClick과 겹칠 때 stopPropagation */
  stop?: boolean;
  tone?: TextLinkTone;
  disabled?: boolean;
  style?: React.CSSProperties;
  title?: string;
}) {
  const color = disabled ? C.mute : tone === 'ink' ? C.ink : tone === 'ok' ? C.ok : C.accent;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      data-ui="action"
      onClick={(e) => { if (stop) e.stopPropagation(); onClick?.(e); }}
      style={{
        border: 'none', background: 'none', padding: 0, margin: 0,
        cursor: disabled ? 'default' : 'pointer',
        color, fontWeight: 700, font: 'inherit', textAlign: 'left',
        fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        fontVariantNumeric: mono ? 'tabular-nums' : undefined,
        WebkitTapHighlightColor: 'transparent',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Search({ size = 'md', style, wrapStyle, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md'; wrapStyle?: React.CSSProperties }) {
  const mobile = useIsMobile();
  const cs: CtrlSize = size === 'sm' ? 'sm' : 'md';
  const h = ctrlH(mobile, cs);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: h, boxSizing: 'border-box', padding: mobile ? '0 12px' : '0 10px', border: `1px solid ${C.line}`, borderRadius: R, background: C.card, ...wrapStyle }}>
      <SearchIcon size={mobile ? 16 : 14} color={C.faint} style={{ flexShrink: 0 }} />
      <input {...rest} style={{ flex: 1, border: 'none', outline: 'none', fontSize: ctrlInputFs(mobile, cs), background: 'transparent', color: C.ink, minWidth: 0, fontFamily: 'inherit', ...style }} />
    </div>
  );
}
