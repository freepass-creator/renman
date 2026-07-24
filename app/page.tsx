'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { FacetPage, Sec, HiddenSecs, Cards, Metric, ObjCard, EmptyState, won, C, PageLoading } from '@/components/ui';
import { WorkPipe } from '@/components/WorkPipe';
import { visibleSecs, dueMatcher } from '@/lib/lens-filters';
import { useIsMobile } from '@/lib/use-mobile';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildSectionCtx, SECTION_MAP, type SectionCtx } from '@/lib/section-registry';
import { useSecOrder } from '@/lib/use-sec-order';
import { Agenda } from '@/components/Agenda';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { openCar } from '@/lib/ui-bus';

const EMPTY_SET = new Set<string>(); // 안정 참조(빈 필터) — 불필요 재렌더 방지
const goSec = (id: string) => { if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
/* 홈 = 회사 전체. 탭 순서: 일정 · 미결 업무 · 운영현황 · 리스크관리. 개인화=/ops.
 *
 * 탭 배치 기준 = 「오늘 끝낼 수 있는가」 (섹션을 글자로 나누지 말고 성질로 나눈다):
 *   미결 업무   = 처리하면 큐에서 사라지는 것 (반납회수·과태료신청·서류첨부·배차조정)
 *   리스크관리  = 처리해도 계속 관리되는 것 (미수·컴플라이언스·보증금·정합성)
 *   운영현황    = 지표(②층·저장 없음)
 *   일정        = 시간축
 * 미수가 「미결」에 있으면 큐가 영원히 안 비워진다 → 리스크관리로 통합(r-unpaid).
 * 차량 상태(정비·사고)는 업무가 아니라 자산 속성 → 자산 그룹(s-repair).
 */
type Lens = '일정' | '콕핏' | '운영' | '리스크';
const LENSES: { key: Lens; label: string; short: string; desc: string }[] = [
  { key: '일정', label: '일정', short: '일정', desc: '회사 전체 일정 · 반납·검사·보험·과태료' },
  { key: '콕핏', label: '미결 업무', short: '미결', desc: '오늘 끝낼 일 · 반납회수·배차·과태료·서류·인도' },
  { key: '운영', label: '운영현황', short: '운영', desc: '회사 전체 운영 한눈 · 함대·계약·자금·현장' },
  { key: '리스크', label: '리스크관리', short: '리스크', desc: '계속 관리할 위험 · 미수·컴플라이언스·보증금' },
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
      const landing = localStorage.getItem('jpk:landing') || '';
      if (sessionStorage.getItem('jpk:landed')) return;
      let to = '';
      if (landing === 'mydesk') to = '/ops';
      else if (landing === 'field') to = '/dispatch?tab=오늘'; // 옛 현장 초기화면
      else if (landing && landing !== 'home' && landing !== '/' && landing.startsWith('/')) to = landing; // 메뉴 어디든 지정 가능
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
  /* 탭 뱃지 = 그 탭에 쌓인 «건수». 어느 탭에 일이 몰려 있는지 열어보지 않고 알 수 있어야 한다.
     미결 = 오늘 끝낼 일 합 · 리스크관리 = 관리 중인 위험 건수. 지표(운영현황)·시간표(일정)엔 안 붙인다 — 셀 «건»이 아니다. */
  const badge = useMemo(() => {
    if (loading) return {} as Record<Lens, number>;
    const overdueRet = D.returnFlow.filter((v: { dday: number | null }) => (v.dday ?? 0) < 0).length;
    return {
      콕핏: overdueRet + D.penaltyPending.length + D.ghostPlates.length + D.doubleBooking.length + D.todo.length + (D.unmatchedTx?.length ?? 0),
      리스크: D.overduePay.length + D.compliance.length,
    } as Record<Lens, number>;
  }, [loading, D]);

  return (
    <FacetPage
      title="홈"
      left={
        <WorkbenchBar
          company
          search
          tabs={LENSES.map((l) => ({ key: l.key, label: mobile ? l.short : l.label, title: l.desc, badge: badge[l.key] }))}
          tab={lens}
          onTab={(k) => setLens(k as Lens)}
          /* 요약현황 섹션을 없앤 자리 — 함대 KPI 두 개만 한 줄로. 나머지 숫자는 각 섹션 헤더(n)가 든다. */
          stat={!loading && lens === '운영' ? (
            <span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>
              보유 <b style={{ color: C.ink }}>{D.summary.held}대</b> · 가동률{' '}
              <b style={{ color: D.summary.util >= 70 ? 'var(--green-text)' : D.summary.util < 50 ? C.warn : C.ink }}>{D.summary.util}%</b>
            </span>
          ) : undefined}
        />
      }
      rail={!loading ? <FacetRail lensKey={lens} facets={curFacets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      {lensContent}{footer}
    </FacetPage>
  );
}

// 섹션 순서/이동 = 공용 훅(lib/use-sec-order). 접힌 섹션 드래그만 — 페이지 전용 손롤 금지.

/** 운영현황 — 「보유자산이 어떻게 굴러가나」. 섹션이 차를 직접 보여준다.
 *  요약현황(지표 카드 12개)은 없앴다 — 10개가 아래 섹션 헤더(n)와 겹쳤고, 미수·미분류는
 *  리스크관리·미결 탭이 이미 든다. 남는 가동률·보유는 툴바 stat 한 줄로 올렸다.
 *  좌측 필터(보기)로 Sec show/hide. */
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
  const overdueList = D.returnFlow.filter((v: { dday: number | null }) => (v.dday ?? 0) < 0);
  const soonList = D.returnFlow.filter((v: { dday: number | null }) => (v.dday ?? 0) >= 0);
  const overdueReturn = overdueList.length;
  const returnSoon = soonList.length;
  // 반납 카드는 지남·임박이 «같은 모양»이어야 한다 — 뱃지만 다르다.
  const returnCard = (v: any, i: number) => {
    const over = (v.dday ?? 0) < 0;
    return (
      <ObjCard key={i} onClick={() => openCar(v.rec.plate)} rail={over ? 'danger' : 'warn'}
        badge={over ? `${-v.dday}일 지남` : `D-${v.dday}`} badgeTone={over ? 'red' : 'amber'}
        co={String(v.rec.companyId || '')} plate={String(v.rec.plate)} carType={String(v.rec.carName || '')}
        fields={[['계약자', String(v.rec.contractorName || '—')], ['반납예정', String(v.rec.endDate || '—')], ['월대여료', v.rec.monthlyRent ? won(v.rec.monthlyRent) : '—']]}
        right={v.net > 0 ? <span style={{ color: 'var(--red-text)' }}>미수 {won(v.net)}</span> : undefined} />
    );
  };
  const deliverList = D.todo.filter((t: { action: string }) => t.action === '인도 대기');
  const deliveryTodo = deliverList.length;

  /* 기본 순서 = 함대 흐름에서 «급한 순». 반납 지남(남의 손에 우리 차) → 인도 대기(대여료 안 도는 중)
     → 휴차(놀고 있음) → 만기 임박(곧 빔) → 운행중(정상) → 멈춘 차.
     접힌 섹션 드래그로 각자 바꿀 수 있다(useSecOrder) — 여기 배열은 «처음 열었을 때»의 순서일 뿐. */
  const [order, reorder] = useSecOrder('jpk:order:ops-v2',
    ['ops-deliver', 'ops-overdue', 'a-idle', 'ops-return', 'a-running', 'a-other']);

  const node: Record<string, React.ReactNode> = {
    'ops-deliver': (
        <Sec id="ops-deliver" title="인도 대기" n={deliverList.length} desc="계약 성립 · 아직 출고 안 됨" right={<WorkPipe to="dispatch" />}>
          {deliverList.length === 0 ? <EmptyState variant="ok">인도 대기 없음</EmptyState> : (
            <Cards min={300}>
              {deliverList.map((t: any, i: number) => (
                <ObjCard key={i} onClick={() => openCar(t.plate)} rail="warn" badge="인도 대기" badgeTone="amber"
                  plate={String(t.plate)} carType={String(t.name || '')}
                  fields={[['임차인', String(t.name || '—')], ['내용', String(t.detail || '—')]]}
                  sub={String(t.detail || '')} />
              ))}
            </Cards>
          )}
        </Sec>
    ),
    'ops-overdue': (
        <Sec id="ops-overdue" title="반납 지남" n={overdueList.length} tone="danger" desc="계약 종료 · 미회수" right={<WorkPipe to="dispatch" />}>
          {overdueList.length === 0 ? <EmptyState variant="ok">지난 반납 없음</EmptyState> : (
            <Cards min={300}>{overdueList.map((v: any, i: number) => returnCard(v, i))}</Cards>
          )}
        </Sec>
    ),
    'ops-return': (
        <Sec id="ops-return" title="만기 임박" n={soonList.length} desc="7일 내 반납 예정 · 다음 배차 준비" right={<WorkPipe to="dispatch" />}>
          {soonList.length === 0 ? <EmptyState variant="ok">임박한 반납 없음</EmptyState> : (
            <Cards min={300}>{soonList.map((v: any, i: number) => returnCard(v, i))}</Cards>
          )}
        </Sec>
    ),
    'a-idle': SECTION_MAP['a-idle']?.render(ctx, { onReorder: reorder }),
    'a-running': SECTION_MAP['a-running']?.render(ctx, { onReorder: reorder }),
    'a-other': SECTION_MAP['a-other']?.render(ctx, { onReorder: reorder }),
  };

  return (
    <>
      {order.filter((id) => show(id)).map((id) => <React.Fragment key={id}>{node[id]}</React.Fragment>)}
    </>
  );
}

function CockpitLens({ ctx, facets, setF }: { ctx: SectionCtx; facets?: Set<string>; setF: (labels: string[]) => void }) {
  const D = ctx.D;
  // v3 = 미수(→리스크관리)·정비사고(→자산) 빠진 순서. 키를 올려야 기존 사용자의 저장된 v2 순서가 되살아나지 않는다.
  const [order, reorder] = useSecOrder('jpk:order:cockpit-v3', ['s-return-over', 's-overlap', 's-penalty', 's-todo', 's-money', 's-docwait', 's-return', 's-expire']);
  const vis = visibleSecs('콕핏', facets);
  const overdueReturn = D.returnFlow.filter((v: { dday: number }) => v.dday < 0).length;
  const pick = (labels: string[], sec: string) => { setF(labels); goSec(sec); };
  return (
    <>
      {/* 지표도 「끝낼 수 있는 것」만 — 미수는 리스크관리 탭이 든다. */}
      <Sec title="현황" desc="오늘 처리할 핵심만 · 클릭하면 좌측 필터·섹션 연동">
        <Cards min={128} fit>
          <Metric label="반납 지남" value={overdueReturn} hint="예정일 경과" tone={overdueReturn ? 'danger' : 'ink'} onClick={() => pick(['반납', '지남'], 's-return-over')} />
          <Metric label="과태료" value={D.penaltyPending.length} hint="변경부과" tone={D.penaltyPending.length ? 'warn' : 'ink'} onClick={() => pick(['과태료'], 's-penalty')} />
          <Metric label="서류 미첨부" value={D.ghostPlates.length} hint="등록증 없음" tone={D.ghostPlates.length ? 'warn' : 'ink'} onClick={() => pick(['서류'], 's-docwait')} />
          <Metric label="자금 미분류" value={D.unmatchedTx?.length ?? 0} hint="매칭 안 됨" tone={(D.unmatchedTx?.length ?? 0) ? 'warn' : 'ink'} onClick={() => pick(['자금'], 's-money')} />
        </Cards>
      </Sec>
      {order.filter((id) => !vis || vis.has(id)).map((id) => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))}
    </>
  );
}

/* 리스크관리 = 처리해도 끝나지 않고 계속 관리되는 것. 미수·컴플라이언스·보증금·정합성.
 * 미수는 여기가 SSOT(r-unpaid) — 미결 업무에 두면 큐가 영영 안 비워진다. */
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
          <Metric label="현재 미수" value={won(D.summary.misuActive)} hint="운행중 · 정상 회수" tone={D.summary.misuActive > 0 ? 'danger' : 'ink'} onClick={() => { setF(['미수']); goSec('r-unpaid'); }} />
          <Metric label="계약종료 미수" value={won(D.summary.misuReturned)} hint="반납·해지 추심" tone={D.summary.misuReturned > 0 ? 'warn' : 'ink'} onClick={() => { setF(['미수']); goSec('r-unpaid'); }} />
          <Metric label="미납 계약" value={D.overduePay.length} hint="연체 1회+" tone={D.overduePay.length ? 'danger' : 'ink'} onClick={() => { setF(['미수']); goSec('r-unpaid'); }} />
          <Metric label="30일+ 연체" value={over30} hint="장기 연체" tone={over30 ? 'danger' : 'ink'} onClick={() => { setF(['미수']); goSec('r-unpaid'); }} />
          <Metric label="시동제어 필요" value={lockNeed} hint="미납 D+3·미제어" tone={lockNeed ? 'danger' : 'ink'} onClick={() => { setF(['미수']); goSec('r-unpaid'); }} />
        </Cards>
      </Sec>
      {order.filter((id) => !vis || vis.has(id)).map((id) => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))}
    </>
  );
}

