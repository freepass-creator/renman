/**
 * 메인 화면 «문제 목록» SSOT.
 *
 * ## 사장님 지시 2026-08-09
 *   「목록은 **어떤 분류·어떤 구분·어떤 상태에서 문제가 뭔지 할 일이 뭔지**를 보여줘야 하고,
 *    그걸 누르면 360이 나온다.」
 *
 * ## 축
 *   **구분(group) = 어디 문제인가** — 미수 · 차량 · 재무. 리스크의 미완료/만기는 급한 정도라 여기 쓰지 않는다.
 *   **분류(kind)** = 그 안의 종류(검사·보험·회수단계). 보험만기·보험만료·보험만기 도래는 같은 말이라 한 칸만.
 *   문제 · 할 일 · 담당. 할 일은 여기서 번역. 담당은 열린 work_item(없으면 미배정).
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
import type { WorkLedgerRow } from './work-ledger';
import { LEDGER_EMPTY } from './ledger-empty';
import { scopedPlateKey, normPlate } from './plate';

export const HOME_GROUPS = ['미수', '차량', '재무'] as const;
export type HomeGroup = (typeof HOME_GROUPS)[number];

export type HomeWorkHint = Pick<WorkLedgerRow, 'plate' | 'companyId' | 'assignee' | 'status' | 'kind'>;

export type HomeProblem = {
  id: string;
  /** 구분 — 미수 · 차량 · 재무 */
  group: HomeGroup;
  /** 분류 — 검사 · 보험 · 내용증명(회수단계) … 같은 말은 한 번만 */
  kind: string;
  /** 상태 — 검사 경과 · 반납 지연 · 내용증명 … */
  status: string;
  /** 문제 — 무엇이 잘못됐나 */
  problem: string;
  /** 할 일 — 그래서 뭘 하나 */
  action: string;
  /** 담당 — 열린 업무의 담당자. 없으면 미배정 */
  assignee: string;
  company: string;
  /** 회사 스코프 키 — 업무 실체화(work_item.companyId)·근거키에 필요. */
  companyId: string;
  plate: string;
  /** 차명 — 목록 「계약자 · 차명」 칸. */
  carName: string;
  /** 원천 종류(risk row kind 원문) — 근거키·업무분류 판정용. 화면 표기는 kind. */
  rawKind: string;
  /** 신원 보조 — 계약자 등 */
  who: string;
  dueDate: string;
  dday: number | null;
  /** 연체일 원자 — 미납 행만(0=연체 아님). 미수의 «기한 칸»은 이것으로 D+n. */
  overdueDays: number;
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

/** 급한 정도가 아니라 «어디 돈·어디 차»인가. */
export function domainOf(row: Pick<RiskSheetRow, 'group' | 'kind'>): HomeGroup {
  if (row.group === '미납' || row.kind.includes('미수')) return '미수';
  if (row.kind === '세금 만기' || row.kind === '자금미분류' || row.kind === '과태료' || row.kind === '과태료 기한') {
    return '재무';
  }
  return '차량';
}

const TOPIC_BY_KIND: Record<string, string> = {
  검사만기: '검사',
  보험만기: '보험',
  '세금 만기': '자동차세',
  '과태료 기한': '과태료',
  과태료: '과태료',
  만기경과: '반납',
  만기임박: '반납',
  '반납·만기': '반납',
  인도예정: '인도',
  휴차: '휴차',
  사고: '사고',
  서류미첨부: '서류',
  자금미분류: '미분류',
  배차충돌: '배차',
};

/** 화면에 쓰는 분류. 미수는 회수단계가 분류다. */
export function topicOf(row: Pick<RiskSheetRow, 'group' | 'kind' | 'status'>): string {
  if (row.group === '미납' || row.kind.includes('미수')) return row.status || '미수';
  return TOPIC_BY_KIND[row.kind] || row.kind;
}

