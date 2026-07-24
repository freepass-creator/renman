/**
 * 인도/반납 전이 오케스트레이터 — 상태전이 patch + 활동기록 + 중복 가드를 한곳에.
 *   SSOT 템플릿 = DeliveryWizard/ReturnWizard.commit()(멱등 histKey·getStore fresh-guard).
 *   목적: Vehicle360의 열등복제(fresh-guard 없음·histKey 누락·반납 활동기록 유실)를 이 정본에 위임.
 *
 *   설계: planTransition = 순수(부수효과 0) — patch·활동기록·가드를 계산만.
 *         · 상태전이 patch 는 patchDeliver/patchReturn 을 그대로 호출(재구현 금지 = 미수 중립).
 *         · 미수/정산 로직은 여기서 손대지 않는다(patches SSOT 유지).
 *         runTransition = 얇은 executor — contractNo/target/fresh-guard 검사 후 commitUpdate + saveIntake.
 *         · toast/haptic 등 UI 부수효과는 호출부(Vehicle360)가 RunResult.reason 으로 매핑.
 *   ※ 연장/해지·증거 업로드(uploadDoc/pushDocVersion)는 이 오케스트레이터 범위 밖(호출부 유지).
 */
import { patchDeliver, patchReturn } from '@/lib/contract-ops';
import { getStore } from '@/lib/store';
import { commitUpdate } from '@/lib/commit';
import { saveIntake } from '@/lib/intake';
import { type EntityRecord } from '@/lib/intake/entities';

export type TransitionAction = 'deliver' | 'return';

export interface TransitionInput {
  action: TransitionAction;
  contract: EntityRecord;
  date: string;
  /** 실무 입력: deliver={fuelOut, mileageOut?} · return={fuelIn, returnMileage?, returnSettleNote?}. patch extra 로 그대로 전달. */
  extra?: EntityRecord;
  actor: string;              // user.name (활동기록 author)
  sessionCompanyId: string;   // commitUpdate 스코프 검사용
  target: string;             // resolveWriteCompany 결과(비어있으면 runTransition 이 차단)
}

export interface TransitionPlan {
  transitionPatch: EntityRecord;
  activity: EntityRecord;
  histKey: string;
  /** fresh(스토어 최신 계약) 기준 진행 가능 여부. true=진행, false=이미 처리됨(중복 차단). */
  guard: (fresh: EntityRecord | null | undefined) => boolean;
}

const DELIVER_BLOCK = ['운행', '반납', '해지', '채권'];
const RETURN_BLOCK = ['반납', '해지', '채권'];

/** 순수 — 저장 없이 patch·활동기록·가드를 계산. Wizard commit() 핵심부와 1:1. */
export function planTransition(input: TransitionInput): TransitionPlan {
  const { action, contract, date, extra = {}, actor, target } = input;
  const plate = String(contract.plate || '');
  const who = String(contract.contractorName || '—');
  const contractNo = String(contract._key || contract.contractNo || '');
  const category = action === 'deliver' ? '인도' : '반납';
  const histKey = `${contractNo || plate}|${category}|${date}`;
  const transitionPatch = action === 'deliver'
    ? patchDeliver(contract, date, extra)
    : patchReturn(contract, date, extra);
  const mileage = action === 'deliver' ? extra.mileageOut : extra.returnMileage;
  const fuel = action === 'deliver' ? extra.fuelOut : extra.fuelIn;
  const verb = action === 'deliver' ? '출고(인도)' : '반납(입고)';
  const title = `${verb}${mileage ? ` · ${mileage}km` : ''} · 연료 ${fuel ?? ''}`;
  const activity: EntityRecord = {
    plate, category, title, date, author: actor, customer: who, contractNo,
    companyId: target, _kind: 'activity', histKey,
  };
  const guard = (fresh: EntityRecord | null | undefined): boolean => {
    if (!fresh) return true;
    const status = String(fresh.status || '');
    return action === 'deliver'
      ? !(fresh.deliveredDate || DELIVER_BLOCK.includes(status))
      : !(fresh.returnedDate || RETURN_BLOCK.includes(status));
  };
  return { transitionPatch, activity, histKey, guard };
}

export type RunFailReason = 'NO_CONTRACT' | 'NEED_COMPANY' | 'ALREADY' | 'SAVE_FAIL';
export interface RunResult { ok: boolean; reason?: RunFailReason; }

/**
 * 얇은 executor — 검사(계약키·target·fresh 중복) 후 상태전이 + 활동기록 커밋.
 *   Wizard commit() 의 핵심 저장부(증거 업로드 제외)와 동일 순서·동일 SSOT.
 */
export async function runTransition(input: TransitionInput): Promise<RunResult> {
  const contractNo = String(input.contract._key || input.contract.contractNo || '');
  if (!contractNo) return { ok: false, reason: 'NO_CONTRACT' };
  if (!input.target) return { ok: false, reason: 'NEED_COMPANY' };
  const plan = planTransition(input);
  // 최신 상태 재확인 — 스테일 화면/다른 기기에서의 중복 인도·반납 방지(단일 writer 보호).
  const fresh = await getStore().get('contract', input.target, contractNo);
  if (!plan.guard(fresh)) return { ok: false, reason: 'ALREADY' };
  try {
    await commitUpdate({
      entity: 'contract', sessionCompanyId: input.sessionCompanyId,
      rec: input.contract, key: contractNo, patch: plan.transitionPatch,
    });
    await saveIntake('history', input.target, [plan.activity], { notify: false });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'SAVE_FAIL' };
  }
}
