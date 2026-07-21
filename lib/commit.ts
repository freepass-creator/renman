/**
 * 쓰기 퍼널 — update/save/remove 단일 입구.
 *   · 회사 해소(resolveWriteCompany)
 *   · notifySaved는 store.afterWrite가 이미 함 → 여기서 중복 호출 금지
 * create 배치·부수효과는 saveIntake. 전이 합법성 검증 = 후속.
 */
import { getStore } from './store';
import { resolveWriteCompany, NEED_COMPANY } from './scope';
import type { EntityRecord } from './intake/entities';

export type CommitUpdateArgs = {
  entity: string;
  sessionCompanyId: string;
  /** companyId 해소용(레코드에 있으면 우선) */
  rec?: { companyId?: unknown } | null;
  key: string;
  patch: EntityRecord;
};

export type CommitSaveArgs = {
  entity: string;
  sessionCompanyId: string;
  rec?: { companyId?: unknown } | null;
  records: EntityRecord[];
};

export type CommitRemoveArgs = {
  entity: string;
  sessionCompanyId: string;
  rec?: { companyId?: unknown } | null;
  key: string;
  reason?: string;
};

function resolveOrThrow(sessionCompanyId: string, rec?: { companyId?: unknown } | null): string {
  const companyId = resolveWriteCompany(sessionCompanyId, rec);
  if (!companyId) throw new Error(NEED_COMPANY);
  return companyId;
}

export async function commitUpdate(args: CommitUpdateArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec);
  await getStore().update(args.entity, companyId, args.key, args.patch);
  return { companyId };
}

export async function commitSave(args: CommitSaveArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec ?? args.records[0]);
  await getStore().save(args.entity, companyId, args.records);
  return { companyId };
}

export async function commitRemove(args: CommitRemoveArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec);
  await getStore().remove(args.entity, companyId, args.key, args.reason || '');
  return { companyId };
}

/**
 * 다중 엔티티 순차 커밋. Firestore 트랜잭션은 아님 — 실패 시 앞선 쓰기는 남을 수 있음.
 * 입금매칭(계약+_bank_tx)처럼 짝 쓰기에 사용.
 */
export async function commitAll(ops: CommitUpdateArgs[]): Promise<{ companyIds: string[] }> {
  const companyIds: string[] = [];
  for (const op of ops) {
    const { companyId } = await commitUpdate(op);
    companyIds.push(companyId);
  }
  return { companyIds };
}
