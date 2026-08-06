'use client';
import React from 'react';
import { Search as SearchIcon, ChevronLeft, ChevronRight, Building2, ChevronDown, Check, X } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import {
  C, R, SH, fieldStyle, selectStyle, toggleStyle, SPACE_M,
  ctrlH, ctrlFs, ctrlInputFs, type CtrlSize,
} from './tokens';
import { Drawer } from './overlays';
import { type Period, PERIODS, periodRange, shiftPeriod, periodTitle } from '@/lib/finance/period';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { todayKST } from '@/lib/contracts/dates'; // KST 기준 오늘
import { ALL_COMPANIES, COMPANIES, companyLabel, companyShort } from '@/lib/companies';

/* 입력·버튼·탭·칩 — 인터랙션 컨트롤 원자. 높이·폰트 = CTRL (ERP4 동기). */

// 회사(법인) 필터 — 셸 툴바 SSOT. size=md면 웹32 · sm이면 원장 필터줄(28)과 맞춤.
export function CompanyFilter({ size = 'md' }: { size?: 'sm' | 'md' }) {
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
  const cs: CtrlSize = size === 'sm' ? 'sm' : 'md';
  const h = ctrlH(mobile, cs);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" data-ui="action" onClick={() => { haptic.tap(); setOpen((o) => !o); }} title="보는 회사"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, boxSizing: 'border-box', padding: mobile ? '0 14px' : (size === 'sm' ? '0 10px' : '0 11px'), border: `1px solid ${C.line}`, borderRadius: R, background: C.card, cursor: 'pointer', fontSize: ctrlFs(mobile, cs), fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: SH.rest, WebkitTapHighlightColor: 'transparent' }}>
        <Building2 size={mobile ? 16 : (size === 'sm' ? 13 : 14)} color={C.mute} style={{ flexShrink: 0 }} />
        {trigger}
        <ChevronDown size={mobile ? 15 : (size === 'sm' ? 12 : 13)} color={C.mute} style={{ flexShrink: 0 }} />
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

/** 칩·탭 카운트 톤 — 급한 것만 danger/warn, 기본 mute(중립 회색). */
export type ChipCountTone = 'danger' | 'warn' | 'mute';

// PillTabs — 룩=toggleStyle. 모바일=CTRL.md(40)+16px (ERP4). lg는 위저드 CTA만.
export function PillTabs<T extends string>({ tabs, value, onChange, size = 'md' }: {
  tabs: { key: T; label: React.ReactNode; title?: string; badge?: number; badgeTone?: ChipCountTone; disabled?: boolean }[];
  value: T;
  onChange: (k: T) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const mobile = useIsMobile();
  const s: 'sm' | 'md' | 'lg' = size === 'lg' ? 'lg' : (size === 'sm' ? 'sm' : 'md');
  return (
    <div role="group" style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
      {tabs.map((t) => {
        // 뱃지 = 그 탭에 «쌓여 있는 건수». 0이면 안 붙인다 — 0을 보여주면 없는 일도 있는 것처럼 읽힌다.
        const n = t.badge && t.badge > 0 ? t.badge : 0;
        const tone = t.badgeTone || 'mute';
        const badgeBg = tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : 'var(--zinc-text)';
        return (
          <button key={t.key} type="button" data-ui="toggle" aria-pressed={value === t.key} disabled={t.disabled} onClick={() => { haptic.select(); onChange(t.key); }}
            title={t.title} style={{ ...toggleStyle(value === t.key, s, mobile), position: 'relative', overflow: 'visible', ...(t.disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null) }}>
            {t.label}
            {n > 0 && (
              <span aria-label={`${n}건`} style={{
                position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 'var(--radius-badge)', background: badgeBg, color: C.inverse, boxSizing: 'border-box',
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
export function IconSeg<T extends string>({ value, onChange, options, size = 'md', showLabels = false }: {
  value: T; onChange: (k: T) => void;
  options: { key: T; label: string; icon: React.ReactNode }[];
  size?: CtrlSize;
  showLabels?: boolean;
}) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile, size);
  return (
    <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', flexShrink: 0 }}>
      {options.map((o, i) => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" onClick={() => { haptic.select(); onChange(o.key); }} title={o.label} aria-label={o.label} aria-pressed={on}
            style={{
              height: h, width: showLabels ? 'auto' : h, minWidth: h, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: showLabels ? 6 : 0,
              cursor: 'pointer', border: 'none', borderLeft: i ? `1px solid ${C.line}` : 'none',
              background: on ? C.brand : C.taupeBg, color: on ? C.inverse : C.mute, padding: showLabels ? '0 12px' : 0,
              WebkitTapHighlightColor: 'transparent',
            }}>
            {o.icon}
            {showLabels ? <span style={{ fontSize: mobile ? 13 : 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{o.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* 다중선택 필터칩 — FacetRail·ToggleChips SSOT (= ERP4). 높이=칩(sm). size는 API 호환용. */
export function ToggleChips<T extends string>({ selected, onToggle, options, size: _size = 'md' }: { selected: Set<T>; onToggle: (v: T) => void; options: { key: T; label: string; count?: number }[]; size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? 8 : 6 }}>
      {options.map((o) => {
        const on = selected.has(o.key);
        return (
          <button key={o.key} type="button" data-ui="toggle" onClick={() => { haptic.select(); onToggle(o.key); }} aria-pressed={on}
            style={toggleStyle(on, 'sm', mobile)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* 퀵필터 — 단일선택 칩. 칩 높이 = ctrlChipH (웹28 · 모바일40).
 *   allowOff: 활성 재클릭 → null (원장 빠른필터).
 *   count: 우측 상단 뱃지. countTone: 급한 것만 danger/warn, 기본=중립 회색. */
export type ChipOpt<T extends string> = { key: T; label: React.ReactNode; count?: number; countTone?: ChipCountTone };
export function FilterChips<T extends string>({
  value, onChange, options, allowOff = false,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: ChipOpt<T>[];
  allowOff?: boolean;
}) {
  const mobile = useIsMobile();
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: mobile ? 8 : 6, alignItems: 'center' }} role="group">
      {options.map((o) => {
        const active = value === o.key;
        const badge = o.count != null && o.count > 0;
        const tone = o.countTone || 'mute';
        const badgeBg = tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : 'var(--zinc-text)';
        return (
          <button
            key={o.key}
            type="button"
            data-ui="toggle"
            onClick={() => {
              haptic.select();
              if (active && allowOff) onChange(null);
              else onChange(o.key);
            }}
            aria-pressed={active}
            style={{
              ...toggleStyle(active, 'sm', mobile),
              position: badge ? 'relative' : undefined,
              overflow: badge ? 'visible' : undefined,
            }}
          >
            {o.label}
            {badge && (
              <span style={{
                position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
                borderRadius: 'var(--radius-badge)', background: badgeBg, color: C.inverse, boxSizing: 'border-box',
                fontSize: 10, fontWeight: 800, lineHeight: '15px', textAlign: 'center',
                fontVariantNumeric: 'tabular-nums', boxShadow: `0 0 0 2px ${C.bg}`,
              }}>{o.count! > 99 ? '99+' : o.count}</span>
            )}
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

export function Btn({
  children, onClick, variant = 'solid', size = 'md', disabled, href, block,
  tip, iconOnly = false, 'aria-pressed': ariaPressed,
  'aria-haspopup': ariaHasPopup, 'aria-expanded': ariaExpanded, 'aria-controls': ariaControls,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'solid' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  href?: string;
  block?: boolean;
  /** hover/long-press 설명 · aria-label. iconOnly면 필수에 가깝게. */
  tip?: string;
  /** 정사각 아이콘만 — tools/ghost 반복액션. tip으로 설명. */
  iconOnly?: boolean;
  'aria-pressed'?: boolean;
  'aria-haspopup'?: React.AriaAttributes['aria-haspopup'];
  'aria-expanded'?: boolean;
  'aria-controls'?: string;
}) {
  const mobile = useIsMobile();
  const lg = size === 'lg'; // 현장 위저드 푸터(터치 48) — ERP4엔 없고 renman 유지
  const cs: CtrlSize = size === 'sm' ? 'sm' : 'md';
  const h = lg ? 48 : ctrlH(mobile, cs);
  const fs = lg ? 15 : ctrlFs(mobile, cs);
  const pad = iconOnly ? 0 : (lg ? '0 18px' : mobile ? '0 18px' : (size === 'sm' ? '0 11px' : '0 14px'));
  const s: React.CSSProperties = {
    height: h, width: iconOnly ? h : (block ? '100%' : undefined), boxSizing: 'border-box', padding: pad, borderRadius: R,
    fontWeight: lg || mobile ? 700 : 600, fontSize: fs, letterSpacing: '-0.01em', lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: `1px solid ${disabled ? C.line : variant === 'solid' ? C.brand : variant === 'danger' ? 'var(--red-border)' : C.line}`,
    background: variant === 'solid' ? (disabled ? C.line : C.brand) : C.taupeBg,
    color: variant === 'solid' ? C.inverse : variant === 'danger' ? 'var(--red-text)' : C.ink,
    boxShadow: disabled ? 'none' : variant === 'solid' ? SH.card : SH.rest,
    textDecoration: 'none', display: block ? 'flex' : 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: iconOnly ? 0 : 6, whiteSpace: 'nowrap',
    transition: 'filter .12s ease, box-shadow .12s ease',
    pointerEvents: disabled ? 'none' : 'auto',
    flexShrink: 0,
  };
  const label = tip || undefined;
  if (href) {
    return (
      <a href={href} data-ui="action" data-clickable="" title={label} aria-label={label} style={s}>
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      data-ui="action"
      title={label}
      aria-label={label}
      aria-pressed={ariaPressed}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      onClick={onClick ? () => { haptic.tap(); onClick(); } : undefined}
      disabled={disabled}
      style={{ ...s, WebkitTapHighlightColor: 'transparent' }}
    >
      {children}
    </button>
  );
}

export function Input({ size = 'md', style, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return <input {...rest} style={{ ...fieldStyle(size === 'sm', mobile), ...style }} />;
}
/** 여러 줄 입력 SSOT — Input과 같은 보더·폰트·포커스, 높이만 내용형. */
export function TextArea({ size = 'md', style, ...rest }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return (
    <textarea
      {...rest}
      style={{
        ...fieldStyle(size === 'sm', mobile),
        width: '100%',
        height: 'auto',
        minHeight: mobile ? 96 : 76,
        padding: mobile ? '10px 12px' : size === 'sm' ? '7px 9px' : '8px 10px',
        lineHeight: 1.5,
        resize: 'vertical',
        ...style,
      }}
    />
  );
}
export function Select({ size = 'md', style, children, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  return <select {...rest} style={{ ...selectStyle(size === 'sm', mobile), ...style }}>{children}</select>;
}

/** 표·목록 행 선택 SSOT — 행 클릭과 중복 실행을 막고 모바일 44px 터치 영역을 보장한다. */
export function Checkbox({
  checked, onChange, label, ariaLabel, disabled = false, stop = true,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  /** 클릭 가능한 행 안에서 사용할 때 행 클릭 전파를 막는다. */
  stop?: boolean;
}) {
  const mobile = useIsMobile();
  return (
    <label
      data-ui="checkbox"
      onClick={stop ? (e) => e.stopPropagation() : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: label ? 7 : 0,
        minWidth: mobile ? 44 : 28, minHeight: mobile ? 44 : 28,
        cursor: disabled ? 'not-allowed' : 'pointer', color: C.ink,
        fontSize: mobile ? 14 : 12.5, fontWeight: 600,
        opacity: disabled ? 0.5 : 1, WebkitTapHighlightColor: 'transparent',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
        onChange={(e) => { haptic.select(); onChange(e.target.checked); }}
        style={{
          width: mobile ? 18 : 16, height: mobile ? 18 : 16, margin: 0,
          cursor: disabled ? 'not-allowed' : 'pointer', accentColor: C.brand, flexShrink: 0,
        }}
      />
      {label != null ? <span>{label}</span> : null}
    </label>
  );
}

export function PeriodBar({ latest, initial = '월간', onRange, size = 'md' }: { latest?: string; initial?: Period; onRange: (r: { from: string; to: string }) => void; size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  const today = React.useMemo(() => todayKST(), []);
  const [period, setPeriod] = React.useState<Period>(initial);
  const [ref, setRef] = React.useState<string | null>(null);
  const [custom, setCustom] = React.useState<{ from: string; to: string } | null>(null);
  const latestNotFuture = latest && latest <= today ? latest : today;
  const refDate = ref ?? latestNotFuture;
  const range = custom ?? periodRange(refDate, period);
  const isAll = !custom && period === '전체';
  const canNav = !custom && period !== '전체';
  const onRangeRef = React.useRef(onRange); onRangeRef.current = onRange;
  React.useEffect(() => { onRangeRef.current(range); }, [range.from, range.to]);
  const nh = ctrlH(mobile, size);
  const nav: React.CSSProperties = { height: nh, width: nh, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: R, background: C.card, cursor: 'pointer', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
  return (
    <div className="period-bar" style={{ display: 'inline-flex', alignItems: 'center', gap: mobile ? SPACE_M : 8, flexWrap: 'wrap' }}>
      <Select size={size} value={custom ? '직접' : period}
        onChange={(e) => { const v = e.target.value; if (v === '직접') setCustom({ from: range.from || refDate, to: range.to || refDate }); else { setCustom(null); setPeriod(v as Period); setRef(null); } }}>
        {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
        <option value="직접">기간 지정</option>
      </Select>
      {custom ? (
        <>
          <Input size={size} type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ from: e.target.value, to: c?.to || e.target.value }))} />
          <span style={{ color: C.faint }}>~</span>
          <Input size={size} type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ from: c?.from || e.target.value, to: e.target.value }))} />
        </>
      ) : isAll ? (
        <span style={{ fontSize: ctrlFs(mobile, size), fontWeight: 700, color: C.ink }}>전체 기간</span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, -1))} aria-label="이전 기간"><ChevronLeft size={mobile ? 18 : 16} strokeWidth={2.2} /></button>
          <span style={{ fontSize: ctrlFs(mobile, size), fontWeight: 700, color: C.ink, minWidth: 104, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{periodTitle(refDate, period)}</span>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, 1))} aria-label="다음 기간"><ChevronRight size={mobile ? 18 : 16} strokeWidth={2.2} /></button>
          <button type="button" onClick={() => setRef(today)} title="오늘이 포함된 기간으로" style={{ height: nh, boxSizing: 'border-box', padding: '0 11px', marginLeft: 5, border: `1px solid ${C.line}`, borderRadius: R, background: C.taupeBg, cursor: 'pointer', color: C.mute, fontSize: mobile ? 14 : (size === 'sm' ? 12 : 12), fontWeight: 700, flexShrink: 0 }}>오늘</button>
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
      onClick={(e) => { if (stop) e.stopPropagation(); haptic.tap(); onClick?.(e); }}
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
  const hasValue = rest.value != null && String(rest.value).length > 0;
  const clear = () => {
    haptic.tap();
    const ev = { target: { value: '' }, currentTarget: { value: '' } } as React.ChangeEvent<HTMLInputElement>;
    rest.onChange?.(ev);
  };
  // width 등은 바깥 칸에 — X가 나와도 칸이 안 커짐. input style의 레이아웃만 wrap으로 올림.
  const { width, minWidth, maxWidth, flex, ...inputStyle } = (style || {}) as React.CSSProperties;
  const clearPad = mobile ? 28 : 22;
  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      height: h,
      boxSizing: 'border-box',
      padding: mobile ? '0 12px' : '0 10px',
      paddingRight: hasValue ? (mobile ? 8 : 6) : (mobile ? 12 : 10),
      border: `1px solid ${C.line}`,
      borderRadius: R,
      background: C.card,
      width, minWidth, maxWidth, flex,
      ...wrapStyle,
    }}>
      <SearchIcon size={mobile ? 16 : 14} color={C.faint} style={{ flexShrink: 0 }} />
      <input
        {...rest}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: ctrlInputFs(mobile, cs),
          background: 'transparent',
          color: C.ink,
          minWidth: 0,
          width: '100%',
          fontFamily: 'inherit',
          paddingRight: hasValue ? clearPad : 0,
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      {hasValue && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={clear}
          style={{
            position: 'absolute',
            right: mobile ? 4 : 2,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: clearPad,
            height: clearPad,
            padding: 0,
            margin: 0,
            border: 'none',
            borderRadius: R,
            background: 'transparent',
            color: C.mute,
            cursor: 'pointer',
          }}
        >
          <X size={mobile ? 16 : 14} />
        </button>
      )}
    </div>
  );
}
