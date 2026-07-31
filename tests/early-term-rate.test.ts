/**
 * 중도해지 위약금 요율 — 실계약 99장 전수 확인 결과를 못박는다.
 *
 * 근거: 스위치플랜 계약서 원본(디지털 텍스트층) 99장 추출 —
 *   해지수수료율 「차량인도일로부터 1년 미만 30% / 1년 이상 20%」 82건 · 40%/30% 4건 · 미기재 13건.
 *   즉 요율은 «단일 값»이 아니라 «경과기간별 두 값»이다.
 * 이전 구현은 단일 earlyTerminationRate 만 봤으므로 1년 이상 경과한 계약에도 1년미만 요율을
 * 적용해 위약금을 과다·과소 청구할 수 있었다. 위약금은 내용증명·소송 청구액의 근거다.
 */
import { describe, it, expect } from 'vitest';
import { earlyTerminationFee } from '@/lib/contracts/settlement';

describe('중도해지 위약금 요율 — 계약서는 경과기간별로 두 값이다', () => {
  /* 실계약 99장 전수 확인: 1년미만 30% / 1년이상 20% (82건) · 40%/30% (4건) · 미기재 13건.
     이전 구현은 단일 요율만 봐서 1년 이상 경과한 계약에도 30%를 적용할 수 있었다 —
     위약금은 내용증명·소송 청구액의 근거이므로 요율이 틀리면 법적 문서가 틀린다. */
  const base = {
    monthlyRent: 500_000,
    rentalMonths: 24,
    earlyTermRateUnder1y: 30,
    earlyTermRateOver1y: 20,
  };

  it('인도 후 6개월 → 1년미만 요율 30%', () => {
    const r = earlyTerminationFee({ ...base, deliveredDate: '2026-01-31', startDate: '2026-01-31' }, '2026-07-31');
    expect(r.rateBasis).toBe('1년미만');
    expect(r.rate).toBe(30);
    expect(r.elapsedMonths).toBe(6);
  });

  it('★인도 후 18개월 → 1년이상 요율 20% (이전에는 30%로 과다청구)', () => {
    const r = earlyTerminationFee({ ...base, deliveredDate: '2025-01-31', startDate: '2025-01-31' }, '2026-07-31');
    expect(r.rateBasis).toBe('1년이상');
    expect(r.rate).toBe(20);
    expect(r.elapsedMonths).toBe(18);
  });

  it('경계 — 정확히 12개월이면 1년이상', () => {
    const r = earlyTerminationFee({ ...base, deliveredDate: '2025-07-31', startDate: '2025-07-31' }, '2026-07-31');
    expect(r.rateBasis).toBe('1년이상');
    expect(r.rate).toBe(20);
  });

  it('기준일은 인도일 우선 — 계약서 문구가 «차량인도일로부터»', () => {
    // 시작일은 오래됐지만 인도가 늦은 계약 → 인도일 기준으로 1년미만
    const r = earlyTerminationFee(
      { ...base, startDate: '2024-01-01', deliveredDate: '2026-03-31' }, '2026-07-31',
    );
    expect(r.rateBasis).toBe('1년미만');
    expect(r.elapsedMonths).toBe(4);
  });

  it('기간별 값이 없으면 단일 요율로 폴백(옛 계약 하위호환)', () => {
    const r = earlyTerminationFee(
      { monthlyRent: 500_000, rentalMonths: 24, earlyTerminationRate: 10, startDate: '2026-01-31' }, '2026-07-31',
    );
    expect(r.rateBasis).toBe('단일');
    expect(r.rate).toBe(10);
  });

  it('요율이 어디에도 없으면 «미확인» + 위약금 0 — 임의 요율로 청구하지 않는다', () => {
    const r = earlyTerminationFee({ monthlyRent: 500_000, rentalMonths: 24, startDate: '2026-01-31' }, '2026-07-31');
    expect(r.rateBasis).toBe('미확인');
    expect(r.rate).toBe(0);
    expect(r.fee).toBe(0);
  });

  it('만기가 지났으면 조기해지가 아니므로 위약금 0', () => {
    const r = earlyTerminationFee(
      { ...base, startDate: '2024-01-31', deliveredDate: '2024-01-31', rentalMonths: 12 }, '2026-07-31',
    );
    expect(r.isEarly).toBe(false);
    expect(r.fee).toBe(0);
  });
});
