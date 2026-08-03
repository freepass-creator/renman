'use client';
/**
 * 차량 상세 데스크 패널 — /dev/car-desk 시안 레이아웃 원자.
 * 카드 1px 테두리 패널 · KV Glance · 행 hover · 스크롤 본문 · 하단 첨부칩.
 * 헤더·행·풋터 간격 = DESK SSOT (페이지에서 손롤 금지).
 */
import { type CSSProperties, type ReactNode } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Badge, Btn, C, R, NUM, won } from '@/components/ui';
import { docHistory, type DocVersion } from '@/lib/docs';
import type { EntityRecord } from '@/lib/intake/entities';

/** 데스크 UI 간격·타이포 SSOT — 패널 헤더 / Glance·표 행 / 풋터 통일. */
export const DESK = {
  gap: 6,
  headH: 28,
  headPad: '3px 6px',
  headTitleFs: 12,
  headNFs: 10,
  labelW: 56,
  labelFs: 10.5,
  valueFs: 12,
  rowPad: '3px 6px',
  footH: 28,
  footPad: '3px 6px',
  footFs: 11,
  metricPad: '8px 10px',
  metricLabelFs: 10.5,
  metricValueFs: 13,
  inputH: 18,
} as const;

export type DeskDocChip = {
  id: string;
  label: string;
  url?: string;
  at?: string;
  /** 미첨부 슬롯(시안 «필요한 서류» 자리) */
  expected?: boolean;
};

/** 패널별 필요 서류 슬롯 + rec._docs 매칭. 없으면 미첨부 칩으로 자리를 비움. */
export function deskDocSlots(
  rec: EntityRecord | null | undefined,
  slots: { type: string; label: string }[],
): DeskDocChip[] {
  const hist = docHistory(rec);
  return slots.map((s) => {
    const exact = hist.find((d) => d.type === s.type && d.url);
    // 슬롯 1개 + 레거시(type '')면 그걸 등록증/증권으로 취급
    const legacy = slots.length === 1
      ? hist.find((d) => !!d.url && (!d.type || d.type === s.type))
      : undefined;
    const d = exact || legacy;
    if (d?.url) {
      return {
        id: `${s.type}-v${d.v}`,
        label: s.label,
        url: d.url,
        at: d.uploadedAt ? String(d.uploadedAt).slice(0, 10) : undefined,
      };
    }
    return { id: s.type, label: s.label, expected: true };
  });
}

/** 여러 레코드에서 서류 칩(과태료·수선). 없으면 expected 슬롯. */
export function deskDocsFromList(
  rows: EntityRecord[],
  type: string,
  labelOf: (r: EntityRecord, d: DocVersion) => string,
  expectedLabel: string,
): DeskDocChip[] {
  const out: DeskDocChip[] = [];
  for (const r of rows) {
    const d = docHistory(r, type).find((x) => x.url) || docHistory(r).find((x) => x.url);
    if (!d?.url) continue;
    out.push({
      id: `${String(r._key || r.plate || out.length)}-v${d.v}`,
      label: labelOf(r, d),
      url: d.url,
      at: d.uploadedAt ? String(d.uploadedAt).slice(0, 10) : undefined,
    });
  }
  if (out.length) return out;
  return [{ id: type, label: expectedLabel, expected: true }];
}

export function DocFoot({
  docs, onAttach,
}: {
  docs: DeskDocChip[];
  onAttach?: () => void;
}) {
  const open = (url?: string) => {
    if (!url) return;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };
  return (
    <div style={{
      flexShrink: 0, borderTop: `1px solid ${C.line}`, background: 'var(--bg-stripe)',
      padding: DESK.footPad, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
      minHeight: DESK.footH, boxSizing: 'border-box',
    }}>
      <FileText size={12} color={C.sub} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: DESK.labelFs, fontWeight: 700, color: C.mute, marginRight: 2 }}>첨부</span>
      {docs.length === 0 && <span style={{ fontSize: DESK.footFs, color: C.faint }}>없음</span>}
      {docs.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => open(p.url)}
          disabled={!p.url}
          title={p.url ? `${p.label}${p.at ? ` · ${p.at}` : ''}` : `${p.label} · 미첨부`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            border: `1px solid ${C.line}`, borderRadius: R,
            background: p.url ? C.card : 'transparent',
            padding: '1px 6px', fontSize: DESK.footFs,
            color: p.url ? C.ink : C.faint,
            cursor: p.url ? 'pointer' : 'default',
            fontWeight: 600,
            maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {p.label}{!p.url ? ' · 미첨부' : ''}
        </button>
      ))}
      <span style={{ flex: 1 }} />
      {onAttach && (
        <button
          type="button"
          onClick={onAttach}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            border: 'none', background: 'none', cursor: 'pointer',
            fontSize: DESK.footFs, color: C.mute, fontWeight: 700, padding: '2px 4px',
          }}
        >
          <Plus size={12} /> 첨부
        </button>
      )}
    </div>
  );
}

