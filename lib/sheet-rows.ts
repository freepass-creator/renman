/**
 * 운영 시트 행 — linkFleet 파생. 페이지는 배열·필터만.
 * 프리패스 엑셀뷰 = 스캔 핵심 열. 상세는 360.
 *
 * 통합 마스터 = 차량 1대=1행(FleetRow). 자산·계약 마스터 원장은 lib/master-ledgers.
 *   금액·상태는 전부 computeContractView(ContractNode.view) 파생 — 여기서 재계산 손롤 금지.
 */
import { type VehicleNode, type ContractNode } from './domain/model';
import { type EntityRecord } from './intake/entities';
import { normPlate } from './plate';
import { deriveLocation } from './vehicle-location';
import { companyShort } from './companies';
import { rowWarnings, type SheetWarning } from './sheet-warnings';
import { rentalTypeOf, paymentTimingOf } from './schema/contract';
import type { RailTone as RowRail } from '@/components/ui';   // 타입 전용 — 런타임 커플링 없음

/**
 * 통합 마스터 행 — 차량 1대 = 1행. 자산 + (활성)계약/손님 + 미수 + 할부·보험·GPS 를 한 줄에.
 * 운영시트(전체보기) SSOT. 자산 필드는 veh 원본, 계약/미수는 computeContractView 파생(재계산 손롤 금지),
 * 보험은 번호판으로 조인(최신 만기 1건). 미수 = 차량의 모든 계약 net 합(반납·잔존채권 포함).
 */
export type FleetRow = {
  plate: string; companyId: string; company: string;
  // 자산
  ownership: string; util: string; status: string; location: string; carName: string; maker: string; subModel: string; year: string; vin: string; note: string;
  acqDate: string; acqPrice: number; inspectionTo: string; gps: string;
  // 할부
  loanCompany: string; loanPrincipal: number; loanRate: number; loanMonths: number; loanStart: string;
  // 계약(활성)
  customer: string; phone: string; rentalType: string; rent: number; deposit: number; termMonths: number; start: string; end: string; dday: number | null;
  paymentDay: number; paymentTiming: string; roundDue: number; roundTotal: number;
  // 보험
  insurer: string; insEnd: string; insPremium: number;
  // 미수
  net: number; overdueDays: number;
  // 인라인 경고(무보험·검사만료·반납지남·미수단계·면허 등) — sheet-warnings 합성. ⚠ 열·'경고' 필터가 씀.
  warnings: SheetWarning[];
  tone: 'ok' | 'warn' | 'danger' | 'mute';
};

/** contracts(전체)를 넘기면 «차량 없는 계약»(고아: plate가 차량목록에 없음)도 별도 행으로 노출 →
 *  마스터 미수 총액이 실제와 일치(계약 미수를 조용히 누락시키지 않음). */
