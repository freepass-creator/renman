import { requiresContractLink } from './cash-rules';

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
  linkMissingCount: number;
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
  const linkMissingCount = input.items.filter((item) =>
    requiresContractLink(item.category) && !String(item.referenceId || '').trim()).length;
  const complete = input.items.length > 0 && Math.abs(difference) < 1
    && unclassifiedCount === 0 && requiredMissingCount === 0 && linkMissingCount === 0;
  return {
    actualAmount,
    itemSum,
    feeAmount,
    expectedAmount,
    difference,
    itemCount: input.items.length,
    unclassifiedCount,
    requiredMissingCount,
    linkMissingCount,
    status: complete ? '대사완료' : '미완료',
  };
}

/** 저장 당시 상태 문자열을 신뢰하지 않고 현재 규칙으로 묶음 대사를 다시 판정한다. */
export function summarizeStoredCashBundle(input: {
  inAmt: number;
  outAmt: number;
  raw: Record<string, unknown>;
}): CashBundleSummary {
  const rawItems = Array.isArray(input.raw.bundleItems) ? input.raw.bundleItems : [];
  const items = rawItems.map((value, index): CashBundleItem => {
    const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
      id: String(item.id || `saved-${index + 1}`),
      party: String(item.party || ''),
      memo: String(item.memo || ''),
      amount: Number(item.amount) || 0,
      category: String(item.category || ''),
      referenceId: String(item.referenceId || ''),
    };
  });
  return summarizeCashBundle({
    flow: input.inAmt > 0 ? '입금' : '출금',
    actualAmount: input.inAmt || input.outAmt,
    feeAmount: Number(input.raw.bundleFeeAmount) || 0,
    items,
  });
}
