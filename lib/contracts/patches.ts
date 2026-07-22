/** 상태전이 패치 — store.update 에 그대로 넘기는 부분 레코드. 전이 합법성은 호출부(canTransition)에서 가드. */
import type { EntityRecord } from '../intake/entities';
import { ymd, addMonthsIso } from './dates';

// extra = 출고 실무 입력(출고 주행거리 mileageOut·연료 fuelOut). 반납정산이 비교할 원점.
export function patchDeliver(rec: EntityRecord, date: string, extra: EntityRecord = {}): EntityRecord {
  return { status: '운행', deliveredDate: date || ymd(rec.startDate) || date, ...extra };
}
// extra = 반납 실무 입력(주행거리·연료·정산 메모 등).
export function patchReturn(rec: EntityRecord, date: string, extra: EntityRecord = {}): EntityRecord {
  return { status: '반납', returnedDate: date, endReason: '정상종료', ...extra };
}
// extra = 해지 사유·위약금 메모 등.
export function patchTerminate(rec: EntityRecord, date: string, extra: EntityRecord = {}): EntityRecord {
  return { status: '해지', returnedDate: date, endReason: '중도해지', ...extra };
}
export function patchExtend(rec: EntityRecord, addMonths: number): EntityRecord {
  const term = (Number(rec.rentalMonths) || 0) + addMonths;
  const start = ymd(rec.startDate || rec.contractDate);
  return { rentalMonths: term, endDate: start ? addMonthsIso(start, term) : rec.endDate };
}

/** 시동제어 패치 SSOT — contract.engineDisabled 정본. receivables·Vehicle360 공용. */
export function patchEngineLock(
  enable: boolean,
  ctx: { today: string; actor: string; reason: string },
): Record<string, unknown> {
  if (enable) {
    return {
      engineDisabled: true,
      engineDisabledAt: ctx.today,
      engineDisabledReason: ctx.reason,
      engineDisabledBy: ctx.actor,
    };
  }
  return {
    engineDisabled: false,
    engineDisabledAt: '',
    engineDisabledReason: '',
    engineReleasedAt: ctx.today,
    engineReleasedBy: ctx.actor,
  };
}
