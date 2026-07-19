// 차량번호(plate) SSOT — 접착제 원자. normPlate 정규화로 차량↔계약↔보험↔과태료를 하나의 물리 축에 꿴다.
//   원자 사전 #1 사슬: plate → normPlate(O→0·I→1·공백제거) → vehicleMatchesPlate(+번호변경이력) → 단일 축.
//   페이지에서 raw 문자열 비교 금지 — 표기차("01도 9893" vs "01도9893")·OCR오차·번호변경 차량을 놓친다.
import { type EntityRecord } from './intake/entities';

const PLATE_RE = /^\d{2,3}[가-힣]\d{4}$/;

/** plate 정규화 — 공백/특수문자 제거, OCR 영문→숫자 보정(O→0, I→1). 매칭·자연키의 기준. */
export function normPlate(s?: unknown): string {
  const t = s == null ? '' : String(s);
  if (!t) return '';
  return t.replace(/\s+/g, '').replace(/O/gi, '0').replace(/I/gi, '1').replace(/[^0-9가-힣]/g, '');
}

/** 정규 차량번호인가 — `\d{2,3}[가-힣]\d{4}` (임판·빈값 제외). */
export function isNormalPlate(plate?: unknown): boolean {
  const k = normPlate(plate);
  return !!k && PLATE_RE.test(k);
}

/** 계약을 통해 차량이 자동 등록될 때 status 결정. 빈값→구매대기 / 임판→등록대기 / 정상→휴차. */
export function deriveVehicleStatusFromContract(plate?: unknown): string {
  const t = plate == null ? '' : String(plate).trim();
  if (!t) return '구매대기';
  if (!isNormalPlate(t)) return '등록대기';
  return '휴차';
}

/** 차량 레코드가 이 plate와 같은가 — normPlate + 번호변경 이력(plateHistory). 매칭 SSOT. */
export function vehicleMatchesPlate(vehicle: EntityRecord, plate?: unknown): boolean {
  const key = normPlate(plate);
  if (!key) return false;
  if (normPlate(vehicle.plate) === key) return true;
  const hist = Array.isArray(vehicle.plateHistory) ? (vehicle.plateHistory as unknown[]) : [];
  return hist.some((h) => normPlate(h) === key);
}

/** plate로 차량 찾기 — normPlate 매칭(현재번호 우선, 번호변경 이력 폴백). */
export function findVehicleByPlate(vehicles: EntityRecord[], plate?: unknown): EntityRecord | undefined {
  const key = normPlate(plate);
  if (!key) return undefined;
  return vehicles.find((v) => normPlate(v.plate) === key)
    ?? vehicles.find((v) => vehicleMatchesPlate(v, plate));
}

/** plate → normPlate 키로 Map 인덱스(차량/거래 등 plate 기준 조인용). */
export function indexByPlate<T extends EntityRecord>(rows: T[], plateKey: keyof T = 'plate' as keyof T): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) { const k = normPlate(r[plateKey]); if (k && !m.has(k)) m.set(k, r); }
  return m;
}
