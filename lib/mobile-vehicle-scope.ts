import type { EntityRecord } from '@/lib/intake/entities';
import { inPlateAliases, normPlate, plateAliasesFor, vehicleMatchesPlate } from '@/lib/plate';

export type MobileVehicleScope = {
  companyId: string;
  canonicalPlate: string;
  vehicle?: EntityRecord;
  vehicles: EntityRecord[];
  aliases: ReadonlySet<string>;
};

/** 모바일 차량 조회의 테넌트·번호변경 범위. URL 회사는 폴백 없이 강제한다. */
export function buildMobileVehicleScope(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  requestedPlate: string,
  requestedCompanyId = '',
): MobileVehicleScope {
  const lookupVehicles = requestedCompanyId
    ? vehicles.filter((record) => String(record.companyId || '') === requestedCompanyId)
    : vehicles;
  const vehicle = lookupVehicles.find((record) => vehicleMatchesPlate(record, requestedPlate));
  const requested = normPlate(requestedPlate);
  const companyId = requestedCompanyId
    || String(vehicle?.companyId || '')
    || String(contracts.find((record) => normPlate(record.plate) === requested)?.companyId || '');
  const scopedVehicles = companyId
    ? vehicles.filter((record) => String(record.companyId || '') === companyId)
    : vehicles;
  return {
    companyId,
    canonicalPlate: String(vehicle?.plate || requestedPlate),
    vehicle,
    vehicles: scopedVehicles,
    aliases: plateAliasesFor(scopedVehicles, requestedPlate),
  };
}

/** 원본은 바꾸지 않고 해당 회사의 옛 번호 레코드만 현재 번호로 투영한다. */
export function scopeMobileVehicleRecords(scope: MobileVehicleScope, records: EntityRecord[]): EntityRecord[] {
  return records
    .filter((record) => !scope.companyId || String(record.companyId || '') === scope.companyId)
    .map((record) => inPlateAliases(scope.aliases, record.plate)
      ? { ...record, plate: scope.canonicalPlate }
      : record);
}
