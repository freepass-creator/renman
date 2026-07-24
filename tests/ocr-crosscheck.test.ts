/**
 * OCR 교차검증(lib/ocr-crosscheck) 특성화 테스트 — 순수 함수의 재무 불변식 고정.
 *   단언값은 전부 현재 구현이 실제 산출하는 값에서 역산(코드가 진리). prod 코드는 무변경.
 *   summarize 규칙: penalty = Σ(error 40 · warn 15), confidence = max(0, 100 − penalty),
 *   level = error(하나라도) → warn(하나라도) → ok.
 */
import { describe, it, expect } from 'vitest';
import {
  crosscheckLoanSchedule,
  crosscheckPenalty,
  crosscheckInsurance,
  crosscheckVehicleReg,
  crosscheckOcr,
} from '@/lib/ocr-crosscheck';

// 정상 3회차 상환표(원금 합 3,000,000 · 월불입 합 3,060,000 · 잔액 감소).
const CLEAN_ROWS = [
  { principal: 1_000_000, interest: 30_000, payment: 1_030_000, remaining_principal: 2_000_000 },
  { principal: 1_000_000, interest: 20_000, payment: 1_020_000, remaining_principal: 1_000_000 },
  { principal: 1_000_000, interest: 10_000, payment: 1_010_000, remaining_principal: 0 },
];

describe('crosscheckLoanSchedule — 상환표 재무 검산', () => {
  it('회차 행 없음 → error · confidence 60 · issues[0].field=rows', () => {
    const r = crosscheckLoanSchedule({ rows: [] });
    expect(r.level).toBe('error');
    expect(r.confidence).toBe(60); // 100 − 40(error)
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('rows');
    expect(r.issues[0].severity).toBe('error');
  });

  it('rows 자체가 없음(비배열) → error(빈 배열과 동일 경로)', () => {
    const r = crosscheckLoanSchedule({});
    expect(r.level).toBe('error');
    expect(r.confidence).toBe(60);
  });

  it('완전 정합(원금합=대출원금 · 월불입합=총상환 · months 일치) → ok · 100 · issues 0', () => {
    const r = crosscheckLoanSchedule({
      rows: CLEAN_ROWS,
      months: 3,
      principal: 3_000_000,
      total_repayment: 3_060_000,
    });
    expect(r.level).toBe('ok');
    expect(r.confidence).toBe(100);
    expect(r.issues).toHaveLength(0);
  });

  it('한 회차 원금+이자 ≠ 월불입 → warn(rows · rowMismatch) · 85', () => {
    const rows = [
      { principal: 1_000_000, interest: 30_000, payment: 1_030_000, remaining_principal: 2_000_000 },
      { principal: 1_000_000, interest: 20_000, payment: 999_999, remaining_principal: 1_000_000 }, // 1,020,000 ≠ 999,999
      { principal: 1_000_000, interest: 10_000, payment: 1_010_000, remaining_principal: 0 },
    ];
    const r = crosscheckLoanSchedule({ rows }); // months/principal/total_repayment 생략 → 그 검사 skip
    expect(r.level).toBe('warn');
    expect(r.confidence).toBe(85); // 100 − 15(warn)
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('rows');
    expect(r.issues[0].message).toContain('원금+이자');
  });

  it('미회수원금이 증가하는 회차 → warn(rows · remainViolation)', () => {
    const rows = [
      { principal: 1_000_000, interest: 30_000, payment: 1_030_000, remaining_principal: 1_000_000 },
      { principal: 1_000_000, interest: 20_000, payment: 1_020_000, remaining_principal: 2_000_000 }, // 증가
    ];
    const r = crosscheckLoanSchedule({ rows });
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('rows');
    expect(r.issues[0].message).toContain('미회수원금');
  });

  it('회차 수 ≠ 기간(months) → warn(months)', () => {
    const r = crosscheckLoanSchedule({ rows: CLEAN_ROWS, months: 5 });
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('months');
  });

  it('원금 합 ≠ 대출원금(허용오차 초과) → warn(principal)', () => {
    const r = crosscheckLoanSchedule({ rows: CLEAN_ROWS, principal: 5_000_000 }); // pSum 3,000,000 ↔ 5,000,000
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('principal');
  });

  it('월불입 합 ≠ 총상환액(허용오차 초과) → warn(total_repayment)', () => {
    const r = crosscheckLoanSchedule({ rows: CLEAN_ROWS, total_repayment: 5_000_000 }); // paySum 3,060,000 ↔ 5,000,000
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('total_repayment');
  });

  it('payment 누락 → pay = 원금+이자 로 대체(paySum 산출됨을 총상환 불일치로 증명)', () => {
    const rows = [
      { principal: 1_000_000, interest: 30_000, remaining_principal: 2_000_000 }, // payment 없음 → 1,030,000
      { principal: 1_000_000, interest: 20_000, remaining_principal: 1_000_000 }, // → 1,020,000
      { principal: 1_000_000, interest: 10_000, remaining_principal: 0 },         // → 1,010,000
    ];
    // 대체가 동작하면 paySum=3,060,000>0 이라 총상환 1,000,000 과 불일치 → warn. 대체가 없으면 paySum=0 → skip(무이슈).
    const r = crosscheckLoanSchedule({ rows, total_repayment: 1_000_000 });
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('total_repayment'); // 대체 경로가 살아있다는 증거
  });

  it('principal 없고 acquisition_cost만 → 취득원가를 대출원금으로 fallback', () => {
    // fallback 이 동작하면 principal=5,000,000 ↔ pSum 3,000,000 불일치 → warn. 없으면 skip(무이슈).
    const r = crosscheckLoanSchedule({ rows: CLEAN_ROWS, acquisition_cost: 5_000_000 });
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('principal'); // acquisition_cost fallback 증거
  });
});

