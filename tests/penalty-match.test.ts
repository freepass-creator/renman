import { describe, expect, it } from 'vitest';
import { matchPenalty } from '@/lib/penalty-match';

describe('과태료 계약 자동매칭', () => {
  const contracts = [
    { contractNo: 'OLD', plate: '299수4820', contractorName: '이전 임차인', startDate: '2025-01-01', returnedDate: '2026-01-31' },
    { contractNo: 'NOW', plate: '299수4820', contractorName: '현재 임차인', startDate: '2026-02-01', endDate: '2027-01-31' },
  ];

  it('위반일이 포함된 계약의 임차인을 찾는다', () => {
    expect(matchPenalty({ plate: '299수 4820', violationDate: '2026-07-20 13:20' }, contracts)?.renter).toBe('현재 임차인');
  });

  it('반납일 당일도 해당 계약으로 매칭한다', () => {
    expect(matchPenalty({ plate: '299수4820', violationDate: '2026-01-31' }, contracts)?.contract.contractNo).toBe('OLD');
  });

  it('계약 기간 밖이거나 날짜가 잘못되면 매칭하지 않는다', () => {
    expect(matchPenalty({ plate: '299수4820', violationDate: '2024-01-01' }, contracts)).toBeNull();
    expect(matchPenalty({ plate: '299수4820', violationDate: '날짜없음' }, contracts)).toBeNull();
  });

  it('기간이 겹치면 시작일이 최신인 계약을 우선한다', () => {
    const overlap = [...contracts, { contractNo: 'NEW', plate: '299수4820', contractorName: '신규 임차인', startDate: '2026-07-01' }];
    expect(matchPenalty({ plate: '299수4820', violationDate: '2026-07-20' }, overlap)?.contract.contractNo).toBe('NEW');
  });
});
