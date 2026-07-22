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
import { companyShort } from './companies';

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
