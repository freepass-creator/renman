/**
 * 자금 계정과목 — **실무 자금일보에서 추출한 SSOT** (docs/UPLOAD-FORMATS.md §3-4).
 *
 * 출처: `26년_스위치플랜_자금일보.xlsx` 4개 계좌 시트, 분류된 거래 1,793건 · 45종.
 * 상상해서 만든 목록이 아니라 **실무자가 실제로 써 온 말**이다. 이름을 바꾸면 과거 파일이 안 붙는다.
 *
 * 자동분류는 이 목록으로만 값을 낸다. 목록에 없으면 «미분류»로 두고 사람이 정하게 한다 —
 * 없는 과목을 지어내면 손익이 조용히 틀어진다.
 */

/** 자금 흐름의 성격 — 손익 집계에 들어가는지가 여기서 갈린다. */
export type MoneyNature =
  | '수익'      // 손익 +
  | '비용'      // 손익 −
  | '비손익';   // 계좌 간 이동·차입·보증금 등 — 손익에 넣으면 안 된다

export type AccountCategory = {
  /** 실무 표기 그대로. 이게 파일과 맞춰지는 키다. */
  name: string;
  nature: MoneyNature;
  /** 이 과목이면 차량번호가 있어야 하는가 (없으면 «분류 미완»으로 잡는다) */
  needsPlate?: boolean;
  /** 이 과목이면 임차인이 있어야 하는가 */
  needsTenant?: boolean;
  note?: string;
};

/* ★«자금이동»이 353건으로 2위다. 계좌 간 이동이라 **입금·출금이 쌍으로 잡힌다** —
   손익에 넣으면 매출도 비용도 두 배로 부푼다. 실무 자금일보가 이걸 따로 표시해 온 이유다. */
export const ACCOUNT_CATEGORIES: AccountCategory[] = [
  // ── 수익
  { name: '대여료', nature: '수익', needsPlate: true, needsTenant: true, note: '핵심 수익. 497건 전부 입금' },
  { name: 'CMS집금', nature: '수익', note: '자동이체 총액 1줄. 상세와 1:N 대사 필요(§2)' },
  { name: '카드자동집금', nature: '수익', note: 'PG 정산 입금. 실정산금액 기준(§3-2)' },
  { name: '위약금', nature: '수익', needsPlate: true },
  { name: '승계수수료', nature: '수익', needsPlate: true },
  { name: '차량매각 대금', nature: '수익', needsPlate: true },
  { name: '보험료 환급', nature: '수익', needsPlate: true },
  { name: '보험료 반환', nature: '수익', needsPlate: true },
  { name: '미수선보험료', nature: '수익', needsPlate: true },
  { name: '세금 환급', nature: '수익' },
  { name: '이자', nature: '수익' },
  { name: '잡이익', nature: '수익' },

  // ── 비용
  { name: '이체수수료', nature: '비용' },
  { name: '보험료', nature: '비용', needsPlate: true },
  { name: '보험료 선납', nature: '비용', needsPlate: true },
  { name: '보증보험료', nature: '비용' },
  { name: '차량관리비', nature: '비용', needsPlate: true },
  { name: '수수료', nature: '비용' },
  { name: '카드사용료', nature: '비용' },
  { name: '통신비', nature: '비용' },
  { name: '임차료', nature: '비용' },
  { name: '세금', nature: '비용' },
  { name: '기장료', nature: '비용' },
  { name: '급여', nature: '비용' },
  { name: '주유비', nature: '비용' },
  { name: '서류수수료', nature: '비용' },
  { name: '조합가입비', nature: '비용' },
  { name: '저당해지', nature: '비용', needsPlate: true },
  { name: '정산금', nature: '비용', note: '협력사 정산 지급' },
  { name: '증비불가잡손실', nature: '비용', note: '증빙 못 붙인 손실 — 세무상 별도 취급' },
  { name: '착오출금', nature: '비용' },

  // ── 비손익 (자금 이동·조달·예치)
  { name: '자금이동', nature: '비손익', note: '★계좌 간 이동. 입출금이 쌍으로 잡힌다 — 손익 집계에서 반드시 제외' },
  { name: '할부금', nature: '비손익', needsPlate: true, note: '원금 상환분 — 이자만 비용' },
  { name: '할부금 상환', nature: '비손익', needsPlate: true },
  { name: '중도상환', nature: '비손익', needsPlate: true },
  { name: '차입금', nature: '비손익' },
  { name: '차입금 상환', nature: '비손익' },
  { name: '운영자금대출', nature: '비손익' },
  { name: '출자금', nature: '비손익' },
  { name: '보증금', nature: '비손익', needsTenant: true, note: '받은 것 — 부채' },
  { name: '보증금 반환', nature: '비손익', needsTenant: true },
  { name: '차량구매비', nature: '비손익', needsPlate: true, note: '자산 취득 — 비용 아님' },
  { name: '오입금', nature: '비손익' },
  { name: '오입금 반환', nature: '비손익' },
  { name: '오입금 환급', nature: '비손익' },
];

const BY_NAME = new Map(ACCOUNT_CATEGORIES.map((c) => [c.name, c]));

/** 실무 표기로 조회. 목록에 없으면 undefined — **지어내지 않는다.** */
export function accountCategory(name: unknown): AccountCategory | undefined {
  return BY_NAME.get(String(name ?? '').trim());
}

/** 손익 집계에 넣을 거래인가. 모르는 과목은 **넣지 않는다**(조용히 부풀리는 것보다 빠지는 게 낫다). */
export function countsToPnl(name: unknown): boolean {
  const c = accountCategory(name);
  return !!c && c.nature !== '비손익';
}

/** 분류가 덜 됐는가 — 과목은 있는데 필수 연결값(차량·임차인)이 비었으면 «미완»이다. */
export function isUnderClassified(row: { category?: unknown; plate?: unknown; tenant?: unknown }): boolean {
  const c = accountCategory(row.category);
  if (!c) return true;
  if (c.needsPlate && !String(row.plate ?? '').trim()) return true;
  if (c.needsTenant && !String(row.tenant ?? '').trim()) return true;
  return false;
}

export const ACCOUNT_CATEGORY_NAMES = ACCOUNT_CATEGORIES.map((c) => c.name);
