'use client';
import React from 'react';
import type { Field, EntityRecord } from '@/lib/intake/entities';
import { useIsMobile } from '@/lib/use-mobile';
import { C, R, SH } from './tokens';
import { Badge } from './misc';
import { Input, Select } from './controls';

/* 상세 라벨/값 표 · 인라인 편집 폼 · 링크형 리스트 — 상세(360) 원자. */

export function DetailGrid({ rows }: { rows: [string, unknown][] }) {
  const mobile = useIsMobile();
  return (
    <div>
      {rows.map(([k, val], i) => {
        const filled = val != null && val !== '';
        const node = (!filled ? '—' : typeof val === 'object' ? val : String(val)) as React.ReactNode;
        return (
          <div key={i} style={{
            display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? 2 : 0,
            padding: mobile ? '8px 12px' : '5px 12px', fontSize: mobile ? 13.5 : 12.5,
            borderTop: i && mobile ? `1px solid var(--border-soft)` : undefined,
          }}>
            <span style={{ width: mobile ? 'auto' : 116, flex: mobile ? undefined : '0 0 116px', color: C.mute, fontSize: mobile ? 11 : undefined }}>{k}</span>
            <span style={{ color: filled ? C.ink : '#cbd5e1', fontVariantNumeric: 'tabular-nums', fontWeight: mobile ? 600 : undefined }}>{node}</span>
          </div>
        );
      })}
    </div>
  );
}
export function DetailRow({ main, sub, right, rightColor = C.mute }: { main: React.ReactNode; sub: React.ReactNode; right?: React.ReactNode; rightColor?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderTop: `1px solid ${C.line2}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{main}</div>
        <div style={{ fontSize: 11, color: C.faint }}>{sub}</div>
      </div>
      {right != null && <div style={{ fontSize: 12.5, fontWeight: 700, color: rightColor, fontVariantNumeric: 'tabular-nums' }}>{right}</div>}
    </div>
  );
}
export function DetailEmpty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 14, fontSize: 12.5, color: '#cbd5e1' }}>{children}</div>;
}

/* 라벨|값 표(인라인 편집) — 세부(360)·InfoDoc 공용 SSOT.
 * editing이면 값 칸만 그 자리에서 입력칸으로(화면 그대로, 폼 스왑 X). key=null이면 읽기전용.
 * 편집 모드는 테두리·배경(accent)으로 시각 구분. */
export type KVRow = [label: string, key: string | null, value: React.ReactNode];
export function KV({ rows, editing, form, onChange }: { rows: KVRow[]; editing?: boolean; form?: EntityRecord; onChange?: (k: string, v: string) => void }) {
  const mobile = useIsMobile();
  return (
    <div style={{ border: `1px solid ${editing ? C.accent : C.line}`, borderRadius: 'var(--radius)', background: editing ? 'var(--bg-card)' : '#fff', boxShadow: editing ? '0 0 0 3px var(--focus-ring)' : SH.rest, transition: 'box-shadow .15s, border-color .15s' }}>
      {rows.map(([k, key, val], i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: mobile ? 'column' : 'row',
          alignItems: mobile ? 'stretch' : 'center',
          justifyContent: mobile ? undefined : undefined,
          minHeight: mobile ? undefined : 34,
          padding: mobile ? '9px 12px' : '0 12px',
          gap: mobile ? 4 : 0,
          fontSize: mobile ? 13.5 : 12.5,
          borderTop: i ? `1px solid var(--border-soft)` : 'none',
        }}>
          <span style={{ width: mobile ? 'auto' : 96, flex: mobile ? undefined : '0 0 96px', color: C.mute, fontSize: mobile ? 11 : undefined, fontWeight: mobile ? 600 : undefined }}>{k}</span>
          {editing && key
            ? <input value={String(form?.[key] ?? '')} onChange={(e) => onChange?.(key, e.target.value)}
                style={{ flex: 1, minWidth: 0, width: '100%', height: mobile ? 36 : 24, boxSizing: 'border-box', padding: mobile ? '0 10px' : '0 7px', border: `1px solid ${C.line}`, borderRadius: 4, fontSize: mobile ? 15 : 12.5, background: '#fff', color: C.ink, fontFamily: 'inherit' }} />
            : <span style={{ minWidth: 0, fontVariantNumeric: 'tabular-nums', fontWeight: mobile ? 600 : undefined }}>{(val === '' || val == null) ? <span style={{ color: '#cbd5e1' }}>—</span> : val}</span>}
        </div>
      ))}
    </div>
  );
}

/* 공용 입력 폼 — 직접입력·상세수정 공용. */
export function FormGrid({ fields, form, onChange, cols = 2 }: { fields: Field[]; form: EntityRecord; onChange: (key: string, val: string) => void; cols?: number }) {
  const mobile = useIsMobile();
  const c = mobile ? 1 : cols; // 모바일=1열(칸 눌림 방지)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${c},1fr)`, gap: 9 }}>
      {fields.map((f) => {
        const val = (form[f.key] as string) ?? '';
        const empty = val === '' || val == null;
        const bg = f.manual && empty ? '#fff7ed' : '#fff';
        return (
          <label key={f.key} style={{ fontSize: 11.5, color: C.mute }}>
            {f.label}{f.required && <span style={{ color: C.danger }}> *</span>}{f.manual && <span style={{ color: '#9a3412' }}> ·직접</span>}
            {f.type === 'select' ? (
              <Select value={val} onChange={(e) => onChange(f.key, e.target.value)} style={{ width: '100%', marginTop: 3, background: bg }}>
                <option value="">—</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={val}
                onChange={(e) => onChange(f.key, e.target.value)} style={{ width: '100%', marginTop: 3, background: bg }} />
            )}
          </label>
        );
      })}
    </div>
  );
}

/* 링크형 리스트 행/박스 — 검색·휴지통·리스크 등. */
export function ListRow({ badge, badgeTone = 'gray', main, sub, right, href, onClick }: { badge?: React.ReactNode; badgeTone?: 'gray' | 'green' | 'red' | 'amber' | 'blue'; main: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; href?: string; onClick?: () => void }) {
  const inner = (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `1px solid ${C.line2}`, textDecoration: 'none', color: 'inherit', cursor: href || onClick ? 'pointer' : 'default' }}>
      {badge != null && <Badge tone={badgeTone}>{badge}</Badge>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{main}</div>
        {sub != null && <div style={{ fontSize: 11, color: C.faint }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</a> : inner;
}
export function ListBox({ children }: { children: React.ReactNode }) {
  return <div style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', background: '#fff' }}>{children}</div>;
}
