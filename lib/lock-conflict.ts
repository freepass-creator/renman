/**
 * Optimistic lock — v5 locked-update 학습. EntityRecord.updatedAt 비교.
 *   store.update 시 patch._expectedUpdatedAt 가 있으면 서버/로컬 현재값과 다를 때 LockConflictError.
 */
export class LockConflictError extends Error {
  constructor(public refPath: string) {
    super(`동시편집 충돌 — 다른 사용자가 먼저 수정했습니다 (${refPath})`);
    this.name = 'LockConflictError';
  }
}

export const EXPECTED_UPDATED_AT = '_expectedUpdatedAt';

/** patch에서 expected 분리 — 저장 문서에 메타 키가 안 남게. */
export function peelExpectedUpdatedAt(patch: Record<string, unknown>): {
  expected?: string;
  data: Record<string, unknown>;
} {
  const expected = typeof patch[EXPECTED_UPDATED_AT] === 'string' ? String(patch[EXPECTED_UPDATED_AT]) : undefined;
  if (expected === undefined) return { data: patch };
  const data = { ...patch };
  delete data[EXPECTED_UPDATED_AT];
  return { expected: expected || undefined, data };
}

export function assertNoLockConflict(
  refPath: string,
  expected: string | undefined,
  currentUpdatedAt: unknown,
): void {
  if (!expected) return;
  const cur = currentUpdatedAt == null || currentUpdatedAt === '' ? '' : String(currentUpdatedAt);
  if (cur && cur !== expected) throw new LockConflictError(refPath);
}
