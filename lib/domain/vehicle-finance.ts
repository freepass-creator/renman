/** 차량 금융 필드 정규화 — loanCashOnly는 저장값이 '예'|'아니오' 문자열(SSOT). truthy 판정 금지. */
export function isCashPurchase(v: unknown): boolean {
  return String(v ?? '') === '예';
}