export function HoverTr({ children, style, onClick }: {
  children: ReactNode; style?: CSSProperties; onClick?: () => void;
}) {
  return (
    <tr
      style={{ transition: 'background .12s ease', cursor: onClick ? 'pointer' : undefined, ...style }}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </tr>
  );
}

export function DeskPanel({
  title, right, children, fill, style, hero, n, docs, onAttach,
}: {
  title: string; right?: ReactNode; children: ReactNode; fill?: boolean;
  style?: CSSProperties; hero?: boolean; n?: number;
  docs?: DeskDocChip[];
  onAttach?: () => void;
}) {
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden', background: C.card,
      display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0,
      flex: fill ? 1 : undefined,
      height: fill ? '100%' : undefined,
      alignSelf: fill ? 'stretch' : undefined,
      ...style,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        minHeight: DESK.headH, boxSizing: 'border-box',
        padding: DESK.headPad, borderBottom: `1px solid ${C.line}`, background: 'var(--bg-stripe)',
      }}>
        {n != null && (
          <span style={{
            fontSize: DESK.headNFs, fontWeight: 800, fontFamily: NUM, color: C.accent,
            minWidth: 14, textAlign: 'center',
          }}>{n}</span>
        )}
        <span style={{
          fontSize: DESK.headTitleFs, fontWeight: 800, color: C.ink,
          letterSpacing: hero ? '-0.01em' : undefined,
        }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      {docs != null && <DocFoot docs={docs} onAttach={onAttach} />}
    </div>
  );
}

