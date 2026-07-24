'use client';
/**
 * /dev/sample — 웹 리디자인 «샘플 페이지»(시안 §05 기준). 실제 페이지 무영향 — 디자인 확정용 샌드박스.
 *   상단바(SessionBar) → 큼직한 상태바(제목+보유·휴차·미수+구간+보기) → [필터 + 엑셀표].
 *   실데이터(운영시트)로 그려 /sheet와 직접 비교 가능. 확정되면 WebPage 렌더러에 반영.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { Download } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, statusRank, fleetRail, type FleetRow } from '@/lib/sheet-rows';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar } from '@/lib/ui-bus';
import { ExcelSheet, Btn, EmptyState, PageLoading, won, C, NUM, type SheetCol } from '@/components/ui';

const STATUSES = [
  { label: '인도예정', rank: 0, color: C.brand },
  { label: '만기경과', rank: 1, color: C.danger },
  { label: '휴차', rank: 2, color: C.violet },
  { label: '마감임박', rank: 3, color: C.warn },
  { label: '운행중', rank: 4, color: C.ok },
];
const MONTH_INPUT: CSSProperties = { height: 30, boxSizing: 'border-box', border: `1px solid ${C.line}`, borderRadius: 7, padding: '0 8px', fontSize: 12, background: C.card, color: 'inherit', fontFamily: 'inherit' };

// ── 시안 §05 그리드 그대로 — 깔끔한 컬럼 subset + 색 점 상태칸 ──
const RAIL_COLOR: Record<string, string> = { brand: C.brand, danger: C.danger, violet: C.violet, warn: C.warn, ok: C.ok, mute: C.faint, none: C.faint };
function statusLabel(r: FleetRow) { const k = statusRank(r); return k === 0 ? '인도예정' : k === 1 ? '만기경과' : k === 2 ? '휴차' : k === 3 ? '마감임박' : k === 4 ? '운행중' : k === 5 ? '정비' : k === 7 ? '처분예정' : '매각'; }
function alertText(r: FleetRow) { const a: string[] = []; if (r.dday != null && r.dday < 0) a.push(`만기 ${-r.dday}일↑`); else if (r.dday != null && r.dday <= 30) a.push(`D-${r.dday}`); if (r.net > 0) a.push('미수'); if (!r.insurer) a.push('무보험'); return a.join(' · ') || '—'; }
const payTxt = (r: FleetRow) => (r.paymentTiming ? `${r.paymentDay}·${r.paymentTiming}` : '—');
const SAMPLE_COLS: SheetCol<FleetRow>[] = [
  { key: 'co', label: '회사', render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'status', label: '차량상태', render: (r) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: RAIL_COLOR[fleetRail(r)], flex: '0 0 auto' }} />{statusLabel(r)}</span>, text: (r) => statusLabel(r) },
  { key: 'plate', label: '차번', pin: true, render: (r) => r.plate, text: (r) => r.plate },
  { key: 'maker', label: '제조사', render: (r) => r.maker || '—', text: (r) => r.maker },
  { key: 'model', label: '세부모델', render: (r) => r.subModel || r.carName || '—', text: (r) => r.subModel || r.carName },
  { key: 'year', label: '연식', align: 'r', render: (r) => r.year || '—', text: (r) => r.year },
  { key: 'cust', label: '사용처', render: (r) => r.customer || '—', text: (r) => r.customer },
  { key: 'start', label: '시작', align: 'r', render: (r) => (r.start ? r.start.slice(2) : '—'), text: (r) => r.start },
  { key: 'end', label: '만기', align: 'r', render: (r) => (r.end ? r.end.slice(2) : '—'), text: (r) => r.end },
  { key: 'rent', label: '대여료', align: 'r', render: (r) => (r.rent ? won(r.rent) : '—'), text: (r) => r.rent },
  { key: 'pay', label: '결제일', align: 'c', render: (r) => payTxt(r), text: (r) => payTxt(r) },
  { key: 'net', label: '미수', align: 'r', render: (r) => (r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : <span style={{ color: C.faint }}>—</span>), text: (r) => r.net },
  { key: 'warn', label: '경고', render: (r) => { const t = alertText(r); return t === '—' ? <span style={{ color: C.faint }}>—</span> : <span style={{ color: C.warn }}>{t}</span>; }, text: (r) => alertText(r) },
];
const MORE_COLS: SheetCol<FleetRow>[] = [
  { key: 'deposit', label: '보증금', align: 'r', render: (r) => (r.deposit ? won(r.deposit) : '—'), text: (r) => r.deposit },
  { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
  { key: 'round', label: '회차', align: 'c', render: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : '—'), text: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : '') },
];

export default function SamplePage() {
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const allRows = useMemo(() => {
    const f = linkFleet(vs, cs, TODAY);
    return buildFleetRows(f.vehicles, ins, f.contracts, hs, TODAY);
  }, [vs, cs, ins, hs]);

  const [view, setView] = useState<'기본' | '상세'>('기본');
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [coSel, setCoSel] = useState<Set<string>>(new Set());
  const [fromM, setFromM] = useState('');
  const [toM, setToM] = useState('');

  const held = useMemo(() => allRows.filter((r) => r.ownership !== '처분완료'), [allRows]);
  const companies = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of held) if (r.companyId && !m.has(r.companyId)) m.set(r.companyId, r.company);
    return [...m.entries()];
  }, [held]);

  const rankSel = useMemo(() => new Set(STATUSES.filter((s) => statusSel.has(s.label)).map((s) => s.rank)), [statusSel]);
  const rows = useMemo(() => held.filter((r) => {
    if (rankSel.size && !rankSel.has(statusRank(r))) return false;
    if (coSel.size && !coSel.has(r.companyId)) return false;
    if (fromM || toM) {
      const s = r.start.slice(0, 7), e = r.end.slice(0, 7);
      if (!s) return false;
      if (toM && s > toM) return false;
      if (fromM && e && e < fromM) return false;
    }
    return true;
  }).sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko')), [held, rankSel, coSel, fromM, toM]);

  const heldCnt = rows.length;
  const idleCnt = rows.filter((r) => r.util === '휴차').length;
  const net = rows.reduce((s, r) => s + Math.max(0, r.net), 0);
  const cols = view === '기본' ? SAMPLE_COLS : [...SAMPLE_COLS, ...MORE_COLS];

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) => set((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const cb = (on: boolean, color?: string) => ({
    width: 15, height: 15, borderRadius: 4, flex: '0 0 auto',
    border: `1.5px solid ${on ? (color ?? C.brand) : C.lineStrong}`,
    background: on ? (color ?? C.brand) : 'transparent',
  } as CSSProperties);

  return (
    <div>
      {/* ── 상태바: 제목 + 요약 + 구간 + 보기 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '14px 18px 12px', borderBottom: `1px solid ${C.line}`, background: C.card }}>
        <span style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.015em', color: C.ink }}>운영 현황</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }} title="기간(월 구간)으로 보기 — 계약기간이 이 구간과 겹치는 차량만">
          <input type="month" value={fromM} max={toM || undefined} onChange={(e) => setFromM(e.target.value)} style={MONTH_INPUT} aria-label="시작월" />
          <span style={{ color: C.faint, fontSize: 12 }}>~</span>
          <input type="month" value={toM} min={fromM || undefined} onChange={(e) => setToM(e.target.value)} style={MONTH_INPUT} aria-label="종료월" />
          {(fromM || toM) && <Btn variant="ghost" size="sm" onClick={() => { setFromM(''); setToM(''); }}>전체</Btn>}
        </span>
        <div style={{ display: 'flex', gap: 18 }}>
          {[['보유', heldCnt, undefined], ['휴차', idleCnt, undefined], ['미수', net ? won(net) : '0', net ? C.danger : undefined]].map(([label, val, color]) => (
            <div key={label as string} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <b style={{ fontFamily: NUM, fontVariantNumeric: 'tabular-nums', fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: (color as string) ?? C.ink }}>{val as string | number}</b>
              <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>{label as string}</span>
            </div>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 8, overflow: 'hidden' }}>
          {(['기본', '상세'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ border: 'none', padding: '6px 13px', fontSize: 12.5, fontWeight: view === v ? 700 : 600, cursor: 'pointer', background: view === v ? C.brand : C.card, color: view === v ? C.inverse : C.mute, fontFamily: 'inherit' }}>{v}</button>
          ))}
        </div>
      </div>

      {/* ── 본문: 필터 레일 + 엑셀표 ── */}
      {loading ? <PageLoading /> : (
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 'calc(100vh - var(--fp-bar-h) - 52px)' }}>
          <div style={{ width: 180, flex: '0 0 auto', borderRight: `1px solid ${C.line}`, padding: '14px 14px 20px', background: C.card }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>차량상태</div>
            {STATUSES.map((s) => {
              const on = statusSel.has(s.label);
              return (
                <label key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.sub, padding: '4px 0', cursor: 'pointer' }} onClick={() => toggle(setStatusSel, s.label)}>
                  <span style={cb(on, s.color)} />
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: s.color, flex: '0 0 auto' }} />
                  {s.label}
                </label>
              );
            })}
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: '.06em', margin: '16px 0 7px' }}>회사</div>
            {companies.map(([id, name]) => {
              const on = coSel.has(id);
              return (
                <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.sub, padding: '4px 0', cursor: 'pointer' }} onClick={() => toggle(setCoSel, id)}>
                  <span style={cb(on)} />{name}
                </label>
              );
            })}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {!rows.length ? <EmptyState>표시할 차량이 없습니다</EmptyState>
              : <ExcelSheet cols={cols} rows={rows} rowKey={(r: FleetRow) => r.plate} onRow={(r: FleetRow) => openCar(r.plate)} />}
          </div>
        </div>
      )}
    </div>
  );
}
