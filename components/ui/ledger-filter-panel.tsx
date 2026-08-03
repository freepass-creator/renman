'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { Btn, Select } from './controls';
import { LedgerPanelFooter } from './ledger-actions';
import { C, R, ctrlH } from './tokens';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import type { LedgerFilterFieldDef } from '@/lib/ledger-filter-defs';

/**
 * 활성 필터 요약 — «필터 창이 닫혀 있어도 무엇을 보고 있는지» 페이지에서 알 수 있어야 한다(사장님 확정).
 *
 * 닫으면 배지 숫자만 남아서 «몇 개 걸렸다»는 것만 알고 «무엇이 걸렸는지»는 알 수 없었다.
 * 이 상태로 숫자를 읽으면 전체 합계라고 오해한다 — 돈 화면에서는 특히 위험하다.
 *
 * 칩을 누르면 그 필터만 해제한다(패널을 열지 않고 바로 되돌릴 수 있게).
 * 값이 없는 축은 칩을 만들지 않으므로, 아무것도 안 걸렸으면 아예 렌더되지 않는다.
 */
export function LedgerActiveFilters({
  defs, values, onClear, onClearAll,
}: {
  defs: readonly LedgerFilterFieldDef[];
  values: Record<string, string>;
  onClear: (key: string) => void;
  onClearAll?: () => void;
}) {
  const mobile = useIsMobile();
  const active = defs.filter((d) => values[d.key]);
  if (active.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {active.map((d) => (
        <button
          key={d.key}
          type="button"
          onClick={() => { haptic.tap(); onClear(d.key); }}
          title={`${d.label} 필터 해제`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: mobile ? 44 : 20, padding: mobile ? '0 10px' : '0 7px',
            border: `1px solid ${C.brand}`, borderRadius: 'var(--radius-badge)',
            background: C.card, color: C.brand, fontSize: mobile ? 13 : 11, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden',
          }}
        >
          <span style={{ color: C.mute, fontWeight: 600 }}>{d.label}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{values[d.key]}</span>
          <X size={mobile ? 15 : 11} aria-hidden />
        </button>
      ))}
      {active.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={() => { haptic.tap(); onClearAll(); }}
          style={{
            height: mobile ? 44 : 20, padding: mobile ? '0 10px' : '0 7px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius-badge)',
            background: C.card, color: C.mute, fontSize: mobile ? 13 : 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >전체 해제</button>
      )}
    </span>
  );
}

/** 정의형 필드가 아닌 Facet 필터도 같은 활성 칩 문법으로 표시한다. */
export function LedgerActiveFilterTags({
  values, onClear, onClearAll,
}: {
  values: readonly string[];
  onClear: (value: string) => void;
  onClearAll?: () => void;
}) {
  const mobile = useIsMobile();
  if (!values.length) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => { haptic.tap(); onClear(value); }}
          title={`${value} 필터 해제`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, height: mobile ? 44 : 20, padding: mobile ? '0 10px' : '0 7px',
            border: `1px solid ${C.brand}`, borderRadius: 'var(--radius-badge)',
            background: C.card, color: C.brand, fontSize: mobile ? 13 : 11, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 240, overflow: 'hidden',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
          <X size={mobile ? 15 : 11} aria-hidden />
        </button>
      ))}
      {values.length > 1 && onClearAll && (
        <button
          type="button"
          onClick={() => { haptic.tap(); onClearAll(); }}
          style={{
            height: mobile ? 44 : 20, padding: mobile ? '0 10px' : '0 7px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius-badge)',
            background: C.card, color: C.mute, fontSize: mobile ? 13 : 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >전체 해제</button>
      )}
    </span>
  );
}

export function LedgerFilterButton({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile, 'sm');
  return (
    <button
      type="button"
      aria-label="세부 필터"
      aria-pressed={open}
      title="세부 필터"
      onClick={() => { haptic.tap(); onClick(); }}
      style={{
        position: 'relative', width: h, height: h, padding: 0, display: 'inline-grid', placeItems: 'center',
        boxSizing: 'border-box',
        border: `1px solid ${open ? C.brand : C.line}`, borderRadius: R,
        background: open ? C.brand : C.card, color: open ? C.inverse : C.mute, cursor: 'pointer',
      }}
    >
      <SlidersHorizontal size={mobile ? 16 : 14} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -6, right: -6, minWidth: 16, height: 16, padding: '0 4px',
          borderRadius: 'var(--radius-badge)', background: 'var(--zinc-text)', color: C.inverse, boxSizing: 'border-box',
          fontSize: 10, fontWeight: 800, lineHeight: '16px', textAlign: 'center',
        }}>{count > 99 ? '99+' : count}</span>
      )}
    </button>
  );
}

export type LedgerFilterOption = { value: string; label: string } | string;

/** DEFS 기반 세부필터 필드 — 손롤 label/Select 금지. 옵션은 페이지에서. */
export function LedgerFilterFields({
  defs,
  values,
  onChange,
  options,
}: {
  defs: readonly LedgerFilterFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  options: Record<string, readonly LedgerFilterOption[]>;
}) {
  return (
    <>
      {defs.map((def) => {
        const opts = options[def.key] || [];
        return (
          <label key={def.key}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>{def.label}</span>
            <Select
              value={values[def.key] || ''}
              onChange={(event) => onChange(def.key, event.target.value)}
              style={{ width: '100%' }}
            >
              <option value="">{def.emptyLabel ?? '전체'}</option>
              {opts.map((opt) => {
                const value = typeof opt === 'string' ? opt : opt.value;
                const label = typeof opt === 'string' ? opt : opt.label;
                return <option key={value} value={value}>{label}</option>;
              })}
            </Select>
          </label>
        );
      })}
    </>
  );
}

/**
 * 세부필터 → 상단 필터줄 Select (좌측 패널 없이).
 * 필드 적은 원장(자산 등) — 3분할(필터|표|상세) 번잡 회피. DEFS·options SSOT 유지.
 */
export function LedgerFilterSelects({
  defs,
  values,
  onChange,
  options,
  size = 'sm',
}: {
  defs: readonly LedgerFilterFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  options: Record<string, readonly LedgerFilterOption[]>;
  size?: 'sm' | 'md';
}) {
  return (
    <>
      {defs.map((def) => {
        const opts = options[def.key] || [];
        return (
          <Select
            key={def.key}
            size={size}
            aria-label={def.label}
            value={values[def.key] || ''}
            onChange={(event) => onChange(def.key, event.target.value)}
          >
            <option value="">{def.emptyLabel ?? `${def.label} 전체`}</option>
            {opts.map((opt) => {
              const value = typeof opt === 'string' ? opt : opt.value;
              const label = typeof opt === 'string' ? opt : opt.label;
              return <option key={value} value={value}>{label}</option>;
            })}
          </Select>
        );
      })}
    </>
  );
}

/** 좌측 필터 패널 — 헤더/하단바 = 상세패널과 동일 규격(--ledger-head-h / --ledger-foot-h). */
export function LedgerFilterPanel({
  title = '세부 필터',
  children,
  onReset,
  onClose,
}: {
  title?: string;
  children: ReactNode;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <section className="ledger-record-panel" aria-label={title}>
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">{title}</div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label={`${title} 닫기`}>
          <X size={14} />
        </button>
      </header>
      <div className="ledger-record-panel__body" style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        {children}
      </div>
      <LedgerPanelFooter>
        <Btn size="sm" variant="ghost" onClick={onReset}>필터 초기화</Btn>
      </LedgerPanelFooter>
    </section>
  );
}
