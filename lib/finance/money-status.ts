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
import { requiresContractLink } from '@/lib/finance/cash-rules';

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
 *   ② 계정과목이 없으면 미분류(무슨 돈인지 모르면 매칭도 무의미).
 *   ③ 입금이 아니면(지출·이체) 계약에 붙을 수납이 아니다 → 해당없음.
 *   ④ 계약성 입금에 실제 계약·회차가 붙었을 때만 매칭완료다.
 */
export function moneyStatusOf(input: MoneyStatusInput): MoneyStatus {
  const matched = !!input.matchedContractId || !!input.matchedScheduleSeq;

  // CMS — 명세와 통장 집금이 짝지어졌는지가 먼저.
  if (input.isCmsItem) return matched ? '매칭완료' : '집금대기';
  if (input.isCmsDeposit) return input.cmsSettled ? '매칭완료' : '집금대기';

  if (isUnclassified(input.category)) return '미분류';

  const inAmt = Number(input.inAmount) || 0;
  const kind = kindOfLabel(String(input.category || ''));
  // 입금이 아니거나 계정과목이 지출·이체면 계약에 붙을 돈이 아니다.
  if (inAmt <= 0 || kind === '지출' || kind === '이체') return '해당없음';
  if (matched) return '매칭완료';
  // 대출금·환급·캐시백·잡이익 같은 일반 수입은 계약 수납이 아니다.
  // «미매칭»으로 두면 직원에게 존재하지 않는 계약을 찾게 하고 오연결을 유도한다.
  if (!requiresContractLink(input.category)) return '해당없음';

  return input.hasProposal ? '제안있음' : '미매칭';
}

/**
 * 자금분류 — «뭐로 입금·출금됐는가». 행 문법 4번 칸.
 *
 * ★근거는 사장님이 실제로 쓰는 자금일보 실데이터다
 *   (`26년_스위치플랜_자금일보.xlsx` 4계좌 2,837건 · 「적요」 컬럼 33종).
 *   적요는 은행이 찍는 «거래 채널 코드»다 — BZ뱅크(938) · FB자금(292) · FB이체(281) ·
 *   타행MB(265) · CM보험(209) · 타행IB(176) · BZ수수(165) · 타행FB(124) · FB자동(106) ·
 *   CMS지(67) · 타행PC(64) · FB통신(24) · 타행CD(21) · 통지CC(14) · 카드결(11) …
 *
 *   33종을 그대로 필터·집계에 쓰면 흩어져서 못 쓴다 → «묶음»이 자금분류이고,
 *   원문 적요는 별도 「적요」 칸에 그대로 남긴다(근거 보존 · 정보 손실 없음).
 *   계정과목(무슨 돈인가)과는 다른 축이며 절대 같은 칸에 담지 않는다.
 */
export const MONEY_CLASS = ['이체', '자동이체', 'CD·ATM', '카드', '수수료', '현금', '기타'] as const;
export type MoneyClass = (typeof MONEY_CLASS)[number];

/** 배지 톤 — 분류는 신호가 아니므로 중립. 색 신호는 자금상태 배지가 담당한다. */
export const MONEY_CLASS_TONE: Record<MoneyClass, 'gray' | 'blue'> = {
  이체: 'gray', 자동이체: 'blue', 'CD·ATM': 'gray', 카드: 'gray', 수수료: 'gray', 현금: 'gray', 기타: 'gray',
};

/**
 * 적요(은행 채널 코드) → 자금분류. 실데이터 33종 전수 기준.
 * 새 적요가 나타나면 '기타'로 떨어지고 화면에서 눈에 띈다(조용히 삼키지 않는다).
 */
const CLASS_BY_JEOKYO: Record<string, MoneyClass> = {
  // 인터넷·모바일·펌뱅킹 이체
  BZ뱅크: '이체', FB이체: '이체', FB자금: '이체', 타행IB: '이체', 타행FB: '이체',
  타행MB: '이체', 타행PC: '이체', OP이체: '이체', 모바일: '이체', 타행환: '이체', 입금: '이체',
  'E-신한은행': '이체',
  // 자동이체·자동집금(CMS)
  CMS지: '자동이체', 통지CC: '자동이체', FB자동: '자동이체', CM보험: '자동이체',
  FB통신: '자동이체', 통신: '자동이체', 의보: '자동이체', 연금: '자동이체', 지로: '자동이체',
  국세: '자동이체', 조합비: '자동이체',
  // CD·ATM
  타행CD: 'CD·ATM', 효성CD: 'CD·ATM', CD송금: 'CD·ATM', CD이체: 'CD·ATM',
  // 카드
  카드결: '카드', 금결PG: '카드', NH카드대금: '카드',
  // 수수료·이자
  BZ수수: '수수료', 수수료: '수수료', 이자: '수수료', 서비스: '수수료',
  // 현금
  현금: '현금',
};

export function moneyClassOf(input: {
  /** 은행 적요(원문). 실데이터의 「적요」 컬럼. */
  jeokyo?: unknown;
  /** 적요가 없는 경로(수동 수납 등)의 수단 문자열. */
  source?: unknown;
  isCms?: boolean;
  isCard?: boolean;
}): MoneyClass {
  const j = String(input.jeokyo || '').trim();
  if (j) {
    /* 적요가 있으면 그것이 근거다 — 은행이 찍은 값이므로 source 추측보다 정확하다.
       ★모르는 적요는 «기타»로 떨어뜨린다. source 폴백으로 흘려보내면 «이체»로 조용히 분류돼
         새 채널 코드가 생긴 사실이 묻힌다(실데이터 33종이므로 새 값이 나올 수 있다). */
    return CLASS_BY_JEOKYO[j] || '기타';
  }
  if (input.isCms) return '자동이체';
  if (input.isCard) return '카드';
  const src = String(input.source || '').trim();
  if (src === '현금') return '현금';
  if (src === 'CMS') return '자동이체';
  if (src === '카드') return '카드';
  if (src === '계좌' || src === '이체' || src === '') return '이체';
  return '기타';
}

/**
 * 계정과목 표기 정규화 — 실데이터 65종에 같은 뜻 다른 표기가 섞여 있다.
 *   「오입금 반환」·「착오입금 반환」·「착오입금반환」·「오입금 환급」 이 각각 별개 값이고
 *   「차량매각 대금」/「차량매각대금」, 「증비불가잡손실」/「증빙불가」, 「할부금」/「할부금 상환」도 갈라져 있다.
 * 정규화하지 않으면 집계가 흩어져 손익·자금계획이 틀린다.
 * ★원문은 버리지 않는다 — 화면·엑셀에는 정규화 값을 쓰고 원문은 상세에서 확인할 수 있게 남긴다.
 */
const SUBJECT_ALIASES: Record<string, string> = {
  '착오입금 반환': '오입금 반환', 착오입금반환: '오입금 반환', '오입금 환급': '오입금 반환',
  '과입금 환급': '오입금 반환', 착오입금: '오입금', '계약취소반환': '오입금 반환',
  '착오출금 환급': '착오출금 반환', '착오출금 반환': '착오출금 반환',
  차량매각대금: '차량매각 대금',
  증비불가잡손실: '증빙불가', 증빙불가: '증빙불가',
  '할부금 상환': '할부금',
  '보험료 반환': '보험료 환급', '보험료 수취': '보험료 환급',
  '세금 환급': '세금 환급',
};

/** 계정과목 원문 → 정규화 라벨. 모르는 값은 원문 그대로(조용히 버리지 않는다). */
export function normalizeSubject(raw: unknown): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  return SUBJECT_ALIASES[v] || v;
}
