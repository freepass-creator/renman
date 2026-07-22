/** 종료 정산 — 반납 보증금 정산 + 중도해지 위약금. 정산서·반납폼·해지 공용 SSOT. */
import type { EntityRecord } from '../intake/entities';
import { ymd, addMonthsIso, monthsBetweenIso } from './dates';

/** 반납 정산 — view = computeContractView(반납일 what-if). 미납(net)을 보증금으로 충당 → 반환액/추가청구 산출. */
export type ReturnSettlement = { deposit: number; unpaid: number; offset: number; refund: number; addCharge: number; proRefund: number };
export function computeReturnSettlement(deposit: number, view: { net: number; refund: number }): ReturnSettlement {
  const unpaid = Math.max(0, view.net);           // 미납 대여료(일할정산 반영)
  return {
    deposit,
    unpaid,
    offset: Math.min(deposit, unpaid),            // 보증금 충당
    refund: Math.max(0, deposit - unpaid),        // 보증금 반환액(임차인 환급)
    addCharge: Math.max(0, unpaid - deposit),     // 추가 청구액
    proRefund: view.refund,                       // 반납 일할 환불(정보)
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
