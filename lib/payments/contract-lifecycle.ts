/**
 * 계약 생애주기 판단 SSOT — 종료·연체·리스크 등.
 *
 * **원칙: 이 파일이 계약 상태 판단의 단일 진실. 페이지·컴포넌트 안에서
 * `c.status === '반납' || c.status === '해지'` 같은 인라인 비교 금지.**
 *
 * 운영현황·계약·자산·리스크·재무·과태료·dashboard·모바일 모두 이 파일 사용.
 *
 * 이전: 25+ 곳에서 미세하게 다른 조합으로 판단 → 페이지마다 같은 계약이
 * 다르게 분류되는 버그 위험. 정책 변경 시 모든 페이지 손봐야 함.
 */

import type { Contract, ContractStatus, VehicleStatus } from './types';

/* ────────────────── ContractStatus 분류 셋 ────────────────── */

/** 운영중 (운행 또는 인도 대기) — 미수 안 발생, 매출 발생 가능. */
export const ACTIVE_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set([
  '대기', '운행',
]);

/** 종료 — 반납·해지·채권 (채권보전 포함). */
export const ENDED_CONTRACT_STATUSES: ReadonlySet<ContractStatus> = new Set([
  '반납', '해지', '채권',
]);

/* ────────────────── VehicleStatus 분류 셋 ────────────────── */

/**
 * 비운영 차량 (운영현황·리스크 노출 X).
 * 휴차·상품화·구매대기·매각 단계 등.
 */
export const INACTIVE_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  '휴차', '휴차대기',
  '매각검토', '매각', '매각대기',
  '상품화대기', '상품화중', '상품대기',
  '구매대기', '등록대기',
]);

/** 매각 단계 — 자산 회전 종료. */
export const DISPOSAL_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  '매각검토', '매각', '매각대기',
]);

/** 휴차 단계 (대기·임시) — 임차 가능 X. */
export const IDLE_VEHICLE_STATUSES: ReadonlySet<VehicleStatus> = new Set([
  '휴차', '휴차대기',
]);

/* ────────────────── 계약 판단 ────────────────── */

/**
 * 계약 종료 여부 — 반납·해지·채권 또는 returnedDate 존재.
 *
 *   if (isContractEnded(c)) return;  // 종료 건 제외
 */
export function isContractEnded(c: Pick<Contract, 'status' | 'returnedDate'>): boolean {
  return ENDED_CONTRACT_STATUSES.has(c.status) || !!c.returnedDate;
}

/** 계약 활성 (종료 아님) — `!isContractEnded` alias. 의미상 가독성 위해. */
export function isContractActive(c: Pick<Contract, 'status' | 'returnedDate'>): boolean {
  return !isContractEnded(c);
}

/**
 * 비정상 종료 — 채권보전, 또는 미수금 남기고 종료된 케이스.
 * 정상종료 vs 비정상종료 구분.
 */
export function isAbnormalEnded(c: Pick<Contract, 'status' | 'returnedDate' | 'unpaidAmount' | 'endReason'>): boolean {
  if (!isContractEnded(c)) return false;
  if (c.status === '채권') return true;
  if (c.endReason === '채권보전') return true;
  if ((c.unpaidAmount ?? 0) > 0) return true;
  return false;
}

/** 정상 종료 — 종료이면서 비정상 아님. */
export function isNormalEnded(c: Pick<Contract, 'status' | 'returnedDate' | 'unpaidAmount' | 'endReason'>): boolean {
  return isContractEnded(c) && !isAbnormalEnded(c);
}

/**
 * 연체·미수 보유 — 회수해야 할 돈이 있는 계약.
 * 운영중·종료 무관 — 미수금 또는 미납 회차 있으면 true.
 */
export function isOverdue(c: Pick<Contract, 'unpaidAmount' | 'unpaidSeqCount'>): boolean {
  return (c.unpaidAmount ?? 0) > 0 || (c.unpaidSeqCount ?? 0) > 0;
}

/* ────────────────── 차량 판단 ────────────────── */

/**
 * 차량이 비운영 상태 (운영현황·리스크에서 보통 제외).
 * 휴차·상품화·구매대기·매각 단계.
 */
export function isVehicleInactive(vehicleStatus?: VehicleStatus | null): boolean {
  if (!vehicleStatus) return false;
  return INACTIVE_VEHICLE_STATUSES.has(vehicleStatus);
}

export function isVehicleInDisposal(vehicleStatus?: VehicleStatus | null): boolean {
  if (!vehicleStatus) return false;
  return DISPOSAL_VEHICLE_STATUSES.has(vehicleStatus);
}

export function isVehicleIdle(vehicleStatus?: VehicleStatus | null): boolean {
  if (!vehicleStatus) return false;
  return IDLE_VEHICLE_STATUSES.has(vehicleStatus);
}

/* ────────────────── 운영현황 필터 (가장 자주 쓰는 조합) ────────────────── */

/**
 * 운영현황 노출 대상 — 계약이 운영중 + 차량이 운영중.
 *
 * 운영현황·대시보드·리스크 페이지에서 이 함수로 1차 필터.
 *
 *   const operating = contracts.filter(isOperating);
 */
export function isOperating(c: Pick<Contract, 'status' | 'returnedDate' | 'vehicleStatus'>): boolean {
  if (isContractEnded(c)) return false;
  if (isVehicleInactive(c.vehicleStatus)) return false;
  return true;
}

/* ────────────────── 상태 정렬 우선순위 ────────────────── */

/**
 * 계약 status 정렬 우선순위 (낮을수록 먼저).
 * 운행 → 대기 → 반납 → 해지 → 채권 순.
 */
export const CONTRACT_STATUS_PRIORITY: Record<ContractStatus, number> = {
  '운행': 0,
  '대기': 10,
  '반납': 91,
  '해지': 92,
  '채권': 93,
};

export function contractStatusOrder(s: ContractStatus): number {
  return CONTRACT_STATUS_PRIORITY[s] ?? 99;
}
