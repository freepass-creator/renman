'use client';
/**
 * 내 일정 — 마이페이지 전용. 직원이 직접 넣는 "나만의" 일정(회사 전체 자동 일정과 다름).
 *   저장 = 사용자별 localStorage(jpk:myschedule:<uid>). 달력은 공용 AgendaCalendar 재사용.
 *   (향후: 서버 동기화·담당자 배정 시 자동 일정과 병합 가능)
 */
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { Sec, Cards, Metric, Btn, C } from '@/components/ui';
import { AgendaCalendar, type CalMark } from '@/components/Agenda';
import { TODAY } from '@/lib/dashboard-consts';

type MyEvent = { id: string; date: string; title: string; memo?: string; done?: boolean };
const inp: React.CSSProperties = { height: 34, boxSizing: 'border-box', padding: '0 10px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', fontSize: 14, background: '#fff', color: C.ink, fontFamily: 'inherit' };
const ddayOf = (date: string) => Math.round((new Date(date + 'T00:00:00').getTime() - new Date(TODAY + 'T00:00:00').getTime()) / 86400000);
const toneOf = (e: MyEvent): CalMark['tone'] => e.done ? 'gray' : (() => { const d = ddayOf(e.date); return d < 0 ? 'red' : d === 0 ? 'amber' : d <= 7 ? 'green' : 'gray'; })();

export function MySchedule() {
  const { user } = useSession();
  const key = `jpk:myschedule:${user.uid}`;
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ date: TODAY, title: '', memo: '' });
  const [sel, setSel] = useState('');

  useEffect(() => { try { const raw = localStorage.getItem(key); setEvents(raw ? (JSON.parse(raw) as MyEvent[]) : []); } catch { setEvents([]); } }, [key]);
  const save = (next: MyEvent[]) => { setEvents(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 무시 */ } };
  const add = () => { const t = form.title.trim(); if (!t || !form.date) return; save([...events, { id: `ev${Date.now()}${events.length}`, date: form.date, title: t, memo: form.memo.trim() || undefined }]); setForm({ date: TODAY, title: '', memo: '' }); setAdding(false); };
  const toggleDone = (id: string) => save(events.map((e) => e.id === id ? { ...e, done: !e.done } : e));
  const remove = (id: string) => save(events.filter((e) => e.id !== id));

  const sorted = useMemo(() => [...events].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0), [events]);
  const marks: CalMark[] = sorted.map((e) => ({ date: e.date, tone: toneOf(e), label: e.title }));
  const overdue = sorted.filter((e) => !e.done && ddayOf(e.date) < 0);
  const today = sorted.filter((e) => ddayOf(e.date) === 0);
  const upcoming = sorted.filter((e) => ddayOf(e.date) > 0 && !e.done);
  const dayItems = sel ? sorted.filter((e) => e.date === sel) : [];

  const Row = ({ e }: { e: MyEvent }) => {
    const d = ddayOf(e.date);
    const dtxt = d < 0 ? `${-d}일 지남` : d === 0 ? '오늘' : `D-${d}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius)', background: '#fff', border: `1px solid ${C.line}`, opacity: e.done ? 0.55 : 1 }}>
        <input type="checkbox" checked={!!e.done} onChange={() => toggleDone(e.id)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: e.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</div>
          {e.memo ? <div style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.memo}</div> : null}
        </div>
        <span style={{ fontSize: 12, color: C.faint, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.date.slice(5)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: e.done ? C.faint : d < 0 ? C.danger : d === 0 ? C.warn : C.mute, whiteSpace: 'nowrap', minWidth: 52, textAlign: 'right' }}>{e.done ? '완료' : dtxt}</span>
        <button onClick={() => remove(e.id)} title="삭제" style={{ border: 'none', background: 'none', color: C.faint, cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}>✕</button>
      </div>
    );
  };
  const List = ({ arr }: { arr: MyEvent[] }) => arr.length
    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{arr.map((e) => <Row key={e.id} e={e} />)}</div>
    : <div style={{ fontSize: 12.5, color: C.faint }}>없음</div>;

  return (
    <>
      <Sec title="현황" desc="내가 직접 넣는 나만의 일정" right={<Btn variant={adding ? 'solid' : 'ghost'} onClick={() => setAdding((a) => !a)}>{adding ? '닫기' : '+ 일정 추가'}</Btn>}>
        <Cards min={128} fit>
          <Metric label="지남·미완" value={overdue.length} tone={overdue.length ? 'danger' : 'ink'} />
          <Metric label="오늘" value={today.length} tone={today.length ? 'warn' : 'ink'} />
          <Metric label="예정" value={upcoming.length} tone="ink" />
          <Metric label="전체" value={events.length} tone="ink" />
        </Cards>
        {adding ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, padding: '12px 14px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ ...inp, width: 150 }} />
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="할 일 / 일정 제목" style={{ ...inp, flex: 1, minWidth: 160 }} autoFocus />
          <input value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="메모(선택)" style={{ ...inp, flex: 1, minWidth: 120 }} />
          <Btn onClick={add}>추가</Btn>
        </div> : null}
      </Sec>

      <Sec title="달력" desc="날짜 클릭 → 그 날 내 일정">
        <AgendaCalendar marks={marks} selected={sel} onSelect={(d) => setSel((s) => s === d ? '' : d)} />
      </Sec>

      {sel ? (
        <Sec title={`${Number(sel.slice(5, 7))}월 ${Number(sel.slice(8, 10))}일`} n={dayItems.length} desc="선택한 날 · 다시 누르면 해제">
          <List arr={dayItems} />
        </Sec>
      ) : null}

      <Sec id="ms-overdue" title="지남 · 미완" n={overdue.length}><List arr={overdue} /></Sec>
      <Sec id="ms-today" title="오늘" n={today.length}><List arr={today} /></Sec>
      <Sec id="ms-upcoming" title="예정" n={upcoming.length}><List arr={upcoming} /></Sec>
    </>
  );
}
