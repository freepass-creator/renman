'use client';
/**
 * 수행창 — 고른 대상의 360. 탭은 「수행」과 「차량360」 둘뿐. (SPEC §4-6~4-9, §5-2)
 *   수행   = 조치 블록(제목·사유·기한·담당·금액·근거 → 완료/접수 · 연기 · 이관/담당 지정 → 빠른 기록)
 *            + 이 차량의 다른 업무 + 최근 이력 3
 *   차량360 = 기존 Vehicle360(embed) 그대로. 별도 「차량 360 →」 링크 없음 — 탭이 곧 360.
 */
import { Check, ChevronDown, Plus, ArrowRight } from 'lucide-react';
import { ActionMenu, Btn, EmptyState, PillTabs, TextLink, C, SP, won } from '@/components/ui';
import { Vehicle360 } from '@/components/Vehicle360';
import type { EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';
import { openLog } from '@/lib/ui-bus';
import { dueCell, isUnassigned, type HomeAction, type HomeTask } from '@/lib/home-work';
import {
  PANE_MAX_W, PAD_X, PAD_X_M, capStyle, hairline, hairlineSoft, tabular, ellipsis, coTagStyle, kbdStyle, dueColor,
} from './home-styles';

export type PaneTab = 'do' | 'v360';

export function WorkPane({
  mobile, task, tasks, history, tab, onTab, onSelect, onAction, busy, assignees, showCompany,
}: {
  mobile: boolean;
  task: HomeTask | null;
  /** 전체(필터 전) — 같은 차량의 다른 업무를 찾는다 */
  tasks: HomeTask[];
  history: EntityRecord[];
  tab: PaneTab; onTab: (t: PaneTab) => void;
  onSelect: (id: string) => void;
  onAction: (t: HomeTask, a: HomeAction, opts?: { days?: number; assignee?: string }) => void;
  busy: boolean;
  assignees: string[];
  showCompany: boolean;
}) {
  const padX = mobile ? PAD_X_M : PAD_X;
  if (!task) {
    return (
      <div style={{ padding: `${SP[6]}px ${padX}px` }}>
        <EmptyState variant="sec">왼쪽에서 업무를 선택하세요</EmptyState>
      </div>
    );
  }
  const others = task.plate
    ? tasks.filter((o) => o.plate && normPlate(o.plate) === normPlate(task.plate) && o.id !== task.id && o.bucket !== 'done')
    : [];
  const doN = (task.bucket === 'done' ? 0 : 1) + others.length;
  const due = dueCell(task);
  const unassigned = isUnassigned(task);
  const bad = task.group === '미수';
  const done = task.bucket === 'done';

  const pill = done ? { text: '완료', color: C.sub, bg: C.head }
    : bad && task.bucket === 'late' && task.effectiveDday != null && task.effectiveDday < 0
      ? { text: `미납 ${-task.effectiveDday}일`, color: C.danger, bg: 'var(--red-bg)' }
      : task.plate && !task.who ? { text: '휴차', color: C.warn, bg: 'var(--orange-bg)' }
        : task.plate ? { text: '계약중', color: C.sub, bg: C.head } : null;

  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: SP[2] + 2, minHeight: mobile ? 44 : 48, flexWrap: mobile ? 'wrap' : 'nowrap', padding: mobile ? `${SP[3]}px 0` : 0 }}>
      {showCompany && task.company && <i style={coTagStyle}>{task.company}</i>}
      <span style={{ fontSize: mobile ? 16 : 15, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em', ...tabular }}>{task.plate || task.who}</span>
      {task.plate && <span style={{ fontSize: 12, color: C.sub, ...ellipsis }}>{[task.carName, task.who].filter(Boolean).join(' · ')}</span>}
      {!task.plate && <span style={{ fontSize: 12, color: C.sub }}>{task.company || ''}</span>}
      {pill && <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 3, background: pill.bg, color: pill.color, fontWeight: 600, whiteSpace: 'nowrap', letterSpacing: '.02em' }}>{pill.text}</span>}
    </div>
  );

  const tabs = (
    <div style={{ borderBottom: hairline, margin: `0 -${padX}px`, padding: `0 ${padX}px` }}>
      <PillTabs<PaneTab>
        size="sm"
        value={tab}
        onChange={onTab}
        tabs={[
          { key: 'do', label: <>수행 <span style={{ color: C.faint, fontWeight: 500, marginLeft: 2, ...tabular }}>{doN}</span></> },
          { key: 'v360', label: task.plate ? '차량360' : '자금' },
        ]}
      />
    </div>
  );

  const recent = task.plate
    ? history
      .filter((h) => normPlate(h.plate) === normPlate(task.plate))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 3)
    : [];

  const meta = (
    <div style={{
      display: 'grid', gridTemplateColumns: mobile ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, auto)', justifyContent: 'start',
      gap: mobile ? `${SP[2]}px ${SP[4]}px` : `0 ${SP[5] - 2}px`, marginTop: SP[3], fontSize: 11,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={capStyle}>기한</span>
        <b style={{ fontSize: 12, fontWeight: 600, color: due.tone === 'late' ? C.danger : due.tone === 'today' ? C.warn : C.ink, ...tabular }}>
          {due.text || '—'}{!done && task.effectiveDue ? ` · ${task.effectiveDue}` : ''}
        </b>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={capStyle}>담당</span>
        <b style={{ fontSize: 12, fontWeight: 600, color: unassigned ? C.warn : C.ink }}>{unassigned ? '미배정' : task.assignee}</b>
      </div>
      {task.amount > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={capStyle}>금액</span>
          <b style={{ fontSize: 12, fontWeight: 600, color: bad ? C.danger : C.ink, ...tabular }}>{won(task.amount)}</b>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={capStyle}>근거</span>
        <b style={{ fontSize: 12, fontWeight: 500, color: C.sub, ...tabular, ...ellipsis }}>{task.workId}</b>
      </div>
    </div>
  );

  const deferMenu = (
    <ActionMenu
      size="sm"
      label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>연기 <ChevronDown size={12} /></span>}
      items={[
        { key: 'd7', label: '1주 후', onClick: () => onAction(task, 'defer', { days: 7 }) },
        { key: 'd14', label: '2주 후', onClick: () => onAction(task, 'defer', { days: 14 }) },
        { key: 'd30', label: '한 달 후', onClick: () => onAction(task, 'defer', { days: 30 }) },
      ]}
    />
  );
  const assignMenu = (
    <ActionMenu
      size="sm"
      label={unassigned ? '담당 지정' : '이관'}
      items={assignees.length
        ? assignees.map((n) => ({ key: n, label: n, disabled: n === task.assignee, onClick: () => onAction(task, 'assign', { assignee: n }) }))
        : [{ key: 'none', label: '지정할 담당자 없음', disabled: true, onClick: () => {} }]}
    />
  );

  const actions = done ? (
    <span style={{ color: C.ok, fontWeight: 600, display: 'inline-flex', gap: SP[1] + 2, alignItems: 'center', fontSize: 12 }}>
      <Check size={12} /> 오늘 완료 · {task.assignee}
    </span>
  ) : (
    <>
      {unassigned
        ? <Btn size="sm" disabled={busy} onClick={() => onAction(task, 'take')}>접수</Btn>
        : <Btn size="sm" disabled={busy} onClick={() => onAction(task, 'done')}><Check size={12} /> 완료</Btn>}
      {deferMenu}
      {assignMenu}
      {!mobile && (
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 3 }}>
          <span style={kbdStyle}>E</span><span style={kbdStyle}>S</span><span style={kbdStyle}>A</span>
        </span>
      )}
    </>
  );

  const quick = (
    <div style={{
      marginTop: SP[2] + 2, minHeight: mobile ? 34 : 30, borderRadius: 4, border: hairline, display: 'flex', alignItems: 'center',
      gap: SP[2], padding: `0 ${SP[2] + 1}px`, color: C.faint, fontSize: 12,
    }}>
      <Plus size={14} /><span>기록</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
        {['통화', '입금', '문자', '메모'].map((k) => (
          <TextLink key={k} tone="accent" onClick={() => openLog({ plate: task.plate || undefined, customer: task.who || undefined, companyId: task.companyId || undefined })}>{k}</TextLink>
        ))}
      </span>
    </div>
  );

  const doBody = (
    <>
      <div style={{ padding: `${SP[4]}px 0 ${SP[3] + 2}px`, borderBottom: hairline }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', margin: `0 0 ${SP[1] + 2}px`, lineHeight: 1.3, color: C.ink }}>{task.action}</h2>
        <div style={{ color: C.sub, fontSize: 12, lineHeight: 1.55, maxWidth: '64ch' }}>
          {[task.problem, task.status && task.status !== '미처리' ? task.status : ''].filter(Boolean).join(' · ') || '기한이 다가옵니다. 사전에 처리하세요.'}
        </div>
        {meta}
        <div style={{ display: 'flex', gap: SP[1] + 2, marginTop: SP[3] + 2, alignItems: 'center', flexWrap: mobile ? 'wrap' : 'nowrap' }}>{actions}</div>
        {quick}
      </div>
      {others.length > 0 && (
        <div style={{ padding: `${SP[3]}px 0 2px`, borderBottom: hairline }}>
          <h3 style={{ ...capStyle, color: C.sub, margin: `0 0 ${SP[1]}px`, height: 18, display: 'flex', alignItems: 'center' }}>이 차량의 다른 업무 {others.length}</h3>
          {others.map((o) => {
            const q = dueCell(o);
            const un = isUnassigned(o);
            return (
              <div
                key={o.id} role="button" tabIndex={0}
                onClick={() => onSelect(o.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(o.id); } }}
                style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 40px 56px', gap: SP[2] + 2, height: 30, alignItems: 'center',
                  fontSize: 12, cursor: 'pointer', borderTop: hairlineSoft,
                }}
              >
                <span style={{ fontWeight: 600, ...ellipsis }}>{o.action}</span>
                <span style={{ textAlign: 'right', fontWeight: o.group === '미수' ? 600 : 500, color: o.group === '미수' ? C.danger : C.ink, ...tabular }}>{o.amount > 0 ? won(o.amount) : ''}</span>
                <span style={{ textAlign: 'right', fontSize: 11, fontWeight: 600, color: dueColor(q.tone), ...tabular }}>{q.text}</span>
                <span style={{ textAlign: 'right', fontSize: 11, color: un ? C.warn : C.sub, fontWeight: un ? 600 : 400 }}>{un ? '미배정' : o.assignee}</span>
              </div>
            );
          })}
        </div>
      )}
      {task.plate && (
        <div style={{ padding: `${SP[3]}px 0 2px` }}>
          <h3 style={{ ...capStyle, color: C.sub, margin: `0 0 ${SP[1]}px`, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>최근 이력</span>
            <TextLink onClick={() => onTab('v360')} tone="accent">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, letterSpacing: 0 }}>전체 → 차량360 <ArrowRight size={12} /></span>
            </TextLink>
          </h3>
          {recent.length === 0 ? (
            <div style={{ fontSize: 12, color: C.faint, padding: `${SP[2]}px 0` }}>기록된 이력이 없습니다</div>
          ) : recent.map((h, i) => (
            <div key={`${h.histKey || i}`} style={{
              display: 'grid', gridTemplateColumns: '40px 36px minmax(0,1fr) 84px', gap: SP[3], height: 28, alignItems: 'center',
              borderTop: hairlineSoft, fontSize: 12,
            }}>
              <span style={{ color: C.faint, fontSize: 11, ...tabular }}>{String(h.date || '').slice(5, 10)}</span>
              <span style={{ color: C.sub, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{String(h.category || '')}</span>
              <span style={ellipsis}>{String(h.title || h.description || '')}</span>
              <span style={{ fontWeight: 500, textAlign: 'right', ...tabular }}>{Number(h.cost) > 0 ? won(Number(h.cost)) : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const v360Body = task.plate ? (
    <div style={{ margin: `0 -${padX}px` }}>
      <Vehicle360 plate={task.plate} embed companyId={task.companyId || undefined} />
    </div>
  ) : (
    <div style={{ padding: `${SP[4]}px 0` }}>
      <div style={{ fontSize: 12, color: C.sub, marginBottom: SP[3] }}>차량이 붙지 않은 업무입니다. 자금 원장에서 확인합니다.</div>
      <Btn size="sm" variant="ghost" href="/cash">자금관리 열기</Btn>
    </div>
  );

  return (
    <div style={{ maxWidth: mobile ? undefined : PANE_MAX_W, padding: `0 ${padX}px ${SP[6] + SP[2]}px` }}>
      {head}
      {tabs}
      {tab === 'do' ? doBody : v360Body}
    </div>
  );
}
