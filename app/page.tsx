'use client';
/**
 * 홈 = 「업무」 — 목록 + 수행창. (설계 정본 design/home-inbox/SPEC.md v3.1)
 *
 *   왼쪽 목록  : ERP가 감지한 문제를 조치 단위로 번역한 업무. 시간축(지연·오늘·이번 주·예정·완료)으로 묶고
 *               사람축(내 업무·미배정·전체)·도메인 칩(미수·차량·재무)으로 거른다.
 *   오른쪽 수행창: 고른 대상의 360 — 탭은 「수행」(할 것)과 「차량360」(전부) 둘뿐.
 *               완료·접수·연기·이관은 «지연 실체화»: 누를 때만 work_item 으로 저장(근거키 = workId).
 *   모바일     : 목록 페이지 → 행을 누르면 수행창 페이지. 개발 스위치(우하단)로 웹/모바일을 번갈아 본다.
 *
 * 계산은 전부 lib/home-work.ts(순수). 이 파일은 상태·저장·배선만.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Btn, C, SP } from '@/components/ui';
import { MTabBar } from '@/components/m/MTabBar';
import { HomeTopBar } from '@/components/home/HomeTopBar';
import { HomeList, type HomePulse } from '@/components/home/HomeList';
import { WorkPane, type PaneTab } from '@/components/home/WorkPane';
import { DevLayoutToggle } from '@/components/home/DevLayoutToggle';
import { LIST_W, TOPBAR_H_M, hairline } from '@/components/home/home-styles';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildRiskSheetRows } from '@/lib/risk-ledger';
import { buildWorkItemLedgerRows } from '@/lib/work-ledger';
import { buildHomeProblems, HOME_GROUPS, type HomeGroup } from '@/lib/home-problems';
import {
  buildHomeTasks, filterHomeTasks, homeSummary, homeTaskRecord, homeActionPatch, isUnassigned,
  HOME_ACTION_LABEL, type HomeAction, type HomeOwnerFilter, type HomeTask,
} from '@/lib/home-work';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { useIsMobile } from '@/lib/use-mobile';
import { useDevLayout, setDevLayout } from '@/lib/use-dev-layout';
import { useSession } from '@/lib/session';
import { commitSave } from '@/lib/commit';
import { NEED_COMPANY } from '@/lib/scope';
import { toast } from '@/lib/toast';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

export default function HomePage() {
  const autoMobile = useIsMobile();
  const dev = useDevLayout();
  const mobile = dev === 'auto' ? autoMobile : dev === 'mobile';
  const framed = dev === 'mobile' && !autoMobile;      // 데스크톱에서 모바일 강제 → 폰 프레임 안에 그린다

  const { user, companyId, isOperator, scopeAll } = useSession();
  const me = String(user?.name || '').trim();
  const { D, contracts, vehicles, insurances, penalties, history, bankTx, workItems, loading, error } = useDashboardData();

  // ── 계산층 ──
  const problems = useMemo(() => buildHomeProblems(
    buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, TODAY, bankTx),
    buildWorkItemLedgerRows(workItems, contracts, vehicles),
  ), [vehicles, contracts, insurances, penalties, history, bankTx, workItems]);
  const tasks = useMemo(() => buildHomeTasks(problems, workItems, TODAY), [problems, workItems]);
  const recv = useMemo(() => selectReceivables(contracts, TODAY), [contracts]);
  const pulse: HomePulse = useMemo(() => ({
    held: D.inFleet.length, running: D.running.length, idle: D.idleCars.length, util: D.util,
    misuTotal: recv.total, misuCount: recv.misuActiveCount + recv.misuReturnedCount,
  }), [D, recv]);
  const assignees = useMemo(() => {
    const s = new Set<string>();
    if (me) s.add(me);
    for (const w of workItems) { const n = String(w.assigneeName || '').trim(); if (n) s.add(n); }
    for (const t of tasks) { const n = String(t.assignee || '').trim(); if (n && n !== LEDGER_EMPTY.unassigned) s.add(n); }
    return [...s];
  }, [workItems, tasks, me]);

  // ── 화면 상태 ──
  // ?layout=mobile|web|auto — 개발 스위치를 URL로도 켠다(스크린샷·공유용)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('layout');
    if (q === 'mobile' || q === 'web' || q === 'auto') setDevLayout(q);
  }, []);
  const [owner, setOwner] = useState<HomeOwnerFilter>('all');
  const ownerInit = useRef(false);
  useEffect(() => {
    if (ownerInit.current) return;
    ownerInit.current = true;
    setOwner(isOperator ? 'all' : 'me');   // 본사=전체 · 직원=내 업무 (SPEC §12 열린 질문 2의 잠정값)
  }, [isOperator]);
  const [dom, setDom] = useState<HomeGroup | null>(null);
  const [fold, setFold] = useState<Record<'later' | 'done', boolean>>({ later: false, done: false });
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<PaneTab>('do');
  const [busy, setBusy] = useState(false);
  const [mOpen, setMOpen] = useState(false);            // 모바일: 수행창 페이지 열림

  const shown = useMemo(() => filterHomeTasks(tasks, { owner, me, dom }), [tasks, owner, me, dom]);
  const summary = useMemo(() => homeSummary(shown), [shown]);
  const counts = useMemo(() => {
    const open = tasks.filter((t) => t.bucket !== 'done');
    const domCounts = Object.fromEntries(HOME_GROUPS.map((g) => [g, open.filter((t) => t.group === g).length])) as Record<HomeGroup, number>;
    return {
      me: open.filter((t) => t.assignee === me).length,
      none: open.filter((t) => isUnassigned(t)).length,
      all: open.length,
      dom: domCounts,
    };
  }, [tasks, me]);

  /** 키보드로 다니는 순서 — 접힌 섹션은 건너뛴다 */
  const navigable = useMemo(
    () => shown.filter((t) => t.bucket !== 'done' && (t.bucket !== 'later' || fold.later)),
    [shown, fold.later],
  );
  const selTask = useMemo(() => tasks.find((t) => t.id === sel) || null, [tasks, sel]);

  // 선택 보정 — 필터가 바뀌어 선택이 목록에서 사라지면 첫 행(데스크톱만 자동 선택)
  useEffect(() => {
    if (mobile) return;
    if (sel && shown.some((t) => t.id === sel)) return;
    setSel(navigable[0]?.id ?? shown[0]?.id ?? null);
  }, [mobile, shown, navigable, sel]);

  const select = useCallback((id: string) => {
    setSel(id); setTab('do');
    if (mobile) setMOpen(true);
  }, [mobile]);

  // ── 저장(지연 실체화) ──
  const act = useCallback(async (t: HomeTask, action: HomeAction, opts?: { days?: number; assignee?: string }) => {
    if (busy) return;
    setBusy(true);
    try {
      const rec = { ...homeTaskRecord(t, TODAY), ...homeActionPatch(action, { today: TODAY, me, days: opts?.days, assignee: opts?.assignee }) };
      await commitSave({ entity: 'work_item', sessionCompanyId: companyId, rec, records: [rec] });
      const what = `${t.plate || t.who} ${t.action}`;
      const tail = action === 'defer' ? ` · ${opts?.days ?? 14}일 후` : action === 'take' ? ` · 담당 ${me}` : action === 'assign' ? ` · 담당 ${opts?.assignee}` : '';
      toast(`${HOME_ACTION_LABEL[action]} — ${what}${tail}`, 'success');
      if (action === 'done' || action === 'defer') {
        const idx = navigable.findIndex((x) => x.id === t.id);
        const next = navigable[idx + 1] || navigable[idx - 1] || null;
        if (!mobile) setSel(next ? next.id : null);
        else setMOpen(false);
      }
    } catch (e) {
      toast((e as Error).message || NEED_COMPANY, 'error');
    } finally {
      setBusy(false);
    }
  }, [busy, companyId, me, navigable, mobile]);

  // ── 키보드 (데스크톱) ──
  useEffect(() => {
    if (mobile) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = navigable.findIndex((t) => t.id === sel);
      if (e.key === 'ArrowDown') { const n = navigable[idx + 1]; if (n) { setSel(n.id); setTab('do'); e.preventDefault(); } return; }
      if (e.key === 'ArrowUp') { const n = navigable[idx - 1]; if (n) { setSel(n.id); setTab('do'); e.preventDefault(); } return; }
      const t = selTask;
      if (!t || t.bucket === 'done') return;
      if (e.key === 'e' || e.key === 'E') { if (!isUnassigned(t)) void act(t, 'done'); }
      if (e.key === 'a' || e.key === 'A') { if (isUnassigned(t)) void act(t, 'take'); }
      if (e.key === 's' || e.key === 'S') { void act(t, 'defer', { days: 14 }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobile, navigable, sel, selTask, act]);

  const showCompany = scopeAll;
  const errorLine = error ? (
    <div style={{ padding: `${SP[2]}px ${SP[5] - SP[1]}px`, fontSize: 12, color: C.danger, borderBottom: hairline }}>{error}</div>
  ) : null;

  const list = (
    <HomeList
      mobile={mobile} today={TODAY} me={me || '—'} tasks={shown} summary={summary} counts={counts} pulse={pulse}
      owner={owner} onOwner={setOwner} dom={dom} onDom={setDom} sel={sel} onSelect={select}
      fold={fold} onFold={(k) => setFold((f) => ({ ...f, [k]: !f[k] }))} showCompany={showCompany} loading={loading}
    />
  );
  const pane = (
    <WorkPane
      mobile={mobile} task={selTask} tasks={tasks} history={history} tab={tab} onTab={setTab}
      onSelect={select} onAction={act} busy={busy} assignees={assignees} showCompany={showCompany}
    />
  );

  // ── 모바일: 목록 페이지 ↔ 수행창 페이지 ──
  if (mobile) {
    const app = (
      <div style={{ height: framed ? '100%' : '100vh', display: 'flex', flexDirection: 'column', background: C.card, color: C.ink, position: 'relative' }}>
        {mOpen && selTask ? (
          <>
            <div style={{ height: TOPBAR_H_M, flex: 'none', display: 'flex', alignItems: 'center', padding: `0 ${SP[2]}px`, background: C.card, borderBottom: hairline }}>
              <Btn variant="ghost" size="sm" onClick={() => setMOpen(false)}><ChevronLeft size={16} /> 업무</Btn>
            </div>
            <div style={{ flex: 1, overflow: 'auto', minHeight: 0, paddingBottom: 72 }}>{pane}</div>
          </>
        ) : (
          <>
            <HomeTopBar mobile />
            {errorLine}
            <div style={{ flex: 1, minHeight: 0 }}>{list}</div>
          </>
        )}
        <MTabBar />
      </div>
    );
    if (!framed) return <>{app}<DevLayoutToggle /></>;
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', justifyContent: 'center', padding: `${SP[4]}px 0` }}>
        <div style={{
          width: 390, height: `calc(100vh - ${SP[4] * 2}px)`, border: hairline, borderRadius: 24, overflow: 'hidden',
          transform: 'translateZ(0)', position: 'relative', background: C.card, boxShadow: 'var(--shadow-lg)',
        }}>{app}</div>
        <DevLayoutToggle />
      </div>
    );
  }

  // ── 데스크톱: 목록 + 수행창 ──
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: C.card, color: C.ink }}>
      <HomeTopBar mobile={false} />
      {errorLine}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `${LIST_W}px minmax(0,1fr)`, minHeight: 0 }}>
        <div style={{ borderRight: hairline, minHeight: 0 }}>{list}</div>
        <div style={{ overflow: 'auto', minHeight: 0, position: 'relative' }}>{pane}</div>
      </div>
      <DevLayoutToggle />
    </div>
  );
}
