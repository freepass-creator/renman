/**
 * 도메인 연결 SSOT — 원장 3자산(현물·계약·자금)을 "계약 허브"로 잇는 단일 로직.
 * 층 SSOT = lib/domain/layers (①원장 자산 ②지표 ③이벤트).
 *
 *   원장 = 유·무형 자산 생성(불변 존재). 계약 성립 ≠ 이벤트 → 계약자산.
 *     · 현물(vehicle)  구매 → 현물자산
 *     · 계약(contract) 성립 → 계약자산(무형)
 *     · 자금(bank_tx…) 계좌 → 자금자산
 *   세계관 축:
 *     · 차량번호 — linkFleet.byPlate / openCar
 *     · 계약자   — customerKey(phone||name) / openCustomer · aggregateCustomers
 *     · 기간     — PeriodBar·txDate·계약 기간 (자금·손익·수납)
 *   계약자산 하나가 셋을 동시에 굴린다:
 *     · 계약에 손님이 종속       → 계약관리 = 손님관리 (고객현황 = 계약의 사람-뷰)
 *     · 활성 계약이 차를 운행시킴 → 현물 "가동(운행/유휴)"은 계약에서 파생(지표·파생)
 *     · 계약이 수납·미수를 낳음   → 자금 흐름·채권(net)도 계약 파생
 *   상태는 전부 2축으로 분류(플랫 enum 폭발 방지):
 *     · 계약 = 진행(대기=계약예정/운행=계약중/종료=계약완료) × 채권(청산/잔존)
 *     · 현물 = 소유(구매예정/등록예정/보유중/처분예정/처분완료) × 가동(운행/유휴/정비, 보유중만)
 *   페이지는 상태를 손롤하지 말고 여기서 분류·연결만 따다 쓴다.
 */
import { type EntityRecord } from '../intake/entities';
import { computeContractView, type ContractView } from '../contract-ops';
import { normPlate } from '../plate';
import { OUT, VEHICLE_REPAIR, VEHICLE_BUY_PLAN, VEHICLE_REG_PLAN, VEHICLE_DISPOSE_PLAN } from './status';
import { customerKey } from '../customers';

type Tone = 'ok' | 'warn' | 'danger' | 'mute';

/* ─────────────── 계약 2축: 진행 × 채권 ─────────────── */
export type ContractPhase = '대기' | '운행' | '종료';
export type ContractDebt = '청산' | '채권잔존';
export type ContractClass = {
  phase: ContractPhase;
  endReason: string;        // 종료 시: 정상종료 / 중도해지
  debt: ContractDebt;       // net > 0 → 채권잔존 (파생, 자동)
  net: number;
  label: string;            // 사람 표시 뱃지
  tone: Tone;
};

/** 계약 뷰 → 2축 분류. 채권축은 net에서 자동 파생(마지막 돈 들어오면 잔존→청산 자동). */
export function classifyContract(v: ContractView): ContractClass {
  const phase: ContractPhase = v.ended ? '종료' : v.status === '운행' ? '운행' : '대기';
  // 종료사유: 해지=중도해지, 그 외 종료=정상종료(반납). (채권보전 여부는 debt축이 따로 표현)
  const endReason = phase === '종료' ? (v.status === '해지' ? '중도해지' : '정상종료') : '';
  const debt: ContractDebt = v.net > 0 ? '채권잔존' : '청산';
  let label: string, tone: Tone;
  if (phase === '대기') { label = '인도대기'; tone = 'warn'; }
  else if (phase === '운행') { label = debt === '채권잔존' ? '운행중·연체' : '운행중'; tone = debt === '채권잔존' ? 'danger' : 'ok'; }
  else { label = debt === '채권잔존' ? `${endReason}·채권보전` : `${endReason}·완결`; tone = debt === '채권잔존' ? 'danger' : 'mute'; }
  return { phase, endReason, debt, net: v.net, label, tone };
}

/* ─────────────── 자산 2축: 소유(5생애) × 가동 ─────────────── */
export type Ownership = '구매예정' | '등록예정' | '보유중' | '처분예정' | '처분완료';
export type Utilization = '운행' | '휴차' | '정비' | null;   // 보유중일 때만
export type VehicleClass = {
  ownership: Ownership;
  utilization: Utilization;
  label: string;
  tone: Tone;
};
/** 장부 잔존(아직 처분완료 아님) — 보유 대수·자산 집계. */
export const onBooks = (o: Ownership) => o !== '처분완료';

