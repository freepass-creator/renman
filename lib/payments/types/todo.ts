// jpkerp5 — 연락 기록 / 수동 할 일 / 달력 스케줄 타입

/** 연락 기록 (미수관리) */
export type ContactLog = {
  id: string;
  contractId: string;
  at: string;
  method: '전화' | '문자' | '방문' | '카톡' | '메모';
  by?: string;
  response?: string;
  nextPromise?: string;        // 다음 약속일
  notes?: string;
};

/** 할 일 담당자 1명 — 각자 인지·완료 상태 보유 */
export type ManualTodoAssignee = {
  name: string;
  ack?: string;          // ISO — 인지 시각 (확인했음)
  done?: string;         // ISO — 완료 시각
};

/** 달력 수동 스케줄 — 자동 집계(만기/반납/신규) 외 사용자가 직접 등록하는 일정 */
export type ManualSchedule = {
  id: string;
  date: string;          // YYYY-MM-DD
  title: string;
  time?: string;         // HH:MM (선택)
  done?: boolean;        // 처리 완료 여부
  doneAt?: string;       // 완료 ISO
  notes?: string;
  createdAt: string;
  createdBy?: string;
};

/** 할 일 후속 기록 1건 — 진행 상황·통화·메모 */
export type ManualTodoFollowup = {
  id: string;
  at: string;            // ISO
  by: string;            // 작성자명 (자유 텍스트)
  note: string;
};

/** 수동 입력 할 일 — 대시보드 공유 칠판 보드. 자동 업무는 달력에서 처리 */
export type ManualTodo = {
  id: string;
  title: string;
  priority: 'high' | 'mid' | 'low';
  assignees: ManualTodoAssignee[];   // 복수 담당자 (빈 배열 가능)
  followups?: ManualTodoFollowup[];   // 후속 진행 기록
  dueDate?: string;        // YYYY-MM-DD
  doneAt?: string;         // 전체 완료 시각 (모든 담당자 완료 시 자동 또는 수동 일괄 처리)
  createdAt: string;
  createdBy?: string;
  notes?: string;
};
