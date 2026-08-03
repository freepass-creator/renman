/**
 * 원장 빈값 카피 SSOT — 표·패널·셀에서 같은 의미에 같은 말.
 * redesign.mdc 행문법 · ledger-ext 엑셀기본 주석과 동기.
 */
export const LEDGER_EMPTY = {
  /** 일반 빈 칸(날짜·금액·텍스트) */
  dash: '—',
  /** 신원(차번·계약 키) 없음 → 상태도 미배정 */
  unassigned: '미배정',
  /** 2차 인물(계약자) 없음 */
  none: '없음',
  /** 매칭 대상(실운전자 등) 아직 안 붙음 */
  unmatched: '미매칭',
  /** 계약 연결 없음(운영현황 등) — none과 구분: «사람»이 아니라 «계약» */
  noContract: '계약 없음',
} as const;

export type LedgerEmptyKey = keyof typeof LEDGER_EMPTY;
