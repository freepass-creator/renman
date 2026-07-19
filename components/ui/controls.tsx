'use client';
import React from 'react';
import { Search as SearchIcon, ChevronLeft, ChevronRight, Building2, ChevronDown, Check } from 'lucide-react';
import { haptic } from '@/lib/haptics';
import { C, R, SH, fieldStyle, selectStyle, toggleStyle, CTRL_M, SPACE_M } from './tokens';
import { Drawer } from './overlays';
import { type Period, PERIODS, periodRange, shiftPeriod, periodTitle } from '@/lib/finance/period';
import { useSession } from '@/lib/session';
import { useIsMobile } from '@/lib/use-mobile';
import { ALL_COMPANIES, COMPANIES, companyLabel, companyShort } from '@/lib/companies';

/* 입력·버튼·탭·칩 — 인터랙션 컨트롤 원자. */

// 회사(법인) 필터 — 셸 툴바 SSOT. 본사=선택(모바일=하단 시트 / 데스크톱=드롭다운), 법인 직원=고정 라벨.
// 웹 32 · 모바일 CTRL_M(40) — WorkbenchBar 1행과 높이 통일.
export function CompanyFilter() {
  const { companyId, setCompanyId, isOperator } = useSession();
  const mobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  if (!isOperator) {
    return <span style={{ fontSize: mobile ? 14 : 13, fontWeight: 800, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>{companyLabel(companyId)}</span>;
  }
  const trigger =
    companyId === ALL_COMPANIES ? (mobile ? '전체' : '전체 회사')
      : mobile ? companyShort(companyId) : companyLabel(companyId);
  const options = [ALL_COMPANIES, ...COMPANIES];
  const pick = (c: string) => { haptic.tap(); setCompanyId(c); setOpen(false); };
  const h = mobile ? CTRL_M : 32;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button type="button" data-ui="action" onClick={() => { haptic.tap(); setOpen((o) => !o); }} title="보는 회사"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: h, boxSizing: 'border-box', padding: mobile ? '0 12px' : '0 11px', border: `1px solid ${C.line}`, borderRadius: R, background: '#fff', cursor: 'pointer', fontSize: mobile ? 14 : 13, fontWeight: 700, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: SH.rest, WebkitTapHighlightColor: 'transparent' }}>
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
          <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 6px)', minWidth: 200, background: '#fff', border: `1px solid ${C.line}`, borderRadius: R, boxShadow: SH.pop, zIndex: 45, overflow: 'hidden' }}>
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

// PillTabs — 원자(유닛)화된 탭 그룹. 각 탭은 독립 버튼: 공간 넓으면 한 줄, 좁으면 줄바꿈에 유연 대응.
// 뷰 전환용 표준(렌즈 탭 등). 활성=brand 채움 / 비활성=흰 배경. 룩=toggleStyle SSOT.
export function PillTabs<T extends string>({ tabs, value, onChange, size = 'md' }: { tabs: { key: T; label: React.ReactNode; title?: string }[]; value: T; onChange: (k: T) => void; size?: 'sm' | 'md' | 'lg' }) {
  const mobile = useIsMobile();
  // 모바일=항상 lg(터치). sm 강제 금지(웹 축소 금지).
  const s: 'sm' | 'md' | 'lg' = mobile ? 'lg' : (size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'md');
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? SPACE_M : 6 }}>
      {tabs.map((t) => (
        <button key={t.key} type="button" data-ui="toggle" aria-pressed={value === t.key} onClick={() => onChange(t.key)} title={t.title} style={toggleStyle(value === t.key, s)}>{t.label}</button>
      ))}
    </div>
  );
}

