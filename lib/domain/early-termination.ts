/**
 * 중도해지 위약금 상시 계산 — jpkerp5 lib/early-termination.ts 이식.
 *   위약금 = 잔여기간(개월) × 월대여료 × 요율(%). 만기 도래(정상종료)면 0.
 *   요율 = 계약조건 earlyTerminationRate(표준약관 10%). 내용증명 청구·반납정산에 공용.
 */
import { type EntityRecord } from '@/lib/intake/entities';

export type EarlyTerm = { isEarly: boolean; remainMonths: number; rate: number; fee: number };

function monthsBetween(from: string, to: string): number {
  if (!from || !to) return 0;
  const f = new Date(from), t = new Date(to);
  if (isNaN(f.getTime()) || isNaN(t.getTime())) return 0;
  let m = (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth());
  if (t.getDate() < f.getDate()) m--;
  return Math.max(0, m);
}

/** 계약의 '지금(today) 중도해지 시' 위약금. 만기 지났으면 isEarly=false·fee=0. */
export function earlyTerminationFee(c: EntityRecord, today: string): EarlyTerm {
  const end = String(c.endDate || '').slice(0, 10);
  const rent = Number(c.monthlyRent) || 0;
  const rate = Number(c.earlyTerminationRate) || 10; // 표준약관 10%
  const isEarly = !!end && /^\d{4}-\d{2}-\d{2}$/.test(end) && today < end;
  const remainMonths = isEarly ? monthsBetween(today, end) : 0;
  const fee = Math.round((remainMonths * rent * (rate / 100)) / 10000) * 10000; // 만원 반올림
  return { isEarly, remainMonths, rate, fee };
}
