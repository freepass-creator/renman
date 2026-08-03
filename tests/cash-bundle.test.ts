import { describe, expect, it } from 'vitest';
import { cashBundleReviewStatus, createCashBundlePreset, requiresLoanRepaymentSplit, summarizeCashBundle, type CashBundleItem } from '@/lib/finance/cash-bundle';

const item = (id: string, amount: number, category = '대여료수입'): CashBundleItem => ({
  id, amount, category, party: `거래처 ${id}`, memo: '', referenceId: `contract-${id}`,
});

describe('일반 묶음 입출금 대사', () => {
  it('할부·리스 원출금은 분해 전부터 미완료이고 분해 자식 과목은 다시 대상이 아니다', () => {
    expect(requiresLoanRepaymentSplit('할부금')).toBe(true);
    expect(requiresLoanRepaymentSplit('할부금 상환')).toBe(true);
    expect(requiresLoanRepaymentSplit('할부·리스료')).toBe(true);
    expect(requiresLoanRepaymentSplit('할부원금상환')).toBe(false);
    expect(requiresLoanRepaymentSplit('이자비용')).toBe(false);
    expect(cashBundleReviewStatus({
      category: '할부금', inAmt: 0, outAmt: 412_438, raw: {},
    })).toBe('미완료');
  });

  it('할부·리스상환은 금액을 만들지 않고 원금·이자 입력 구조만 준비한다', () => {
    expect(createCashBundlePreset('할부·리스상환', '메리츠', 'SP-2604-0086')).toEqual([
      expect.objectContaining({ party: '메리츠', category: '할부원금상환', amount: 0, referenceId: 'SP-2604-0086' }),
      expect.objectContaining({ party: '메리츠', category: '이자비용', amount: 0, referenceId: 'SP-2604-0086' }),
    ]);
  });
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

  it('계약성 구성건은 금액·계정이 맞아도 실제 계약 연결이 없으면 미완료다', () => {
    expect(summarizeCashBundle({
      flow: '입금', actualAmount: 100_000, feeAmount: 0,
      items: [{ ...item('1', 100_000, '대여료수입'), referenceId: '' }],
    })).toMatchObject({ difference: 0, linkMissingCount: 1, status: '미완료' });
  });
});
