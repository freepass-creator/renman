import { describe, expect, it } from 'vitest';
import { buildCashPlan, summarizeCashPlanMonths } from '@/lib/finance/cash-plan';
import type { EntityRecord } from '@/lib/intake/entities';

const TODAY = '2026-08-03';
const rec = (value: Record<string, unknown>): EntityRecord => value as EntityRecord;

describe('buildCashPlan', () => {
  it('날짜·방향·금액이 확정된 자금업무만 예측잔액에 반영한다', () => {
    const result = buildCashPlan({
      today: TODAY,
      openingBalance: 1_000_000,
      openingBalanceKnown: true,
      workItems: [
        rec({ _key: 'in', category: '자금', title: '지원금 입금', cashFlow: '입금예정', expectedAmount: 500_000, dueDate: '2026-08-05' }),
        rec({ _key: 'out', category: '자금', title: '용역비 지급', cashFlow: '출금예정', expectedAmount: 200_000, dueDate: '2026-08-06' }),
        rec({ _key: 'unknown', targetType: '자금', title: '용도 확인', expectedAmount: 900_000 }),
      ],
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows.find((row) => row.id === 'work:unknown')?.status).toBe('분류필요');
    expect(result.summary.inflow).toBe(500_000);
    expect(result.summary.outflow).toBe(200_000);
    expect(result.summary.closingBalance).toBe(1_300_000);
    expect(result.summary.needsReview).toBe(1);
  });

  it('일정이 없는 보험료·임차료는 목록에 남기되 계산에서는 제외한다', () => {
    const result = buildCashPlan({
      today: TODAY,
      openingBalance: 2_000_000,
      insurances: [rec({ _key: 'i1', insurer: '보험사', totalPremium: 1_000_000, paidPremium: 250_000 })],
      leases: [rec({ _key: 'l1', landlord: '임대인', monthlyRent: 300_000 })],
    });

    expect(result.rows.map((row) => row.status)).toEqual(['일정확인', '일정확인']);
    expect(result.summary.outflow).toBe(0);
    expect(result.summary.closingBalance).toBe(2_000_000);
    expect(result.summary.needsReview).toBe(2);
  });

  it('보험 회차와 미납 과태료만 출금 예정으로 반영한다', () => {
    const result = buildCashPlan({
      today: TODAY,
      openingBalance: 1_000_000,
      insurances: [rec({
        _key: 'i1', insurer: '보험사', policyNo: 'P-1',
        installments: [
          { cycle: 1, dueDate: '2026-08-05', amount: 100_000, paid: false },
          { cycle: 2, dueDate: '2026-08-10', amount: 100_000, paid: true },
        ],
      })],
      penalties: [
        rec({ _key: 'p1', dueDate: '2026-08-07', amount: 50_000, description: '미납 과태료' }),
        rec({ _key: 'p2', dueDate: '2026-08-08', amount: 70_000, status: '납부완료' }),
      ],
    });

    expect(result.rows.map((row) => row.id)).toEqual(['insurance:i1:1', 'penalty:p1']);
    expect(result.summary.outflow).toBe(150_000);
    expect(result.summary.closingBalance).toBe(850_000);
    expect(result.summary.minimumBalanceDate).toBe('2026-08-07');
  });

  it('납부일이 있는 임차료는 월별 예정행을 만들고 말일을 보정한다', () => {
    const result = buildCashPlan({
      today: '2026-01-30',
      horizonDays: 40,
      openingBalance: 1_000_000,
      leases: [rec({
        _key: 'l1', address: '서울 사업장', monthlyRent: 100_000,
        paymentDay: 31, startDate: '2026-01-01', endDate: '2026-12-31',
      })],
    });

    expect(result.rows.map((row) => row.dueDate)).toEqual(['2026-01-31', '2026-02-28']);
    expect(result.summary.outflow).toBe(200_000);
    expect(result.summary.closingBalance).toBe(800_000);
  });

  it('종료 계약의 미정산 보증금은 보수적 출금 상한으로 표시한다', () => {
    const result = buildCashPlan({
      today: TODAY,
      openingBalance: 2_000_000,
      contracts: [rec({
        _key: 'c1', status: '반납', returnedDate: '2026-08-04',
        contractorName: '홍길동', depositReceived: 500_000,
      })],
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ source: '보증금반환', direction: '출금', certainty: '확인필요' });
    expect(result.summary.outflow).toBe(500_000);
    expect(result.summary.closingBalance).toBe(1_500_000);
    expect(result.summary.needsReview).toBe(1);
  });

  it('차량 할부를 출금 예정으로 전개하고 매각차·현금구매는 제외한다', () => {
    const loan = {
      loanCompany: '캐피탈', loanPrincipal: 12_000_000, loanMonths: 12,
      loanRate: 0, loanStartDate: '2026-06-15',
    };
    const result = buildCashPlan({
      today: TODAY, // 2026-08-03 · horizon 90일 → 2026-11-01
      openingBalance: 5_000_000,
      vehicles: [
        rec({ _key: 'v1', plate: '12가3456', carName: '아반떼', ...loan }),
        rec({ _key: 'sold', plate: '34나5678', status: '매각', ...loan }),
        rec({ _key: 'cash', plate: '56다7890', loanCashOnly: '예', ...loan }),
      ],
    });

    // 6·7월 회차는 경과라 제외, 11/15은 horizon 밖 → 8·9·10월 3회차만
    expect(result.rows.map((row) => row.dueDate)).toEqual(['2026-08-15', '2026-09-15', '2026-10-15']);
    expect(result.rows.every((row) => row.source === '할부' && row.direction === '출금' && row.amount === 1_000_000)).toBe(true);
    expect(result.rows[0].counterparty).toBe('캐피탈');
    expect(result.summary.outflow).toBe(3_000_000);
    expect(result.summary.closingBalance).toBe(2_000_000);
  });

  it('summarizeCashPlanMonths — 월 버킷·기한경과 분리·미확정 카운트', () => {
    const { rows } = buildCashPlan({
      today: TODAY,
      workItems: [
        rec({ _key: 'in', category: '자금', title: '지원금', cashFlow: '입금예정', expectedAmount: 500_000, dueDate: '2026-08-20' }),
        rec({ _key: 'out', category: '자금', title: '용역비', cashFlow: '출금예정', expectedAmount: 200_000, dueDate: '2026-09-10' }),
        rec({ _key: 'late', category: '자금', title: '늦은 입금', cashFlow: '입금예정', expectedAmount: 300_000, dueDate: '2026-08-01' }),
        rec({ _key: 'unknown', targetType: '자금', title: '용도 확인', expectedAmount: 900_000 }),
      ],
      vehicles: [rec({
        _key: 'v1', plate: '12가3456', loanCompany: '캐피탈',
        loanPrincipal: 12_000_000, loanMonths: 12, loanRate: 0, loanStartDate: '2026-06-15',
      })],
    });
    const outlook = summarizeCashPlanMonths(rows, TODAY, 3);

    expect(outlook.months.map((m) => m.ym)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(outlook.months[0]).toMatchObject({ inflow: 500_000, outflow: 1_000_000, net: -500_000 });
    expect(outlook.months[1]).toMatchObject({ inflow: 0, outflow: 1_200_000, net: -1_200_000 });
    expect(outlook.months[1].bySource).toEqual({ 자금업무: 200_000, 할부: 1_000_000 });
    expect(outlook.overdueInflow).toBe(300_000); // 8/1 도래분은 «밀린 돈»으로 분리
    expect(outlook.unscheduledCount).toBe(1);
  });

  it('활성 계약의 예정을 입금으로 가져오고 종료 계약은 제외한다', () => {
    const base = {
      monthlyRent: 300_000,
      rentalMonths: 2,
      startDate: '2026-08-10',
      endDate: '2026-10-09',
      contractDate: '2026-08-01',
      deliveredDate: '2026-08-10',
      paymentDay: 10,
      paymentTiming: '선불',
    };
    const result = buildCashPlan({
      today: TODAY,
      horizonDays: 90,
      contracts: [
        rec({ _key: 'active', status: '운행', contractorName: '정상 고객', ...base }),
        rec({ _key: 'ended', status: '반납', returnedDate: '2026-08-02', contractorName: '종료 고객', ...base }),
      ],
    });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every((row) => row.source === '계약대여료' && row.counterparty === '정상 고객')).toBe(true);
    expect(result.summary.inflow).toBeGreaterThan(0);
  });
});
