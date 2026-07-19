/**
 * 차량 자산(할부·보험) 파생 SSOT — v5 /asset/loan·insurance 학습 → Vehicle360·자산현황이 공유.
 *   새 /asset/loan URL 만들지 않음.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { loanSchedule, loanSummary, type LoanRow } from '@/lib/loan';
import { dday, TODAY } from '@/lib/dashboard-consts';
import { ageFromBirth } from '@/lib/compliance';

export type VehicleLoanView = {
  rows: LoanRow[];
  monthlyPayment: number;
  remainPrincipal: number;
  remainSeq: number;
  paidSeq: number;
  nextDate: string;
  company: string;
  cashOnly: boolean;
};

/** 증권 운전연령 문구 → 최소 만 나이. "만30세이상한정" → 30 */
export function parseInsuranceMinAge(driverAge: unknown): number | null {
  if (driverAge == null || driverAge === '') return null;
  if (typeof driverAge === 'number' && Number.isFinite(driverAge)) return driverAge;
  const m = String(driverAge).match(/(\d{2,3})/);
  return m ? Number(m[1]) : null;
}

/** 운전자 만나이 vs 보험 최소연령 — 미달이면 under. */
export function insuranceAgeGap(
  contract: EntityRecord | null | undefined,
  insurance: EntityRecord | null | undefined,
  vehicle: EntityRecord | null | undefined,
  asOf: string = TODAY,
): { driverAge: number; minAge: number; under: boolean } | null {
  const driver =
    Number(contract?.driverAge) ||
    ageFromBirth(contract?.contractorBirth, asOf) ||
    0;
  const minAge =
    parseInsuranceMinAge(insurance?.driverAge) ||
    Number(contract?.insuranceAge ?? vehicle?.insuranceAge) ||
    0;
  if (!driver || !minAge) return null;
  return { driverAge: driver, minAge, under: driver < minAge };
}

/** 차량 할부 스냅샷 — 현금완납·스케줄 불가 시 null. */
export function vehicleLoanView(v: EntityRecord | null | undefined, asOf: string = TODAY): VehicleLoanView | null {
  if (!v) return null;
  const cashOnly = String(v.loanCashOnly) === '예';
  if (cashOnly) {
    return {
      rows: [], monthlyPayment: 0, remainPrincipal: 0, remainSeq: 0, paidSeq: 0, nextDate: '',
      company: String(v.loanCompany || ''), cashOnly: true,
    };
  }
  const principal = Number(v.loanPrincipal || v.loanRemainingPrincipal) || 0;
  const months = Number(v.loanMonths) || 0;
  if (!principal || !months) return null;
  const rows = loanSchedule(principal, Number(v.loanRate) || 0, months, String(v.loanStartDate || ''));
  if (!rows.length) return null;
  const sum = loanSummary(rows, asOf);
  return {
    rows,
    monthlyPayment: sum.monthlyPayment,
    remainPrincipal: Number(v.loanRemainingPrincipal) || sum.remainPrincipal,
    remainSeq: sum.remainSeq,
    paidSeq: sum.paidSeq,
    nextDate: sum.nextDate,
    company: String(v.loanCompany || ''),
    cashOnly: false,
  };
}

export function insuranceExpiryTone(endDate: unknown): 'red' | 'amber' | 'gray' | null {
  const d = dday(endDate);
  if (d == null) return null;
  if (d < 0) return 'red';
  if (d <= 30) return 'amber';
  return 'gray';
}
