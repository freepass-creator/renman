/**
 * 자금분류 · 자금상태 — 정의 SSOT.
 *
 * 사장님 확정: 「자금일보에는 CMS든 뭐든 그냥 입금 출금에 대한 모든게 다 있는거임 ·
 *              뭘로 입금됐든지 같은 페이지에 구분해서 분류 상태를 확실하게 정의해주길 바람」
 *
 * ── 세 축을 섞지 않는다 (사장님 정의) ──────────────────────────────
 *   ① 자금분류 = «뭐로 입금됐는가»      → 계좌이체 · CMS · 법인카드 · 현금 (MONEY_CLASS)
 *   ② 자금상태 = «매칭됐는가»           → 아래 MONEY_STATUS 6단계. 이 파일이 유일한 정의처.
 *   ③ 계정과목 = «그 돈이 무슨 돈인가»  → lib/payments/ledger-subjects.ts (대여료수입·보험료 …)
 *                                        회계 용어이므로 라벨을 「계정과목」 그대로 쓴다.
 * 수단이 무엇이든 같은 표에 있고, 구분은 ①이 한다 — 「자금일보에는 CMS든 뭐든 다 있는거임」.
 * ★①과 ③을 같은 칸에 담지 않는다. «어떻게 들어왔나»와 «무슨 돈인가»는 다른 질문이다.
 *
 * ★이전 구현(lib/finance/cash-cols.tsx matchStatus)은 상태가 3개(매칭완료·미매칭·해당없음)뿐이라
 *   «계정과목이 안 붙은 돈»과 «분류는 됐지만 계약에 안 붙은 돈»이 똑같이 «미매칭»으로 보였다.
 *   그 둘은 해야 할 일이 다르다 — 앞은 분류 작업, 뒤는 매칭 작업.
 */
import { isUnclassified, kindOfLabel } from '@/lib/payments/ledger-subjects';

/** 처리 단계 — 앞에 있는 것부터 처리한다(정렬 우선순위와 동일). */
export const MONEY_STATUS = [
  '미분류',    // 계정과목이 없다 → 이 돈이 무슨 돈인지부터 정해야 한다
  '집금대기',  // CMS 명세인데 통장 집금과 연결되지 않았다
  '미매칭',    // 분류는 됐고 계약에 붙을 돈인데 아직 안 붙었다
  '제안있음',  // 자동매칭 후보가 있다 → 사람이 확인만 하면 된다
  '매칭완료',  // 계약 회차에 붙었다
  '해당없음',  // 계약에 붙을 돈이 아니다(지출·계좌간이체 등)
] as const;
export type MoneyStatus = (typeof MONEY_STATUS)[number];

export const MONEY_STATUS_ORDER: Record<MoneyStatus, number> =
  Object.fromEntries(MONEY_STATUS.map((s, i) => [s, i])) as Record<MoneyStatus, number>;

/** 배지 톤 — 손이 필요한 것일수록 강하게. 상태 신호는 배지 색으로만(행 틴트 금지). */
export const MONEY_STATUS_TONE: Record<MoneyStatus, 'red' | 'amber' | 'blue' | 'green' | 'gray'> = {
  미분류: 'red',
  집금대기: 'amber',
  미매칭: 'amber',
  제안있음: 'blue',
  매칭완료: 'green',
  해당없음: 'gray',
};

/** 사람이 손을 대야 하는 상태인가 — 자금일보의 «할 일» 카운트. */
export function moneyStatusNeedsWork(status: MoneyStatus): boolean {
  return status === '미분류' || status === '집금대기' || status === '미매칭' || status === '제안있음';
}

export type MoneyStatusInput = {
  /** 계정과목 라벨(category). 없거나 '(미분류)'면 미분류. */
  category?: unknown;
  /** 입금액(원). 0 이하면 입금이 아니다. */
  inAmount?: number;
  /** 출금액(원). */
  outAmount?: number;
  /** 계약 매칭 여부 — matchedContractId 또는 matchedScheduleSeq. */
  matchedContractId?: unknown;
  matchedScheduleSeq?: unknown;
  /** CMS 명세행인가(통장 집금과 짝지어야 하는 것). */
  isCmsItem?: boolean;
  /** CMS 집금(통장) 행인가. */
  isCmsDeposit?: boolean;
  /** CMS 정산 완료 표식(settlementRole === 'deposit'). */
  cmsSettled?: boolean;
  /** 자동매칭 제안이 걸려 있는가 — 화면이 계산해 넘긴다. */
  hasProposal?: boolean;
};

/**
 * 자금상태 판정 — 단일 정의처.
 *
 * 판정 순서에 의미가 있다: «먼저 해야 할 일»이 앞에 온다.
 *   ① CMS 짝짓기(집금대기)는 계정과목보다 먼저다 — 짝이 맞아야 금액이 확정된다.
 *   ② 매칭완료면 더 볼 것이 없다.
 *   ③ 계정과목이 없으면 미분류(무슨 돈인지 모르면 매칭도 무의미).
 *   ④ 입금이 아니면(지출·이체) 계약에 붙을 돈이 아니다 → 해당없음.
 */
export function moneyStatusOf(input: MoneyStatusInput): MoneyStatus {
  const matched = !!input.matchedContractId || !!input.matchedScheduleSeq;

  // CMS — 명세와 통장 집금이 짝지어졌는지가 먼저.
  if (input.isCmsItem) return matched ? '매칭완료' : '집금대기';
  if (input.isCmsDeposit) return input.cmsSettled ? '매칭완료' : '집금대기';

  if (matched) return '매칭완료';
  if (isUnclassified(input.category)) return '미분류';

  const inAmt = Number(input.inAmount) || 0;
  const kind = kindOfLabel(String(input.category || ''));
  // 입금이 아니거나 계정과목이 지출·이체면 계약에 붙을 돈이 아니다.
  if (inAmt <= 0 || kind === '지출' || kind === '이체') return '해당없음';

  return input.hasProposal ? '제안있음' : '미매칭';
}

/**
 * 자금분류 — «뭐로 입금됐는가». 행 문법 4번 칸.
 * 계정과목(무슨 돈인가)과 다른 축이며, 절대 같은 칸에 담지 않는다.
 */
export const MONEY_CLASS = ['계좌이체', 'CMS', '법인카드', '현금', '기타'] as const;
export type MoneyClass = (typeof MONEY_CLASS)[number];

/** 배지 톤 — 분류는 신호가 아니므로 중립. 색 신호는 자금상태 배지가 담당한다. */
export const MONEY_CLASS_TONE: Record<MoneyClass, 'gray' | 'blue'> = {
  계좌이체: 'gray', CMS: 'blue', 법인카드: 'gray', 현금: 'gray', 기타: 'gray',
};

export function moneyClassOf(input: { isCms?: boolean; isCard?: boolean; source?: unknown }): MoneyClass {
  if (input.isCms) return 'CMS';
  if (input.isCard) return '법인카드';
  const src = String(input.source || '');
  if (src === '현금') return '현금';
  if (src === 'CMS') return 'CMS';
  if (src === '카드') return '법인카드';
  if (src === '계좌' || src === '이체' || src === '') return '계좌이체';
  return '기타';
}
