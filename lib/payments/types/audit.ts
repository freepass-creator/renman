// jpkerp5 — 감사 로그 타입 (모든 변경 추적: 누가 / 언제 / 무엇을)

/** 감사 로그 — 모든 변경 추적 (누가 / 언제 / 무엇을) */
export type AuditAction = 'create' | 'update' | 'delete' | 'restore' | 'match' | 'unmatch' | 'login' | 'logout' | 'import' | 'export';

export type AuditEntityType =
  | 'contract' | 'company' | 'vehicle'
  | 'bank_tx' | 'card_tx' | 'schedule'
  | 'penalty' | 'license' | 'document'
  | 'system';

export type AuditLog = {
  id: string;
  at: string;              // ISO timestamp
  by?: string;             // 사용자 email (없으면 시스템)
  byUid?: string;          // Firebase UID
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string;       // 대상 ID (있을 때)
  label: string;           // 1줄 요약 (예: "ICR-2605-0001 1회차 자동매칭 ₩1,500,000")
  before?: Record<string, unknown>;  // 변경 전 (선택)
  after?: Record<string, unknown>;   // 변경 후 (선택)
};
