/**
 * 업무관리 행 타입·순수 헬퍼 SSOT.
 * 열 정의 = lib/work-cols.tsx · 생성 섹션 = lib/work-form-sections.ts
 */
import type { EntityRecord } from '@/lib/intake/entities';
import type { PenaltyKind, PenaltyProcess } from '@/lib/penalty-work';
import type { WorkGroup } from '@/lib/work-form-sections';
import { rentalTypeOf } from '@/lib/schema/contract';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { WORK_CATEGORIES } from '@/lib/work-taxonomy';

export type WorkGroupFilter = '전체' | WorkGroup;
export type WorkSource = 'work_item' | 'history' | 'penalty' | 'inbox';
/** 업무 상태 SSOT — 미분류는 업무구분(분류) 미지정값이지 상태 아님. */
export type WorkStatus = '대기' | '진행' | '완료' | '보류' | '미배정';
export type WorkDueState = '기한없음' | '기한경과' | '오늘' | '임박' | '예정' | '종결';

export type WorkLedgerRow = {
  id: string;
  company: string;
  companyId: string;
  kind: string;
  group: WorkGroup;
  /** 검색용 합본 */
  target: string;
  title: string;
  workAt: string;
  workDate: string;
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  status: WorkStatus | string;
  assignee: string;
  amount: number;
  source: WorkSource;
  nest?: 'penalty-bucket';
  plate?: string;
  carName?: string;
  contractKey?: string;
  contractNo?: string;
  /** 계약자명 — 신원 컬럼 */
  customerName?: string;
  /** 대여형태 — 계약자 sub */
  rentalType?: string;
  priority?: string;
  violationDate?: string;
  driverName?: string;
  penaltyKind?: PenaltyKind;
  process?: PenaltyProcess;
  matched?: boolean;
  count?: number;
  openCount?: number;
  raw: EntityRecord;
};

export const WORK_GROUPS: WorkGroupFilter[] = ['전체', ...WORK_CATEGORIES];

export const WORK_SOURCE_LABEL: Record<WorkSource, string> = {
  work_item: '업무',
  history: '이력',
  penalty: '과태료',
  inbox: '문서함',
};

export function carNameOf(plate: string, vehicles: EntityRecord[]): string {
  if (!plate) return '';
  const v = vehicles.find((x) => String(x.plate || '') === plate);
  return v ? String(v.carName || v.model || '') : '';
}

export function contractMeta(
  contractKey: string,
  contracts: EntityRecord[],
): { customerName: string; contractNo: string; rentalType: string; plate: string } {
  if (!contractKey) return { customerName: '', contractNo: '', rentalType: '', plate: '' };
  const c = contracts.find((x) => String(x._key || '') === contractKey);
  if (!c) return { customerName: '', contractNo: '', rentalType: '', plate: '' };
  return {
    customerName: String(c.contractorName || ''),
    contractNo: String(c.contractNo || ''),
    rentalType: rentalTypeOf(c),
    plate: String(c.plate || ''),
  };
}

