'use client';
/**
 * 홈 목록 — 시간축(지연·오늘·이번 주·예정·완료)으로 묶인 업무 한 줄들.
 * 행 = 조치 · 대상 · 계약자·차명 · 금액 · 기한 · 담당. 배지·아이콘·행 안 버튼 없음. (SPEC §4-3~4-5, §5-1)
 */
import type { KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { EmptyState, FilterChips, PillTabs, C, SP, won } from '@/components/ui';
import type { HomeGroup } from '@/lib/home-problems';
import { HOME_GROUPS } from '@/lib/home-problems';
import {
  HOME_BUCKETS, dueCell, isUnassigned,
  type HomeBucket, type HomeOwnerFilter, type HomeTask,
} from '@/lib/home-work';
import {
  ROW_GRID, ROW_GAP, ROW_H, ROW_H_M, SEC_H, COLS_H, PAD_X, PAD_X_M,
  capStyle, hairline, hairlineSoft, tabular, ellipsis, coTagStyle, kbdStyle, dueColor,
} from './home-styles';

/** 인라인 카운트 — 배지 버블 대신 숫자만(SPEC: 색은 신호에만). */
function N({ n, tone }: { n: number; tone?: 'warn' | 'danger' }) {
  return <span style={{ color: tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : C.faint, fontWeight: 500, marginLeft: 2, ...tabular }}>{n}</span>;
}

export type HomePulse = { held: number; running: number; idle: number; util: number; misuTotal: number; misuCount: number };

export function HomeList({
  mobile, today, me, tasks, summary, counts, pulse,
  owner, onOwner, dom, onDom, sel, onSelect, fold, onFold, showCompany, loading,
}: {
  mobile: boolean;
  today: string;
  me: string;
  /** 필터 적용된 목록 */
  tasks: HomeTask[];
  summary: Record<HomeBucket, number>;
  counts: { me: number; none: number; all: number; dom: Record<HomeGroup, number> };
  pulse: HomePulse;
  owner: HomeOwnerFilter; onOwner: (v: HomeOwnerFilter) => void;
  dom: HomeGroup | null; onDom: (v: HomeGroup | null) => void;
  sel: string | null; onSelect: (id: string) => void;
  fold: Record<'later' | 'done', boolean>; onFold: (k: 'later' | 'done') => void;
  showCompany: boolean;
  loading: boolean;
}) {
  const padX = mobile ? PAD_X_M : PAD_X;
  const dateLabel = `${today.slice(0, 10)} ${['일', '월', '화', '수', '목', '금', '토'][new Date(`${today.slice(0, 10)}T00:00:00+09:00`).getDay()]}`;

  const summaryLine = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `0 ${SP[3] + 2}px`, marginTop: 5, fontSize: 12.5, color: C.sub, ...tabular }}>
      <span style={{ color: summary.late ? C.danger : C.ok, fontWeight: 600 }}>
        지연 <b style={{ fontWeight: 600 }}>{summary.late === 0 ? '없음' : summary.late}</b>
      </span>
      <span>오늘 <b style={{ color: C.ink, fontWeight: 600 }}>{summary.today}</b></span>
      <span>이번 주 <b style={{ color: C.ink, fontWeight: 600 }}>{summary.week}</b></span>
      <span>예정 <b style={{ color: C.ink, fontWeight: 600 }}>{summary.later}</b></span>
      <span>완료 <b style={{ color: C.ink, fontWeight: 600 }}>{summary.done}</b></span>
    </div>
  );
  const pulseLine = (
    <div style={{ marginTop: 4, fontSize: 11, color: C.sub, display: 'flex', flexWrap: 'wrap', gap: `0 ${SP[3]}px`, ...tabular }}>
      <span>보유 <b style={{ color: C.ink, fontWeight: 600 }}>{pulse.held}</b></span>
      <span>운행 <b style={{ color: C.ink, fontWeight: 600 }}>{pulse.running}</b></span>
      <span>휴차 <b style={{ color: C.ink, fontWeight: 600 }}>{pulse.idle}</b></span>
      <span>가동률 <b style={{ color: C.ink, fontWeight: 600 }}>{pulse.util}%</b></span>
      <span>미수 <b style={{ color: C.danger, fontWeight: 600 }}>{won(pulse.misuTotal)}</b> · {pulse.misuCount}건</span>
    </div>
  );
  const seg = (
    <PillTabs<HomeOwnerFilter>
      size="sm"
      value={owner}
      onChange={onOwner}
      tabs={[
        { key: 'me', label: <>내 업무 <N n={counts.me} /></> },
        { key: 'none', label: <>미배정 <N n={counts.none} tone={counts.none ? 'warn' : undefined} /></> },
        { key: 'all', label: <>전체 <N n={counts.all} /></> },
      ]}
    />
  );
  const chips = (
    <FilterChips<HomeGroup>
      value={dom}
      onChange={onDom}
      allowOff
      options={HOME_GROUPS.map((g) => ({ key: g, label: <>{g} <N n={counts.dom[g] || 0} tone={g === '미수' && counts.dom[g] ? 'danger' : undefined} /></> }))}
    />
  );

  const head = mobile ? (
    <div style={{ padding: `${SP[3] + 2}px ${padX}px ${SP[3]}px`, background: C.card, borderBottom: hairline, flex: 'none' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.ink }}>업무</div>
      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{dateLabel} · {me}</div>
      {summaryLine}
      {pulseLine}
      <div style={{ marginTop: SP[3] }}>{seg}</div>
    </div>
  ) : (
    <div style={{ padding: `${SP[3] + 2}px ${padX}px 0`, flex: 'none' }}>
      <div style={{ fontSize: 11, color: C.sub }}>{dateLabel} · 담당 {me}</div>
      {summaryLine}
      {pulseLine}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP[3], marginTop: SP[3] }}>
        {seg}{chips}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: ROW_GRID, gap: ROW_GAP, height: COLS_H, alignItems: 'center',
        marginTop: SP[2] + 2, borderBottom: hairline,
      }}>
        <span style={capStyle}>조치</span>
        <span style={capStyle}>대상</span>
        <span style={capStyle}>계약자 · 차명</span>
        <span style={{ ...capStyle, textAlign: 'right' }}>금액</span>
        <span style={{ ...capStyle, textAlign: 'right' }}>기한</span>
        <span style={{ ...capStyle, textAlign: 'right' }}>담당</span>
      </div>
    </div>
  );

  const groups = HOME_BUCKETS.map((b) => ({ ...b, rows: tasks.filter((t) => t.bucket === b.key) }));
  const anyOpen = groups.some((g) => !g.fold && g.rows.length > 0);

  return (
    <section style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: C.card, height: '100%' }}>
      {head}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {loading && tasks.length === 0 ? (
          <div style={{ padding: `${SP[6]}px ${padX}px`, color: C.sub, fontSize: 12 }}>불러오는 중…</div>
        ) : !anyOpen ? (
          <div style={{ padding: `${SP[5]}px ${padX}px` }}>
            <EmptyState variant="ok">처리할 업무가 없습니다 — 지연 · 오늘 · 이번 주가 모두 비어 있습니다</EmptyState>
          </div>
        ) : null}
        {groups.map((g) => {
          if (g.fold) {
            const open = fold[g.key as 'later' | 'done'];
            return (
              <div key={g.key}>
                <div
                  role="button" tabIndex={0}
                  onClick={() => onFold(g.key as 'later' | 'done')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFold(g.key as 'later' | 'done'); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SP[1] + 2, height: SEC_H, padding: `0 ${padX}px`,
                    ...capStyle, color: open && g.key === 'done' ? C.ok : C.faint, borderBottom: hairlineSoft, cursor: 'pointer',
                  }}
                >
                  <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', marginLeft: -4 }} />
                  <span>{g.label}</span>
                  <span style={{ ...tabular, letterSpacing: 0 }}>{g.rows.length}</span>
                  <span style={{ marginLeft: 'auto', fontWeight: 500, letterSpacing: 0, fontSize: 11 }}>{open ? '접기' : '펼치기'}</span>
                </div>
                {open && g.rows.map((t) => <Row key={t.id} t={t} mobile={mobile} sel={sel === t.id} onSelect={onSelect} showCompany={showCompany} padX={padX} />)}
              </div>
            );
          }
          if (g.rows.length === 0) return null;
          const misu = g.rows.filter((r) => r.group === '미수').reduce((s, r) => s + (r.amount || 0), 0);
          const color = g.key === 'late' ? C.danger : g.key === 'today' ? C.warn : C.sub;
          return (
            <div key={g.key}>
              <div style={{
                position: 'sticky', top: 0, zIndex: 1, background: C.card, display: 'flex', alignItems: 'center', gap: SP[1] + 2,
                height: SEC_H, padding: `0 ${padX}px`, ...capStyle, color, borderBottom: hairlineSoft,
              }}>
                <span>{g.label}</span>
                <span style={{ ...tabular, letterSpacing: 0 }}>{g.rows.length}</span>
                {misu > 0 && <span style={{ marginLeft: 'auto', fontWeight: 500, letterSpacing: 0, fontSize: 11, color: C.danger, ...tabular }}>미수 {won(misu)}</span>}
              </div>
              {g.rows.map((t) => <Row key={t.id} t={t} mobile={mobile} sel={sel === t.id} onSelect={onSelect} showCompany={showCompany} padX={padX} />)}
            </div>
          );
        })}
        {mobile && <div style={{ height: 72 }} />}
      </div>
      {!mobile && (
        <div style={{
          flex: 'none', height: 30, borderTop: hairline, display: 'flex', alignItems: 'center', gap: SP[3] + 2,
          padding: `0 ${padX}px`, fontSize: 11, color: C.faint,
        }}>
          <span><span style={kbdStyle}>↑</span><span style={kbdStyle}>↓</span> 이동</span>
          <span><span style={kbdStyle}>E</span> 완료</span>
          <span><span style={kbdStyle}>A</span> 접수</span>
          <span><span style={kbdStyle}>S</span> 연기</span>
          <span style={{ marginLeft: 'auto', ...tabular }}>{tasks.filter((t) => t.bucket !== 'done').length}건</span>
        </div>
      )}
    </section>
  );
}

