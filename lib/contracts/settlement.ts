/** 종료 정산 — 반납 보증금 정산 + 중도해지 위약금 + 초과주행. 정산서·반납폼·해지 공용 SSOT. */
import type { EntityRecord } from '../intake/entities';
import { recordedDepositOffsetAmount } from './deposit-offset';
import { sumChargesByKind, CHARGE_KIND_OVER_MILEAGE, CHARGE_KIND_EARLY_TERM } from './charges';
import { ymd, addMonthsIso, monthsBetweenIso } from './dates';
import { computeOverMileage, type OverMileageBasis } from '@/lib/domain/over-mileage';

/** 반납 정산 — view = computeContractView(반납일 what-if). 미납+초과주행을 보증금으로 충당 → 반환액/추가청구. */
export type ReturnSettlement = {
  deposit: number;
  unpaid: number;
  offset: number;
  refund: number;
  addCharge: number;
  proRefund: number;
  /** 초과주행 과금(원). basis≠반납확정이면 0. */
  overMileageFee: number;
  excessKm: number;
  overMileageRate: number;
  mileageBasis: OverMileageBasis;
};

export type ReturnSettlementOpts = {
  /** 계약(주행·한도·단가). 없으면 초과주행=0·산출불가. */
  contract?: EntityRecord;
  /** 반납일/조회일. 기본=계약 returnedDate. */
  asOf?: string;
  /** 위저드 입력 중 반납 계기판(아직 계약에 안 씀). */
  returnMileage?: number | string | null;
};

/**
 * 반납 정산.
 *   · _charges에 초과주행·위약금이 있으면 view.net에 이미 편입 → 여기선 중복 가산 금지.
 *   · 미기록 시에만 산출 수수료를 charge에 더함(미리보기).
 *   · 이미 충당 소진된 보증금(recordedDepositOffset)은 avail에서 차감(R2).
 */
export function computeReturnSettlement(
  deposit: number,
  view: { net: number; refund: number },
  opts?: ReturnSettlementOpts,
): ReturnSettlement {
  const unpaid = Math.max(0, view.net);
  let overMileageFee = 0;
  let excessKm = 0;
  let overMileageRate = 0;
  let mileageBasis: OverMileageBasis = '산출불가';
  let earlyTermFee = 0;

  if (opts?.contract) {
    const asOf = ymd(opts.asOf) || ymd(opts.contract.returnedDate) || '';
    const draft = opts.returnMileage != null && opts.returnMileage !== ''
      ? { ...opts.contract, returnMileage: opts.returnMileage }
      : opts.contract;
    const om = computeOverMileage(draft, asOf);
    const omRecorded = sumChargesByKind(opts.contract, CHARGE_KIND_OVER_MILEAGE);
    // 원장에 청구가 있으면 그 금액·표시용. 없으면 산출값(미리보기).
    overMileageFee = omRecorded > 0 ? omRecorded : om.fee;
    excessKm = om.excessKm;
    overMileageRate = om.rate;
    mileageBasis = omRecorded > 0 ? (om.basis === '산출불가' ? '반납확정' : om.basis) : om.basis;

    const et = (() => {
      const rate = Number(opts.contract.earlyTerminationRate) || 0;
      const monthlyRent = Number(opts.contract.monthlyRent) || 0;
      const term = Number(opts.contract.rentalMonths) || 0;
      const start = ymd(opts.contract.startDate || opts.contract.contractDate);
      const maturity = start && term ? addMonthsIso(start, term) : '';
      const isEarly = !!maturity && asOf < maturity;
      const remainingMonths = isEarly ? monthsBetweenIso(asOf, maturity) : 0;
      return Math.round(remainingMonths * monthlyRent * (rate / 100));
    })();
    const etRecorded = sumChargesByKind(opts.contract, CHARGE_KIND_EARLY_TERM);
    earlyTermFee = etRecorded > 0 ? etRecorded : et;
  }

  // net에 이미 편입된 청구는 unpaid에 포함 → 가산 0. 미편입(미리보기)만 더함.
  const omInNet = opts?.contract ? sumChargesByKind(opts.contract, CHARGE_KIND_OVER_MILEAGE) > 0 : false;
  const etInNet = opts?.contract ? sumChargesByKind(opts.contract, CHARGE_KIND_EARLY_TERM) > 0 : false;
  const extra = (omInNet ? 0 : overMileageFee) + (etInNet ? 0 : earlyTermFee);
  const charge = unpaid + extra;
  const consumed = opts?.contract ? recordedDepositOffsetAmount(opts.contract) : 0;
  const avail = Math.max(0, deposit - consumed);
  return {
    deposit,
    unpaid,
    offset: consumed + Math.min(avail, charge),
    refund: Math.max(0, avail - charge),
    addCharge: Math.max(0, charge - avail),
    proRefund: view.refund,
    overMileageFee,
    excessKm,
    overMileageRate,
    mileageBasis,
  };
}

