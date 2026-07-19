/**
 * 할부/리스 원리금 상환 스케줄 — SSOT.
 *   ★데이터 원칙: 실제 「할부상환스케줄표」가 OCR 되기 전까지는 이 계산값(원리금 균등상환)을 쓰고,
 *     스케줄표가 들어오면 그 찐데이터로 교체한다(계약서·보험증권·등록증과 동일 패턴).
 *   원금(loanPrincipal)·연이율(loanRate)·개월(loanMonths)·개시일(loanStartDate)에서 월별 이자/원금 분해.
 *   손익: 이자만 비용(금융비용), 원금은 부채 상환(자본 — 손익 아님).
 */
import { type EntityRecord } from '@/lib/intake/entities';

export type LoanRow = { seq: number; ym: string; payment: number; interest: number; principal: number; balance: number };

// 이율 정규화 — 0.17(소수) 또는 17(퍼센트) 둘 다 연 17%로. 연 → 월.
const monthlyRate = (raw: number): number => { const r = raw > 1 ? raw / 100 : raw; return r / 12; };

/** 차량 1대 할부 상환 스케줄(원리금 균등). 현금구매(loanCashOnly=예)·데이터 없으면 []. */
export function loanSchedule(v: EntityRecord): LoanRow[] {
  if (String(v.loanCashOnly || '') === '예') return [];
  const P = Number(v.loanPrincipal) || 0;
  const n = Number(v.loanMonths) || 0;
  const start = String(v.loanStartDate || '').slice(0, 7);
  if (!P || !n || !/^\d{4}-\d{2}$/.test(start)) return [];
  const r = monthlyRate(Number(v.loanRate) || 0);
  const pay = r > 0 ? (P * r) / (1 - Math.pow(1 + r, -n)) : P / n;
  const [sy, sm] = start.split('-').map(Number);
  let bal = P;
  const out: LoanRow[] = [];
  for (let i = 0; i < n; i++) {
    const interest = bal * r;
    const principal = Math.min(pay - interest, bal);
    bal = Math.max(0, bal - principal);
    const d = new Date(sy, sm - 1 + i, 1);
    out.push({ seq: i + 1, ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, payment: Math.round(pay), interest: Math.round(interest), principal: Math.round(principal), balance: Math.round(bal) });
  }
  return out;
}

export type LoanTotals = { interest: number; principal: number; payment: number; cars: number };

/** 여러 차량 할부 — 기간(from~to, YYYY-MM-DD; 빈값=무한) 내 이자·원금·상환액 합. */
export function loanTotalsInRange(vehicles: EntityRecord[], from: string, to: string): LoanTotals {
  const fym = (from || '').slice(0, 7);
  const tym = (to || '').slice(0, 7);
  let interest = 0, principal = 0, payment = 0;
  const cars = new Set<string>();
  for (const v of vehicles) {
    for (const row of loanSchedule(v)) {
      if ((!fym || row.ym >= fym) && (!tym || row.ym <= tym)) {
        interest += row.interest; principal += row.principal; payment += row.payment;
        cars.add(String(v.plate || ''));
      }
    }
  }
  return { interest: Math.round(interest), principal: Math.round(principal), payment: Math.round(payment), cars: cars.size };
}
