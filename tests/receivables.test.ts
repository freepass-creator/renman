/**
 * 미수(net) 회귀 테스트 — computeContractView(전 화면 미수 SSOT) 불변식 고정.
 * 목적: 미수/수납 로직을 건드릴 때 조용한 회귀를 자동으로 잡는다(P0 · 금액 로직 보험).
 *   실행: npm test  (vitest)
 * 아래 기대값은 "현재 올바른 동작"을 못박은 것 — 값이 바뀌면 의도한 변경인지 반드시 확인.
 */
import { describe, it, expect } from 'vitest';
import { computeContractView } from '@/lib/contract-ops';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-07-22';

/** 계약 레코드 fixture — 기본 운행중·선불·25일·12개월·월50만. */
function c(over: Record<string, unknown>): EntityRecord {
  return {
    _key: 'c', monthlyRent: 500_000, rentalMonths: 12,
    startDate: '2025-01-01', endDate: '2026-01-01', contractDate: '2025-01-01',
    deliveredDate: '2025-01-01', status: '운행', paymentDay: 25, paymentTiming: '선불',
    ...over,
  } as EntityRecord;
}
const net = (over: Record<string, unknown>) => computeContractView(c(over), TODAY).net;

describe('씨앗 계약 — net은 _carryUnpaid(직원 확정 실미수) 앵커', () => {
  it('무납부 → net == carry', () => {
    expect(net({ _carryUnpaid: 1_200_000, _paidTotal: 0 })).toBe(1_200_000);
  });

  it('앱수납 50만 → net == carry − 수납 (FIFO)', () => {
    expect(net({ _carryUnpaid: 1_200_000, _payments: [{ seq: 1, date: '2026-07-01', amount: 500_000, source: '계좌' }] })).toBe(700_000);
  });

  it('앱수납 분할(30만+20만) → net == carry − 합', () => {
    expect(net({
      _carryUnpaid: 1_200_000,
      _payments: [
        { seq: 1, date: '2026-06-01', amount: 300_000, source: '계좌' },
        { seq: 1, date: '2026-07-01', amount: 200_000, source: '계좌' },
      ],
    })).toBe(700_000);
  });

  it('앱수납 초과(carry 50만 · 수납 90만) → net == 0 (음수 아님)', () => {
    expect(net({ _carryUnpaid: 500_000, _payments: [{ seq: 1, date: '2026-07-01', amount: 900_000, source: '계좌' }] })).toBe(0);
  });

  it('carry 0 → net == 0', () => {
    expect(net({ _carryUnpaid: 0 })).toBe(0);
  });
});

describe('B-1 회귀 가드 — 반납/해지 계약도 carry 유실 없음', () => {
  it('반납 계약 + carry → net == carry', () => {
    expect(net({ status: '반납', returnedDate: '2025-06-01', _carryUnpaid: 2_000_000 })).toBe(2_000_000);
  });

  it('짧은 반납(2개월) + 큰 carry(회차창 초과) → net == carry (면제·용량으로 안 샘)', () => {
    // start 2025-01-01, 반납 2025-03-01 (도래 2회차뿐) 인데 carry 5,000,000 — 예전엔 초과분 유실됐음.
    expect(net({ startDate: '2025-01-01', endDate: '2025-03-01', status: '반납', returnedDate: '2025-03-01', _carryUnpaid: 5_000_000 })).toBe(5_000_000);
  });

  it('해지 계약 + carry → net == carry', () => {
    expect(net({ status: '해지', returnedDate: '2025-08-01', _carryUnpaid: 1_500_000 })).toBe(1_500_000);
  });
});

describe('일반 계약(carry 없음) — 도래분만 미수, 미도래는 제외', () => {
  it('전액 도래 → net == Σ도래 회차', () => {
    // 400k × 6개월, 2026-01~07, TODAY 07-22 → 6회차 전부 도래
    expect(net({ monthlyRent: 400_000, rentalMonths: 6, startDate: '2026-01-01', endDate: '2026-07-01' })).toBe(2_400_000);
  });

  it('미도래 회차는 net에 안 들어간다 (핵심 정책)', () => {
    // 결제일 1일 · start 2026-07-01 · 선불 12개월 · TODAY 07-22 → 1회차(07-01)만 도래, 2회차(08-01)~는 미도래
    expect(net({ monthlyRent: 500_000, rentalMonths: 12, startDate: '2026-07-01', endDate: '2027-07-01', paymentDay: 1 })).toBe(500_000);
  });

  it('결제일 미도래면 net 0 (시작했어도 첫 결제일 전이면 미수 아님)', () => {
    // 결제일 25일 · start 2026-07-01 · TODAY 07-22 → 1회차 마감 07-25 아직 안 옴 → 도래분 없음
    expect(net({ monthlyRent: 500_000, rentalMonths: 12, startDate: '2026-07-01', endDate: '2027-07-01', paymentDay: 25 })).toBe(0);
  });
});

describe('엣지 — 크래시 없이 방어', () => {
  it('결제일 31일(월말 보정) → 예외 없이 계산', () => {
    expect(() => net({ paymentDay: 31, _carryUnpaid: 1_000_000 })).not.toThrow();
    expect(net({ paymentDay: 31, _carryUnpaid: 1_000_000 })).toBe(1_000_000);
  });

  it('손상 날짜(startDate 1930) → 예외 없이 net 반환', () => {
    expect(() => net({ startDate: '1930-01-01', endDate: '1931-01-01', _carryUnpaid: 800_000 })).not.toThrow();
  });

  it('스케줄 못 만드는 계약(월대여료 0) → net 0, 크래시 없음', () => {
    expect(() => net({ monthlyRent: 0, _carryUnpaid: 0 })).not.toThrow();
  });
});