export function ScrollBody({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  return <div style={{ flex: 1, minHeight: 0, overflow: scroll ? 'auto' : 'hidden' }}>{children}</div>;
}

/** Glance 행 — [라벨, 표시값] 또는 [라벨, 표시값, 편집키|키쌍]. 편집 시 같은 칸에 인라인 입력(레이아웃 고정). */
export type GlanceRow = [string, ReactNode] | [string, ReactNode, string | [string, string]];

const glanceIn: CSSProperties = {
  width: '100%', minWidth: 0, height: DESK.inputH, boxSizing: 'border-box',
  padding: '0 3px', margin: 0,
  border: `1px solid ${C.line}`, borderRadius: 3,
  fontSize: DESK.valueFs, fontWeight: 600, lineHeight: `${DESK.inputH - 2}px`,
  color: C.ink, background: C.card, fontFamily: 'inherit',
};

export function Glance({ rows, labelW = DESK.labelW, wrap, edit }: {
  rows: GlanceRow[];
  labelW?: number;
  wrap?: boolean;
  edit?: { form: Record<string, unknown>; onChange: (k: string, v: string) => void };
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <tbody>
        {rows.map((row, i) => {
          const [k, v, ek] = row;
          const editing = !!(edit && ek);
          return (
            <HoverTr key={`${k}-${i}`} style={{ borderTop: i ? `1px solid ${C.line2}` : undefined }}>
              <td style={{
                width: labelW, padding: DESK.rowPad, fontSize: DESK.labelFs, color: C.mute,
                whiteSpace: 'nowrap', verticalAlign: 'middle',
              }}>{k}</td>
              <td style={{
                padding: DESK.rowPad, fontSize: DESK.valueFs, color: C.ink, fontWeight: 600,
                maxWidth: wrap ? undefined : 160,
                overflow: editing || wrap ? undefined : 'hidden',
                textOverflow: editing || wrap ? undefined : 'ellipsis',
                whiteSpace: wrap || editing ? 'normal' : 'nowrap',
                wordBreak: wrap ? 'keep-all' : undefined,
                verticalAlign: 'middle',
              }}>
                {editing && edit && ek ? (
                  Array.isArray(ek) ? (
                    <span style={{ display: 'flex', gap: 3, alignItems: 'center', minWidth: 0 }}>
                      <input
                        value={String(edit.form[ek[0]] ?? '')}
                        onChange={(e) => edit.onChange(ek[0], e.target.value)}
                        style={glanceIn}
                      />
                      <span style={{ color: C.faint, flexShrink: 0 }}>·</span>
                      <input
                        value={String(edit.form[ek[1]] ?? '')}
                        onChange={(e) => edit.onChange(ek[1], e.target.value)}
                        style={glanceIn}
                      />
                    </span>
                  ) : (
                    <input
                      value={String(edit.form[ek] ?? '')}
                      onChange={(e) => edit.onChange(ek, e.target.value)}
                      style={glanceIn}
                    />
                  )
                ) : (v == null || v === ''
                  ? <span style={{ color: C.lineStrong, fontWeight: 400 }}>—</span>
                  : v)}
              </td>
            </HoverTr>
          );
        })}
      </tbody>
    </table>
  );
}

const thS: CSSProperties = {
  padding: DESK.rowPad, fontSize: DESK.labelFs, textAlign: 'left', color: C.mute, fontWeight: 700,
  background: 'var(--bg-stripe)', borderBottom: `1px solid ${C.line}`,
};
const tdS: CSSProperties = {
  padding: DESK.rowPad, fontSize: DESK.valueFs, color: C.ink, borderTop: `1px solid ${C.line2}`,
};
const tdRS: CSSProperties = { ...tdS, textAlign: 'right', fontFamily: NUM };

export function SchTable({
  rows, onRow,
}: {
  rows: { seq: number | string; due: string; amt: number; paid: number; bal: number; st: string }[];
  onRow?: (seq: string) => void;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
      <thead>
        <tr>
          {(['회차', '기일', '청구', '납부', '미납', '상태'] as const).map((h) => (
            <th key={h} style={{
              ...thS, position: 'sticky', top: 0, zIndex: 1,
              textAlign: h === '상태' ? 'center' : (h === '회차' || h === '기일' ? 'left' : 'right'),
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <HoverTr key={row.seq} onClick={onRow ? () => onRow(String(row.seq)) : undefined}>
            <td style={tdS}>{row.seq}</td>
            <td style={tdS}>{row.due}</td>
            <td style={tdRS}>{won(row.amt)}</td>
            <td style={tdRS}>{row.paid ? won(row.paid) : '—'}</td>
            <td style={tdRS}>{row.bal ? <b style={{ color: C.danger }}>{won(row.bal)}</b> : '—'}</td>
            <td style={{ ...tdS, textAlign: 'center' }}>
              <Badge tone={row.st === '연체' ? 'red' : row.st === '부분납' ? 'amber' : row.st === '완료' ? 'green' : 'gray'}>{row.st}</Badge>
            </td>
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

export function HistTable({
  rows, withWho,
}: {
  rows: { at: string; kind: string; body: string; who?: string }[];
  withWho?: boolean;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>일자</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>구분</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>내용</th>
          {withWho && <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>상대</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((h, i) => (
          <HoverTr key={i}>
            <td style={tdS}>{h.at}</td>
            <td style={tdS}>
              <Badge tone={h.kind === '과태료' || h.kind === '연체' || h.kind === '사고' ? 'amber' : h.kind === '입금' || h.kind === '보증' ? 'green' : 'gray'}>{h.kind}</Badge>
            </td>
            <td style={tdS}>{h.body}</td>
            {withWho && <td style={tdS}>{h.who || '—'}</td>}
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

export function RepairTable({
  rows,
}: {
  rows: { at: string; kind: string; body: string; amt: number }[];
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
      <thead>
        <tr>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>일자</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>구분</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1 }}>내용</th>
          <th style={{ ...thS, position: 'sticky', top: 0, zIndex: 1, textAlign: 'right' }}>금액</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h, i) => (
          <HoverTr key={i}>
            <td style={tdS}>{h.at}</td>
            <td style={tdS}><Badge tone={h.kind === '사고' ? 'amber' : 'gray'}>{h.kind}</Badge></td>
            <td style={tdS}>{h.body}</td>
            <td style={tdRS}>{h.amt ? won(h.amt) : '—'}</td>
          </HoverTr>
        ))}
      </tbody>
    </table>
  );
}

/** 패널 안 조치 띠 — 반납/입금 등. 페이지 위로 안 밀어냄. */
export function DeskPane({
  title, onClose, children,
}: {
  title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <div style={{
      flexShrink: 0, padding: DESK.headPad, borderBottom: `1px solid ${C.line}`,
      background: 'var(--bg-stripe)', display: 'flex', flexDirection: 'column', gap: DESK.gap,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, minHeight: DESK.headH - 6, boxSizing: 'border-box',
      }}>
        <span style={{ fontSize: DESK.headTitleFs, fontWeight: 800, color: C.ink }}>{title}</span>
        <span style={{ flex: 1 }} />
        <Btn size="sm" variant="ghost" onClick={onClose}>닫기</Btn>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: DESK.gap, alignItems: 'flex-end' }}>{children}</div>
    </div>
  );
}

/** 한눈 지표 스트립(저장없음) — 시안 4칸. */
export function MetricStrip({ items }: { items: [string, ReactNode][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, flex: 1, minHeight: 0 }}>
      {items.map(([k, v], i) => (
        <div key={k} style={{
          padding: DESK.metricPad, display: 'flex', flexDirection: 'column', justifyContent: 'center',
          borderLeft: i ? `1px solid ${C.line2}` : undefined, minWidth: 0,
        }}>
          <div style={{ fontSize: DESK.metricLabelFs, color: C.mute, marginBottom: 2 }}>{k}</div>
          <div style={{
            fontSize: DESK.metricValueFs, color: C.ink, fontWeight: 700,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

/** 회차표 하단 청구·수금·미수 요약. */
export function SchFoot({ items }: { items: ReactNode[] }) {
  return (
    <div style={{
      display: 'flex', gap: 14, padding: DESK.footPad, fontSize: DESK.valueFs, color: C.mute,
      borderTop: `1px solid ${C.line}`, background: 'var(--bg-stripe)', flexShrink: 0, flexWrap: 'wrap',
      minHeight: DESK.footH, boxSizing: 'border-box', alignItems: 'center',
    }}>
      {items.map((x, i) => <span key={i}>{x}</span>)}
    </div>
  );
}

export const DESK_FILL: CSSProperties = { flex: 1, minHeight: 0, display: 'grid', gap: DESK.gap };

/**
 * 데스크 5×3 슬롯 SSOT — 자산|계약|수납 동일 좌표.
 *   좌열1×3 · mid col2·3·4 각1×2 · 우측열 col5 세 칸 · 하단 col2–4(mid 세 칸 아래)
 */
export const DESK_SLOT = {
  left: { gridColumn: '1', gridRow: '1 / 4' } as CSSProperties,
  mid2: { gridColumn: '2', gridRow: '1 / 3' } as CSSProperties,
  mid3: { gridColumn: '3', gridRow: '1 / 3' } as CSSProperties,
  mid4: { gridColumn: '4', gridRow: '1 / 3' } as CSSProperties,
  right1: { gridColumn: '5', gridRow: '1' } as CSSProperties,
  right2: { gridColumn: '5', gridRow: '2' } as CSSProperties,
  right3: { gridColumn: '5', gridRow: '3' } as CSSProperties,
  bottom: { gridColumn: '2 / 5', gridRow: '3' } as CSSProperties,
} as const;

export function deskGrid(mobile: boolean): CSSProperties {
  return {
    ...DESK_FILL,
    gridTemplateColumns: mobile ? '1fr' : 'repeat(5, minmax(0, 1fr))',
    gridTemplateRows: mobile ? undefined : 'repeat(3, minmax(0, 1fr))',
    overflow: mobile ? 'auto' : 'hidden',
  };
}

export function deskSlot(mobile: boolean, slot: keyof typeof DESK_SLOT): CSSProperties | undefined {
  return mobile ? undefined : DESK_SLOT[slot];
}
