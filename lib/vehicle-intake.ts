/**
 * 자동차등록증 투입 SSOT — OCR→엔티티매핑→기존차량 대조→원본저장→saveIntake.
 *   자산관리(/asset) 생성 패널에서 소비. 화면은 공용(components/ui/doc-intake-panel).
 *
 * ★등록증이 들어오면 「계약만 있고 차량 원장 없음」 리스크가 풀린다 —
 *   그 차번으로 걸린 계약이 있으면 «리스크 해소»로 알려 준다(홈·리스크 큐에서 사라진다).
 */
import { companyLabel } from '@/lib/companies';
import {
  type DocIntakeRow, type DocIntakeSpec, type DocIntakeVerdict,
} from '@/lib/doc-intake';
import { saveIntake } from '@/lib/intake';
import type { EntityRecord } from '@/lib/intake/entities';
import { findVehicleByPlate, normPlate } from '@/lib/plate';
import { docPath, uploadDoc } from '@/lib/storage';

/** 차량 엔티티의 OCR 종류(lib/intake/entities `vehicle.ocrType`). */
export const VEHICLE_OCR_TYPE = 'vehicle_reg';
export const VEHICLE_OCR_MAX = 10;

export type VehicleMatchDerive = {
  /** 같은 차번이 이미 차량 원장에 있다. */
  dup: boolean;
  /** 이 차번으로 걸린 계약이 있다 — 등록하면 「차량 원장 없음」 리스크가 풀린다. */
  resolvesGhost: boolean;
};

export function deriveVehicleMatch(
  rec: EntityRecord,
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
): VehicleMatchDerive {
  const plate = normPlate(rec.plate);
  if (!plate) return { dup: false, resolvesGhost: false };
  return {
    dup: !!findVehicleByPlate(vehicles, plate),
    resolvesGhost: contracts.some((c) => normPlate(c.plate) === plate),
  };
}

/**
 * 저장해도 되는 상태인가 — 차량번호 하나.
 * 등록증은 차번이 자연키(entities `vehicle.idFrom = 'plate'`)라 이것만은 반드시 있어야 한다.
 * 나머지(차대번호·제원)는 못 읽어도 등록하고 나중에 보완한다 — 차를 못 넣는 것보다 낫다.
 */
export function vehicleIntakeMissing(rec: EntityRecord): string[] {
  return String(rec.plate || '').trim() ? [] : ['차량번호'];
}

export async function buildVehicleSaveRecords(
  rows: DocIntakeRow[],
  companyId: string,
): Promise<EntityRecord[]> {
  return Promise.all(rows.map(async (r) => {
    let fileUrl = '';
    try {
      fileUrl = (await uploadDoc(
        r.file,
        docPath(companyId, 'vehicle', String(r.rec.plate || r.id), r.fileName),
      )) || '';
    } catch { /* Firebase 미설정 시 스킵 — 차량은 저장한다(파일만 없음) */ }
    return {
      ...r.rec,
      companyId,
      ...(fileUrl ? { fileUrl } : {}),
      _ocrOriginal: r.ocrOriginal,
    };
  }));
}

export async function saveVehicleRecords(companyId: string, records: EntityRecord[]): Promise<number> {
  await saveIntake('vehicle', companyId, records);
  return records.length;
}

export function vehicleSavedToast(count: number, companyId: string): string {
  return `차량 ${count}대 등록 · ${companyLabel(companyId)}`;
}

export const VEHICLE_INTAKE_SPEC: DocIntakeSpec = {
  entityKey: 'vehicle',
  ocrType: VEHICLE_OCR_TYPE,
  max: VEHICLE_OCR_MAX,
  hint: '자동차등록증 이미지·PDF · 여러 장',
  refEntities: ['vehicle', 'contract'],
  missing: vehicleIntakeMissing,
  derive: (rec, refs) => {
    const m = deriveVehicleMatch(rec, refs[0] || [], refs[1] || []);
    const badges: DocIntakeVerdict['badges'] = [];
    if (m.resolvesGhost && !m.dup) badges.push({ t: '리스크 해소 · 계약있음', tone: 'green' });
    return { dup: m.dup, badges };
  },
  manual: [
    { key: 'plate', label: '차량번호', placeholder: '12가3456' },
    { key: 'carName', label: '차명', placeholder: '아반떼' },
    { key: 'vin', label: '차대번호(VIN)' },
  ],
  summary: (rec) => [String(rec.plate || '').trim(), String(rec.carName || '').trim()].filter(Boolean).join(' · '),
  build: (rows, companyId) => buildVehicleSaveRecords(rows, companyId),
  save: saveVehicleRecords,
  savedToast: vehicleSavedToast,
  saveLabel: (n) => `차량 ${n}대 등록`,
  incompleteNote: (n) => `미완 ${n}건은 차량번호를 수기 입력해야 등록됩니다.`,
};
