import { describe, expect, it } from 'vitest';
import { analyzeMatchProposal, autoMatchScoped } from '@/lib/payments/match-proposal';
import type { BankTransaction, Contract } from '@/lib/payments/types';

const schedule = { seq: 1, dueDate: '2026-08-05', amount: 500000, status: '연체', paidAmount: 0 } as const;
const contract = (id: string, customerName: string): Contract => ({
  id, contractNo: id, customerName, vehiclePlate: '12가3456', status: '운행', schedules: [{ ...schedule }],
} as Contract);
const tx = (counterparty: string, amount = 500000): BankTransaction => ({
  id: 'tx1', txDate: '2026-08-02', amount, counterparty,
} as BankTransaction);

describe('입금 계약 연결 후보', () => {
  it('입금자와 금액이 한 계약에 일치하면 자동후보로만 제안한다', () => {
    const result = analyzeMatchProposal(tx('홍길동'), [contract('C1', '홍길동')]);
    expect(result).toMatchObject({ state: '자동후보', reason: '입금자·청구금액 일치' });
    expect(result.preferred?.contract.id).toBe('C1');
  });

  it('동명이인 계약 충돌은 자동후보로 확정하지 않는다', () => {
    const result = analyzeMatchProposal(tx('홍길동'), [contract('C1', '홍길동'), contract('C2', '홍길동')]);
    expect(result.state).toBe('복수후보');
    expect(result.preferred).toBeUndefined();
  });

  it('이름만 맞고 금액이 다르면 검토후보로 둔다', () => {
    expect(analyzeMatchProposal(tx('홍길동', 400000), [contract('C1', '홍길동')]).state).toBe('검토후보');
  });

  it('출금은 계약 수납 매칭 대상이 아니다', () => {
    expect(analyzeMatchProposal({ ...tx('홍길동'), withdraw: 500000, amount: 0 }, [contract('C1', '홍길동')]).state).toBe('해당없음');
  });

  it('전체 회사에서도 다른 법인 계약을 후보로 섞지 않는다', () => {
    const records = [
      { _key: 'C-A', companyId: 'A', contractorName: '홍길동', plate: '11가1111', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
      { _key: 'C-B', companyId: 'B', contractorName: '홍길동', plate: '22나2222', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
    ];
    const result = autoMatchScoped([
      { ...tx('홍길동'), companyCode: 'A' },
    ], records, '2026-08-02');
    expect(result).toHaveLength(1);
    expect(result[0].candidate.contract.id).toBe('C-A');
  });
});