/**
 * 중도해지 위약금 = 잔여개월 × 월대여료 × 요율(%). 만기 도래(정상종료)면 0.
 *
 * ★요율은 «차량인도일로부터 경과기간»에 따라 갈린다 — 실계약 99장 전수 확인:
 *   1년미만 30% / 1년이상 20% (82건) · 40%/30% (4건) · 미기재 13건.
 *   이전 구현은 단일 `earlyTerminationRate` 만 봤으므로, 1년 이상 경과한 계약에도
 *   1년미만 요율(30%)을 적용해 위약금을 «과다 청구»할 수 있었다(반대 방향이면 과소).
 *   위약금은 내용증명·소송 청구액의 근거이므로 요율이 틀리면 법적 문서가 틀린다.
 *
 * 기준일 = 인도일(deliveredDate) 우선, 없으면 시작일. 계약서 문구가 «차량인도일로부터»이다.
 */
export type EarlyTermCalc = {
  rate: number; isEarly: boolean; remainingMonths: number; monthlyRent: number; fee: number; maturity: string;
  /** 요율을 어디서 정했는지 — '1년미만' | '1년이상' | '단일' | '미확인' */
  rateBasis: '1년미만' | '1년이상' | '단일' | '미확인';
  /** 인도일로부터 경과 개월 — 화면·문서에서 근거로 보여준다. */
  elapsedMonths: number;
};

/** 경과기간에 맞는 위약금율을 고른다. 기간별 값이 없으면 단일 요율로 폴백. */
function pickEarlyTermRate(rec: EntityRecord, elapsedMonths: number): { rate: number; basis: EarlyTermCalc['rateBasis'] } {
  const under = Number(rec.earlyTermRateUnder1y);
  const over = Number(rec.earlyTermRateOver1y);
  const hasUnder = Number.isFinite(under) && under > 0;
  const hasOver = Number.isFinite(over) && over > 0;
  if (hasUnder || hasOver) {
    if (elapsedMonths >= 12) {
      if (hasOver) return { rate: over, basis: '1년이상' };
    } else if (hasUnder) {
      return { rate: under, basis: '1년미만' };
    }
  }
  const single = Number(rec.earlyTerminationRate);
  if (Number.isFinite(single) && single > 0) return { rate: single, basis: '단일' };
  return { rate: 0, basis: '미확인' };
}

export function earlyTerminationFee(rec: EntityRecord, asOf: string): EarlyTermCalc {
  const monthlyRent = Number(rec.monthlyRent) || 0;
  const term = Number(rec.rentalMonths) || 0;
  const start = ymd(rec.startDate || rec.contractDate);
  const maturity = start && term ? addMonthsIso(start, term) : '';
  const isEarly = !!maturity && asOf < maturity;
  const remainingMonths = isEarly ? monthsBetweenIso(asOf, maturity) : 0;
  // 계약서 문구가 «차량인도일로부터»이므로 인도일을 우선한다(없으면 시작일).
  const from = ymd(rec.deliveredDate || rec.startDate || rec.contractDate);
  const elapsedMonths = from ? Math.max(0, monthsBetweenIso(from, asOf)) : 0;
  const { rate, basis } = pickEarlyTermRate(rec, elapsedMonths);
  const fee = Math.round(remainingMonths * monthlyRent * (rate / 100));
  return { rate, isEarly, remainingMonths, monthlyRent, fee, maturity, rateBasis: basis, elapsedMonths };
}