function Row({ t, mobile, sel, onSelect, showCompany, padX }: {
  t: HomeTask; mobile: boolean; sel: boolean; onSelect: (id: string) => void; showCompany: boolean; padX: number;
}) {
  const due = dueCell(t);
  const who = [t.who, t.carName].filter(Boolean).join(' · ');
  const bad = t.group === '미수';
  const unassigned = isUnassigned(t);
  const done = t.bucket === 'done';
  const strike = done ? { color: C.faint, textDecoration: 'line-through', textDecorationColor: C.line } : null;
  const co = showCompany && t.company ? <i style={coTagStyle}>{t.company}</i> : null;
  const kb = {
    role: 'button' as const, tabIndex: 0,
    onClick: () => onSelect(t.id),
    onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(t.id); } },
  };
  if (mobile) {
    return (
      <div {...kb} style={{
        display: 'flex', flexDirection: 'column', gap: 3, padding: `${SP[2]}px ${padX}px`, minHeight: ROW_H_M, justifyContent: 'center',
        background: sel ? C.selected : C.card, borderBottom: hairlineSoft, cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP[2], minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, color: C.ink, ...ellipsis, ...strike }}>{t.action}</span>
          {t.amount > 0 && <span style={{ fontSize: 12.5, fontWeight: bad ? 600 : 500, color: bad ? C.danger : C.ink, ...tabular, ...strike }}>{won(t.amount)}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SP[2], minWidth: 0, fontSize: 12 }}>
          {t.plate && <span style={{ fontWeight: 600, color: C.ink, ...tabular, ...strike }}>{t.plate}</span>}
          {co}
          <span style={{ color: C.sub, flex: 1, minWidth: 0, ...ellipsis, ...strike }}>{t.plate ? who : t.who}</span>
          <span style={{ fontSize: 11, fontWeight: due.tone === 'week' || due.tone === 'later' ? 500 : 600, color: dueColor(due.tone), ...tabular }}>{due.text}</span>
          <span style={{ fontSize: 11, color: unassigned ? C.warn : C.sub, fontWeight: unassigned ? 600 : 400 }}>{unassigned ? '미배정' : t.assignee}</span>
        </div>
      </div>
    );
  }
  return (
    <div {...kb} style={{
      display: 'grid', gridTemplateColumns: ROW_GRID, gap: ROW_GAP, alignItems: 'center', height: ROW_H,
      padding: `0 ${padX}px`, borderBottom: hairlineSoft, cursor: 'pointer', position: 'relative', outline: 'none',
      background: sel ? C.selected : 'transparent',
    }}>
      {sel && <span style={{ position: 'absolute', left: 0, top: -1, bottom: -1, width: 2, background: C.ink }} />}
      <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, ...ellipsis, ...strike }}>{t.action}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, ...ellipsis, ...tabular, ...strike }}>{t.plate || t.who}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: SP[1] + 2, minWidth: 0, color: C.sub, fontSize: 12 }}>
        {co}<span style={{ ...ellipsis, ...strike }}>{t.plate ? who : ''}</span>
      </span>
      <span style={{ textAlign: 'right', fontSize: 12, fontWeight: bad ? 600 : 500, color: bad ? C.danger : C.ink, whiteSpace: 'nowrap', ...tabular, ...strike }}>{t.amount > 0 ? won(t.amount) : ''}</span>
      <span style={{ textAlign: 'right', fontSize: 11, fontWeight: due.tone === 'week' || due.tone === 'later' ? 500 : 600, color: dueColor(due.tone), whiteSpace: 'nowrap', ...tabular }}>{due.text}</span>
      <span style={{ textAlign: 'right', fontSize: 11, color: unassigned ? C.warn : C.sub, fontWeight: unassigned ? 600 : 400, ...ellipsis }}>{unassigned ? '미배정' : t.assignee}</span>
    </div>
  );
}
