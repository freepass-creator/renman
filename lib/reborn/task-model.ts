export type TaskOwner = 'company' | 'customer';
export type TaskCategory = 'collection' | 'contract' | 'vehicle' | 'document' | 'finance' | 'other';
export type TaskPriority = 1 | 2 | 3;

export type TaskSignal = {
  kind?: unknown;
  title?: unknown;
  detail?: unknown;
  amount?: unknown;
  dday?: number | null;
};

function sourceOf(signal: TaskSignal): string {
  return `${signal.kind ?? ''} ${signal.title ?? ''} ${signal.detail ?? ''}`.trim();
}

/** 회사가 처리할 누락과 임차인이 이행할 의무를 같은 규칙으로 분류한다. */
export function taskOwnerOf(signal: TaskSignal): TaskOwner {
  const source = sourceOf(signal);
  if (/미수|미납|납부약속|반납(?:임박|지남|요청)|자동차검사|검사(?:임박|경과|요청)/.test(source)) return 'customer';
  return 'company';
}

export function taskCategoryOf(signal: TaskSignal): TaskCategory {
  const source = sourceOf(signal);
  if (/미수|미납|수납/.test(source)) return 'collection';
  if (/자금|미분류|미매칭|입금|계좌|통장|CMS|카드/.test(source)) return 'finance';
  if (/서류|첨부|등록증|증빙|원본/.test(source)) return 'document';
  if (/계약|보험|면허|컴플라이언스/.test(source)) return 'contract';
  if (/휴차|배차|반납|검사|사고|만기|출고|인도/.test(source)) return 'vehicle';
  return 'other';
}

/** 미수·사고·입금불일치·경과 업무를 먼저, 장기휴차·만기임박·자료누락을 다음으로 둔다. */
export function taskPriorityOf(signal: TaskSignal): TaskPriority {
  const source = sourceOf(signal);
  const dday = signal.dday ?? null;
  if (
    (dday != null && dday < 0)
    || /미수|미납|사고|배차충돌|입금불일치|미매칭|자금미분류|오류|위험/.test(source)
  ) return 1;
  if (
    (dday != null && dday <= 7)
    || /장기휴차|휴차|만기|검사|보험|미첨부|등록증 없음|확인필요|배차|출고|인도/.test(source)
  ) return 2;
  return 3;
}

export function taskPriorityLabel(priority: TaskPriority): string {
  if (priority === 1) return '긴급';
  if (priority === 2) return '확인';
  return '일반';
}

export function taskDueLabel(dueDate: unknown, dday: number | null): string {
  const date = String(dueDate ?? '').slice(0, 10);
  if (date) return `기한 ${date}`;
  if (dday == null) return '';
  if (dday < 0) return `${Math.abs(dday)}일 경과`;
  if (dday === 0) return '오늘';
  return `D-${dday}`;
}

/** 원문 링크는 내부 경로나 http(s)만 허용한다. */
export function safeEvidenceHref(value: unknown): string | undefined {
  const href = String(value ?? '').trim();
  if (href.startsWith('/') || /^https?:\/\//i.test(href)) return href;
  return undefined;
}
