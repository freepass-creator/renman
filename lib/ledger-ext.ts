/**
 * 원장 항목 추가·삭제 규격 (틀).
 * 엑셀 열 · 상세 섹션 · 세부필터 — 언제든 요청으로 push/splice.
 *
 * ## 엑셀기본 열 순서 (= redesign 행문법)
 *   `회사 → 신원(+) → [분류] → 내용 → 상태 → 수치/기한 → (보조…)`
 *   회사 열 key: 전 원장 `company`(라벨=회사명).
 *   상태·분류를 신원보다 앞에 두지 말 것. 빈값 카피 = `lib/ledger-empty.ts`.
 *
 * ## 요청 한 줄
 *   `{시트} · {축} · {+|-}{key}({라벨})`
 *
 * | 축 | 의미 | 반영 위치 |
 * |---|---|---|
 * | `엑셀기본` | 기본 보기 열 | `*_SHEET_KEYS.basic` |
 * | `엑셀전체` 또는 `엑셀` | 전체 보기 열 순서 | `*_SHEET_KEYS.all` |
 * | `{섹션명}` (등록증정보 등) | 상세패널 섹션 | `*_DETAIL_DEFS` |
 * | `필터` | 세부필터 | `*_FILTER_DEFS` (+ matcher/options) |
 *
 * ## 예시
 *   자산 · 엑셀전체 · +fuel(연료)
 *   자산 · 엑셀기본 · -inspectionTo
 *   자산 · 등록증정보 · +ownerPhone(소유자전화)
 *   자산 · 필터 · +fuel
 *   계약 · 요금·납부 · -reservationFee
 *
 * ## 반영 순서
 *   1) 컬럼 카탈로그에 key 없으면 col 정의 먼저 (ax/cx/FL…)
 *   2) 해당 KEYS/DEFS 배열에 `+` push / `-` 제거
 *   3) 필터면 페이지 matcher·options만 연결 (UI는 LedgerFilterFields)
 *   페이지·LedgerFrame은 손대지 않음.
 */
import type { SheetCol } from '@/components/ui';

export type SheetViewKeys = {
  /** 기본 보기 */
  basic: readonly string[];
  /** 전체 보기 순서(뒤로만 확장). basic 키를  squ 포함해도 됨. */
  all: readonly string[];
};

export type DetailSectionDef = {
  title: string;
  open?: boolean;
  keys: readonly string[];
};

export function pickCols<T>(catalog: SheetCol<T>[], keys: readonly string[]): SheetCol<T>[] {
  const map = new Map(catalog.map((col) => [col.key, col]));
  return keys.map((key) => map.get(key)).filter((col): col is SheetCol<T> => !!col);
}

export function buildSheetViews<T>(catalog: SheetCol<T>[], keys: SheetViewKeys): {
  basic: SheetCol<T>[];
  expanded: SheetCol<T>[];
} {
  return {
    basic: pickCols(catalog, keys.basic),
    expanded: pickCols(catalog, keys.all),
  };
}

export function buildDetailSections<T>(
  catalog: SheetCol<T>[],
  defs: readonly DetailSectionDef[],
): Array<{ title: string; open?: boolean; cols: SheetCol<T>[] }> {
  return defs.map((def, index) => ({
    title: def.title,
    open: def.open ?? index === 0,
    cols: pickCols(catalog, def.keys),
  }));
}
