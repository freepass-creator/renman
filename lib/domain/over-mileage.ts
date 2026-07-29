/**
 * 초과주행 과금 — 반납 정산 라인아이템 순수 계산.
 *   driven = returnMileage − mileageOut (둘 다 있을 때만).
 *   허용 = annualMileageLimit × (사용일수/365) 일할.
 *   요율 = contract.overMileageRate || DEFAULT_OVER_MILEAGE_RATE.
 *   ★결측을 0km로 계산하지 않음(산출불가).
 *
 * TODO(2단계): 진행중 차량 예상 초과 — history.mileage(정비 계기판) 최신값으로
 *   일평균 주행 추정 → 만기 시 예상 초과·예상 청구액(반납 전 고객 사전통보).
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { ymd } from '@/lib/contracts/dates';

/** 회사 공통 초과주행 단가(원/km). 계약 overMileageRate 미입력 시 폴백. */
export const DEFAULT_OVER_MILEAGE_RATE = 100;

export type OverMileageBasis = '반납확정' | '산출불가' | '한도없음';

export type OverMileageResult = {
  allowedKm: number;
  drivenKm: number;
  excessKm: number;
  rate: number;
  fee: number;
  basis: OverMileageBasis;
  usageDays: number;
};

function usageDaysBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  const raw = Math.round((b - a) / 86400000);
  return Math.max(1, raw); // 당일 반납=1일
}

/**
 * 계약 1건 초과주행 과금.
 * @param today 반납일 what-if(미반납이면 조회 기준일). returnedDate가 있으면 그걸 우선.
 */
export function computeOverMileage(contract: EntityRecord, today: string): OverMileageResult {
  const empty = (basis: OverMileageBasis, rate = 0): OverMileageResult => ({
    allowedKm: 0, drivenKm: 0, excessKm: 0, rate, fee: 0, basis, usageDays: 0,
  });

  const outRaw = contract.mileageOut;
  const inRaw = contract.returnMileage;
  // 결측 → 0으로 채우지 않음(0km 주행 오인 금지).
  if (outRaw === '' || outRaw == null || inRaw === '' || inRaw == null) {
    return empty('산출불가');
  }
  const mileageOut = Number(outRaw);
  const returnMileage = Number(inRaw);
  if (!Number.isFinite(mileageOut) || !Number.isFinite(returnMileage)) {
    return empty('산출불가');
  }

  const limitRaw = contract.annualMileageLimit;
  if (limitRaw === '' || limitRaw == null) {
    return empty('한도없음');
  }
  const annualLimit = Number(limitRaw);
  if (!Number.isFinite(annualLimit) || annualLimit <= 0) {
    // 0·음수 한도 = 무제한 취급(한도없음).
    return empty('한도없음');
  }

  const start = ymd(contract.deliveredDate || contract.startDate || contract.contractDate);
  const end = ymd(contract.returnedDate || today);
  if (!start || !end) {
    return empty('산출불가');
  }
  const usageDays = usageDaysBetween(start, end);
  const allowedKm = annualLimit * (usageDays / 365);
  const drivenKm = returnMileage - mileageOut;
  // 음수 주행(계기판 오류) = 초과 없음.
  const excessKm = Math.max(0, drivenKm - allowedKm);

  const rateRaw = contract.overMileageRate;
  const rate = (rateRaw !== '' && rateRaw != null && Number.isFinite(Number(rateRaw)))
    ? Number(rateRaw)
    : DEFAULT_OVER_MILEAGE_RATE;
  const fee = Math.round(excessKm * rate);

  return {
    allowedKm: Math.round(allowedKm * 10) / 10,
    drivenKm,
    excessKm: Math.round(excessKm * 10) / 10,
    rate,
    fee,
    basis: '반납확정',
    usageDays,
  };
}