describe('crosscheckPenalty — 과태료 금액/차번 검산', () => {
  it('부과금액 0/공란 → error(amount) · 60', () => {
    const r = crosscheckPenalty({ amount: 0, car_number: '12가3456' });
    expect(r.level).toBe('error');
    expect(r.confidence).toBe(60);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('amount');
  });

  it('본세+가산금 ≠ 부과금액 → warn(amount)', () => {
    const r = crosscheckPenalty({ amount: 100_000, penalty_amount: 80_000, surcharge_amount: 30_000, car_number: '12가3456' });
    expect(r.level).toBe('warn'); // 80,000+30,000=110,000 ≠ 100,000
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('amount');
  });

  it('차량번호 미인식 → warn(car_number)', () => {
    const r = crosscheckPenalty({ amount: 50_000 }); // main 세부 없음 → 세부검산 skip
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('car_number');
  });

  it('정상(금액 유효 · 차번 있음) → ok · 100', () => {
    const r = crosscheckPenalty({ amount: 50_000, car_number: '12가3456' });
    expect(r.level).toBe('ok');
    expect(r.confidence).toBe(100);
    expect(r.issues).toHaveLength(0);
  });
});

describe('crosscheckInsurance — 보험 회차/기간 검산', () => {
  it('2~N회차 합 > 총보험료 → error(installments) · 60', () => {
    const r = crosscheckInsurance({
      total_premium: 1_000_000,
      installments: [{ cycle: 1, amount: 100_000 }, { cycle: 2, amount: 600_000 }, { cycle: 3, amount: 600_000 }],
      car_number: '12가3456',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
    expect(r.level).toBe('error'); // later sum 1,200,000 > 1,000,000 → first < 0
    expect(r.confidence).toBe(60);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('installments');
  });

  it('일시납(분납 없음 · 1년) → ok · 100', () => {
    const r = crosscheckInsurance({
      total_premium: 1_000_000,
      paid_premium: 1_000_000,
      installments: [],
      car_number: '12가3456',
      start_date: '2025-01-01',
      end_date: '2025-12-31',
    });
    expect(r.level).toBe('ok');
    expect(r.confidence).toBe(100);
    expect(r.issues).toHaveLength(0);
  });
});

describe('crosscheckVehicleReg — 등록증 검산', () => {
  it('차대번호 길이 ≠ 17 → warn(vin)', () => {
    const r = crosscheckVehicleReg({ vin: 'ABC123', plate: '12가3456' });
    expect(r.level).toBe('warn');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('vin');
  });

  it('plate·car_number 둘 다 없음 → error(plate) · 60', () => {
    const r = crosscheckVehicleReg({ vin: 'KMHXX00XXXX000001' }); // 17자
    expect(r.level).toBe('error');
    expect(r.confidence).toBe(60);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].field).toBe('plate');
  });

  it('정상(vin 17자 · plate 있음 · 등록일 과거) → ok · 100', () => {
    const r = crosscheckVehicleReg({ vin: 'KMHXX00XXXX000001', plate: '12가3456', displacement: 1998, first_registration_date: '2020-01-01' });
    expect(r.level).toBe('ok');
    expect(r.confidence).toBe(100);
    expect(r.issues).toHaveLength(0);
  });
});

describe('crosscheckOcr — docType 디스패처', () => {
  it('loan_schedule 라우팅(빈 rows → error)', () => {
    expect(crosscheckOcr('loan_schedule', { rows: [] }).level).toBe('error');
  });
  it('penalty 라우팅(금액 0 → error)', () => {
    expect(crosscheckOcr('penalty', { amount: 0, car_number: '12가3456' }).level).toBe('error');
  });
  it('미지원 docType → ok · 100 · issues 0(무해 통과)', () => {
    const r = crosscheckOcr('unknown_type', {});
    expect(r).toEqual({ level: 'ok', confidence: 100, issues: [] });
  });
});
