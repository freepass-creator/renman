/** 계약·회차 근거가 있어야 자금일보에서 완료로 볼 수 있는 렌탈 영업 입금. */
export function requiresContractLink(category: unknown): boolean {
  return /대여료|임대료|보증금|카드매출|미수금회수/.test(String(category || ''));
}

/** 계약 회차의 미수를 실제로 줄이는 수납. 보증금은 계약 귀속만 하며 대여료 회차에 넣지 않는다. */
export function reducesReceivable(category: unknown): boolean {
  return /대여료|임대료|카드매출|CMS집금|미수금회수/.test(String(category || ''));
}

/**
 * 미수 입금 매칭 검토대기열 진입 규칙.
 * 미분류는 먼저 대기열에 올려 사람이 계약 귀속을 판단하고, 명시적으로 다른 성격인 수입만 제외한다.
 * CMS 합계 집금행(deposit)은 제외하고 개별 수납행(item)은 과목과 무관하게 검토 대상으로 유지한다.
 */
export function canReviewReceivableMatch(
  category: unknown,
  settlementRole?: 'deposit' | 'item',
): boolean {
  if (settlementRole === 'deposit') return false;
  if (settlementRole === 'item') return true;
  const label = String(category || '').trim();
  if (!label || label === '(미분류)') return true;
  return reducesReceivable(label);
}
