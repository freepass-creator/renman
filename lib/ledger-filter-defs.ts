/**
 * 원장 세부 필터 필드 SSOT.
 * 추가/삭제 요청: `{시트} · 필터 · +|-{key}({라벨})` — 규격 본문 `@/lib/ledger-ext`.
 *
 * 반영: 1) 여기 DEFS 2) 페이지 matcher·options.
 */
import { LEDGER_LABEL } from '@/lib/ledger-labels';

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
  // 기본보기 4·5번 칸은 반드시 필터에 있다 — 「보이는 축으로 거를 수 있어야 한다」.
  //   자산범위(보유/처분)는 더 거친 묶음이라 자산분류(구매예정·보유중·처분예정·처분완료)를 대신하지 못한다.
  { key: 'lifecycle', label: LEDGER_LABEL.lifecycle },
  { key: 'status', label: LEDGER_LABEL.assetStatus },
  { key: 'maker', label: '제조사' },
];

/** 계약 세부필터. */
export const CONTRACT_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'bucket', label: '계약범위' },
  { key: 'rentalType', label: LEDGER_LABEL.rentalType },
  { key: 'status', label: '계약상태' },
  { key: 'endReason', label: '종료사유' },
  { key: 'deposit', label: '보증금', emptyLabel: '보증금 전체' },
  { key: 'scheduleStatus', label: '회차상태' },
];

/** 운영현황 세부필터. */
export const FLEET_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'scope', label: '가동·리스크' },
  // 기본보기 4·5번 칸 — 자산·정비 원장과 같은 축·같은 이름(차량 원장군).
  { key: 'lifecycle', label: LEDGER_LABEL.lifecycle },
  { key: 'status', label: LEDGER_LABEL.assetStatus },
  { key: 'contract', label: '계약' },
  { key: 'warn', label: '경고' },
];

/** 업무 세부필터. */
export const WORK_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'group', label: LEDGER_LABEL.workCategory },
  // 대분류(탭)로 좁힌 뒤 더 좁힐 때 쓰는 2단. 탭에 세부 17개를 늘어놓지 않으려고 여기로 내렸다.
  { key: 'category', label: '분류(세부)' },
  { key: 'penProcess', label: '과태료상태' },
  { key: 'penKind', label: '과태료분류' },
  { key: 'status', label: '업무상태' },
  // 「일정」을 분류 축에서 뺀 대가 — 급한 정도는 분류가 아니라 이 축이 담당한다(긴급·높음·보통·낮음).
  { key: 'priority', label: '우선순위' },
  { key: 'assignee', label: '담당자', emptyLabel: '담당자 전체' },
  { key: 'source', label: '원천' },
];

/**
 * 리스크 세부필터.
 * ★분류·상태로 걸러낼 수 있어야 한다 — 구분만으로는 «검사만기 중 어김만» 같은 실무 조회가 안 된다.
 *   옵션 값은 화면에서 실제 데이터로 수집하므로 분류값을 바꿔도 따라온다.
 */
export const RISK_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'group', label: '리스크구분' },
  { key: 'kind', label: '리스크분류' },
  { key: 'status', label: '리스크상태' },
];

/** 자금·계좌 세부필터. */
export const CASH_ACCOUNT_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'accountStatus', label: '계좌상태' },
  { key: 'accountType', label: '계좌분류' },
];

/** 자금·거래 세부필터. */
export const CASH_TX_FILTER_DEFS: LedgerFilterFieldDef[] = [
  { key: 'flow', label: '수지구분' },
  { key: 'sourceQuick', label: '원천필터' },
  { key: 'unclassified', label: '미분류만' },
  { key: 'category', label: '계정과목' },
  { key: 'match', label: '자금상태' },
  { key: 'bundleStatus', label: '묶음대사' },
];
