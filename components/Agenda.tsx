'use client';
/**
 * 일정(어젠다) 공용 컴포넌트 — 달력 + 일정별 섹션(못한거·오늘·내일·이번주·예정).
 *   홈 '일정' 탭(회사 전체)과 마이페이지 '일정' 탭이 같은 이걸 쓴다(규격통일, 중복 금지).
 *   데이터 = ctx.agenda(예정 기한) + ctx.dayFeedFor(그날 한 일). 기간 축 세계관.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useIsMobile } from '@/lib/use-mobile';
import { openCar, openCustomer } from '@/lib/ui-bus';
import { Sec, Cards, Metric, Badge, C, won, SPACE_M, EmptyState } from '@/components/ui';
import { type AgendaItem, AGENDA_KINDS } from '@/lib/agenda';
import { type DayFeedItem } from '@/lib/day-feed';
import { type SectionCtx } from '@/lib/section-registry';
import { TODAY } from '@/lib/dashboard-consts';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const goSec = (id: string) => { if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

// 일정 아이템 한 줄 — 종류 뱃지·차번·설명·날짜·D-day. 클릭 → 차량 360.
function AgendaRow({ it }: { it: AgendaItem }) {
  const mobile = useIsMobile();
  const col = it.tone === 'red' ? C.danger : it.tone === 'amber' ? C.warn : it.tone === 'green' ? 'var(--green-text)' : C.mute;
  const bt = (it.tone === 'red' ? 'red' : it.tone === 'amber' ? 'amber' : it.tone === 'green' ? 'green' : 'gray') as 'red' | 'amber' | 'green' | 'gray';
  return (
    <div onClick={() => it.plate && openCar(it.plate)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '12px 14px' : '9px 12px', minHeight: mobile ? 52 : undefined, borderRadius: 'var(--radius)', background: '#fff', border: `1px solid ${C.line}`, cursor: it.plate ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}>
      <Badge tone={bt}>{it.kind}</Badge>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: mobile ? 14.5 : undefined }}>{it.plate || '—'}</span>
      <span style={{ color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, fontSize: mobile ? 13 : undefined }}>{it.title}</span>
      <span style={{ fontSize: mobile ? 13 : 12, color: C.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{it.date.slice(5)}</span>
      <span style={{ fontSize: mobile ? 13 : 12, fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>{it.dday < 0 ? `${-it.dday}일 지남` : it.dday === 0 ? '오늘' : `D-${it.dday}`}</span>
    </div>
  );
}

function FeedRow({ it }: { it: DayFeedItem }) {
  const mobile = useIsMobile();
  const bt = it.tone === 'danger' ? 'red' : it.tone === 'warn' ? 'amber' : it.tone === 'ok' ? 'green' : 'gray';
  return (
    <div
      onClick={() => {
        if (it.plate) openCar(it.plate);
        else if (it.customerKey) openCustomer(it.customerKey);
      }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: mobile ? '12px 14px' : '9px 12px', minHeight: mobile ? 52 : undefined, borderRadius: 'var(--radius)', background: '#fff', border: `1px solid ${C.line}`, cursor: (it.plate || it.customerKey) ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent' }}
    >
      <Badge tone={bt}>{it.kind}</Badge>
      {it.plate ? <span style={{ fontWeight: 700, whiteSpace: 'nowrap', fontSize: mobile ? 14.5 : undefined }}>{it.plate}</span> : null}
      <span style={{ color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1, fontSize: mobile ? 13 : undefined }}>{it.title}</span>
      {it.amount != null && it.amount > 0 ? <span style={{ fontSize: mobile ? 14 : 12.5, fontWeight: 700, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{won(it.amount)}</span> : null}
    </div>
  );
}

export type CalMark = { date: string; tone: 'red' | 'amber' | 'green' | 'gray'; label: string };
// 월 달력 공용 원자 — marks(날짜·색·라벨)만 받아 그린다. 회사일정·내일정 등 무엇이든 재사용. 전체폭·반응형(데스크톱 칩/모바일 점).
export function AgendaCalendar({ marks, selected, onSelect }: { marks: CalMark[]; selected: string; onSelect: (d: string) => void }) {
  const mobile = useIsMobile();
  const [ym, setYm] = useState(() => TODAY.slice(0, 7));
  const byDate = useMemo(() => { const g = new Map<string, CalMark[]>(); for (const x of marks) { const a = g.get(x.date); if (a) a.push(x); else g.set(x.date, [x]); } return g; }, [marks]);
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const startDow = new Date(y, m - 1, 1).getDay();
  const cells: (number | null)[] = [...Array(startDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const shift = (delta: number) => { const d = new Date(y, m - 1 + delta, 1); setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const ds = (day: number) => `${ym}-${String(day).padStart(2, '0')}`;
  const dot = (t: string) => t === 'red' ? C.danger : t === 'amber' ? C.warn : t === 'green' ? 'var(--green-text)' : C.mute;
  const chipBg = (t: string) => t === 'red' ? 'rgba(220,38,38,0.10)' : t === 'amber' ? 'rgba(217,119,6,0.10)' : t === 'green' ? 'rgba(22,163,74,0.10)' : 'var(--bg-stripe)';
  const nav: CSSProperties = { border: `1px solid ${C.line}`, background: '#fff', borderRadius: 'var(--radius)', width: mobile ? 40 : 32, height: mobile ? 40 : 32, boxSizing: 'border-box', cursor: 'pointer', color: C.mute, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' };
  const cellH = mobile ? 46 : 100, maxChips = 3;
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: '#fff', padding: mobile ? 10 : 16, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button onClick={() => shift(-1)} style={nav} aria-label="이전 달"><ChevronLeft size={mobile ? 18 : 16} /></button>
        <span style={{ fontSize: mobile ? 16 : 15, fontWeight: 800, color: C.ink, minWidth: 96, textAlign: 'center' }}>{y}년 {m}월</span>
        <button onClick={() => shift(1)} style={nav} aria-label="다음 달"><ChevronRight size={mobile ? 18 : 16} /></button>
        <span style={{ flex: 1 }} />
        <button onClick={() => setYm(TODAY.slice(0, 7))} style={{ ...nav, width: 'auto', padding: '0 14px', fontSize: mobile ? 13 : 12, fontWeight: 700 }}>오늘</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: mobile ? 3 : 6 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? C.danger : i === 6 ? C.accent : C.faint, paddingBottom: 4 }}>{w}</div>)}
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const dstr = ds(day); const its = byDate.get(dstr) || []; const isToday = dstr === TODAY; const isSel = dstr === selected;
          return (
            <button key={i} onClick={() => onSelect(dstr)} style={{ minHeight: cellH, boxSizing: 'border-box', borderRadius: 'var(--radius)', border: `1px solid ${isSel ? C.accent : isToday ? C.mute : C.line}`, background: isSel ? 'var(--bg-card)' : '#fff', cursor: 'pointer', padding: mobile ? '3px 2px' : '6px 7px', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', overflow: 'hidden' }}>
              <span style={{ fontSize: mobile ? 11.5 : 13, fontWeight: isToday ? 800 : 600, color: isToday ? C.accent : C.ink, alignSelf: mobile ? 'center' : 'flex-start', flexShrink: 0 }}>{day}</span>
              {mobile ? (
                <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {its.slice(0, 4).map((it, k) => <span key={k} style={{ width: 5, height: 5, borderRadius: '50%', background: dot(it.tone) }} />)}
                </span>
              ) : (
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  {its.slice(0, maxChips).map((it, k) => (
                    <span key={k} title={it.label} style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: chipBg(it.tone), color: dot(it.tone), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
                  ))}
                  {its.length > maxChips && <span style={{ fontSize: 10.5, color: C.faint, paddingLeft: 4 }}>+{its.length - maxChips}건</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 일정 = 시간축 관점(미결·리스크와 같은 규격: 현황 Metric + Sec). 달력 + 일정별 섹션. 실데이터=ctx.agenda.
export function Agenda({ ctx, facets }: { ctx: SectionCtx; facets?: Set<string> }) {
  const [selDate, setSelDate] = useState('');
  const kinds = facets && facets.size ? AGENDA_KINDS.filter((k) => facets.has(k)) : []; // 종류 필터
  const items = kinds.length ? ctx.agenda.filter((it) => kinds.includes(it.kind)) : ctx.agenda;
  const overdue = items.filter((it) => it.dday < 0);
  const today = items.filter((it) => it.dday === 0);
  const tomorrow = items.filter((it) => it.dday === 1);
  const week = items.filter((it) => it.dday >= 2 && it.dday <= 7);
  const later = items.filter((it) => it.dday >= 8);
  const dayItems = selDate ? items.filter((it) => it.date === selDate) : [];
  const dayFeed = useMemo(() => (selDate ? ctx.dayFeedFor(selDate) : []), [ctx, selDate]);
  const todayFeed = useMemo(() => ctx.dayFeedFor(TODAY), [ctx]);
  const secs: { id: string; label: string; arr: AgendaItem[] }[] = [
    { id: 'sc-overdue', label: '못한 일 (지남)', arr: overdue },
    { id: 'sc-today', label: '오늘 예정', arr: today },
    { id: 'sc-tomorrow', label: '내일', arr: tomorrow },
    { id: 'sc-week', label: '이번주', arr: week },
    { id: 'sc-later', label: '예정 (이후)', arr: later },
  ];
  return (
    <>
      <Sec title="현황" desc="기한(예정) · 오늘 한 일(실적)">
        <Cards min={128} fit>
          <Metric label="못한 일(지남)" value={overdue.length} tone={overdue.length ? 'danger' : 'ink'} onClick={() => goSec('sc-overdue')} />
          <Metric label="오늘 예정" value={today.length} tone={today.length ? 'warn' : 'ink'} onClick={() => goSec('sc-today')} />
          <Metric label="오늘 한 일" value={todayFeed.length} tone={todayFeed.length ? 'ok' : 'ink'} onClick={() => setSelDate(TODAY)} />
          <Metric label="내일" value={tomorrow.length} tone={tomorrow.length ? 'warn' : 'ink'} onClick={() => goSec('sc-tomorrow')} />
          <Metric label="이번주" value={week.length} tone="ink" onClick={() => goSec('sc-week')} />
        </Cards>
      </Sec>
      <Sec title="달력" desc="날짜 클릭 → 그 날 예정 + 그 날 한 일">
        <AgendaCalendar marks={items.map((it) => ({ date: it.date, tone: it.tone, label: it.plate || it.kind }))} selected={selDate} onSelect={(d) => setSelDate((s) => s === d ? '' : d)} />
      </Sec>
      {selDate ? (
        <>
          <Sec title={`${Number(selDate.slice(5, 7))}월 ${Number(selDate.slice(8, 10))}일 · 한 일`} n={dayFeed.length} desc="출고·반납·입금·수납·과태료·활동 — 클릭 → 차/손님" tone={dayFeed.length ? 'ok' : undefined}>
            {dayFeed.length
              ? <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{dayFeed.map((it, i) => <FeedRow key={i} it={it} />)}</div>
              : <EmptyState variant="sec">이 날 기록된 일 없음</EmptyState>}
          </Sec>
          <Sec title={`${Number(selDate.slice(5, 7))}월 ${Number(selDate.slice(8, 10))}일 · 예정`} n={dayItems.length} desc="기한 있는 일 · 다시 날짜 누르면 해제">
            {dayItems.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{dayItems.map((it, i) => <AgendaRow key={i} it={it} />)}</div> : <EmptyState variant="sec">이 날 예정 없음</EmptyState>}
          </Sec>
        </>
      ) : null}
      {secs.map((s) => (
        <Sec key={s.id} id={s.id} title={s.label} n={s.arr.length}>
          {s.arr.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{s.arr.slice(0, 40).map((it, i) => <AgendaRow key={i} it={it} />)}{s.arr.length > 40 ? <div style={{ fontSize: 11.5, color: C.faint, marginTop: SPACE_M }}>외 {s.arr.length - 40}건</div> : null}</div> : <EmptyState variant="sec">없음</EmptyState>}
        </Sec>
      ))}
    </>
  );
}
