'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { useReloadOnSaved } from '@/lib/use-reload-on-saved';
import { Sec, Cards, Metric, Btn, Input, C } from '@/components/ui';
import { AgendaCalendar, type CalMark } from '@/components/Agenda';
import { TODAY } from '@/lib/dashboard-consts';
import { ALL_COMPANIES } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { completeWork, type WorkItem } from '@/lib/workflow';

type MyEvent = WorkItem & { date: string; memo?: string; done?: boolean };
const ddayOf = (date: string) => Math.round((new Date(`${date}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 86400000);
const toneOf = (e: MyEvent): CalMark['tone'] => e.done ? 'gray' : (() => {
  const d = ddayOf(e.date); return d < 0 ? 'red' : d === 0 ? 'amber' : d <= 7 ? 'green' : 'gray';
})();

export function MySchedule() {
  const { user, companyId } = useSession();
  const [events, setEvents] = useState<MyEvent[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ date: TODAY, title: '', memo: '' });
  const [sel, setSel] = useState('');

  const load = useCallback(async () => {
    const records = await getStore().list('work_item', companyId);
    setEvents(records
      .filter((r) => String(r.assigneeId || '') === user.uid)
      .map((r) => ({
        ...r, id: String(r.id || r._key), title: String(r.title || ''),
        date: String(r.dueDate || r.date || TODAY), memo: r.memo ? String(r.memo) : undefined,
        status: (r.status || 'todo') as WorkItem['status'],
        source: (r.source || 'manual') as WorkItem['source'],
        done: r.status === 'completed' || !!r.done,
      })));
  }, [companyId, user.uid]);
  useEffect(() => { void load(); }, [load]);
  useReloadOnSaved(load);

  async function add() {
    const title = form.title.trim();
    if (!title || !form.date || busy) return;
    if (companyId === ALL_COMPANIES) {
      toast('일정을 저장할 회사를 먼저 선택하세요.', 'error'); return;
    }
    setBusy(true);
    try {
      const id = `work_${user.uid}_${Date.now()}`;
      await getStore().save('work_item', companyId, [{
        id, _key: id, title, memo: form.memo.trim(), dueDate: form.date,
        assigneeId: user.uid, assigneeName: user.name, source: 'manual', status: 'todo',
      }]);
      setForm({ date: TODAY, title: '', memo: '' });
      setAdding(false);
      await load();
      toast('일정을 저장했습니다.', 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function toggleDone(event: MyEvent) {
    if (busy) return;
    setBusy(true);
    try {
      if (!event.done) {
        const result = completeWork({ item: event, companyId: String(event.companyId || companyId) });
        await getStore().update('work_item', companyId, String(event._key), {
          status: result.completed.status, completedAt: result.completed.completedAt,
        });
        await getStore().save('atomic_event', String(event.companyId || companyId), [result.event]);
      } else {
        await getStore().update('work_item', companyId, String(event._key), { status: 'todo', completedAt: null });
      }
      await load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function remove(event: MyEvent) {
    if (busy) return;
    setBusy(true);
    try {
      await getStore().remove('work_item', companyId, String(event._key), '사용자 일정 삭제');
      await load();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const sorted = useMemo(() => [...events].sort((a, b) => a.date.localeCompare(b.date)), [events]);
  const marks: CalMark[] = sorted.map((e) => ({ date: e.date, tone: toneOf(e), label: e.title }));
  const overdue = sorted.filter((e) => !e.done && ddayOf(e.date) < 0);
  const today = sorted.filter((e) => ddayOf(e.date) === 0);
  const upcoming = sorted.filter((e) => ddayOf(e.date) > 0 && !e.done);
  const dayItems = sel ? sorted.filter((e) => e.date === sel) : [];

  const Row = ({ event }: { event: MyEvent }) => {
    const d = ddayOf(event.date);
    const dtext = d < 0 ? `${-d}일 지남` : d === 0 ? '오늘' : `D-${d}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 'var(--radius)', background: C.card, border: `1px solid ${C.line}`, opacity: event.done ? 0.55 : 1 }}>
        <input type="checkbox" checked={!!event.done} disabled={busy} onChange={() => void toggleDone(event)} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, textDecoration: event.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</div>
          {event.memo ? <div style={{ fontSize: 11.5, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.memo}</div> : null}
        </div>
        <span style={{ fontSize: 12, color: C.faint, whiteSpace: 'nowrap' }}>{event.date.slice(5)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: event.done ? C.faint : d < 0 ? C.danger : d === 0 ? C.warn : C.mute, minWidth: 52, textAlign: 'right' }}>{event.done ? '완료' : dtext}</span>
        <button onClick={() => void remove(event)} disabled={busy} title="삭제" style={{ border: 'none', background: 'none', color: C.faint, cursor: 'pointer', padding: '2px 4px' }}>×</button>
      </div>
    );
  };
  const List = ({ items }: { items: MyEvent[] }) => items.length
    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{items.map((event) => <Row key={event.id} event={event} />)}</div>
    : <div style={{ fontSize: 12.5, color: C.faint }}>없음</div>;

  return (
    <>
      <Sec title="내 일정" desc="회사 공용 업무 저장소에서 내게 배정된 일정" right={<Btn variant={adding ? 'solid' : 'ghost'} onClick={() => setAdding((a) => !a)}>{adding ? '닫기' : '+ 일정 추가'}</Btn>}>
        <Cards min={128} fit>
          <Metric label="지연·미완" value={overdue.length} tone={overdue.length ? 'danger' : 'ink'} />
          <Metric label="오늘" value={today.length} tone={today.length ? 'warn' : 'ink'} />
          <Metric label="예정" value={upcoming.length} tone="ink" />
          <Metric label="전체" value={events.length} tone="ink" />
        </Cards>
        {adding ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12, padding: '12px 14px', border: `1px solid ${C.accent}`, borderRadius: 'var(--radius)', background: 'var(--bg-card)' }}>
          <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} style={{ width: 150 }} />
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="업무 / 일정 제목" style={{ flex: 1, minWidth: 160 }} autoFocus />
          <Input value={form.memo} onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="메모(선택)" style={{ flex: 1, minWidth: 120 }} />
          <Btn onClick={() => void add()} disabled={busy}>{busy ? '저장 중…' : '추가'}</Btn>
        </div> : null}
      </Sec>
      <Sec title="내 달력" desc="날짜를 누르면 그날 일정을 확인합니다.">
        <AgendaCalendar marks={marks} selected={sel} onSelect={(d) => setSel((s) => s === d ? '' : d)} />
      </Sec>
      {sel ? <Sec title={`${Number(sel.slice(5, 7))}월 ${Number(sel.slice(8, 10))}일`} n={dayItems.length}><List items={dayItems} /></Sec> : null}
      <Sec id="ms-overdue" title="지연·미완" n={overdue.length}><List items={overdue} /></Sec>
      <Sec id="ms-today" title="오늘" n={today.length}><List items={today} /></Sec>
      <Sec id="ms-upcoming" title="예정" n={upcoming.length}><List items={upcoming} /></Sec>
    </>
  );
}
