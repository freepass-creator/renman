'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { FacetPage, Sec, HiddenSecs, Cards, Metric, won, PageLoading } from '@/components/ui';
import { WorkPipe } from '@/components/WorkPipe';
import { visibleSecs, dueMatcher } from '@/lib/lens-filters';
import { useIsMobile } from '@/lib/use-mobile';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx, SECTION_MAP, type SectionCtx } from '@/lib/section-registry';
import { useSecOrder } from '@/lib/use-sec-order';
import { Agenda } from '@/components/Agenda';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';

const EMPTY_SET = new Set<string>(); // 안정 참조(빈 필터) — 불필요 재렌더 방지
const goSec = (id: string) => { if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
// 홈 = 회사 전체. 탭 순서: 일정 · 미결 · 운영현황 · 리스크. 개인화=/ops.
type Lens = '일정' | '콕핏' | '운영' | '리스크';
const LENSES: { key: Lens; label: string; short: string; desc: string }[] = [
  { key: '일정', label: '일정', short: '일정', desc: '회사 전체 일정 · 반납·검사·보험·과태료' },
  { key: '콕핏', label: '미결 업무', short: '미결', desc: '우리가 처리할 것 · 반납·회수·검사·서류·인도·과태료' },
  { key: '운영', label: '운영현황', short: '운영', desc: '회사 전체 운영 한눈 · 함대·계약·자금·현장' },
  { key: '리스크', label: '리스크현황', short: '리스크', desc: '통제 밖 위험 · 계약자 미납·컴플라이언스' },
];

export default function Home() {
  const { scopeAll } = useSession();
  const mobile = useIsMobile();
  const router = useRouter();
  // 데이터 로딩 + D 계산 = 공용 훅(담당자 워크벤치와 동일 코드 재사용)
  const { D, contracts, vehicles, insurances, bankTx, history, penalties, inbox, loading } = useDashboardData();
  const [lens, setLens] = useState<Lens>('운영');
  const [facetSel, setFacetSel] = useState<Record<string, Set<string>>>({});
  // 초기 화면 — 세션당 1회. mydesk→/ops · home→유지. 옛 field→입출고.
  useEffect(() => {
    try {
      const landing = localStorage.getItem('jpk:landing');
      if (sessionStorage.getItem('jpk:landed')) return;
      let to = '';
      if (landing === 'mydesk') to = '/ops';
      else if (landing === 'field') to = '/dispatch?tab=오늘'; // 옛 현장 초기화면
      if (to) { sessionStorage.setItem('jpk:landed', '1'); router.replace(to); }
    } catch { /* 무시 */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const curFacets = facetSel[lens] || EMPTY_SET;
  const toggleFacet = (label: string) => setFacetSel((m) => { const cur = new Set(m[lens] || []); if (cur.has(label)) cur.delete(label); else cur.add(label); return { ...m, [lens]: cur }; });
  const resetFacets = () => setFacetSel((m) => ({ ...m, [lens]: new Set<string>() }));
  // 카드 → 홈 렌즈. '돈'·'자금' 옛 값 → 재무현황(미분류).
  useEffect(() => {
    function on(e: Event) {
      const l = String((e as CustomEvent).detail || '');
      if (!l) return;
      if (l === '돈' || l === '자금') { router.push('/finance?facet=미분류'); return; }
      if (l === '운영' || l === '일정' || l === '콕핏' || l === '리스크') {
        setLens(l as Lens);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
    window.addEventListener('jpk:lens', on);
    return () => window.removeEventListener('jpk:lens', on);
  }, [router]);
  const setF = (labels: string[]) => setFacetSel((m) => ({ ...m, [lens]: new Set(labels) }));
  const dueMatch = useMemo(() => dueMatcher(lens, curFacets), [lens, curFacets]);
  const ctx = useMemo(() => buildSectionCtx({ D, contracts, history, bankTx, scopeAll, dueMatch, vehicles, insurances, penalties, inbox }), [D, contracts, history, bankTx, scopeAll, dueMatch, vehicles, insurances, penalties, inbox]);

  const lensContent = loading ? <PageLoading />
    : lens === '운영' ? <OpsLens ctx={ctx} facets={curFacets} setF={setF} />
      : lens === '일정' ? <Agenda ctx={ctx} facets={curFacets} />
        : lens === '리스크' ? <RiskLens ctx={ctx} facets={curFacets} setF={setF} />
          : <CockpitLens ctx={ctx} facets={curFacets} setF={setF} />;
  const footer = <>{!loading && <HiddenSecs />}</>;
  return (
    <FacetPage
      title="홈"
      left={
        <WorkbenchBar
          company
          search
          tabs={LENSES.map((l) => ({ key: l.key, label: mobile ? l.short : l.label, title: l.desc }))}
          tab={lens}
          onTab={(k) => setLens(k as Lens)}
        />
      }
      rail={!loading ? <FacetRail lensKey={lens} facets={curFacets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {lensContent}{footer}
    </FacetPage>
  );
}

// 섹션 순서/이동 = 공용 훅(lib/use-sec-order). 접힌 섹션 드래그만 — 페이지 전용 손롤 금지.

/** 운영현황 — ② 지표. 좌측 필터(영역)로 Sec show/hide. */
function OpsLens({ ctx, facets, setF }: { ctx: SectionCtx; facets?: Set<string>; setF: (labels: string[]) => void }) {
  const D = ctx.D;
  const S = D.summary;
  const vis = visibleSecs('운영', facets);
  const show = (id: string) => !vis || vis.has(id);
  const go = (href: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href } }));
  };
  const pick = (labels: string[], sec: string) => { setF(labels); goSec(sec); };
  const overdueReturn = D.returnFlow.filter((v: { dday: number }) => v.dday < 0).length;
  const returnSoon = D.returnFlow.filter((v: { dday: number }) => v.dday >= 0).length;
  const deliveryTodo = D.todo.filter((t: { action: string }) => t.action === '인도 대기').length;

  return (
    <>
      {show('ops-fleet') && (
        <Sec id="ops-fleet" title="함대" desc="현물자산 · 가동(지표)" right={<WorkPipe to="asset" />}>
          <Cards min={128} fit>
            <Metric label="보유" value={`${S.held}대`} tone="ink" onClick={() => pick(['함대'], 'ops-fleet')} />
            <Metric label="운행" value={`${S.running}대`} tone={S.running ? 'ok' : 'ink'} onClick={() => go('/asset')} />
            <Metric label="유휴" value={`${S.idle}대`} tone={S.idle ? 'warn' : 'ink'} onClick={() => go('/asset')} />
            <Metric label="가동률" value={`${S.util}%`} tone={S.util >= 70 ? 'ok' : S.util < 50 ? 'warn' : 'ink'} onClick={() => go('/asset')} />
            <Metric label="정비·사고" value={`${D.repair.length}대`} tone={D.repair.length ? 'warn' : 'ink'} onClick={() => go('/repair')} />
          </Cards>
        </Sec>
      )}
      {show('ops-contract') && (
        <Sec id="ops-contract" title="계약" desc="계약자산 · 생애 신호" right={<WorkPipe to="contract" />}>
          <Cards min={128} fit>
            <Metric label="운행중 계약" value={`${S.activeContracts}건`} tone="ink" onClick={() => go('/contract')} />
            <Metric label="인도 대기" value={`${deliveryTodo}건`} tone={deliveryTodo ? 'warn' : 'ink'} onClick={() => go('/dispatch?tab=출고')} />
            <Metric label="반납 임박" value={`${returnSoon}건`} tone={returnSoon ? 'warn' : 'ink'} onClick={() => go('/dispatch?tab=반납')} />
            <Metric label="반납 지남" value={`${overdueReturn}건`} tone={overdueReturn ? 'danger' : 'ink'} onClick={() => go('/dispatch?tab=반납')} />
          </Cards>
        </Sec>
      )}
      {show('ops-cash') && (
        <Sec id="ops-cash" title="자금·채권" desc="자금자산 · 미수(지표)" right={<WorkPipe to="payments" />}>
          <Cards min={128} fit>
            <Metric label="운행중 미수" value={won(S.misuActive)} tone={S.misuActive > 0 ? 'danger' : 'ink'} onClick={() => go('/receivables')} />
            <Metric label="미수 건" value={`${S.misuActiveCount}건`} tone={S.misuActiveCount ? 'warn' : 'ink'} onClick={() => go('/receivables')} />
            <Metric label="미분류 입금" value={`${S.unclassified}건`} tone={S.unclassified ? 'warn' : 'ink'} onClick={() => go('/payments')} />
            <Metric label="자금 순증감" value={won(S.cashNet)} tone={S.cashNet < 0 ? 'danger' : 'ink'} onClick={() => go('/finance')} />
          </Cards>
        </Sec>
      )}
      {show('ops-field') && (
        <Sec id="ops-field" title="현장 신호" desc="이벤트 · 처리할 일 힌트" right={<WorkPipe to="dispatch" />}>
          <Cards min={128} fit>
            <Metric label="과태료" value={`${D.penaltyPending.length}건`} tone={D.penaltyPending.length ? 'warn' : 'ink'} onClick={() => go('/penalty')} />
            <Metric label="서류 미첨부" value={`${D.ghostPlates.length}건`} tone={D.ghostPlates.length ? 'warn' : 'ink'} onClick={() => { window.dispatchEvent(new CustomEvent('jpk:lens', { detail: '콕핏' })); }} />
            <Metric label="할부 차량" value={`${S.loanCount}대`} tone="ink" onClick={() => go('/asset')} />
            <Metric label="매각·말소" value={`${S.sold}대`} tone="ink" onClick={() => go('/asset')} />
          </Cards>
        </Sec>
      )}
    </>
  );
}

function CockpitLens({ ctx, facets, setF }: { ctx: SectionCtx; facets?: Set<string>; setF: (labels: string[]) => void }) {
  const D = ctx.D;
  const [order, reorder] = useSecOrder('jpk:order:cockpit-v2', ['s-return-over', 's-unpaid', 's-overlap', 's-penalty', 's-todo', 's-money', 's-docwait', 's-return', 's-expire', 's-repair']);
  const vis = visibleSecs('콕핏', facets);
  const overdueReturn = D.returnFlow.filter((v: { dday: number }) => v.dday < 0).length;
  const pick = (labels: string[], sec: string) => { setF(labels); goSec(sec); };
  return (
    <>
      <Sec title="현황" desc="오늘 처리할 핵심만 · 클릭하면 좌측 필터·섹션 연동">
        <Cards min={128} fit>
          <Metric label="미수(운행중)" value={won(D.summary.misuActive)} hint="회수 대상" tone={D.summary.misuActive > 0 ? 'danger' : 'ink'} onClick={() => pick(['미수'], 's-unpaid')} />
          <Metric label="반납 지남" value={overdueReturn} hint="예정일 경과" tone={overdueReturn ? 'danger' : 'ink'} onClick={() => pick(['반납', '지남'], 's-return-over')} />
          <Metric label="과태료" value={D.penaltyPending.length} hint="변경부과" tone={D.penaltyPending.length ? 'warn' : 'ink'} onClick={() => pick(['과태료'], 's-penalty')} />
          <Metric label="서류 미첨부" value={D.ghostPlates.length} hint="등록증 없음" tone={D.ghostPlates.length ? 'warn' : 'ink'} onClick={() => pick(['서류'], 's-docwait')} />
        </Cards>
      </Sec>
      {order.filter((id) => !vis || vis.has(id)).map((id) => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))}
    </>
  );
}

// 리스크현황 = 우리 통제 밖(계약자 귀책) 위험. 미납·컴플라이언스. (회수 '조치'는 미결 업무.)
function RiskLens({ ctx, facets, setF }: { ctx: SectionCtx; facets?: Set<string>; setF: (labels: string[]) => void }) {
  const D = ctx.D;
  const [order, reorder] = useSecOrder('jpk:order:risk-v2', ['r-unpaid', 'r-compliance', 'r-deposit', 'r-integrity']);
  const vis = visibleSecs('리스크', facets);
  const over30 = D.overduePay.filter((v: { overdueDays: number }) => v.overdueDays >= 30).length;
  // 시동제어 필요 = 미납 D+3 이상(시동제어 단계+)인데 아직 미제어. 능동 알림 — 실무자가 미수에서 전환.
  const lockNeed = D.overduePay.filter((v: { overdueDays: number; ended?: boolean; rec?: { engineDisabled?: boolean } }) => !v.ended && !v.rec?.engineDisabled && v.overdueDays >= 3).length;
  return (
    <>
      <Sec title="현황" desc="통제 밖 위험 · 계약자 귀책">
        <Cards min={128} fit>
          <Metric label="운행중 미수" value={won(D.summary.misuActive)} hint="운행중만" tone={D.summary.misuActive > 0 ? 'danger' : 'ink'} onClick={() => { setF(['미납']); goSec('r-unpaid'); }} />
          <Metric label="미납 계약" value={D.overduePay.length} hint="연체 1회+" tone={D.overduePay.length ? 'danger' : 'ink'} onClick={() => { setF(['미납']); goSec('r-unpaid'); }} />
          <Metric label="30일+ 연체" value={over30} hint="장기 연체" tone={over30 ? 'danger' : 'ink'} onClick={() => { setF(['미납']); goSec('r-unpaid'); }} />
          <Metric label="시동제어 필요" value={lockNeed} hint="미납 D+3·미제어" tone={lockNeed ? 'danger' : 'ink'} onClick={() => { setF(['미납']); goSec('r-unpaid'); }} />
        </Cards>
      </Sec>
      {order.filter((id) => !vis || vis.has(id)).map((id) => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))}
    </>
  );
}

