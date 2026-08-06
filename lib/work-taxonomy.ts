/** 업무 생성·필터·상세패널이 함께 쓰는 업무구분 SSOT. */
export const WORK_CATEGORIES = [
  '일정',
  '고객상담',
  '연락기록',
  '정비·수선',
  '사고',
  '검사',
  '세차',
  '보험',
  '자금',
  '부품교체',
  '수납이슈',
  '분쟁',
  '클레임',
  '문서',
  '메모',
  '기타',
  '과태료',
  // 2026-08-06 추가 — 실무자가 실제로 하는 자산 실행. 배차·처분은 담당·기한·진행상태가 붙는 일이다.
  '입출고',
  '매각·처분',
] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export function isWorkCategory(value: unknown): value is WorkCategory {
  return (WORK_CATEGORIES as readonly unknown[]).includes(value);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 업무분류 2단 (2026-08-06 사장님 확정) — 대분류 = **대상 축**「무엇에 대한 일인가」
 *
 * 왜 축을 하나로 잡는가: 종전 17개는 평면이라 축이 섞여 있었다 — `정비·수선`(차에 하는 일)·
 * `고객상담`(사람에게 하는 일)·`수납이슈`(돈)·`메모`(기록 방식)가 같은 레벨이었다.
 * 그러면 새 업무를 넣을 때 어디에 넣을지가 사람마다 달라지고, 탭이 18개가 되어 고를 수가 없다.
 *
 * 대상 축을 고른 이유: 원장(자산·계약·자금)과 축이 같아서 **대상별 필수 검증**이 자연스럽게 붙는다.
 * 차량 일에는 차량번호가, 계약·고객 일에는 계약이, 돈 일에는 금액이 반드시 있어야 한다.
 *
 * 세부(WORK_CATEGORIES 17개)는 그대로 둔다 — 기존 레코드의 `category` 를 건드리지 않는다.
 * 대분류는 세부에서 **파생**한다(저장하지 않는다). 파생이라 과거 데이터도 즉시 새 분류로 보인다.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 대분류 — 화면 탭·필터의 1단. 6축(사장님 확정 2026-08-06).
 *
 * ★축을 **원장과 같은 말**로 잡았다: 자산 · 계약 · 자금.
 *   업무는 데이터 3층의 ③이벤트이고, 이벤트는 결국 «어느 원장에 붙는가»로 갈린다.
 *   메뉴(자산관리·계약관리·자금관리)와 같은 이름을 쓰므로 «이 업무가 어디 것인지»를 배울 필요가 없다.
 *   + 과태료(전용 화면·엔티티가 따로 있어도 한 축) + 일정 + 기타.
 *
 * ★「일정」의 경계 규칙: **대상이 붙는 예약은 그 대상 축으로 간다.**
 *   검사 예약 = 자산 · 수납 약속 = 자금 · 방문 상담 = 계약.
 *   「일정」축은 **대상 없는 일정**(회의·출장·사내 약속)만 담는다.
 *   이 규칙이 없으면 «차량 검사 예약»이 자산인지 일정인지 사람마다 갈려 17개 평면 시절로 돌아간다.
 */
export const WORK_DIVISIONS = ['자산', '계약', '자금', '일정', '과태료', '기타'] as const;

export type WorkDivision = (typeof WORK_DIVISIONS)[number];

/**
 * 대분류 → 세부. 모든 세부는 정확히 한 대분류에 속한다(중복·누락 없음 — 테스트가 지킨다).
 * 옛 값(세차·부품교체·연락기록·클레임·분쟁)도 여기 남는다 — 매핑이 사라지면 과거 업무가 「기타」로 떨어진다.
 */
export const WORK_DIVISION_CATEGORIES: Record<WorkDivision, readonly WorkCategory[]> = {
  자산: ['정비·수선', '사고', '검사', '보험', '입출고', '매각·처분', '세차', '부품교체'],
  계약: ['고객상담', '연락기록', '분쟁', '클레임'],
  자금: ['수납이슈', '자금'],
  일정: ['일정'],
  과태료: ['과태료'],
  기타: ['문서', '메모', '기타'],
};

/**
 * **신규 생성에서 고를 수 있는 세부 — 필수 최소.** 여기서 늘려나간다.
 *
 * 왜 전부를 안 띄우는가: 17개를 다 띄우면 고르는 사람마다 다른 값을 고른다.
 * 특히 «고객상담/연락기록/클레임/분쟁» 은 상세 필드가 사실상 같아(work-cols.tsx 참조)
 * 이름만 넷이었다. 지금은 **고객상담 하나**로 받고, 정말 갈라야 할 필요가 생기면 그때 늘린다.
 * 세차·부품교체도 정비·수선의 유형(maintType '소모품교체')으로 충분해 뺐다.
 *
 * ★뺀 값도 **지워지지 않는다** — 이미 저장된 업무는 그 값 그대로 보이고 대분류도 정상 판정된다.
 *   목록에서 빠지는 것은 «새로 고를 때»뿐이다.
 */
export const WORK_CATEGORIES_ACTIVE = [
  '정비·수선', '사고', '검사', '보험',   // 자산 — 각각 전용 필드·만기관리가 다르다
  '입출고', '매각·처분',                  // 자산 — 실행(배차·처분). 담당·기한·진행이 붙는다
  '고객상담',                            // 계약 — 상담·연락·클레임·분쟁을 하나로 받는다
  '수납이슈', '자금',                     // 자금
  '일정',                                // 일정
  '과태료',                              // 과태료
  '문서', '메모', '기타',                 // 기타
] as const satisfies readonly WorkCategory[];

const DIVISION_BY_CATEGORY = new Map<string, WorkDivision>(
  (Object.entries(WORK_DIVISION_CATEGORIES) as Array<[WorkDivision, readonly WorkCategory[]]>)
    .flatMap(([division, cats]) => cats.map((c) => [c, division] as const)),
);

/** 세부 → 대분류. 모르는 값(옛 자유입력)은 「기타」로 — 조용히 사라지지 않고 눈에 띄는 자리. */
export function workDivisionOf(category: unknown): WorkDivision {
  return DIVISION_BY_CATEGORY.get(String(category || '')) || '기타';
}

export function isWorkDivision(value: unknown): value is WorkDivision {
  return (WORK_DIVISIONS as readonly unknown[]).includes(value);
}

/**
 * 대상별 필수 항목 — 대분류가 곧 「무엇에 대한 일인가」이므로 그 대상이 비면 업무가 떠 버린다.
 * (차량 일인데 차가 없으면 어느 차 이력에도 안 붙는다. 돈 일인데 금액이 없으면 자금계획에 안 잡힌다.)
 */
export const WORK_DIVISION_REQUIRED: Record<WorkDivision, readonly string[]> = {
  자산: ['plate'],
  계약: ['contractKey'],
  자금: ['amount'],
  일정: ['dueDate'],   // 대상 없는 일정이라 «언제»가 유일한 실체다. 날짜 없는 일정은 일정이 아니다.
  과태료: ['plate'],
  기타: [],
};

const REQUIRED_LABEL: Record<string, string> = {
  plate: '차량번호', contractKey: '계약(계약자)', amount: '금액', dueDate: '기한',
};

/** 비어 있는 필수 항목의 라벨. 저장 전 검증에 쓴다 — 없으면 [] . */
export function missingWorkRequirements(
  category: unknown,
  record: Record<string, unknown> | null | undefined,
): string[] {
  if (!record) return [];
  return WORK_DIVISION_REQUIRED[workDivisionOf(category)]
    .filter((key) => {
      const v = record[key];
      if (key === 'amount') return !(Number(v) > 0);
      return !String(v ?? '').trim();
    })
    .map((key) => REQUIRED_LABEL[key] || key);
}
