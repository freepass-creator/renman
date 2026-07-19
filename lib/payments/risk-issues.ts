/**
 * 리스크 이슈 자동 감지 — Contract 한 건에서 활성 이슈 배열을 동적 생성.
 *
 * 저장 X (RTDB에 별도 노드 없음). 페이지 로드 시 매번 계산.
 * 각 이슈는 "발생일" 기준 D+N으로 추적.
 *
 *   const issues = computeActiveIssues(contract, today);
 *   for (const i of issues) console.log(i.kind, i.issueDate, i.daysOverdue);
 */

import type { Contract, RiskIssue, RiskIssueKind } from './types';
import { isContractEnded } from './contract-lifecycle';

/** 미납 회차 중 가장 오래된 dueDate (없으면 undefined) */
function oldestUnpaidDueDate(c: Contract): string | undefined {
  const overdue = (c.schedules ?? []).filter((s) => s.status === '연체' || s.status === '부분납');
  if (overdue.length === 0) return undefined;
  return overdue.map((s) => s.dueDate).sort()[0];
}

function diffDays(fromYmd: string, toYmd: string): number {
  if (!fromYmd || !toYmd) return 0;
  const f = new Date(fromYmd).getTime();
  const t = new Date(toYmd).getTime();
  if (isNaN(f) || isNaN(t)) return 0;
  return Math.max(0, Math.round((t - f) / (1000 * 60 * 60 * 24)));
}

/**
 * Contract 1건의 활성 리스크 이슈 모두 반환.
 * 한 계약에 미납+과태료+검사지연 동시일 수 있어서 배열.
 * today: 'YYYY-MM-DD' 기준일 (보통 todayKr())
 */
export function computeActiveIssues(c: Contract, today: string): RiskIssue[] {
  const out: RiskIssue[] = [];

  // 1. 미납 — schedules에 연체/부분납 있음
  const unpaidDue = oldestUnpaidDueDate(c);
  if (unpaidDue) {
    out.push({
      contractId: c.id,
      kind: '미납',
      issueDate: unpaidDue,
      daysOverdue: diffDays(unpaidDue, today),
      amount: c.unpaidAmount ?? 0,
      meta: { unpaidSeqCount: c.unpaidSeqCount ?? 0 },
    });
  }

  // 2. 검사지연 — inspectionDueDate < today
  if (c.inspectionDueDate && c.inspectionDueDate < today) {
    out.push({
      contractId: c.id,
      kind: '검사지연',
      issueDate: c.inspectionDueDate,
      daysOverdue: diffDays(c.inspectionDueDate, today),
    });
  }

  // 3. 보험만료 — insuranceExpiryDate < today
  if (c.insuranceExpiryDate && c.insuranceExpiryDate < today) {
    out.push({
      contractId: c.id,
      kind: '보험만료',
      issueDate: c.insuranceExpiryDate,
      daysOverdue: diffDays(c.insuranceExpiryDate, today),
    });
  }

  // 4. 과태료 — hasViolations + violationSince
  if (c.hasViolations && c.violationSince) {
    out.push({
      contractId: c.id,
      kind: '과태료',
      issueDate: c.violationSince,
      daysOverdue: diffDays(c.violationSince, today),
    });
  }

  // 5. 면허 — customerLicenseStatus = 정지/취소/만료
  if (
    c.customerLicenseStatus === '정지' ||
    c.customerLicenseStatus === '취소' ||
    c.customerLicenseStatus === '만료'
  ) {
    out.push({
      contractId: c.id,
      kind: '면허',
      issueDate: (c.customerLicenseCheckedAt ?? today).slice(0, 10),
      daysOverdue: diffDays((c.customerLicenseCheckedAt ?? today).slice(0, 10), today),
      meta: { status: c.customerLicenseStatus },
    });
  }

  // 6. 시동제어 — engineDisabled (액션 자체도 이슈로 추적)
  if (c.engineDisabled && c.engineDisabledAt) {
    out.push({
      contractId: c.id,
      kind: '시동제어',
      issueDate: c.engineDisabledAt.slice(0, 10),
      daysOverdue: diffDays(c.engineDisabledAt.slice(0, 10), today),
      meta: { reason: c.engineDisabledReason ?? '' },
    });
  }

  // 7. 채권화 — status = '채권'
  if (c.status === '채권') {
    // 채권 전이일은 별도 필드 없음 — notes 또는 history에서 가져와야 하지만, 임시로 contractDate 또는 returnedDate
    out.push({
      contractId: c.id,
      kind: '채권화',
      issueDate: c.returnedDate ?? c.contractDate ?? today,
      daysOverdue: diffDays(c.returnedDate ?? c.contractDate ?? today, today),
    });
  }

  return out;
}

