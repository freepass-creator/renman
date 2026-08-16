/**
 * 메인 화면 «문제 목록» SSOT.
 *
 * ## 사장님 지시 2026-08-09
 *   「목록은 **어떤 분류·어떤 구분·어떤 상태에서 문제가 뭔지 할 일이 뭔지**를 보여줘야 하고,
 *    그걸 누르면 360이 나온다.」
 *
 * ## 5축
 *   구분(group) · 분류(kind) · 상태(status) · 문제(problem) · **할 일(action)**
 *   앞 4개는 리스크 원장이 이미 갖고 있다(lib/risk-ledger) — 다시 만들지 않는다.
 *   여기서 더하는 것은 **할 일 하나**뿐이다.
 *
 * ## 왜 할 일이 따로 필요한가
 *   「만기경과」는 문제고, 「반납 받기」는 할 일이다. 문제만 보여 주면 사용자가
 *   매번 «그래서 뭘 하지»를 스스로 번역해야 한다. 그 번역을 시스템이 한다.
 *
 * ## 링크
 *   차량이 붙은 건은 **360**으로 보낸다(그 자산의 모든 정보·이력).
 *   차량이 없는 건(자금 미분류 등)만 해당 원장으로 보낸다.
 */
import type { RiskSheetRow } from './risk-ledger';

export type HomeProblem = {
  id: string;
  /** 구분 — 미완료 · 미납 · 만기 · 휴차 */
  group: string;
  /** 분류 — 만기경과 · 검사만기 · 계약유지 미수 … */
  kind: string;
  /** 상태 — 검사 경과 · 반납 지연 · 내용증명 … */
  status: string;
  /** 문제 — 무엇이 잘못됐나 */
  problem: string;
  /** 할 일 — 그래서 뭘 하나 */
  action: string;
  company: string;
  plate: string;
  /** 신원 보조 — 계약자 등 */
  who: string;
  dueDate: string;
  dday: number | null;
  amount: number;
  /** 누르면 갈 곳. 차량이 있으면 360. */
  href: string;
  urgent: boolean;
};

/**
 * 분류 → 할 일. 「무엇이 잘못됐나」를 「그래서 뭘 하나」로 옮긴다.
 * ★미수는 회수단계마다 조치가 달라서 여기서 고정하지 않는다 — 원장이 실은 status 를 쓴다.
 */
const ACTION_BY_KIND: Record<string, string> = {
  만기경과: '반납 받기',
  만기임박: '반납 안내',
  '반납·만기': '반납 받기',
  인도예정: '인도 처리',
  검사만기: '정기검사 예약',
  보험만기: '보험 갱신',
  '세금 만기': '자동차세 납부',
  '과태료 기한': '과태료 납부',
  과태료: '과태료 처리',
  서류미첨부: '등록증 올리기',
  자금미분류: '자금 분류',
  배차충돌: '배차 기간 조정',
  휴차: '가동 계획 세우기',
  사고: '사고 처리',
};

/** 미수는 회수단계(status)가 곧 다음 조치의 근거다. */
const ACTION_BY_COLLECTION_STAGE: Record<string, string> = {
  회수대기: '입금 확인',
  '계약조건 확인': '연체조항 확인·등록',
  경고: '연체 통보',
  시동제어: '시동 제어',
  차량회수: '차량 회수',
  내용증명: '내용증명 발송',
  채권화: '법적조치·채권화',
};

export function actionFor(row: Pick<RiskSheetRow, 'kind' | 'status' | 'group'>): string {
  if (row.group === '미납') {
    return ACTION_BY_COLLECTION_STAGE[row.status] || '회수 진행';
  }
  return ACTION_BY_KIND[row.kind] || '확인';
}

/** 차량이 있으면 360, 없으면 리스크 원장의 그 건. */
export function hrefFor(row: Pick<RiskSheetRow, 'plate' | 'id' | 'companyId'>): string {
  const plate = String(row.plate || '').trim();
  if (plate) return `/vehicle/${encodeURIComponent(plate)}`;
  return `/risk?open=${encodeURIComponent(row.id)}`;
}

/**
 * 리스크 행 → 화면에 그대로 그릴 수 있는 문제 목록.
 * 급한 순(경과 → 임박 → 나머지), 같으면 금액 큰 순.
 */
export function buildHomeProblems(rows: RiskSheetRow[], cap = 40): HomeProblem[] {
  const out = rows.map((r): HomeProblem => ({
    id: r.id,
    group: r.group,
    kind: r.kind,
    status: r.status,
    problem: r.subject,
    action: actionFor(r),
    company: r.company,
    plate: r.plate,
    who: r.customer,
    dueDate: r.dueDate,
    dday: r.dday,
    amount: r.amount,
    href: hrefFor(r),
    urgent: (r.dday != null && r.dday < 0) || r.group === '미납' || r.group === '미완료',
  }));

  const rank = (p: HomeProblem) => (p.dday != null && p.dday < 0 ? 0 : p.group === '미납' ? 1 : p.dday != null ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b)
    || (a.dday ?? 9999) - (b.dday ?? 9999)
    || b.amount - a.amount);
  return out.slice(0, cap);
}

/** 구분별 건수 — 화면 상단 칩. */
export function countByGroup(rows: HomeProblem[]): Array<{ group: string; n: number }> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.group, (m.get(r.group) || 0) + 1);
  return [...m].map(([group, n]) => ({ group, n }));
}
