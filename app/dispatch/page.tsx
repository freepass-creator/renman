'use client';
/**
 * 차량이동 — 업무. Sec: 현황 · 오늘 큐 · 출고 대기 · 반납 대상 · 재고.
 *   옛 ?tab=오늘|출고|반납 → 해당 Sec로 스크롤. /field·/m 흡수.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { openCar, openIngest, openLog } from '@/lib/ui-bus';
import { FacetPage, Sec, Cards, Metric, ObjCard, EmptyState, Btn, won, C, SPACE_M, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { companyLabel } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet, recommendNextRent, buildRentRecoCtx, type VehicleNode } from '@/lib/domain/model';
import { textMatch } from '@/lib/search-match';
import { effectiveEndDate } from '@/lib/contract-ops';
import { buildFieldQueues, filterFieldRows, fieldTodayCount } from '@/lib/field-queue';
import { DeliveryWizard } from '@/components/DeliveryWizard';
import { ReturnWizard } from '@/components/ReturnWizard';
import { useEntityLists } from '@/lib/use-entity-lists';
import { useSecOrder } from '@/lib/use-sec-order';

type DState = '반납지남' | '반납임박' | '운행중' | '대여가능' | '정비' | '기타';
const DISPATCH_SECS = ['dispatch-status', 'dispatch-quick', 'dispatch-today', 'dispatch-out', 'dispatch-in', 'dispatch-stock'] as const;
const ORDER: DState[] = ['반납지남', '반납임박', '대여가능', '운행중', '정비', '기타'];
function dispatchOf(n: VehicleNode): { key: DState; label: string; tone: 'red' | 'amber' | 'green' | 'blue' | 'gray' } {
  if (n.ownership !== '보유중') return { key: '기타', label: n.label, tone: 'gray' };
  if (n.utilization === '정비') return { key: '정비', label: '정비중', tone: 'amber' };
  const av = n.activeContract;
  if (av) {
    const dd = av.view.dday;
    if (dd != null && dd < 0) return { key: '반납지남', label: `반납지남 ${-dd}일`, tone: 'red' };
    if (dd != null && dd <= 7) return { key: '반납임박', label: `반납 D-${dd}`, tone: 'amber' };
    return { key: '운행중', label: '운행중', tone: 'green' };
  }
  return { key: '대여가능', label: '대여가능', tone: 'blue' };
}

const nkey = (p: unknown) => String(p || '').replace(/\s/g, '');
const ddayOf = (d: string) => (d ? Math.round((new Date(d + 'T12:00:00').getTime() - new Date(TODAY + 'T12:00:00').getTime()) / 86400000) : null);
const goSec = (id: string) => { if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

type Wiz = { kind: '인도' | '반납'; contract: EntityRecord; vehicle: EntityRecord | null };
type IoRow = { kind: '인도' | '반납'; contract: EntityRecord };

function focusFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('tab');
  if (raw === '오늘' || raw === 'field') return 'dispatch-today';
  if (raw === '출고' || raw === '인도') return 'dispatch-out';
  if (raw === '반납') return 'dispatch-in';
  if (raw === '현황') return 'dispatch-stock';
  return null;
}

function IoCards({ rows, byPlate, openIo }: {
  rows: IoRow[];
  byPlate: Map<string, EntityRecord>;
  openIo: (kind: '인도' | '반납', c: EntityRecord) => void;
}) {
  if (rows.length === 0) return <EmptyState variant="sec">해당 없음</EmptyState>;
  return (
    <Cards min={260} fit>
      {rows.map(({ kind, contract: c }, i) => {
        const v = byPlate.get(nkey(c.plate)) || null;
        const carType = String(v?.carName || c.carName || '');
        if (kind === '인도') {
          const sched = c.deliveryScheduledDate
            ? `출고예정 ${String(c.deliveryScheduledDate)}`
            : c.startDate ? `계약 ${String(c.startDate)}` : '';
          const today = (String(c.deliveryScheduledDate || c.startDate || '').slice(0, 10) === TODAY);
          return (
            <ObjCard
              key={`d-${i}`}
              plate={String(c.plate || '')}
              name={String(c.contractorName || '—')}
              carType={carType}
              sub={sched}
              badge={today ? '오늘 출고' : '출고대기'}
              badgeTone={today ? 'green' : 'amber'}
              onClick={() => openIo('인도', c)}
            />
          );
        }
        const end = String(effectiveEndDate(c) || '');
        const dd = ddayOf(end);
        const badge = dd == null ? '운행중' : dd < 0 ? `D+${-dd} 지남` : dd === 0 ? '오늘 반납' : `D-${dd}`;
        const tone = dd != null && dd < 0 ? 'red' : dd != null && dd <= 7 ? 'amber' : 'blue';
        return (
          <ObjCard
            key={`r-${i}`}
            plate={String(c.plate || '')}
            name={String(c.contractorName || '—')}
            carType={carType}
            sub={`반납예정 ${end || '미정'}`}
            badge={badge}
            badgeTone={tone}
            onClick={() => openIo('반납', c)}
          />
        );
      })}
    </Cards>
  );
}

export default function DispatchPage() {
  const { companyId, scopeAll } = useSession();
  const { data: [vs = [], cs = []], loading, reload } = useEntityLists(['vehicle', 'contract']);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [wiz, setWiz] = useState<Wiz | null>(null);
  const [order, reorder] = useSecOrder('jpk:order:dispatch', [...DISPATCH_SECS]);

  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());
  const setF = (labels: string[]) => setFacets(new Set(labels));

  useEffect(() => {
    if (loading) return;
    const id = focusFromUrl();
    if (id) {
      const t = window.setTimeout(() => goSec(id), 80);
      return () => window.clearTimeout(t);
    }
  }, [loading]);

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);
  const rentCtx = useMemo(() => buildRentRecoCtx(fleet.vehicles), [fleet]);
  const nodes = useMemo(() => fleet.vehicles.map((n) => ({ n, d: dispatchOf(n) })).sort((a, b) => ORDER.indexOf(a.d.key) - ORDER.indexOf(b.d.key)), [fleet]);
  const shown = nodes.filter(({ n, d }) =>
    (facets.size === 0 || facets.has(d.key))
    && textMatch(q, n.plate, String(n.veh.carName || ''), n.activeContract?.customer || ''));
  const cnt = (k: DState) => nodes.filter((x) => x.d.key === k).length;
  const running = cnt('운행중') + cnt('반납임박') + cnt('반납지남');
  // 칩별 매칭 건수(erp3식 '라벨(N)') — 전체 함대 정적 집계. cnt() 재사용.
  const counts: Record<string, number> = { 대여가능: cnt('대여가능'), 운행중: cnt('운행중'), 반납임박: cnt('반납임박'), 반납지남: cnt('반납지남'), 정비: cnt('정비') };

  const byPlate = useMemo(() => {
    const m = new Map<string, EntityRecord>();
    for (const v of vs) m.set(nkey(v.plate), v);
    return m;
  }, [vs]);
  const queues = useMemo(() => buildFieldQueues(cs, TODAY), [cs]);
  const todayN = fieldTodayCount(queues);
  const todayRows = useMemo(() => filterFieldRows([
    ...queues.returnOverdue.map((c) => ({ kind: '반납' as const, contract: c })),
    ...queues.returnToday.map((c) => ({ kind: '반납' as const, contract: c })),
    ...queues.deliverToday.map((c) => ({ kind: '인도' as const, contract: c })),
  ].filter((row, i, arr) => arr.findIndex((x) => String(x.contract._key || x.contract.plate) === String(row.contract._key || row.contract.plate)) === i), q), [queues, q]);
  const outRows = useMemo(() => filterFieldRows(queues.deliverAll.map((c) => ({ kind: '인도' as const, contract: c })), q), [queues, q]);
  const inRows = useMemo(() => filterFieldRows(queues.returnAll.map((c) => ({ kind: '반납' as const, contract: c })), q), [queues, q]);

  const openIo = (kind: '인도' | '반납', c: EntityRecord) => {
    setWiz({ kind, contract: c, vehicle: byPlate.get(nkey(c.plate)) || null });
    if (typeof document !== 'undefined') {
      window.setTimeout(() => document.getElementById('dispatch-wiz')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  return (
    <FacetPage
      title="배차관리"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 출고·반납`}
      tools={
        <WorkbenchBar
          mid={<WorkHubBack />}
          search={{ value: q, onChange: setQ, placeholder: '차량·차명·손님·계약' }}
          stat={
            <span style={{ fontSize: 12, color: C.mute, whiteSpace: 'nowrap' }}>
              오늘 <b style={{ color: todayN ? C.warn : C.ink }}>{todayN}</b>
              {' · '}출고 {queues.deliverAll.length}
              {' · '}반납 {queues.returnAll.length}
            </span>
          }
        />
      }
      rail={!loading ? <FacetRail lensKey="배차" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      {loading ? <PageLoading /> : (
        <>
          {wiz && (
            <div id="dispatch-wiz" style={{ marginBottom: SPACE_M }}>
              {wiz.kind === '인도'
                ? <DeliveryWizard key={`인도:${String(wiz.contract._key || '')}`} contract={wiz.contract} vehicle={wiz.vehicle} onClose={() => setWiz(null)} onDone={() => { setWiz(null); reload(); }} />
                : <ReturnWizard key={`반납:${String(wiz.contract._key || '')}`} contract={wiz.contract} vehicle={wiz.vehicle} onClose={() => setWiz(null)} onDone={() => { setWiz(null); reload(); }} />}
            </div>
          )}
          {order.map((id) => {
            if (id === 'dispatch-status') {
              return (
                <Sec key={id} id={id} title="현황" desc="클릭 → 아래 섹션" onReorder={reorder}>
                  <Cards min={128} fit>
                    <Metric label="오늘 큐" value={`${todayN}건`} tone={todayN ? 'warn' : 'ink'} onClick={() => goSec('dispatch-today')} />
                    <Metric label="출고 대기" value={`${queues.deliverAll.length}건`} tone={queues.deliverAll.length ? 'warn' : 'ink'} onClick={() => goSec('dispatch-out')} />
                    <Metric label="반납 대상" value={`${queues.returnAll.length}건`} tone={queues.returnOverdue.length ? 'danger' : queues.returnAll.length ? 'warn' : 'ink'} onClick={() => goSec('dispatch-in')} />
                    <Metric label="대여가능" value={`${cnt('대여가능')}대`} tone={cnt('대여가능') ? 'ok' : 'ink'} onClick={() => { setF(['대여가능']); goSec('dispatch-stock'); }} />
                    <Metric label="운행중" value={`${running}대`} tone="ink" onClick={() => { setF(['운행중', '반납임박', '반납지남']); goSec('dispatch-stock'); }} />
                    <Metric label="반납지남" value={`${cnt('반납지남')}대`} tone={cnt('반납지남') ? 'danger' : 'ink'} onClick={() => { setF(['반납지남']); goSec('dispatch-stock'); }} />
                  </Cards>
                </Sec>
              );
            }
            if (id === 'dispatch-quick') {
              return (
                <Sec key={id} id={id} title="빠른 입력" desc="메모·비용·면허 — 공용 엔진" onReorder={reorder}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE_M }}>
                    <Btn variant="ghost" onClick={() => openLog()}>메모</Btn>
                    <Btn variant="ghost" onClick={() => openIngest('history')}>비용·점검</Btn>
                    <Btn variant="ghost" onClick={() => openIngest('customer')}>면허증 OCR</Btn>
                  </div>
                </Sec>
              );
            }
            if (id === 'dispatch-today') {
              return (
                <Sec key={id} id={id} title="오늘 큐" n={todayRows.length} desc="오늘 출고·반납·지남 — 탭하면 위저드" onReorder={reorder}>
                  <IoCards rows={todayRows} byPlate={byPlate} openIo={openIo} />
                </Sec>
              );
            }
            if (id === 'dispatch-out') {
              return (
                <Sec key={id} id={id} title="출고 대기" n={outRows.length} desc="인도(출고) — 계기판·연료·사진·서명" onReorder={reorder}>
                  <IoCards rows={outRows} byPlate={byPlate} openIo={openIo} />
                </Sec>
              );
            }
            if (id === 'dispatch-in') {
              return (
                <Sec key={id} id={id} title="반납 대상" n={inRows.length} desc="반납 — 계기판·연료·정산 · 임박순" onReorder={reorder}>
                  <IoCards rows={inRows} byPlate={byPlate} openIo={openIo} />
                </Sec>
              );
            }
            return (
              <Sec key={id} id={id} title="재고" n={shown.length} desc="보낼 수 있나 · 언제 돌아오나 · 좌측 필터" onReorder={reorder}>
                {shown.length === 0 ? <EmptyState variant="sec">해당 차량 없음</EmptyState>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{shown.map(({ n, d }) => {
                    const av = n.activeContract;
                    const fields: [string, ReactNode][] = av ? [
                      ['계약자', String(av.view.rec.contractorName || '—')],
                      ['반납예정', av.view.endDate ? `${av.view.endDate}${av.view.dday != null ? (av.view.dday < 0 ? ` (${-av.view.dday}일 지남)` : ` (D-${av.view.dday})`) : ''}` : '—'],
                      ['월대여료', av.view.monthlyRent ? won(av.view.monthlyRent) : '—'],
                      ['검사만기', n.veh.inspectionTo ? String(n.veh.inspectionTo) : '—'],
                    ] : (() => {
                      const reco = d.key === '대여가능' ? recommendNextRent(n, fleet.vehicles, rentCtx) : null;
                      const f: [string, ReactNode][] = [
                        ['차명', n.veh.carName ? String(n.veh.carName) : '—'],
                        ['마지막 대여료', (() => { const lc = n.contracts[n.contracts.length - 1]; return lc?.view.rec.monthlyRent ? won(lc.view.rec.monthlyRent) : '—'; })()],
                      ];
                      if (reco) f.push(['추천 재렌트료', <span style={{ color: C.ok, fontWeight: 700 }}>{won(reco.recommended)} <span style={{ color: C.faint, fontWeight: 400 }}>({won(reco.low)}~{won(reco.high)})</span></span>]);
                      else f.push(['거쳐간 손님', `${n.contracts.length}명`]);
                      f.push(['검사만기', n.veh.inspectionTo ? String(n.veh.inspectionTo) : '—']);
                      return f;
                    })();
                    const needReturn = (d.key === '반납지남' || d.key === '반납임박') && !!av;
                    return (
                      <div key={n.plate} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                        <ObjCard
                          badge={d.label}
                          badgeTone={d.tone}
                          plate={n.plate}
                          name={av ? String(av.view.rec.contractorName || '—') : (n.veh.carName ? String(n.veh.carName) : '—')}
                          carType={av && n.veh.carName ? String(n.veh.carName) : undefined}
                          fields={fields}
                          right={av && av.net > 0 ? <span style={{ color: C.danger }}>미수 {won(av.net)}</span> : undefined}
                          onClick={() => openCar(n.plate)}
                        />
                        {(needReturn || d.key === '대여가능') && (
                          <div style={{ display: 'flex', gap: SPACE_M, flexWrap: 'wrap' }}>
                            {needReturn && av ? <Btn size="sm" onClick={() => openIo('반납', av.view.rec)}>반납</Btn> : null}
                            {d.key === '대여가능' ? <Btn size="sm" variant="ghost" onClick={() => openCar(n.plate)}>360</Btn> : null}
                          </div>
                        )}
                      </div>
                    );
                  })}</div>}
              </Sec>
            );
          })}
        </>
      )}
    </FacetPage>
  );
}
