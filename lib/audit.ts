/**
 * 감사(Audit) — ERP 30원칙 "모든 변경은 누가·언제·무엇". v5 audit-fields+audit-store를 v6로 이식.
 *   · 2층 구조:  (1) inline 필드 = 엔티티에 "마지막 상태"(createdBy/updatedBy/deletedBy…) 빠른표시
 *              (2) audit_logs 컬렉션 = append-only 시계열 트레일(before/after)
 *   · 행위자(actor)는 React 비의존 store가 읽어야 하므로 모듈 스코프에 둠 → SessionProvider가 주입.
 *   · 실제 쓰기(logAudit)는 store.ts(AuditingStore)가 담당. 이 파일은 타입·actor·스탬프·빌더만(순수).
 */

export type AuditActor = { uid: string; name: string; email: string; role?: string };
export type AuditAction =
  | 'create' | 'update' | 'delete' | 'restore'
  | 'import' | 'match' | 'unmatch' | 'login' | 'logout';

export type AuditLog = {
  id: string;
  at: string;            // ISO
  companyId: string;
  by: string;            // 행위자 표시명
  byUid: string;
  byEmail: string;
  action: AuditAction;
  entityType: string;    // entityKey (vehicle/contract/…)
  entityId: string;      // 자연키(_key)
  label: string;         // 사람이 읽는 요약
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

// ── 현재 행위자 (모듈 스코프 — store가 읽음) ──
let _actor: AuditActor | null = null;
export function setAuditActor(a: AuditActor | null): void { _actor = a; }
export function getAuditActor(): AuditActor | null { return _actor; }
function actorName(): string { return _actor?.name || 'system'; }
function actorUid(): string { return _actor?.uid || 'system'; }

const nowIso = () => new Date().toISOString();

// ── inline 스탬프 — 반환 patch를 레코드에 머지 ──
export function stampCreateFields(): Record<string, unknown> {
  return { createdBy: actorName(), createdByUid: actorUid(), createdAt: nowIso() };
}
export function stampUpdateFields(): Record<string, unknown> {
  return { updatedBy: actorName(), updatedByUid: actorUid(), updatedAt: nowIso() };
}
export function stampDeleteFields(reason?: string): Record<string, unknown> {
  return { deletedAt: nowIso(), deletedBy: actorName(), deletedByUid: actorUid(), deletedReason: reason || '' };
}
export function stampRestoreFields(): Record<string, unknown> {
  return {
    deletedAt: null, deletedReason: null, deletedBy: null, deletedByUid: null,
    updatedBy: actorName(), updatedByUid: actorUid(), updatedAt: nowIso(),
  };
}

// ── audit_logs 엔트리 빌더 (쓰기는 store가) ──
export function buildAuditLog(p: {
  action: AuditAction; entityType: string; entityId: string; companyId: string;
  label: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null;
}): AuditLog {
  return {
    id: `al_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    at: nowIso(),
    companyId: p.companyId,
    by: actorName(),
    byUid: actorUid(),
    byEmail: _actor?.email || '',
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    label: p.label,
    before: p.before ?? null,
    after: p.after ?? null,
  };
}

/** patch의 키에 대해서만 before 스냅샷을 추린다(트레일 비대화 방지). */
export function beforeSubset(before: Record<string, unknown> | null | undefined, patch: Record<string, unknown>): Record<string, unknown> | null {
  if (!before) return null;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) if (k in before) out[k] = before[k];
  return Object.keys(out).length ? out : null;
}

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  create: '등록', update: '수정', delete: '삭제', restore: '복구',
  import: '일괄등록', match: '매칭', unmatch: '매칭해제', login: '로그인', logout: '로그아웃',
};
