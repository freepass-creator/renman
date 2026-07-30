/**
 * 원장 세부 필터 필드 SSOT.
 * 추가/삭제 요청: `{시트} · 필터 · +|-{key}({라벨})` — 규격 본문 `@/lib/ledger-ext`.
 *
 * 반영: 1) 여기 DEFS 2) 페이지 matcher·options.
 */
export type LedgerFilterFieldDef = {
  key: string;
  label: string;
  /** 빈 값 옵션 라벨. 기본 '전체'. */
  emptyLabel?: string;
};

/** 활성 세부필터 개수(배지). */
export function countActiveFilters(values: Record<string, string>, defs: readonly LedgerFilterFieldDef[]): number {
  return defs.reduce((n, def) => n + (values[def.key] ? 1 : 0), 0);
}

/** DEFS 키 기준 빈 값 맵. */
export function emptyFilterValues(defs: readonly LedgerFilterFieldDef[]): Record<string, string> {
  return Object.fromEntries(defs.map((def) => [def.key, '']));
}

/**
 * 행이 세부필터를 통과하는지.
 * matcher에 없는 key는 무시(아직 미배선).
 */
export function matchLedgerFilters<T>(
  row: T,
  values: Record<string, string>,
  matchers: Partial<Record<string, (row: T, value: string) => boolean>>,
): boolean {
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const match = matchers[key];
    if (!match) continue;
    if (!match(row, value)) return false;
  }
  return true;
}

/** 단순 동등 비교 matcher. */
export function eqFilter<T>(get: (row: T) => string): (row: T, value: string) => boolean {
  return (row, value) => get(row) === value;
}

/** 자산 세부필터 — 추가 요청 시 여기 push. */
export const ASSET_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'pool', label: '자산범위' },
  { key: 'quick', label: '빠른필터' },
  { key: 'status', label: '차량상태' },
  { key: 'maker', label: '제조사' },
];

/** 계약 세부필터. */
export const CONTRACT_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'bucket', label: '계약범위' },
  { key: 'rentalType', label: '대여형태' },
  { key: 'status', label: '계약상태' },
  { key: 'endReason', label: '종료사유' },
];

/** 운영현황 세부필터. */
export const FLEET_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'scope', label: '가동·리스크' },
  { key: 'contract', label: '계약' },
  { key: 'warn', label: '경고' },
];

/** 일정관리 세부필터. */
export const AGENDA_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'kind', label: '종류' },
];

/** 업무 세부필터. */
export const WORK_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'group', label: '업무구분' },
  { key: 'penProcess', label: '과태료 처리' },
  { key: 'penKind', label: '과태료 유형' },
  { key: 'status', label: '상태' },
  { key: 'assignee', label: '담당자', emptyLabel: '담당자 전체' },
  { key: 'source', label: '원천' },
];

/** 리스크 세부필터. */
export const RISK_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'group', label: '리스크 구분' },
];

/** 자금·계좌 세부필터. */
export const CASH_ACCOUNT_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'accountStatus', label: '계좌상태' },
  { key: 'accountType', label: '계좌구분' },
];

/** 자금·거래 세부필터. */
export const CASH_TX_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'flow', label: '수지구분' },
  { key: 'sourceQuick', label: '원천필터' },
  { key: 'unclassified', label: '미분류만' },
  { key: 'category', label: '계정과목' },
  { key: 'match', label: '매칭상태' },
];