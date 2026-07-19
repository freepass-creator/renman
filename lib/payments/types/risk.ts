// jpkerp5 — 리스크 이슈 타입 (계약별 "발생일" 기준 D+N 추적)

/** 리스크 이슈 — 각 이슈는 "발생일" 기준 D+N으로 추적 */
export type RiskIssueKind =
  | '미납'        // schedules에 연체/부분납 있음 — 발생일 = 가장 오래된 미납 회차 dueDate
  | '검사지연'    // inspectionDueDate < today — 발생일 = inspectionDueDate
  | '보험만료'    // insuranceExpiryDate < today — 발생일 = insuranceExpiryDate
  | '등록증만료'  // (Vehicle 측 데이터) — 발생일 = registrationExpiry
  | '과태료'      // hasViolations + violationSince — 발생일 = violationSince
  | '면허'        // customerLicenseStatus = 정지/취소/만료
  | '사고'        // 사고 미해결 — 발생일 = 사고 접수일
  | '시동제어'    // engineDisabled = true — 발생일 = engineDisabledAt
  | '내용증명'    // 발송 후 미해결 — 발생일 = 발송일 (history_entries)
  | '채권화';     // status = '채권' — 발생일 = 채권 전이일

export type RiskResolveKind = '정상화' | '회수' | '매각' | '면제' | '기간연장';

export type RiskIssue = {
  contractId: string;
  kind: RiskIssueKind;
  issueDate: string;             // YYYY-MM-DD — 발생한 날짜 ⭐
  daysOverdue: number;           // today - issueDate (자동 계산)
  // 부가 정보 (이슈별)
  amount?: number;               // 금액 (미납·과태료 등)
  meta?: Record<string, string | number | boolean>;
  // 종결 (resolvedAt 있으면 종결, 없으면 진행중)
  resolvedAt?: string;
  resolvedKind?: RiskResolveKind;
  resolvedNote?: string;
};
