import { isUnclassified } from '@/lib/payments/ledger-subjects';

/** 계약·회차 근거가 있어야 자금일보에서 완료로 볼 수 있는 렌탈 영업 입금. */
export function requiresContractLink(category: unknown): boolean {
  return /대여료|임대료|보증금|카드매출|미수금회수/.test(String(category || ''));
}

/** 계약 회차의 미수를 실제로 줄이는 수납. 보증금은 계약 귀속만 하며 대여료 회차에 넣지 않는다. */
export function reducesReceivable(category: unknown): boolean {
  return /대여료|임대료|카드매출|CMS집금|미수금회수/.test(String(category || ''));
}

/** 계약에는 귀속하지만 대여료 회차·미수는 줄이지 않는 보증금 수령 과목. */
export function isDepositReceiptCategory(category: unknown): boolean {
  const label = String(category || '');
  return /보증금/.test(label) && !/반환/.test(label);
}

/**
 * 계약 입금 매칭 검토대기열 진입 규칙.
 * 일반 미분류는 자금관리의 1차 분류에서 먼저 성격을 확정한다.
 * CMS 개별 성공건은 수납 원천 자체가 계약성 근거이므로 과목 미입력 상태에서도 검토할 수 있다.
 * 보증금은 계약에는 귀속하지만 대여료 미수는 줄이지 않는 별도 입금 원자로 처리한다.
 * CMS 합계 집금행(deposit)은 제외하고 개별 수납행(item)은 과목과 무관하게 검토 대상으로 유지한다.
 */
export function canReviewReceivableMatch(
  category: unknown,
  settlementRole?: 'deposit' | 'item',
  method?: unknown,
): boolean {
  if (settlementRole === 'deposit') return false;
  if (settlementRole === 'item') return true;
  const label = String(category || '').trim();
  if (!label || label === '(미분류)') return /CMS|자동이체/.test(String(method || ''));
  return requiresContractLink(label);
}

/**
 * 출금 증빙 검토 규칙.
 * 성격이 정해지지 않은 거래는 먼저 1차 분류하고, 내부 계좌 이동은 비용 증빙 대상에서 제외한다.
 * 그 밖의 분류된 출금(비용·자산·금융·세금·보증금 반환)은 증빙 또는 처리 근거가 필요하다.
 */
export function requiresExpenseEvidence(category: unknown): boolean {
  const label = String(category || '').trim();
  if (isUnclassified(label)) return false;
  return !isInternalTransferCategory(label);
}

/** 표준명과 과거 원장명을 함께 읽되 저장 라벨을 임의 변경하지 않는다. */
export function isInternalTransferCategory(category: unknown): boolean {
  return /^(계좌간이체|자금이동|내부이체)$/.test(String(category || '').trim());
}