/* 퀵필터 — 세그먼트 툴바(각진 버튼군). 룩=toggleStyle SSOT. 칩에 건수 붙이지 않음. */
export type ChipOpt<T extends string> = { key: T; label: string; count?: number };
export function FilterChips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: ChipOpt<T>[] }) {
  const mobile = useIsMobile();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: mobile ? SPACE_M : 6, marginTop: SPACE_M }}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button key={o.key} type="button" data-ui="toggle" onClick={() => onChange(o.key)} aria-pressed={active} style={toggleStyle(active, mobile ? 'lg' : 'sm')}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Btn({ children, onClick, variant = 'solid', size = 'md', disabled, href, block }: { children: React.ReactNode; onClick?: () => void; variant?: 'solid' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; disabled?: boolean; href?: string; block?: boolean }) {
  const mobile = useIsMobile();
  const sm = size === 'sm';
  const lg = size === 'lg'; // 현장 위저드 푸터(터치 48)
  // 모바일: sm/md → CTRL_M(40). 웹: sm=28 · md=32 · lg=48.
  const h = lg ? 48 : mobile ? CTRL_M : (sm ? 28 : 32);
  const s: React.CSSProperties = {
    height: h, boxSizing: 'border-box', padding: lg ? '0 18px' : sm ? '0 11px' : '0 14px', borderRadius: R,
    fontWeight: lg || mobile ? 700 : 600, fontSize: lg ? 15 : mobile ? 14 : sm ? 12 : 12.5, letterSpacing: '-0.01em', lineHeight: 1,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    border: `1px solid ${disabled ? C.line : variant === 'solid' ? C.brand : variant === 'danger' ? 'var(--red-border)' : C.line}`,
    background: variant === 'solid' ? (disabled ? C.line : C.brand) : '#fff',
    color: variant === 'solid' ? '#fff' : variant === 'danger' ? 'var(--red-text)' : C.ink,
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
  const base = fieldStyle(size === 'sm');
  const m = mobile ? { ...base, height: CTRL_M, fontSize: 15, padding: '0 12px' } : base;
  return <input {...rest} style={{ ...m, ...style }} />;
}
export function Select({ size = 'md', style, children, ...rest }: Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: 'sm' | 'md' }) {
  const mobile = useIsMobile();
  const base = selectStyle(size === 'sm');
  const m = mobile ? { ...base, height: CTRL_M, fontSize: 14, padding: '0 28px 0 12px' } : base;
  return <select {...rest} style={{ ...m, ...style }}>{children}</select>;
}
// 기간·날짜 선택 공용 프리미티브 — 드롭다운(당일~연간·전체) 선택 → ‹ ›로 그 달·주 이동 → '오늘'(현재 기간 복귀) + 직접(from~to). 자금일보·일정 공용 SSOT.
//   상태는 내부 관리, 확정 범위 {from,to}만 onRange로 방출('전체'=빈 문자열). latest=데이터 최신일(초기 기준).
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
  React.useEffect(() => { onRangeRef.current(range); }, [range.from, range.to]); // 범위 바뀔 때만 방출(루프 방지)
  const nh = mobile ? CTRL_M : 32;
  const nav: React.CSSProperties = { height: nh, width: nh, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: R, background: '#fff', cursor: 'pointer', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
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
        <span style={{ fontSize: mobile ? 14 : 13, fontWeight: 700, color: C.ink }}>전체 기간</span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, -1))} aria-label="이전 기간"><ChevronLeft size={mobile ? 18 : 16} /></button>
          <span style={{ fontSize: mobile ? 14 : 13, fontWeight: 700, color: C.ink, minWidth: 104, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{periodTitle(refDate, period)}</span>
          <button style={nav} onClick={() => canNav && setRef(shiftPeriod(refDate, period, 1))} aria-label="다음 기간"><ChevronRight size={mobile ? 18 : 16} /></button>
          <button type="button" onClick={() => setRef(today)} title="오늘이 포함된 기간으로" style={{ height: nh, boxSizing: 'border-box', padding: '0 11px', marginLeft: 5, border: `1px solid ${C.line}`, borderRadius: R, background: C.taupeBg, cursor: 'pointer', color: C.mute, fontSize: mobile ? 13 : 12, fontWeight: 700, flexShrink: 0 }}>오늘</button>
        </span>
      )}
    </div>
  );
}

export function Search({ size = 'md', style, wrapStyle, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md'; wrapStyle?: React.CSSProperties }) {
  const sm = size === 'sm';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: sm ? 28 : 32, boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: R, background: '#fff', ...wrapStyle }}>
      <SearchIcon size={14} color={C.faint} style={{ flexShrink: 0 }} />
      <input {...rest} style={{ flex: 1, border: 'none', outline: 'none', fontSize: sm ? 12 : 12.5, background: 'transparent', color: C.ink, minWidth: 0, fontFamily: 'inherit', ...style }} />
    </div>
  );
}
