/**
 * 운영 시트 행 — linkFleet 파생. 페이지는 배열·필터만.
 * 프리패스 엑셀뷰 = 스캔 핵심 열. 상세는 360.
 *
 * 뷰 4종 = 사업현황.xlsx 시트 구성 그대로(자산·계약·채권·반납). 쓰던 장부와 같은 단위로 본다.
 *   자산 = 차량 1행  ·  계약/채권/반납 = 계약 1행
 *   같은 차가 손바뀜하면 계약이 여러 건 → 자산 163대에 계약 177건인 게 정상.
 *   금액·상태는 전부 computeContractView(ContractNode.view) 파생 — 여기서 재계산 손롤 금지.
 */
import { type VehicleNode, type ContractNode, onBooks } from './domain/model';
import { type ContractView } from './contract-ops';
import { type EntityRecord } from './intake/entities';
import { normPlate } from './plate';
import { deriveLocation } from './vehicle-location';
import { companyShort } from './companies';
import { rowWarnings, type SheetWarning } from './sheet-warnings';

export type SheetRow = {
  plate: string;
  companyId: string;
  company: string;
  ownership: string;
  util: string;
  carName: string;
  year: string;
  customer: string;
  rent: number;
  net: number;
  start: string;
  end: string;
  dday: number | null;
  tone: 'ok' | 'warn' | 'danger' | 'mute';
};

/** 계약 1행 — 계약·채권·반납 탭 공용(어느 탭이냐는 필터일 뿐, 행 모양은 같다). */
export type ContractRow = {
  contractNo: string;
  plate: string;
  companyId: string;
  company: string;
  customer: string;
  phone: string;
  carName: string;
  rent: number;
  deposit: number;
  net: number;          // 순미수(= computeContractView.net)
  overdueDays: number;  // 최장 연체일
  count: number;        // 미납 회차수
  start: string;
  end: string;
  returned: string;     // 반납일(있으면)
  dday: number | null;
  status: string;
  ended: boolean;
  tone: 'ok' | 'warn' | 'danger' | 'mute';
};

/** 연체 강도 → 톤. 30/90일은 selectReceivables 의 aging 경계와 같은 기준. */
function debtTone(net: number, overdueDays: number): ContractRow['tone'] {
  if (net <= 0) return 'ok';
  if (overdueDays >= 90) return 'danger';
  if (overdueDays >= 30) return 'warn';
  return 'mute';
}

/** ContractView 1건 → ContractRow. 손바뀜 노드 정보(plate·customer) 있으면 우선. 계약현황·운영시트 공용 SSOT. */
export function contractViewToRow(v: ContractView, node?: { plate?: string; customer?: string }): ContractRow {
  const r = v.rec;
  return {
    contractNo: String(r.contractNo || r._key || ''),
    plate: node?.plate || String(r.plate || ''),
    companyId: String(r.companyId || ''),
    company: companyShort(String(r.companyId || '')),
    customer: node?.customer || String(r.contractorName || ''),
    phone: String(r.contractorPhone || ''),
    carName: String(r.carName || ''),
    rent: v.monthlyRent || 0,
    deposit: Number(r.deposit) || 0,
    net: v.net,
    overdueDays: v.overdueDays,
    count: v.count,
    start: v.startDate,
    end: v.endDate,
    returned: String(r.returnedDate || ''),
    dday: v.dday,
    status: v.status,
    ended: v.ended,
    tone: debtTone(v.net, v.overdueDays),
  };
}

export function buildContractRows(contracts: ContractNode[]): ContractRow[] {
  return contracts
    .map((n) => contractViewToRow(n.view, { plate: n.plate, customer: n.customer }))
    .sort((a, b) => a.plate.localeCompare(b.plate, 'ko'));
}

/**
 * 통합 마스터 행 — 차량 1대 = 1행. 자산 + (활성)계약/손님 + 미수 + 할부·보험·GPS 를 한 줄에.
 * 운영시트(전체보기) SSOT. 자산 필드는 veh 원본, 계약/미수는 computeContractView 파생(재계산 손롤 금지),
 * 보험은 번호판으로 조인(최신 만기 1건). 미수 = 차량의 모든 계약 net 합(반납·잔존채권 포함).
 */
export type FleetRow = {
  plate: string; companyId: string; company: string;
  // 자산
  ownership: string; util: string; status: string; location: string; carName: string; year: string; vin: string;
  acqDate: string; acqPrice: number; inspectionTo: string; gps: string;
  // 할부
  loanCompany: string; loanPrincipal: number; loanRate: number; loanMonths: number; loanStart: string;
  // 계약(활성)
  customer: string; phone: string; rent: number; deposit: number; termMonths: number; start: string; end: string; dday: number | null;
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
      year: String(veh?.firstReg || veh?.yearMonth || '').slice(0, 4),
      vin: String(veh?.vin || ''),
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
      rent: Number(v?.rec.monthlyRent) || 0,
      deposit: Number(v?.rec.deposit) || 0,
      termMonths: Number(v?.rec.rentalMonths) || 0,
      start: String(v?.rec.startDate || v?.rec.deliveredDate || ''),
      end: String(v?.rec.endDate || ''),
      dday: v?.dday ?? null,
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

export function buildSheetRows(vehicles: VehicleNode[]): SheetRow[] {
  return vehicles
    .filter((n) => onBooks(n.ownership))
    .map((n) => {
      const ac = n.activeContract;
      const v = ac?.view;
      return {
        plate: n.plate || String(n.veh.plate || ''),
        companyId: String(n.veh.companyId || ''),
        company: companyShort(String(n.veh.companyId || '')),
        ownership: n.ownership,
        util: n.utilization ?? n.label,
        carName: String(n.veh.carName || n.veh.model || ''),
        year: String(n.veh.yearMonth || n.veh.year || '').slice(0, 4),
        customer: ac?.customer || '',
        rent: Number(v?.rec.monthlyRent) || 0,
        net: ac?.net ?? 0,
        start: String(v?.rec.startDate || v?.rec.deliveredDate || ''),
        end: String(v?.rec.endDate || ''),
        dday: v?.dday ?? null,
        tone: n.tone,
      };
    })
    .sort((a, b) => a.plate.localeCompare(b.plate, 'ko'));
}