/** 가장 심각한 이슈 1건 — 우선순위 정렬용 */
export function pickPrimaryIssue(issues: RiskIssue[]): RiskIssue | null {
  if (issues.length === 0) return null;
  // 우선순위: 채권화 > 시동제어 > 미납 > 면허 > 보험만료 > 과태료 > 검사지연 > 등록증만료
  const RANK: Record<RiskIssueKind, number> = {
    '채권화': 100,
    '시동제어': 90,
    '내용증명': 85,
    '미납': 80,
    '면허': 70,
    '보험만료': 60,
    '사고': 55,
    '과태료': 50,
    '검사지연': 40,
    '등록증만료': 30,
  };
  return [...issues].sort((a, b) => (RANK[b.kind] ?? 0) - (RANK[a.kind] ?? 0) || b.daysOverdue - a.daysOverdue)[0];
}

/**
 * 시동제어 액션 필요? — D+3 이상 미납인데 아직 시동제어 안 한 상태
 *   D+3 진입 = 시동제어 D-1 (다음 날 해야 함)
 *   D+4 ~ D+9 = 시동제어 활성 상태여야 함 (안 했으면 지연)
 */
export function needsEngineLockAction(c: Contract, today: string): boolean {
  if (c.engineDisabled === true) return false;        // 이미 했으면 ok
  if (isContractEnded(c)) return false;
  const due = oldestUnpaidDueDate(c);
  if (!due) return false;
  return diffDays(due, today) >= 3;
}

/**
 * 내용증명 발송 액션 필요? — D+10 이상 미납인데 아직 내용증명 발송 안 한 상태
 *   history_entries 에서 category='법적조치' 또는 kind 관련 발송 기록 검색
 */
export function needsNoticeAction(
  c: Contract,
  today: string,
  noticeSentContractIds: Set<string>,
): boolean {
  if (noticeSentContractIds.has(c.id)) return false;  // 이미 발송했으면 ok
  if (c.status === '채권') return false;              // 채권 전이된 건 이미 진행
  const due = oldestUnpaidDueDate(c);
  if (!due) return false;
  return diffDays(due, today) >= 10;
}

/** 미납 SLA 단계 (D+N 기준) — 3·4·10·11 임계 */
export type LatePayStage =
  | '정상'
  | '경고'       // D+1~2
  | '시동제어D-1' // D+3 (다음날 시동제어 예정)
  | '시동제어'   // D+4~9
  | '내용증명'   // D+10 (계약해지 통보 + 회수 예정)
  | '회수가능';  // D+11+

export function computeLatePayStage(daysOverdue: number): LatePayStage {
  if (daysOverdue >= 11) return '회수가능';
  if (daysOverdue >= 10) return '내용증명';
  if (daysOverdue >= 4) return '시동제어';
  if (daysOverdue >= 3) return '시동제어D-1';
  if (daysOverdue >= 1) return '경고';
  return '정상';
}

/** 이슈 종류별 배지 색상 (UI 헬퍼) */
export const ISSUE_COLOR: Record<RiskIssueKind, 'red' | 'orange' | 'yellow' | 'gray'> = {
  '미납': 'red',
  '내용증명': 'red',
  '시동제어': 'red',
  '채권화': 'red',
  '면허': 'orange',
  '보험만료': 'orange',
  '사고': 'orange',
  '과태료': 'yellow',
  '검사지연': 'yellow',
  '등록증만료': 'yellow',
};

/** 이슈 종류별 아이콘용 짧은 라벨 */
export const ISSUE_LABEL: Record<RiskIssueKind, string> = {
  '미납': '미납',
  '내용증명': '내용증명',
  '시동제어': '시동제어',
  '채권화': '채권화',
  '면허': '면허',
  '보험만료': '보험만료',
  '사고': '사고',
  '과태료': '과태료',
  '검사지연': '검사지연',
  '등록증만료': '등록증',
};
