/** 종료 정산 — 반납 보증금 정산 + 중도해지 위약금 + 초과주행. 정산서·반납폼·해지 공용 SSOT. */
import type { EntityRecord } from '../intake/entities';
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
 *   청구합 = unpaid + overMileageFee
 *   refund = max(0, deposit − 청구합)
 *   addCharge = max(0, 청구합 − deposit)
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

  if (opts?.contract) {
    const asOf = ymd(opts.asOf) || ymd(opts.contract.returnedDate) || '';
    const draft = opts.returnMileage != null && opts.returnMileage !== ''
      ? { ...opts.contract, returnMileage: opts.returnMileage }
      : opts.contract;
    const om = computeOverMileage(draft, asOf);
    overMileageFee = om.fee;
    excessKm = om.excessKm;
    overMileageRate = om.rate;
    mileageBasis = om.basis;
  }

  const charge = unpaid + overMileageFee;
  return {
    deposit,
    unpaid,
    offset: Math.min(deposit, charge),
    refund: Math.max(0, deposit - charge),
    addCharge: Math.max(0, charge - deposit),
    proRefund: view.refund,
    overMileageFee,
    excessKm,
    overMileageRate,
    mileageBasis,
  };
}

/* 중도해지 위약금 = 잔여개월 × 월대여료 × 요율(%). 만기 도래(정상종료)면 0. 요율=계약서상 earlyTerminationRate. */
export type EarlyTermCalc = { rate: number; isEarly: boolean; remainingMonths: number; monthlyRent: number; fee: number; maturity: string };
export function earlyTerminationFee(rec: EntityRecord, asOf: string): EarlyTermCalc {
  const rate = Number(rec.earlyTerminationRate) || 0;
  const monthlyRent = Number(rec.monthlyRent) || 0;
  const term = Number(rec.rentalMonths) || 0;
  const start = ymd(rec.startDate || rec.contractDate);
  const maturity = start && term ? addMonthsIso(start, term) : '';
  const isEarly = !!maturity && asOf < maturity;
  const remainingMonths = isEarly ? monthsBetweenIso(asOf, maturity) : 0;
  const fee = Math.round(remainingMonths * monthlyRent * (rate / 100));
  return { rate, isEarly, remainingMonths, monthlyRent, fee, maturity };
}
