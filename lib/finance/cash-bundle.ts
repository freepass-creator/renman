export const CASH_BUNDLE_TYPES = ['일괄입금', '일괄출금', '급여', '보험', '정비', '대량지급', '기타'] as const;
export type CashBundleType = (typeof CASH_BUNDLE_TYPES)[number];

export type CashBundleItem = {
  id: string;
  party: string;
  memo: string;
  amount: number;
  category: string;
  referenceId?: string;
};

export type CashBundleSummary = {
  actualAmount: number;
  itemSum: number;
  feeAmount: number;
  expectedAmount: number;
  difference: number;
  itemCount: number;
  unclassifiedCount: number;
  requiredMissingCount: number;
  status: '미완료' | '대사완료';
};

/**
 * 일반 묶음 대사.
 * 입금: 구성합계 - 수수료 = 실제 입금 / 출금: 구성합계 + 수수료 = 실제 출금.
 * 구성건이 없거나 금액 차이·미분류가 남으면 저장은 가능하지만 «미완료»다.
 */
export function summarizeCashBundle(input: {
  flow: '입금' | '출금';
  actualAmount: number;
  feeAmount: number;
  items: CashBundleItem[];
}): CashBundleSummary {
  const actualAmount = Math.max(0, Number(input.actualAmount) || 0);
  const feeAmount = Math.max(0, Number(input.feeAmount) || 0);
  const itemSum = input.items.reduce((sum, item) => sum + Math.max(0, Number(item.amount) || 0), 0);
  const expectedAmount = input.flow === '입금' ? itemSum - feeAmount : itemSum + feeAmount;
  const difference = actualAmount - expectedAmount;
  const unclassifiedCount = input.items.filter((item) => !String(item.category || '').trim()).length;
  const requiredMissingCount = input.items.filter((item) =>
    !String(item.party || '').trim() || !(Number(item.amount) > 0)).length;
  const complete = input.items.length > 0 && Math.abs(difference) < 1
    && unclassifiedCount === 0 && requiredMissingCount === 0;
  return {
    actualAmount,
    itemSum,
    feeAmount,
    expectedAmount,
    difference,
    itemCount: input.items.length,
    unclassifiedCount,
    requiredMissingCount,
    status: complete ? '대사완료' : '미완료',
  };
}
