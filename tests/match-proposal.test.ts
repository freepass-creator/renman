import { describe, expect, it } from 'vitest';
import { analyzeMatchProposal, autoMatchScoped, buildMatchBacklog } from '@/lib/payments/match-proposal';
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

  it('상대방명이 달라도 적요 속 차량번호와 금액이 맞으면 안전후보로 제안한다', () => {
    const result = analyzeMatchProposal({
      ...tx('고객205'), memo: '대여료 12가3456 2026-08',
    }, [contract('C1', '홍길동')]);
    expect(result.state).toBe('자동후보');
    expect(result.preferred?.contract.id).toBe('C1');
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

  it('일마감 날짜와 별개로 전체 미매칭 적체를 후보 상태별로 만든다', () => {
    const contracts = [
      { _key: 'C1', companyId: 'A', contractorName: '홍길동', plate: '12가3456', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
    ];
    const records = [
      { _key: 'OLD', companyId: 'A', txDate: '2026-05-01', amount: 500000, counterparty: '홍길동', category: '대여료수입' },
      { _key: 'TODAY', companyId: 'A', txDate: '2026-08-02', amount: 500000, counterparty: '홍길동', category: '대여료수입' },
    ];
    expect(buildMatchBacklog(records, contracts, '2026-08-02', 'date').map((row) => row.tx.id)).toEqual(['TODAY']);
    const all = buildMatchBacklog(records, contracts, '2026-08-02', 'all');
    expect(all.map((row) => row.tx.id)).toEqual(['TODAY', 'OLD']);
    expect(all.every((row) => row.proposal.state === '자동후보' && row.automatic)).toBe(true);
  });

  it('일반 미분류는 1차 분류로 돌리고 개별 CMS 수납만 과목 없이 검토한다', () => {
    const contracts = [
      { _key: 'C1', companyId: 'A', contractorName: '홍길동', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
    ];
    const base = { companyId: 'A', txDate: '2026-08-02', amount: 500000, counterparty: '홍길동' };
    const records = [
      { ...base, _key: 'KEEP', category: '대여료' },
      { ...base, _key: 'UNCLASSIFIED', category: '' },
      { ...base, _key: 'UNCLASSIFIED_LABEL', category: '(미분류)' },
      { ...base, _key: 'CMS_RAW', method: 'CMS' },
      { ...base, _key: 'CMS_ITEM', category: '기타수입', settlementRole: 'item' },
      { ...base, _key: 'BUNDLE', category: '대여료', settlementRole: 'deposit' },
      { ...base, _key: 'DEPOSIT', category: '보증금' },
      { ...base, _key: 'SALE', category: '매각대금' },
      { ...base, _key: 'OTHER', category: '기타수입' },
      { ...base, _key: 'EXPENSE', category: '정비비' },
      { ...base, _key: 'DONE', category: '대여료', matchedContractId: 'C1' },
    ];
    const backlog = buildMatchBacklog(records, contracts, '2026-08-02', 'all');
    expect(backlog.map((row) => row.tx.id).sort()).toEqual([
      'CMS_ITEM', 'CMS_RAW', 'DEPOSIT', 'KEEP',
    ]);
    expect(backlog.find((row) => row.tx.id === 'DEPOSIT')).toMatchObject({
      proposal: { state: '미매칭', reason: '계약 귀속 필요 · 대여료 미수 차감 없음' },
      automatic: undefined,
    });
    expect(backlog.find((row) => row.tx.id === 'UNCLASSIFIED')).toBeUndefined();
  });

  it('동명이인 복수 계약은 전체 적체에서도 자동 승인 후보가 되지 않는다', () => {
    const contracts = [
      { _key: 'C1', companyId: 'A', contractorName: '홍길동', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
      { _key: 'C2', companyId: 'A', contractorName: '홍길동', monthlyRent: 500000, startDate: '2026-01-01', rentalMonths: 12 },
    ];
    const [row] = buildMatchBacklog([
      { _key: 'TX', companyId: 'A', txDate: '2026-08-02', amount: 500000, counterparty: '홍길동', category: '대여료수입' },
    ], contracts, '2026-08-02', 'all');
    expect(row.proposal.state).toBe('복수후보');
    expect(row.automatic).toBeUndefined();
  });

  it('입금 두 건이 같은 한 회차를 차지하려 하면 오래된 한 건만 안전후보로 예약한다', () => {
    const contracts = [
      { _key: 'C1', companyId: 'A', contractorName: '홍길동', monthlyRent: 500000, startDate: '2026-08-01', rentalMonths: 1, paymentTiming: '후불' },
    ];
    const rows = buildMatchBacklog([
      { _key: 'OLD', companyId: 'A', txDate: '2026-08-01', amount: 500000, counterparty: '홍길동', category: '대여료' },
      { _key: 'NEW', companyId: 'A', txDate: '2026-08-02', amount: 500000, counterparty: '홍길동', category: '대여료' },
    ], contracts, '2026-08-02', 'all');
    expect(rows.find((row) => row.tx.id === 'OLD')?.automatic).toBeDefined();
    expect(rows.find((row) => row.tx.id === 'NEW')?.proposal).toMatchObject({
      state: '검토후보', reason: '동일 계약 회차에 다른 입금 후보가 있어 확인 필요',
    });
  });
});
