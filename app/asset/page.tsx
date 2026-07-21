'use client';
/**
 * 자산현황 — 현물자산 원장 생애 Sec (탭 금지).
 *   구매예정 · 등록예정 · 보유중 · 처분예정 · 처분완료 + FacetRail 상시.
 *   가동률·미수율은 홈(지표).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { type EntityRecord } from '@/lib/intake/entities';
import { openCar, openIngest } from '@/lib/ui-bus';
import { FacetPage, Sec, Cards, Metric, ObjCard, Btn, EmptyState, won, C, SPACE_M, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkPipe } from '@/components/WorkPipe';
import { QuickLogForm } from '@/components/QuickLogForm';
import { companyLabel } from '@/lib/companies';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { linkFleet, type Ownership, type VehicleNode } from '@/lib/domain/model';
import { textMatch } from '@/lib/search-match';
import { vehicleLoanView } from '@/lib/vehicle-asset';
import { useSecOrder } from '@/lib/use-sec-order';
import { useEntityLists } from '@/lib/use-entity-lists';

const UTIL_LABELS = ['운행', '유휴', '정비'];
const LIFE_SECS = ['a-buy', 'a-reg', 'a-hold', 'a-out-plan', 'a-out'] as const;
type LifeSec = (typeof LIFE_SECS)[number];
const SEC_OWN: Record<LifeSec, Ownership> = {
  'a-buy': '구매예정',
  'a-reg': '등록예정',
  'a-hold': '보유중',
  'a-out-plan': '처분예정',
  'a-out': '처분완료',
};
const SEC_META: Record<LifeSec, { title: string; desc: string }> = {
  'a-buy': { title: '구매예정', desc: '매입 검토·구매 대기' },
  'a-reg': { title: '등록예정', desc: '매입 후 번호·등록 전' },
  'a-hold': { title: '보유중', desc: '운행 가능 원장 · 가동률은 홈' },
  'a-out-plan': { title: '처분예정', desc: '매각·말소 진행' },
  'a-out': { title: '처분완료', desc: '매각·말소 원장' },
};

const SEC_PIPE: Partial<Record<LifeSec, 'ingest' | 'dispatch' | 'repair'>> = {
  'a-buy': 'ingest',
  'a-reg': 'ingest',
  'a-hold': 'dispatch',
  'a-out-plan': 'dispatch',
};

const goSec = (id: string) => {
  if (typeof document !== 'undefined') document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const hasLoan = (n: VehicleNode) => {
  const lv = vehicleLoanView(n.veh, TODAY);
  if (lv?.cashOnly) return false;
  return (Number(n.veh.loanRemainingPrincipal) || 0) > 0 || (lv != null && lv.remainPrincipal > 0);
};
const noInsurance = (n: VehicleNode) => !n.veh.insuranceExpiryDate;
const badgeTone = (t: VehicleNode['tone']): 'green' | 'amber' | 'gray' | 'blue' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'mute' ? 'gray' : 'blue';

export default function AssetPage() {
  const { companyId, scopeAll } = useSession();
  const { data: [vs = [], cs = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'history']);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [logPlate, setLogPlate] = useState<string | null>(null);
  const [order, reorder] = useSecOrder('jpk:order:asset', [...LIFE_SECS]);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);
  const extra = useMemo(() => {
    const loc = new Map<string, string>(), next = new Map<string, EntityRecord>();
    for (const h of [...hs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))) {
      const p = String(h.plate || ''); if (!p) continue;
      if (String(h.category) === '이동' && !loc.has(p)) loc.set(p, String(h.title || ''));
      if (String(h.nextDate || '') >= TODAY && !next.has(p)) next.set(p, h);
    }
    const lastRet = new Map<string, string>();
    for (const c of cs) { const p = String(c.plate); const r = String(c.returnedDate || ''); if (r && r > (lastRet.get(p) || '')) lastRet.set(p, r); }
    return { loc, next, lastRet };
  }, [hs, cs]);
  const idleDaysOf = (n: VehicleNode) => {
    const since = extra.lastRet.get(n.plate) || String(n.veh.acquisitionDate || n.veh.firstReg || '');
    const dd = dday(since); return dd != null ? -dd : null;
  };

  const nodes = fleet.vehicles;
  const utilSel = UTIL_LABELS.filter((x) => facets.has(x));
  const dueSel = ['검사지남', '검사30일', '보험지남', '보험30일'].filter((x) => facets.has(x));
  const debtSel = ['할부있음', '보험없음'].filter((x) => facets.has(x));

  const filtered = nodes.filter((n) => {
    if (utilSel.length && (n.utilization == null || !utilSel.includes(n.utilization))) return false;
    if (dueSel.length) {
      const insp = dday(n.veh.inspectionTo);
      const ins = dday(n.veh.insuranceExpiryDate);
      const hit = (dueSel.includes('검사지남') && insp != null && insp < 0)
        || (dueSel.includes('검사30일') && insp != null && insp >= 0 && insp <= 30)
        || (dueSel.includes('보험지남') && ins != null && ins < 0)
        || (dueSel.includes('보험30일') && ins != null && ins >= 0 && ins <= 30);
      if (!hit) return false;
    }
    if (debtSel.length) {
      const hit = (debtSel.includes('할부있음') && hasLoan(n)) || (debtSel.includes('보험없음') && noInsurance(n));
      if (!hit) return false;
    }
    if (!textMatch(q, n.plate, n.veh.carName, n.activeContract?.view.rec.contractorName, n.label)) return false;
    return true;
  }).sort((a, b) => String(a.plate).localeCompare(String(b.plate)));

  const byOwn = (own: Ownership) => filtered.filter((n) => n.ownership === own);
  const cnt = (own: Ownership) => nodes.filter((n) => n.ownership === own).length;

  const renderCard = (n: VehicleNode) => {
    const av = n.activeContract, idleD = n.utilization === '유휴' ? idleDaysOf(n) : null;
    const fields: [string, ReactNode][] =
      n.ownership === '처분완료' || n.ownership === '처분예정' ? [
        ['매입', n.veh.acquisitionPrice ? won(n.veh.acquisitionPrice) : '—'],
        ['매각', n.veh.salePrice ? won(n.veh.salePrice) : (n.veh.saleDate ? String(n.veh.saleDate) : '—')],
        ['거쳐간 손님', `${n.contracts.length}명`],
      ] : n.ownership === '구매예정' || n.ownership === '등록예정' ? [
        ['상태', n.label],
        ['매입처', String(n.veh.supplier || '—')],
        ['매입가', n.veh.acquisitionPrice ? won(n.veh.acquisitionPrice) : '—'],
      ] : n.utilization === '운행' && av ? [
        ['계약자', String(av.view.rec.contractorName || '—')],
        ['반납', av.view.endDate ? `${av.view.endDate}${av.view.dday != null ? (av.view.dday < 0 ? ` (${-av.view.dday}일 지남)` : ` (D-${av.view.dday})`) : ''}` : '—'],
        ['월대여료', av.view.monthlyRent ? won(av.view.monthlyRent) : '—'],
        ['검사만기', n.veh.inspectionTo ? String(n.veh.inspectionTo) : '—'],
      ] : [
        ['위치', extra.loc.get(n.plate) || '차고지'],
        ['가동', n.utilization || '—'],
        ['검사만기', n.veh.inspectionTo ? String(n.veh.inspectionTo) : '—'],
        ['다음 계획', extra.next.get(n.plate) ? `${String(extra.next.get(n.plate)!.nextDate)} · ${String(extra.next.get(n.plate)!.title || '')}` : '—'],
      ];
    if (hasLoan(n)) {
      const lv = vehicleLoanView(n.veh, TODAY);
      fields.push(['할부잔여', won(Number(n.veh.loanRemainingPrincipal) || lv?.remainPrincipal || 0)]);
    }
    const deep = debtSel.includes('할부있음') ? 'loan' : debtSel.includes('보험없음') ? 'insurance' : undefined;
    const right = idleD != null
      ? <span style={{ color: idleD >= 180 ? C.danger : C.warn }}>{idleD}일 대기</span>
      : undefined;
    return (
      <div key={n.plate} style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
        <ObjCard
          badge={n.label}
          badgeTone={badgeTone(n.tone)}
          co={scopeAll ? String(n.veh.companyId || '') : undefined}
          plate={n.plate}
          carType={n.veh.carName ? String(n.veh.carName) : undefined}
          fields={fields}
          right={right}
          onClick={() => openCar(n.plate, deep)}
        />
        {n.ownership === '보유중' && (n.utilization === '유휴' || n.utilization === '정비') ? (
          <div style={{ display: 'flex', gap: SPACE_M, flexWrap: 'wrap' }}>
            <Btn variant={logPlate === n.plate ? 'solid' : 'ghost'} onClick={() => setLogPlate((p) => p === n.plate ? null : n.plate)}>{logPlate === n.plate ? '닫기' : '+ 기록'}</Btn>
            <Btn variant="ghost" onClick={() => openCar(n.plate, deep)}>360</Btn>
          </div>
        ) : null}
        {logPlate === n.plate ? <QuickLogForm ctx={{ plate: n.plate, companyId: String(n.veh.companyId || '') }} onDone={() => setLogPlate(null)} onCancel={() => setLogPlate(null)} /> : null}
      </div>
    );
  };

  return (
    <FacetPage
      title="자산현황"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 현물 ${nodes.length}대`}
      tools={
        <WorkbenchBar
          search={{ value: q, onChange: setQ, placeholder: '차량·차명·손님' }}
          actions={<Btn size="sm" onClick={() => openIngest('vehicle')}>+ 차량 담기</Btn>}
        />
      }
      rail={!loading ? <FacetRail lensKey="자산현황" facets={facets} onToggle={toggleFacet} onReset={resetFacets} /> : null}
    >
      <Sec title="생애" desc="현물자산 · 구매→등록→보유→처분" hideable={false}>
        <Cards min={100} fit>
          {(LIFE_SECS as readonly LifeSec[]).map((id) => (
            <Metric key={id} label={SEC_META[id].title} value={`${cnt(SEC_OWN[id])}대`}
              tone={cnt(SEC_OWN[id]) && (id === 'a-buy' || id === 'a-reg' || id === 'a-out-plan') ? 'warn' : 'ink'}
              onClick={() => goSec(id)} />
          ))}
        </Cards>
      </Sec>

      {loading ? <PageLoading />
        : order.map((id) => {
          const sid = id as LifeSec;
          const meta = SEC_META[sid];
          const list = byOwn(SEC_OWN[sid]);
          return (
            <Sec key={sid} id={sid} title={meta.title} n={list.length} desc={meta.desc} onReorder={reorder}
              right={SEC_PIPE[sid] ? <WorkPipe to={SEC_PIPE[sid]!} /> : undefined}>
              {list.length === 0 ? <EmptyState variant="sec">해당 차량 없음</EmptyState>
                : <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>{list.map(renderCard)}</div>}
            </Sec>
          );
        })}
    </FacetPage>
  );
}
