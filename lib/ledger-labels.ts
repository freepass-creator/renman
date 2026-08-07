/**
 * 원장 «용어 사전» — SSOT.
 *
 * ## 왜 있나
 *   같은 데이터를 페이지마다 다른 이름으로 부르면 화면을 옮길 때마다 다시 찾아야 한다.
 *   예전에는 라벨이 전부 문자열 리터럴이라 「회사명」이 9군데에 따로 박혀 있었고,
 *   한 곳을 고쳐도 나머지 8곳이 따라오지 않았다. 일정 원장만 「차량」, 자산만 「차대번호(VIN)」,
 *   운영만 「이율」 — 이런 어긋남을 아무도 못 잡았다(주석에만 규격이 있고 코드엔 없었으므로).
 *
 * ## 규칙
 *   1) **두 개 이상의 원장이 쓰는 라벨은 반드시 여기 있어야 한다.**
 *      `tests/ledger-vocabulary.test.ts` 가 강제한다 — 공유 라벨을 리터럴로 새로 박으면 빨간불.
 *   2) 한 원장에서만 쓰는 라벨(자산 「제원관리번호」 등)은 그 원장 카탈로그에 그대로 둔다.
 *      나중에 두 번째 원장이 쓰기 시작하면 그때 여기로 올린다.
 *   3) 「X분류 / X상태」 규격(리스크분류·업무상태…)은 **원장 이름이 접두로 붙는 게 정상**이라
 *      공유 대상이 아니다. 그건 각 원장 카탈로그의 몫.
 *
 * ## 쓰는 법
 *   `{ key: 'plate', label: LEDGER_LABEL.plate, … }`
 */
export const LEDGER_LABEL = {
  /* 신원 */
  company: '회사명',
  plate: '차량번호',
  carName: '차명',
  contractNo: '계약번호',
  contractor: '계약자',
  phone: '연락처',

  /* 차량 제원 */
  maker: '제조사',
  modelLine: '모델',
  subModel: '세부모델',
  modelYear: '연식',
  vin: '차대번호',
  mileage: '주행거리',

  /* 계약 */
  rentalType: '계약분류',
  contractState: '계약상태',
  term: '계약기간',
  monthlyRent: '월대여료',
  paymentDay: '결제일',
  paymentTiming: '납부시기',

  /* 돈 */
  amount: '금액',
  overdueDays: '연체일',
  unpaidCount: '미납회차',

  /* 기한 */
  due: '기한',
  dday: 'D-day',

  /* 자산 */
  lifecycle: '자산분류',
  assetStatus: '자산상태',
  acqDate: '취득일',
  acqPrice: '매입가',

  /* 금융·보험 */
  loanPrincipal: '할부원금',
  loanMonths: '할부개월',
  loanRate: '연이율',
  insurer: '보험사',
  insuranceExpiry: '보험만기',

  /* 관제·정비 */
  engineControl: '시동제어',
  maintCost: '정비비누계',
  maintVsAvg: '평균대비',
  maintCount: '정비건수',
  maintLastDate: '최근정비',

  /* 업무 */
  workCategory: '업무분류',
} as const;

export type LedgerLabel = (typeof LEDGER_LABEL)[keyof typeof LEDGER_LABEL];

/** 사전에 등록된 용어 집합 — 테스트가 «공유 라벨인데 사전에 없다»를 잡는 데 쓴다. */
export const LEDGER_LABEL_VALUES: ReadonlySet<string> = new Set(Object.values(LEDGER_LABEL));
