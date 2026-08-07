/**
 * 세부패널 «섹션 사전» — SSOT.
 *
 * ## 사장님 설계 (2026-08-07)
 *   「섹션을 만들어 놓고, 페이지는 **어떤 섹션을 쓰느냐**로만 구분한다.
 *    항목별 섹션을 다 만들어 놓고, 차량360에는 그 섹션이 다 들어와 있는 것.」
 *
 * ## 규칙
 *   1) **섹션의 이름·순서는 여기서만 정한다.** 같은 주제가 페이지마다 다른 이름으로 나오면 안 된다
 *      — 예전에는 운영현황이 「금융·보험」, 자산이 「금융·할부」+「보험」으로 갈려 있었다.
 *   2) **한 섹션 = 한 주제.** 금융과 보험은 다른 주제다 → 한 섹션에 합치지 않는다.
 *      (한 칸에 원자 하나 규칙의 섹션판.)
 *   3) **키 배정만 원장이 한다.** 같은 「금융」이라도 컬럼 key 이름은 원장마다 다르다
 *      (운영 `loanCo` / 자산 `loanCompany`). 섹션의 존재·제목·순서는 여기,
 *      그 섹션에 무엇이 들어가는지는 원장의 `SectionKeyMap` — 이 분리를 지킨다.
 *   4) 값이 다 빈 섹션은 record-panel 이 알아서 숨긴다(sectionHasValue). 여기서 걱정하지 않는다.
 *
 * ## 쓰는 법
 *   ```ts
 *   export const FLEET_DETAIL_DEFS = sectionDefs({
 *     '차량·상태': ['company', 'plate', …],
 *     '금융': ['loanCo', 'loanAmt', …],
 *     '보험': ['insurer', 'insEnd', …],
 *   });
 *   ```
 *   순서는 맵에 쓴 순서가 아니라 아래 `DETAIL_SECTIONS` 순서를 따른다 —
 *   어느 원장을 열어도 같은 섹션이 같은 자리에 있어야 하기 때문이다.
 */
import type { DetailSectionDef } from './ledger-ext';

/**
 * 표준 섹션 목록 = 표시 순서.
 *   신원 → 계약 → 돈 → 자산·서류 → 부가.
 * 새 섹션은 «주제»가 정말 새로울 때만 추가한다. 기존 주제의 변종이면 기존 섹션에 키를 넣는다.
 */
export const DETAIL_SECTIONS = [
  // 신원
  '차량·상태',
  '신원·분류',
  // 계약
  '계약',
  '계약자',
  '기간·인도',
  '주행',
  // 돈
  '요금·납부',
  '수납·리스크',
  '미수·종료',
  '기한·금액',
  // 자산·서류
  '등록증',
  '제조·제원',
  '취득',
  '금융',
  '보험',
  '세금',
  'GPS',
  '수선·이력',
  '처분·매각',
  '매물',
  '문서',
] as const;

export type DetailSectionName = (typeof DETAIL_SECTIONS)[number];

/**
 * 차량360(components/vehicle-detail)의 대응 앵커.
 * 「360에는 그 섹션이 다 들어와 있다」를 코드로 붙들어 두는 자리 —
 * 원장 패널에서 360으로 건너뛸 때 어느 섹션으로 보낼지가 여기서 결정된다.
 * 대응이 없는 섹션은 아직 360에 전용 자리가 없다는 뜻(현황에 녹아 있음).
 */
export const DETAIL_SECTION_ANCHOR: Partial<Record<DetailSectionName, string>> = {
  '차량·상태': 'v-status',
  '계약': 'v-status',
  '계약자': 'v-status',
  '기간·인도': 'v-status',
  '요금·납부': 'v-schedule',
  '수납·리스크': 'v-schedule',
  '미수·종료': 'v-schedule',
  '등록증': 'v-reg',
  '제조·제원': 'v-reg',
  '취득': 'v-purchase',
  '금융': 'v-purchase',
  '보험': 'v-insurance',
  'GPS': 'v-gps',
  '수선·이력': 'v-work',
  '매물': 'v-product',
  '문서': 'v-docs',
};

/** 원장이 채우는 «섹션 → 컬럼 key» 배정표. 비었거나 없는 섹션은 그 원장이 안 쓰는 것. */
export type SectionKeyMap = Partial<Record<DetailSectionName, readonly string[]>>;

/**
 * 배정표 → 상세 섹션 정의. 순서는 `DETAIL_SECTIONS` 고정.
 * @param open 처음부터 펼칠 섹션. 없으면 첫 섹션.
 */
export function sectionDefs(map: SectionKeyMap, open?: DetailSectionName): DetailSectionDef[] {
  const used = DETAIL_SECTIONS.filter((name) => (map[name]?.length ?? 0) > 0);
  return used.map((name, index) => ({
    title: name,
    keys: map[name] as readonly string[],
    open: open ? name === open : index === 0,
  }));
}
