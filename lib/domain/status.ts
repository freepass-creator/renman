/**
 * 상태 SSOT — 계약·차량 어휘·파티션·술어·회수 SLA.
 * 페이지/엔진은 여기서만 판정 집합을 가져온다. (죽은 payments/contract-lifecycle 대체)
 *
 * 분류 엔진(classify*)은 domain/model · 미수 뷰는 contract-ops — 이 파일은 집합·술어만.
 */
import type { EntityRecord } from '../intake/entities';

/* ── 계약 생애 상태 어휘 ── */
export type LifeStatus = '대기' | '운행' | '반납' | '해지' | '채권';
export const CONTRACT_ENDED = new Set<string>(['반납', '해지', '채권']);
export const CONTRACT_ACTIVE = new Set<string>(['운행']); // 인도완료·미반납 표시값

/* ── 차량 소유·가동 파티션 (classifyVehicle 과 동일) ── */
export const VEHICLE_OUT = new Set(['매각', '말소']); // 처분완료
/** 유휴(세워둔 차). 매각대기는 아직 보유 → OUT 아님. */
export const VEHICLE_IDLE = new Set([
  '대기', '상품대기', '휴차', '유휴', '구매대기', '등록대기', '상품화', '연장대기', '종료대기', '매각대기',
]);
export const VEHICLE_REPAIR = new Set(['정비', '사고', '수리']);
export const VEHICLE_BUY_PLAN = new Set(['구매대기', '구매예정', '매입검토', '구매검토', '검토', '매입대기']);
export const VEHICLE_REG_PLAN = new Set(['등록대기', '등록예정', '입고대기']);
export const VEHICLE_DISPOSE_PLAN = new Set(['매각대기', '매각검토', '처분예정']);

/** @deprecated dashboard-consts 호환 — VEHICLE_IDLE / VEHICLE_OUT 사용 */
export const IDLE = VEHICLE_IDLE;
export const OUT = VEHICLE_OUT;

/* ── 계약 상태 머신 (허용 전이 SSOT) ── */
export type ContractAction = 'deliver' | 'return' | 'terminate' | 'extend';
/** from status × action → to status. 없으면 금지된 전이. (반납·해지·채권 = 종료, 나가는 전이 없음) */
const TRANSITIONS: Record<string, Partial<Record<ContractAction, LifeStatus>>> = {
  '대기': { deliver: '운행' },
  '운행': { return: '반납', terminate: '해지', extend: '운행' },
};
/** 전이 허용 여부 — 페이지/커밋이 상태전이 전에 확인(종료 계약 재인도 등 불법 전이 차단). */
export function canTransition(from: unknown, action: ContractAction): boolean {
  return !!TRANSITIONS[String(from || '')]?.[action];
}
/** 전이 결과 상태(불법이면 null). */
export function nextStatus(from: unknown, action: ContractAction): LifeStatus | null {
  return TRANSITIONS[String(from || '')]?.[action] ?? null;
}

/* ── 계약 술어 (contract-ops 와 동일 의미) ── */
export function isContractEndedStatus(status: unknown): boolean {
  return CONTRACT_ENDED.has(String(status || ''));
}

/** 인도(출고) 대기 — plate + 대기 + 미인도·미반납 */
export function isDeliveryPending(c: EntityRecord): boolean {
  return !!c.plate && !c.deliveredDate && !c.returnedDate && String(c.status || '') === '대기';
}

/** 반납 대상 — 인도완료 + 미반납 + 종료상태 아님 */
export function isReturnable(c: EntityRecord): boolean {
  return !!c.plate && !!c.deliveredDate && !c.returnedDate && !isContractEndedStatus(c.status);
}

/* ── 미수 회수 SLA (구 collection.ts) ── */
export type CollectionStage = '정상' | '경고' | '시동제어' | '내용증명' | '채권화';
export interface CollectionInfo {
  stage: CollectionStage;
  tone: 'gray' | 'amber' | 'orange' | 'red' | 'purple';
  nextAction: string;
  overdueDays: number;
}
export interface CollectionSLA { warn?: number; engineLock?: number; notice?: number; debt?: number }

/** 기본 SLA: 경고 D+1 · 시동 D+3 · 내용증명 D+10 · 채권화 D+30 */
export function collectionStage(overdueDays: number, sla?: CollectionSLA): CollectionInfo {
  const warn = sla?.warn ?? 1, lock = sla?.engineLock ?? 3, notice = sla?.notice ?? 10, debt = sla?.debt ?? 30;
  const d = Math.max(0, Math.round(overdueDays));
  if (d < warn) return { stage: '정상', tone: 'gray', nextAction: '', overdueDays: d };
  if (d < lock) return { stage: '경고', tone: 'amber', nextAction: '독촉 연락', overdueDays: d };
  if (d < notice) return { stage: '시동제어', tone: 'orange', nextAction: '시동 제어', overdueDays: d };
  if (d < debt) return { stage: '내용증명', tone: 'red', nextAction: '내용증명 발송', overdueDays: d };
  return { stage: '채권화', tone: 'purple', nextAction: '법적조치·채권화', overdueDays: d };
}
