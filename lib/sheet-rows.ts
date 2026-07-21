/**
 * 운영 시트 행 — linkFleet 파생. 페이지는 배열·필터만.
 * 프리패스 엑셀뷰 = 스캔 핵심 열. 상세는 360.
 */
import { type VehicleNode, onBooks } from './domain/model';
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
