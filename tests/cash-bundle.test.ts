import { describe, expect, it } from 'vitest';
import { summarizeCashBundle, type CashBundleItem } from '@/lib/finance/cash-bundle';

const item = (id: string, amount: number, category = '대여료수입'): CashBundleItem => ({
  id, amount, category, party: `거래처 ${id}`, memo: '',
});

describe('일반 묶음 입출금 대사', () => {
  it('입금은 구성합계에서 수수료를 뺀 금액과 실제 입금을 맞춘다', () => {
    expect(summarizeCashBundle({
      flow: '입금', actualAmount: 970_000, feeAmount: 30_000,
      items: [item('1', 400_000), item('2', 600_000)],
    })).toMatchObject({ itemSum: 1_000_000, expectedAmount: 970_000, difference: 0, status: '대사완료' });
  });

  it('출금은 구성합계에 수수료를 더한 금액과 실제 출금을 맞춘다', () => {
    expect(summarizeCashBundle({
      flow: '출금', actualAmount: 1_005_000, feeAmount: 5_000,
      items: [item('1', 400_000, '급여'), item('2', 600_000, '급여')],
    })).toMatchObject({ itemSum: 1_000_000, expectedAmount: 1_005_000, difference: 0, status: '대사완료' });
  });

  it('금액이 맞아도 미분류 구성건이 있으면 미완료로 이어서 저장한다', () => {
    expect(summarizeCashBundle({
      flow: '출금', actualAmount: 100_000, feeAmount: 0,
      items: [item('1', 100_000, '')],
    })).toMatchObject({ difference: 0, unclassifiedCount: 1, status: '미완료' });
  });

  it('구성합계가 덜 채워진 상태도 차이를 보존하고 미완료로 둔다', () => {
    expect(summarizeCashBundle({
      flow: '입금', actualAmount: 500_000, feeAmount: 0,
      items: [item('1', 300_000)],
    })).toMatchObject({ difference: 200_000, status: '미완료' });
  });

  it('금액·계정이 맞아도 거래처가 없으면 미완료다', () => {
    expect(summarizeCashBundle({
      flow: '출금', actualAmount: 100_000, feeAmount: 0,
      items: [{ ...item('1', 100_000, '정비·수리비'), party: '' }],
    })).toMatchObject({ difference: 0, requiredMissingCount: 1, status: '미완료' });
  });
});
