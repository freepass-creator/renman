'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { type ReactNode } from 'react';
import { Btn, Select } from './controls';
import { LedgerPanelFooter } from './ledger-actions';
import { C, R, ctrlH } from './tokens';
import { useIsMobile } from '@/lib/use-mobile';
import type { LedgerFilterFieldDef } from '@/lib/ledger-filter-defs';

export function LedgerFilterButton({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile, 'sm');
  return (
    <button
      type="button"
      aria-label="세부 필터"
      aria-pressed={open}
      title="세부 필터"
      onClick={onClick}
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
