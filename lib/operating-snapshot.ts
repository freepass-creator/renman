// 운영 집계 엔진(② metric) — SSOT. 저장 없음. 원장(+이벤트) → 파생 D.
//   홈·반영·법인관리가 같은 숫자. 페이지에서 집계 손롤 금지.
//   층 = lib/domain/layers (METRIC_ENGINES.operating-snapshot).
import { type EntityRecord } from './intake/entities';
import { computeContractView, isDeliveryPending } from './contract-ops';
import { scanRisks } from './risk-ops';
import { checkCompliance } from './compliance';
import { matchDriver } from './penalty-reassign';
import { linkFleet } from './domain/model';
import { dday, OUT } from './dashboard-consts';
import { normPlate } from './plate';
import { selectReceivables } from './snapshot/selectors';

export type DashboardInput = {
  contracts: EntityRecord[];
  vehicles: EntityRecord[];
  insurances: EntityRecord[];
  penalties: EntityRecord[];
  bankTx: EntityRecord[];
};

/** 운영 파생값 전체 — 홈 렌즈·워크벤치·반영이 공유하는 단일 계산. */
export function computeDashboard(input: DashboardInput, today: string) {
  const { contracts, vehicles, insurances, penalties, bankTx } = input;
  // 계약 뷰 1패스 — linkFleet·scanRisks가 동일 views 재사용 (computeContractView 3중 호출 방지)
  const views = contracts.map((c) => computeContractView(c, today));
  const fleet = linkFleet(vehicles, contracts, today, views);
  const activeByPlate = new Map<string, ReturnType<typeof computeContractView>>();
  for (const v of views) if (v.status === '운행') activeByPlate.set(normPlate(v.rec.plate), v);
  const risks = scanRisks(contracts, today, views);
  // 행 표시용 status — 차량 원문 status 우선, 없으면 계약 폴백(구매대기 등 할 일 판별용)
  const statusOf = (v: EntityRecord) => String(v.status || '') || (activeByPlate.has(normPlate(v.plate)) ? '운행' : '대기');

  const rows = vehicles.map((v) => ({ v, av: activeByPlate.get(normPlate(v.plate)) || null, status: statusOf(v) }));
  // 가동·보유 집계 = linkFleet/classifyVehicle SSOT (자산현황·경영 KPI와 동일)
  const heldNodes = fleet.vehicles.filter((n) => n.ownership !== '처분완료');
  const runningNodes = heldNodes.filter((n) => n.utilization === '운행');
  const idleNodes = heldNodes.filter((n) => n.utilization === '유휴');
  const soldNodes = fleet.vehicles.filter((n) => n.ownership === '처분완료');
  const util = heldNodes.length ? Math.round((runningNodes.length / heldNodes.length) * 100) : 0;
  const runningPlates = new Set(runningNodes.map((n) => n.plate));
  const idlePlates = new Set(idleNodes.map((n) => n.plate));
  const soldPlates = new Set(soldNodes.map((n) => n.plate));
  const inFleet = rows.filter((r) => !OUT.has(r.status));
  const running = rows.filter((r) => runningPlates.has(normPlate(r.v.plate)));
  const idleCars = rows.filter((r) => idlePlates.has(normPlate(r.v.plate)));
  const soldRows = rows.filter((r) => soldPlates.has(normPlate(r.v.plate)));
  const recv = selectReceivables(contracts, today);
  const totalUnpaid = recv.total;

  const overduePay = views.filter((v) => v.net > 0).sort((a, b) => b.net - a.net);
  const returnFlow = views.filter((v) => v.status === '운행' && v.dday != null && v.dday <= 7).sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));
  const expiring = [
    ...views.filter((v) => v.status === '운행' && v.dday != null && v.dday > 7 && v.dday <= 30).map((v) => ({ plate: v.rec.plate, dday: v.dday as number, main: `${v.rec.plate} · ${v.rec.contractorName}`, sub: `계약 만기 D-${v.dday}` })),
    ...insurances.filter((i) => { const d = dday(i.endDate); return d != null && d <= 30; }).map((i) => ({ plate: i.plate, dday: dday(i.endDate)!, main: `${i.plate} · ${i.insurer || '보험'}`, sub: `보험 만기 ${(() => { const d = dday(i.endDate)!; return d < 0 ? `${-d}일 경과` : `D-${d}`; })()}` })),
    ...vehicles.filter((v) => { const d = dday(v.inspectionTo); return d != null && d <= 30; }).map((v) => ({ plate: v.plate, dday: dday(v.inspectionTo)!, main: `${v.plate} · ${v.carName || ''}`, sub: `검사 만기 ${(() => { const d = dday(v.inspectionTo)!; return d < 0 ? `${-d}일 경과` : `D-${d}`; })()}` })),
  ];
  const repair = rows.filter((r) => ['정비', '사고'].includes(r.status));
  const insMismatch = risks.flatMap((r) => r.flags.filter((f) => f.kind === '보험불일치').map((f) => ({ rec: r.rec, detail: f.detail })));
  const vehByPlate = new Map(vehicles.map((vv) => [normPlate(vv.plate), vv]));
  const compliance = views.filter((v) => v.status === '운행')
    .map((v) => ({ rec: v.rec, flags: checkCompliance(v.rec, vehByPlate.get(normPlate(v.rec.plate)) || null, today) }))
    .filter((x) => x.flags.length > 0)
    .sort((a, b) => (b.flags.some((f) => f.severity === 'high') ? 1 : 0) - (a.flags.some((f) => f.severity === 'high') ? 1 : 0));
  const penaltyPending = penalties.filter((p) => !['변경부과완료', '종결'].includes(String(p.reassignStatus || ''))).map((p) => ({ rec: p, driver: matchDriver(p, contracts) }));
  // 중복 대여 — 같은 차(normPlate)에 기간이 겹치는 미반납 계약 2건 이상(배차 사고 방지).
  const cByPlate = new Map<string, EntityRecord[]>();
  for (const c of contracts) {
    if (c.returnedDate) continue;
    const p = normPlate(c.plate);
    if (!p) continue;
    const cur = cByPlate.get(p);
    if (cur) cur.push(c); else cByPlate.set(p, [c]);
  }
  const doubleBooking: { plate: string; detail: string }[] = [];
  for (const [p, cs] of cByPlate) {
    if (cs.length < 2) continue;
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      const as = String(a.startDate || a.deliveredDate || ''), ae = String(a.endDate || '9999-12-31');
      const bs = String(b.startDate || b.deliveredDate || ''), be = String(b.endDate || '9999-12-31');
      if (as && bs && as <= be && bs <= ae) doubleBooking.push({ plate: p, detail: `${a.contractorName || '?'}(${as}~) ↔ ${b.contractorName || '?'}(${bs}~)` });
    }
  }
  // 처리 대기(할 일) — 완료 안 된 상태: 인도(출고) 대기·구매/등록 예정 등 액션 필요한 것
  const deliveryPending = contracts.filter(isDeliveryPending);
  const purchasePending = rows.filter((r) => ['구매대기', '구매예정', '등록대기', '입고대기', '매입대기'].includes(r.status));
  const todo: { plate: string; name: string; action: string; detail: string; cta: string; focus?: string }[] = [
    ...deliveryPending.map((c) => ({ plate: String(c.plate), name: String(c.contractorName || '임차인 미정'), action: '인도 대기', detail: `계약 ${String(c.startDate || c.contractDate || '—')} · 아직 출고 안 함`, cta: '인도(출고) →' })),
    ...purchasePending.map((r) => ({ plate: String(r.v.plate), name: String(r.v.carName || '차명 미정'), action: r.status, detail: '구매·등록 진행 필요', cta: '처리 →' })),
  ];
  // 일정 — 무엇을 담을지 재정의 예정. 당분간 비움(반납·검사·보험·과태료는 각자 미결/만기 섹션에서 관리).
  const sched: { d: number; type: string; plate: string; label: string; tone: 'amber' | 'teal' | 'purple' | 'orange' }[] = [];
  // 미결 종합 — 자금 미분류(매칭 안 됨) · 미등록 차량(계약만 있고 등록증/서류 없음)
  const unmatchedTx = bankTx.filter((t) => !t.category || String(t.category) === '(미분류)');
  const ghostPlates = Array.from(new Set(contracts.map((c) => String(c.plate || '')).filter((p) => p && !vehByPlate.has(normPlate(p)))));

  // 헤드라인 스냅샷 — "반영" 요약이 읽는 값(같은 계산). 보유/전체/매각/운행/미수/자금.
  // v5 migrate-switchplan 사전점검 대응: 전체구매(자산)·현보유·매각·운행중차량·운행중계약·반납·할부·미수(액/건)·자금건수.
  const cashIn = bankTx.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const cashOut = bankTx.reduce((s, t) => s + (Number(t.withdraw) || 0), 0);
  // "운행중 차량수"(running=차량 status)와 "운행중 계약수"(activeContracts=활성 계약)는 다르다.
  const activeContracts = views.filter((v) => v.status === '운행').length;    // 운행중 계약(=v5 채권 102)
  const endedContracts = views.filter((v) => v.ended).length;                 // 종료(반납·해지·채권 =v5 반납 75)
  const loanCount = vehicles.filter((v) => v.loanCompany != null || v.loanCashOnly != null).length; // 할부(상환합계 157)
  // 미수 분해 — 운행중 미수(직원 채권 carry)와 반납 추심잔여(carryReturned)를 구분(v5 사전점검 라인아이템).
  const misuActive = recv.misuActive;
  const misuReturned = recv.misuReturned;
  const misuActiveCount = recv.misuActiveCount;
  const misuReturnedCount = recv.misuReturnedCount;
  const summary = {
    totalVeh: vehicles.length,      // 전체 구매(자산)
    held: heldNodes.length,         // 현보유(처분 제외) — linkFleet
    sold: soldNodes.length,         // 매각·말소
    running: runningNodes.length,   // 운행중 차량(활성계약 파생)
    idle: idleNodes.length,         // 유휴(쉬는 차)
    util,                           // 가동률 % = 운행/보유
    activeContracts,                // 계약차량 — 운행중 계약수
    endedContracts,                 // 반납·종료 계약수
    loanCount,                      // 할부(상환) 차량수
    misuTotal: totalUnpaid,         // 현재 미수 총액(운행중+반납추심)
    misuCount: recv.unpaidCount,    // 현재 미수 건수(net>0)
    misuActive,                     // 운행중 미수
    misuActiveCount,                // 운행중 미수 건수
    misuReturned,                   // 반납 추심잔여
    misuReturnedCount,              // 반납 추심 건수
    overpayTotal: recv.overpayTotal, // 과오납 합
    cashIn, cashOut, cashNet: cashIn - cashOut, // 자금 입/출/순증감
    txCount: bankTx.length,         // 자금(계좌거래) 건수
    unclassified: unmatchedTx.length, // 자금 미분류(매칭 안 됨)
  };

  return { rows, inFleet, running, idleCars, soldRows, util, totalUnpaid, overduePay, returnFlow, expiring, repair, insMismatch, compliance, penaltyPending, doubleBooking, todo, sched, unmatchedTx, ghostPlates, summary };
}

export type Dashboard = ReturnType<typeof computeDashboard>;
export type OperatingSummary = Dashboard['summary'];