/** 차량 → 2축 분류. 가동은 보유중만 파생(활성 계약→운행, 아니면 유휴/정비). */
export function classifyVehicle(veh: EntityRecord, hasActiveContract: boolean): VehicleClass {
  const s = String(veh.status || '');
  let ownership: Ownership;
  if (OUT.has(s)) ownership = '처분완료';
  else if (VEHICLE_DISPOSE_PLAN.has(s)) ownership = '처분예정';
  else if (VEHICLE_BUY_PLAN.has(s)) ownership = '구매예정';
  else if (VEHICLE_REG_PLAN.has(s)) ownership = '등록예정';
  else ownership = '보유중';
  let utilization: Utilization = null;
  if (ownership === '보유중') utilization = VEHICLE_REPAIR.has(s) ? '정비' : hasActiveContract ? '운행' : '휴차';
  const label =
    ownership === '처분완료' ? (s || '매각')
      : ownership === '처분예정' ? (s || '처분예정')
        : ownership === '구매예정' ? (s || '구매예정')
          : ownership === '등록예정' ? (s || '등록예정')
            : (utilization ?? '휴차');
  const tone: Tone =
    ownership === '처분완료' ? 'mute'
      : ownership === '처분예정' || ownership === '구매예정' || ownership === '등록예정' ? 'warn'
        : utilization === '운행' ? 'ok' : utilization === '정비' ? 'warn' : 'mute';
  return { ownership, utilization, label, tone };
}

/* ─────────────── 연결 엔진: 차 ↔ 계약 ↔ 손님 ↔ 채권 ─────────────── */
export type ContractNode = ContractClass & { view: ContractView; plate: string; customer: string };
export type VehicleNode = VehicleClass & { veh: EntityRecord; plate: string; activeContract: ContractNode | null; contracts: ContractNode[] };
export type Fleet = {
  contracts: ContractNode[];
  vehicles: VehicleNode[];
  byPlate: Map<string, VehicleNode>;         // 번호판(정규화) → 차량 노드
  activeByPlate: Map<string, ContractNode>;  // 번호판 → 현재 운행 계약
};

/** 원자 연결 — 차량·계약을 번호판(normPlate)으로 잇고, 손님·가동·채권을 계약에서 파생. 전 페이지 SSOT.
 *  views를 넘기면(contracts와 동일 순서) computeContractView를 다시 돌리지 않음 — dashboard/KPI 1패스용. */
export function linkFleet(vehicles: EntityRecord[], contracts: EntityRecord[], today: string, views?: ContractView[]): Fleet {
  const cNodes: ContractNode[] = contracts.map((c, i) => {
    const view = views?.[i] ?? computeContractView(c, today);
    return { ...classifyContract(view), view, plate: normPlate(c.plate), customer: String(c.contractorName || '') };
  });
  const activeByPlate = new Map<string, ContractNode>();
  const histByPlate = new Map<string, ContractNode[]>();
  for (const n of cNodes) {
    const arr = histByPlate.get(n.plate); if (arr) arr.push(n); else histByPlate.set(n.plate, [n]);
    if (n.phase === '운행') activeByPlate.set(n.plate, n);
  }
  const vNodes: VehicleNode[] = vehicles.map((veh) => {
    const p = normPlate(veh.plate);
    const active = activeByPlate.get(p) ?? null;
    return { ...classifyVehicle(veh, !!active), veh, plate: p, activeContract: active, contracts: histByPlate.get(p) ?? [] };
  });
  return { contracts: cNodes, vehicles: vNodes, byPlate: new Map(vNodes.map((n) => [n.plate, n])), activeByPlate };
}

/* ─────────────── 손님 = 계약의 사람-뷰 (계약을 사람 기준으로 묶음) ─────────────── */
export type CustomerNode = { name: string; phone: string; contracts: ContractNode[]; active: number; ended: number; totalDebt: number };

/* ─────────────── 계약이력 — 차/손님의 계약을 시간순으로 (재렌트·재계약 시계열) ─────────────── */
/** 계약이력 타임라인 — 시작일 순 정렬. 한 차의 재렌트 = [과거 반납…, 현재 운행], 한 손님의 재계약 = 계약 시퀀스. */
export function contractTimeline(nodes: ContractNode[]): ContractNode[] {
  const key = (n: ContractNode) => String(n.view.rec.startDate || n.view.rec.contractDate || n.view.rec.deliveredDate || '');
  return [...nodes].sort((a, b) => { const ka = key(a), kb = key(b); return ka < kb ? -1 : ka > kb ? 1 : 0; });
}

/** 손바뀜 이력 — 한 차의 계약을 시간순으로, 손바뀜마다 대여료 인하 추이. (렌터카 = 손이 바뀔수록 대여료↓·차값↓) */
export type HandoverStep = { seq: number; customer: string; rent: number; drop: number; dropPct: number; phase: ContractPhase; start: string; net: number };
export type Handover = { count: number; steps: HandoverStep[]; firstRent: number; lastRent: number; totalDrop: number; totalDropPct: number };
export function handoverHistory(contracts: ContractNode[]): Handover {
  const tl = contractTimeline(contracts);
  let prev = 0, totalDrop = 0;
  const steps: HandoverStep[] = tl.map((n, i) => {
    const rent = Number(n.view.rec.monthlyRent) || 0;
    const drop = i === 0 ? 0 : Math.max(0, prev - rent);      // 손바뀜 시 대여료 인하액(오르면 0)
    const dropPct = i === 0 || prev <= 0 ? 0 : Math.round((drop / prev) * 100);
    totalDrop += drop; prev = rent;
    return { seq: i + 1, customer: n.customer, rent, drop, dropPct, phase: n.phase, start: String(n.view.rec.startDate || ''), net: n.net };
  });
  const firstRent = steps[0]?.rent ?? 0;
  const lastRent = steps[steps.length - 1]?.rent ?? 0;
  return { count: tl.length, steps, firstRent, lastRent, totalDrop, totalDropPct: firstRent > 0 ? Math.round(((firstRent - lastRent) / firstRent) * 100) : 0 };
}

