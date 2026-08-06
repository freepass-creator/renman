'use client';
import React from 'react';
import type { Field, EntityRecord } from '@/lib/intake/entities';
import { useIsMobile } from '@/lib/use-mobile';
import { C, R, SH, ctrlH, ctrlInputFs } from './tokens';
import { Badge } from './misc';
import { Input, Select } from './controls';
import { VehicleFieldPicker, ContractFieldPicker } from './entity-picker';
import { ChevronDown } from 'lucide-react';

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
            <span style={{ color: filled ? C.ink : C.lineStrong, fontVariantNumeric: 'tabular-nums', fontWeight: mobile ? 600 : undefined }}>{node}</span>
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
  return <div style={{ padding: 14, fontSize: 12.5, color: C.lineStrong }}>{children}</div>;
}

/* 섹션 소제목(테두리 없음) — freepass ERP4 동기. 상세 그룹 헤더. Section(박스)·Sec(접기)와 별개. */
export function SectionLabel({ children, mt = 14, mb = 6 }: { children: React.ReactNode; mt?: number; mb?: number }) {
  return <div style={{ fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: '-0.01em', margin: `${mt}px 0 ${mb}px` }}>{children}</div>;
}

/* 접이식 — 제목 줄만 보이고 눌러 펼침(할부스케줄·FAQ). Sec(페이지 섹션)과 별개. */
export function Disclosure({ title, defaultOpen = false, open: openProp, onOpenChange, children }: {
  title: React.ReactNode; defaultOpen?: boolean; open?: boolean; onOpenChange?: (o: boolean) => void; children: React.ReactNode;
}) {
  const mobile = useIsMobile();
  const [inner, setInner] = React.useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : inner;
  const setOpen = (next: boolean) => { onOpenChange?.(next); if (!controlled) setInner(next); };
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          minHeight: ctrlH(mobile), padding: mobile ? '10px 2px' : '8px 2px',
          border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <ChevronDown
          size={mobile ? 16 : 14}
          color={open ? C.ink : C.faint}
          style={{ flex: '0 0 auto', transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}
        />
        <span style={{ flex: 1, minWidth: 0, fontSize: mobile ? 14 : 12.5, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>{title}</span>
      </button>
      {open && <div style={{ padding: '0 0 10px 0' }}>{children}</div>}
    </div>
  );
}

/* 라벨|값 표(인라인 편집) — 세부(360)·InfoDoc 공용 SSOT.
 * editing이면 값 칸만 그 자리에서 입력칸으로(화면 그대로, 폼 스왑 X). key=null이면 읽기전용.
 * 편집 모드는 테두리·배경(accent)으로 시각 구분. */
export type KVRow = [label: string, key: string | null, value: React.ReactNode];
export function KV({ rows, editing, form, onChange }: { rows: KVRow[]; editing?: boolean; form?: EntityRecord; onChange?: (k: string, v: string) => void }) {
  const mobile = useIsMobile();
  /* ★상세 규격 = 원장 우측 상세패널의 필드 표 하나(사장님 확정 2026-08-06).
     라벨|값 표가 두 벌(손롤 KV / `ledger-record-panel__fields`)일 이유가 없어 여기로 통일한다.
     ─ 마크업·클래스를 패널과 같게 쓰므로 라벨 폭·행 구분선·스트라이프가 저절로 같아진다.
     ─ 바깥 박스(테두리·그림자)는 없앤다: 섹션이 이미 박스다(박스 안 박스 = 금지 데코).
       편집 중 신호만 왼쪽 강조선으로 남긴다. */
  return (
    <dl
      className="ledger-record-panel__fields"
      style={editing ? { boxShadow: `inset 2px 0 0 ${C.accent}` } : undefined}
    >
      {rows.map(([k, key, val], i) => (
        <div className="ledger-record-panel__field" key={i}>
          <dt>{k}</dt>
          <dd>
            {editing && key
              ? <input value={String(form?.[key] ?? '')} onChange={(e) => onChange?.(key, e.target.value)}
                  style={{ width: '100%', height: ctrlH(mobile), boxSizing: 'border-box', padding: mobile ? '0 12px' : '0 7px', border: `1px solid ${C.line}`, borderRadius: R, fontSize: ctrlInputFs(mobile), background: C.card, color: C.ink, fontFamily: 'inherit' }} />
              : ((val === '' || val == null) ? <span style={{ color: C.faint }}>—</span> : val)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* 공용 입력 폼 — 직접입력·상세수정 공용. vehicle/contract-picker = 목록에서만 선택(순수 텍스트 금지).
 * 사이드패널 cols=1 · 넓은 ingest/표 편집은 cols=2.
 * note 기본 표시(ingest·상세 안내). 사이드패널만 showNotes={false}.
 * Select background 통째 override 금지(캐럿 깨짐) → backgroundColor만.
 */
export function FormGrid({
  fields, form, onChange, onPatch, cols = 2, showNotes = true,
}: {
  fields: Field[];
  form: EntityRecord;
  onChange: (key: string, val: string) => void;
  /** 피커 선택 시 plate+contractKey 등 동반 세팅 */
  onPatch?: (patch: Record<string, string>) => void;
  cols?: number;
  /** false면 field.note 숨김(ledger create/edit 패널). 기본 true. */
  showNotes?: boolean;
}) {
  const mobile = useIsMobile();
  const c = mobile ? 1 : cols;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${c},1fr)`, gap: 14 }}>
      {fields.map((f) => {
        if (f.type === 'vehicle-picker') {
          return (
            <label key={f.key} style={{ fontSize: 12, color: C.mute, gridColumn: c > 1 && !mobile ? '1 / -1' : undefined }}>
              {f.label}{f.required && <span style={{ color: C.danger }}> *</span>}
              <div style={{ marginTop: 6 }}>
                <VehicleFieldPicker
                  value={String(form.plate || '')}
                  onChange={(plate) => onChange('plate', plate)}
                  onPatch={onPatch}
                />
              </div>
              {showNotes && f.note ? <small style={{ display: 'block', marginTop: 6, color: C.faint }}>{f.note}</small> : null}
            </label>
          );
        }
        if (f.type === 'contract-picker') {
          return (
            <label key={f.key} style={{ fontSize: 12, color: C.mute, gridColumn: c > 1 && !mobile ? '1 / -1' : undefined }}>
              {f.label}{f.required && <span style={{ color: C.danger }}> *</span>}
              <div style={{ marginTop: 6 }}>
                <ContractFieldPicker
                  value={String(form.contractKey || '')}
                  onChange={(key) => onChange('contractKey', key)}
                  onPatch={onPatch}
                />
              </div>
              {showNotes && f.note ? <small style={{ display: 'block', marginTop: 6, color: C.faint }}>{f.note}</small> : null}
              {(form.contractNo || form.customerName || form.plate) && String(form.contractKey || '') ? (
                <small style={{ display: 'block', marginTop: 6, color: C.mute }}>
                  {[form.customerName, form.contractNo, form.plate].filter(Boolean).map(String).join(' · ')}
                </small>
              ) : null}
            </label>
          );
        }

        const val = (form[f.key] as string) ?? '';
        const empty = val === '' || val == null;
        // 직접입력 빈칸 강조 — background 통째 덮지 않음(Select 캐럿·appearance 유지)
        const emptyHint = f.manual && empty ? { backgroundColor: 'var(--orange-bg)' } as const : undefined;
        return (
          <label key={f.key} style={{ fontSize: 12, color: C.mute }}>
            {f.label}{f.required && <span style={{ color: C.danger }}> *</span>}
            {f.type === 'select' ? (
              <Select value={val} onChange={(e) => onChange(f.key, e.target.value)} style={{ width: '100%', marginTop: 6, ...emptyHint }}>
                <option value="">—</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : (
              <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={val}
                onChange={(e) => onChange(f.key, e.target.value)} style={{ width: '100%', marginTop: 6, ...emptyHint }} />
            )}
            {showNotes && f.note ? <small style={{ display: 'block', marginTop: 6, color: C.faint }}>{f.note}</small> : null}
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
  return <div style={{ marginTop: 10, border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', background: C.card }}>{children}</div>;
}