/** ISO → MM-DD HH:mm (시:분까지). 날짜만 있으면 MM-DD. */
export function fmtStamp(iso: string): string {
  if (!iso) return LEDGER_EMPTY.dash;
  const m = String(iso).replace('T', ' ').match(/(?:\d{4}-)?(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return LEDGER_EMPTY.dash;
  return m[3] != null ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : `${m[1]}-${m[2]}`;
}

/** 원천 status → 대기·진행·완료·보류·미배정. '미분류'는 상태로 쓰지 않음. */
export function normalizeWorkStatus(raw: unknown, done?: boolean): WorkStatus {
  if (done || raw === 'completed' || raw === true) return '완료';
  const s = String(raw ?? '').trim();
  if (!s || s === '미분류') return '대기';
  if (/완료|종결/.test(s)) return '완료';
  if (/보류|취소/.test(s)) return '보류';
  if (/미배정/.test(s)) return '미배정';
  if (/진행/.test(s)) return '진행';
  if (/대기|접수|예정|todo|waiting/.test(s)) return '대기';
  return '대기';
}

/**
 * 수집함 문서의 업무 상태.
 * 차량번호는 연결 대상 중 하나일 뿐이므로 배정 여부를 차량번호로 추정하지 않는다.
 * 자금 자료처럼 차량번호가 없는 원본도 담당자가 잡으면 진행, 실제 매칭이 끝나야 완료다.
 */
export function inboxWorkStatus(record: EntityRecord): WorkStatus {
  const sourceStatus = String(record.status || '').trim();
  const processing = String(record.processingState || '').trim();
  const intake = String(record.intakeState || '').trim();
  const assignment = String(record.assignmentState || '').trim();
  const assignee = String(record.assignee || '').trim();

  if (
    sourceStatus === '매칭'
    || processing === '처리완료'
    || (intake === '처리완료' && !!String(record.matchedEntity || record.matchedKey || record.matchedAt || '').trim())
  ) return '완료';
  if (/보류|취소/.test(sourceStatus)) return '보류';
  if (assignment === '배정됨' || assignee || intake === '처리중') return '진행';
  return '미배정';
}

export type WorkDueSignal = {
  state: WorkDueState;
  /** 기한경과 D+N · 임박 D-N · 오늘. 그 외 빈 값. */
  label: string;
  days: number | null;
};

/** 업무상태와 기한을 분리해 표시한다. 기한경과를 업무상태로 덮어쓰지 않는다. */
export function workDueSignal(dueDate: string, status: string, today: string): WorkDueSignal {
  if (/완료|종결|보류|취소/.test(status)) return { state: '종결', label: '', days: null };
  const due = String(dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return { state: '기한없음', label: '', days: null };
  }
  const days = Math.round((new Date(`${due}T00:00:00+09:00`).getTime() - new Date(`${today}T00:00:00+09:00`).getTime()) / 86_400_000);
  if (days < 0) return { state: '기한경과', label: `D+${Math.abs(days)}`, days };
  if (days === 0) return { state: '오늘', label: '오늘', days };
  if (days <= 3) return { state: '임박', label: `D-${days}`, days };
  return { state: '예정', label: '', days };
}

/** 기본 목록 우선순위: 기한경과 → 미배정 → 오늘/임박 → 그 외 → 종결. */
export function workAttentionRank(row: Pick<WorkLedgerRow, 'dueDate' | 'status'>, today: string): number {
  const due = workDueSignal(row.dueDate, row.status, today).state;
  if (due === '기한경과') return 0;
  if (row.status === '미배정') return 1;
  if (due === '오늘' || due === '임박') return 2;
  if (due === '종결') return 4;
  return 3;
}

export function workStatusTone(status: string): 'green' | 'amber' | 'red' | 'gray' | 'blue' {
  if (status === '완료') return 'green';
  if (status === '진행') return 'blue';
  if (status === '미배정' || status === '대기' || status === '보류') return 'amber';
  if (/지연|미매칭|경과|미처리/.test(status)) return 'red';
  return 'gray';
}

export function workGroup(kind: unknown): WorkGroup {
  const value = String(kind || '');
  if (!value || value === '미분류' || value === '일반') return '기타';
  if (/일정|스케줄|예약/.test(value)) return '일정';
  if (/연락기록/.test(value)) return '연락기록';
  if (/상담|통화|문자|연락|고객|민원/.test(value)) return '고객상담';
  if (/검사/.test(value)) return '검사';
  if (/세차/.test(value)) return '세차';
  if (/부품교체/.test(value)) return '부품교체';
  if (/정비|수선|부품|오일|타이어/.test(value)) return '정비·수선';
  if (/사고|파손|보험접수/.test(value)) return '사고';
  if (/보험/.test(value)) return '보험';
  if (/자금|입금예정|출금예정/.test(value)) return '자금';
  if (/수납/.test(value)) return '수납이슈';
  if (/분쟁/.test(value)) return '분쟁';
  if (/클레임/.test(value)) return '클레임';
  if (/과태료|범칙|통행료|주차/.test(value)) return '과태료';
  if (/문서|증빙|서류|계약서|등록증|증권/.test(value)) return '문서';
  if (/메모/.test(value)) return '메모';
  return '기타';
}

export function parseWorkGroup(raw: string | null): WorkGroupFilter {
  if (raw && (WORK_GROUPS as string[]).includes(raw)) return raw as WorkGroupFilter;
  return '전체';
}

/** 업무/과태료 표 배지 — 페이지 `.filter().length` 손롤 금지. */
export function summarizeWorkLedgerRows(rows: WorkLedgerRow[], today: string): {
  total: number;
  inProgress: number;
  unmatched: number;
  unassigned: number;
  overdue: number;
} {
  let inProgress = 0, unmatched = 0, unassigned = 0, overdue = 0;
  for (const r of rows) {
    if (!/완료|종결/.test(r.status)) inProgress++;
    if (r.process === '미매칭') unmatched++;
    if (r.status === '미배정') unassigned++;
    if (workDueSignal(r.dueDate, r.status, today).state === '기한경과') overdue++;
  }
  return { total: rows.length, inProgress, unmatched, unassigned, overdue };
}