/* ─────────────── 반납 차 재렌트 적정 대여료 추천 (함대 손바뀜 실적 기반) ─────────────── */
/** 함대의 "손바뀜당 대여료 인하율" — 재렌트 추천의 근거. 실 계약이력에서 각 손바뀜 스텝의 인하율 평균. */
export function fleetRentDropRate(vehicles: VehicleNode[]): { perHandoverPct: number; sampleSteps: number; sampleCars: number } {
  const drops: number[] = [];
  for (const v of vehicles) {
    const h = handoverHistory(v.contracts);
    for (const s of h.steps) if (s.seq > 1 && s.drop > 0) drops.push(s.dropPct); // 손바뀜에서 실제 내린 스텝만
  }
  const perHandoverPct = drops.length ? Math.round(drops.reduce((a, b) => a + b, 0) / drops.length) : 0;
  return { perHandoverPct, sampleSteps: drops.length, sampleCars: vehicles.filter((v) => v.contracts.length >= 2).length };
}

export type RentReco = { currentRent: number; nextHand: number; dropPct: number; recommended: number; low: number; high: number; peers: number; peerAvg: number; basis: string };
/** 함대 단위 재렌트 컨텍스트 — dropRate·동종 렌트를 1회만 계산. 목록에서 행마다 fleetRentDropRate 금지. */
export type RentRecoCtx = { dropPct: number; rentsByModel: Map<string, Map<string, number[]>> };
export function buildRentRecoCtx(fleet: VehicleNode[]): RentRecoCtx {
  const dropPct = fleetRentDropRate(fleet).perHandoverPct || 10;
  const rentsByModel = new Map<string, Map<string, number[]>>();
  for (const v of fleet) {
    const model = String(v.veh.carName || '');
    if (!model) continue;
    const rents = contractTimeline(v.contracts).map((c) => Number(c.view.rec.monthlyRent) || 0).filter((r) => r > 0);
    if (!rents.length) continue;
    let byPlate = rentsByModel.get(model);
    if (!byPlate) { byPlate = new Map(); rentsByModel.set(model, byPlate); }
    byPlate.set(v.plate, rents);
  }
  return { dropPct, rentsByModel };
}

/** 반납 차 다음 대여료 추천 — 마지막 대여료 × (1 − 함대 손바뀜 인하율), 만원 단위. ctx 넘기면 함대 스캔 생략. */
export function recommendNextRent(vehicle: VehicleNode, fleet: VehicleNode[], ctx?: RentRecoCtx): RentReco | null {
  const tl = contractTimeline(vehicle.contracts);
  const last = tl[tl.length - 1];
  const currentRent = (last ? Number(last.view.rec.monthlyRent) : Number(vehicle.veh.monthlyRent)) || 0;
  if (currentRent <= 0) return null;
  const resolved = ctx ?? buildRentRecoCtx(fleet);
  const dropPct = resolved.dropPct;
  const round10k = (n: number) => Math.round(n / 10000) * 10000;
  const recommended = round10k(currentRent * (1 - dropPct / 100));
  const model = String(vehicle.veh.carName || '');
  const peerRents: number[] = [];
  const byPlate = resolved.rentsByModel.get(model);
  if (byPlate) for (const [p, rents] of byPlate) if (p !== vehicle.plate) peerRents.push(...rents);
  const peerAvg = peerRents.length ? round10k(peerRents.reduce((a, b) => a + b, 0) / peerRents.length) : 0;
  return {
    currentRent, nextHand: tl.length + 1, dropPct, recommended,
    low: round10k(recommended * 0.9), high: round10k(recommended * 1.05),
    peers: peerRents.length, peerAvg,
    basis: `${tl.length}손 반납 → 함대 손바뀜 평균 ${dropPct}%↓ 적용${peerRents.length ? ` · 동종 ${model} ${peerRents.length}건 평균 ${Math.round(peerAvg / 10000)}만` : ''}`,
  };
}

/** 고객현황 = 계약을 손님(이름+연락처)으로 묶은 파생 뷰. 별도 원천 아님 — 계약이 원천. 키=customerKey SSOT. */
export function groupByCustomer(cNodes: ContractNode[]): CustomerNode[] {
  const map = new Map<string, CustomerNode>();
  for (const n of cNodes) {
    const phone = String(n.view.rec.contractorPhone || '');
    const key = customerKey(n.customer, phone);
    if (!key) continue;
    let c = map.get(key);
    if (!c) { c = { name: n.customer, phone, contracts: [], active: 0, ended: 0, totalDebt: 0 }; map.set(key, c); }
    c.contracts.push(n);
    if (n.phase === '종료') c.ended++; else c.active++;
    c.totalDebt += Math.max(0, n.net);
  }
  return [...map.values()].sort((a, b) => b.totalDebt - a.totalDebt);
}