/** 보험만기 도래 · 보험만료 · 보험만기 → 같은 말. */
export function sameTalk(a: string, b: string): boolean {
  const key = (s: string) => String(s || '').replace(/[\s·\-]/g, '').replace(/도래|만료|만기|경과|임박|미필|대상|정기/g, '');
  const x = key(a);
  const y = key(b);
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** 차량이 있으면 360, 없으면 리스크 원장의 그 건. */
export function hrefFor(row: Pick<RiskSheetRow, 'plate' | 'id' | 'companyId'>): string {
  const plate = String(row.plate || '').trim();
  if (plate) return `/vehicle/${encodeURIComponent(plate)}`;
  return `/risk?open=${encodeURIComponent(row.id)}`;
}

function workKindFits(rowKind: string, workKind: string): boolean {
  if (!rowKind || !workKind) return false;
  return rowKind === workKind || rowKind.includes(workKind) || workKind.includes(rowKind);
}

/** 같은 회사·차량의 열린 업무에서 담당을 고른다. 분류가 겹치면 그걸 우선. */
export function assigneeFor(row: Pick<RiskSheetRow, 'plate' | 'companyId' | 'kind'>, work: HomeWorkHint[]): string {
  if (!normPlate(row.plate)) return LEDGER_EMPTY.unassigned;
  const key = scopedPlateKey(row.companyId, row.plate);
  const open = work.filter((w) => {
    if (!normPlate(w.plate) || !String(w.assignee || '').trim()) return false;
    if (w.status === '완료' || w.status === '보류') return false;
    return scopedPlateKey(w.companyId, w.plate) === key;
  });
  if (open.length === 0) return LEDGER_EMPTY.unassigned;
  const hit = open.find((w) => workKindFits(row.kind, w.kind)) || open[0];
  return String(hit.assignee).trim();
}

/**
 * 행 2줄 — 같은 말은 빼다. 할 일만은 항상 남긴다.
 */
export function problemFields(p: Pick<HomeProblem, 'kind' | 'status' | 'problem' | 'action'>): [string, string][] {
  const fields: [string, string][] = [];
  if (p.problem && !sameTalk(p.problem, p.kind) && !sameTalk(p.problem, p.status)) {
    fields.push(['문제', p.problem]);
  }
  if (p.status && p.status !== '미처리' && !sameTalk(p.status, p.kind) && !sameTalk(p.status, p.problem)) {
    fields.push(['상태', p.status]);
  }
  if (p.action) fields.push(['할 일', p.action]);
  return fields;
}

/**
 * 리스크 행 → 화면에 그대로 그릴 수 있는 문제 목록.
 * 급한 순(경과 → 임박 → 나머지), 같으면 금액 큰 순. 자르지 않는다(구분이 목록에서 사라지지 않게).
 */
export function buildHomeProblems(rows: RiskSheetRow[], work: HomeWorkHint[] = []): HomeProblem[] {
  const out = rows.map((r): HomeProblem => ({
    id: r.id,
    group: domainOf(r),
    kind: topicOf(r),
    status: r.status,
    problem: r.subject,
    action: actionFor(r),
    assignee: assigneeFor(r, work),
    company: r.company,
    companyId: r.companyId,
    plate: r.plate,
    carName: r.carName,
    rawKind: r.kind,
    who: r.customer,
    dueDate: r.dueDate,
    dday: r.dday,
    overdueDays: Number(r.overdueDays) || 0,
    amount: r.amount,
    href: hrefFor(r),
    urgent: (r.dday != null && r.dday < 0) || r.group === '미납' || r.group === '미완료',
  }));

  const rank = (p: HomeProblem) => (p.dday != null && p.dday < 0 ? 0 : p.group === '미수' ? 1 : p.dday != null ? 2 : 3);
  out.sort((a, b) => rank(a) - rank(b)
    || (a.dday ?? 9999) - (b.dday ?? 9999)
    || b.amount - a.amount);
  return out;
}

/** 구분별 건수 — 화면 상단 칩. 구분 고정 순. */
export function countByGroup(rows: HomeProblem[]): Array<{ group: string; n: number }> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.group, (m.get(r.group) || 0) + 1);
  return HOME_GROUPS.filter((g) => m.has(g)).map((group) => ({ group, n: m.get(group) || 0 }));
}