export function buildFleetRows(vehicles: VehicleNode[], insurance: EntityRecord[] = [], contracts: ContractNode[] = [], history: EntityRecord[] = [], today = ''): FleetRow[] {
  // 보험: 번호판별 최신(만기 늦은) 1건
  const insByPlate = new Map<string, EntityRecord>();
  for (const ins of insurance) {
    const p = normPlate(ins.plate);
    if (!p) continue;
    const cur = insByPlate.get(p);
    if (!cur || String(ins.endDate || '') > String(cur.endDate || '')) insByPlate.set(p, ins);
  }
  const histByPlate = new Map<string, EntityRecord[]>();
  for (const h of history) { const p = normPlate(h.plate); if (!p) continue; const a = histByPlate.get(p); if (a) a.push(h); else histByPlate.set(p, [h]); }
  const isCash = (v: EntityRecord) => /(예|현금|Y)/i.test(String(v.loanCashOnly || ''));

  // 한 plate(차량 1대 또는 고아 계약군)의 계약 파생 필드 + 보험/미수.
  const rowFrom = (
    plate: string, veh: EntityRecord | null, active: ContractNode | null, plateContracts: ContractNode[],
    asset: Pick<FleetRow, 'companyId' | 'ownership' | 'util' | 'status' | 'location' | 'tone'>,
  ): FleetRow => {
    const v = active?.view;
    const net = plateContracts.reduce((s, c) => s + Math.max(0, c.net), 0);
    const overdueDays = plateContracts.reduce((m, c) => Math.max(m, c.view.overdueDays), 0);
    const ins = insByPlate.get(plate);
    return {
      plate,
      companyId: asset.companyId,
      company: companyShort(asset.companyId),
      ownership: asset.ownership, util: asset.util, status: asset.status, location: asset.location,
      carName: String(veh?.carName || veh?.model || active?.view.rec.carName || ''),
      maker: String(veh?.maker || ''),
      subModel: String(veh?.subModel || veh?.modelLine || ''),
      year: String(veh?.firstReg || veh?.yearMonth || '').slice(0, 4),
      vin: String(veh?.vin || ''),
      note: String(veh?.note ?? veh?.memo ?? ''),
      acqDate: String(veh?.acquisitionDate || ''),
      acqPrice: Number(veh?.acquisitionPrice) || 0,
      inspectionTo: String(veh?.inspectionTo || ''),
      gps: String(veh?.gpsProvider || ''),
      loanCompany: String(veh?.loanCompany || '') || (veh && isCash(veh) ? '현금' : ''),
      loanPrincipal: Number(veh?.loanPrincipal) || 0,
      loanRate: Number(veh?.loanRate) || 0,
      loanMonths: Number(veh?.loanMonths) || 0,
      loanStart: String(veh?.loanStartDate || ''),
      customer: active?.customer || '',
      phone: String(v?.rec.contractorPhone || ''),
      rentalType: rentalTypeOf(v?.rec),
      rent: Number(v?.rec.monthlyRent) || 0,
      deposit: Number(v?.rec.deposit) || 0,
      termMonths: Number(v?.rec.rentalMonths) || 0,
      start: String(v?.rec.startDate || v?.rec.deliveredDate || ''),
      end: String(v?.rec.endDate || ''),
      dday: v?.dday ?? null,
      paymentDay: active ? (Number(v?.rec.paymentDay) >= 1 && Number(v?.rec.paymentDay) <= 31 ? Number(v?.rec.paymentDay) : 25) : 0,
      paymentTiming: active ? paymentTimingOf(v?.rec.paymentTiming) : '',
      roundDue: v?.roundDue ?? 0,
      roundTotal: v?.roundTotal ?? 0,
      insurer: String(ins?.insurer || ''),
      insEnd: String(ins?.endDate || ''),
      insPremium: Number(ins?.totalPremium) || 0,
      net, overdueDays,
      warnings: rowWarnings({
        held: asset.ownership !== '처분완료' && asset.status !== '차량없음',
        active: !!active, contractRec: active?.view.rec ?? null, veh,
        util: asset.util, customer: active?.customer || '',
        dday: v?.dday ?? null, rent: Number(v?.rec.monthlyRent) || 0,
        overdueDays, insEnd: String(ins?.endDate || ''), inspectionTo: String(veh?.inspectionTo || ''), today,
      }),
      // 상태 뱃지는 «상태» 톤(운행=초록·유휴=회색·정비=주의). 미수는 미수/연체 열 색으로 별도 표시.
      tone: asset.tone,
    };
  };

  const rows: FleetRow[] = vehicles.map((n) =>
    rowFrom(n.plate || String(n.veh.plate || ''), n.veh, n.activeContract, n.contracts, {
      companyId: String(n.veh.companyId || ''), ownership: n.ownership, util: n.utilization ?? n.label, status: n.label,
      // 현위치 = 한 칸에 하나. 대여중=계약자(차가 그 손님에게), 아니면 최근 이동처/차고지. 활성계약은 linkFleet SSOT와 일치.
      location: n.activeContract ? (n.activeContract.customer || '차고지') : deriveLocation(n.veh, [], histByPlate.get(n.plate) || [], today).location,
      tone: n.tone,
    }));

  // 고아 계약(차량 목록에 없는 plate) → plate별 1행(자산=차량없음). 미수 누락 방지.
  const vplates = new Set(vehicles.map((n) => n.plate));
  const orphanByPlate = new Map<string, ContractNode[]>();
  for (const c of contracts) if (c.plate && !vplates.has(c.plate)) {
    const arr = orphanByPlate.get(c.plate); if (arr) arr.push(c); else orphanByPlate.set(c.plate, [c]);
  }
  for (const [plate, cs] of orphanByPlate) {
    const active = cs.find((c) => c.phase === '운행') ?? cs[cs.length - 1] ?? null;
    rows.push(rowFrom(plate, null, active, cs, {
      companyId: String(active?.view.rec.companyId || ''), ownership: '처분완료', util: '차량없음', status: '차량없음', location: '차량없음', tone: 'mute',
    }));
  }

  return rows.sort((a, b) => a.plate.localeCompare(b.plate, 'ko'));
}

/**
 * 상태 정렬 우선순위 SSOT (사장님 지정): 인도예정>만기경과>휴차>마감임박>운행중>정비 등>처분예정>처분완료.
 *   app/sheet/page.tsx 지역 statusRank 승격 — /sheet 정렬·ObjRow 레일·홈 섹션이 공용.
 */
export function statusRank(r: Pick<FleetRow, 'ownership' | 'util' | 'dday'>): number {
  if (r.ownership === '처분완료') return 8;
  if (r.ownership === '처분예정') return 7;
  if (r.ownership === '구매예정' || r.ownership === '등록예정') return 0;  // 인도(입고)예정
  if (r.dday != null && r.dday < 0) return 1;                             // 만기경과(반납지남)
  if (r.util === '휴차') return 2;                                        // 휴차
  if (r.dday != null && r.dday >= 0 && r.dday <= 30) return 3;            // 마감임박(만기임박)
  if (r.util === '운행') return 4;                                        // 운행중
  return 5;                                                                // 정비 등 기타
}

/** FleetRow → ObjRow/ExcelSheet 레일색(상태축). statusRank와 같은 술어. 정상(운행)=무색. */
export function fleetRail(r: Pick<FleetRow, 'ownership' | 'util' | 'dday'>): RowRail {
  const rank = statusRank(r);
  return rank === 0 ? 'brand' : rank === 1 ? 'danger' : rank === 2 ? 'violet'
    : rank === 3 ? 'warn' : rank === 4 ? 'none' : rank === 5 ? 'warn' : 'mute';
}
