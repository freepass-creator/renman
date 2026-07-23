/**
 * 쓰기 퍼널 — update/save/remove 단일 입구.
 *   · 회사 해소(resolveWriteCompany)
 *   · notifySaved는 store.afterWrite가 이미 함 → 여기서 중복 호출 금지
 * create 배치·부수효과는 saveIntake. 전이 합법성 검증 = 후속.
 */
import { getStore } from './store';
import { resolveWriteCompany, NEED_COMPANY } from './scope';
import { canSetStatus } from './domain/status';
import { syncVehicleToFreepass } from './freepass/product-sync';
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

/**
 * 계약 status 직접 쓰기 백스톱(SM-1) — 종료 계약 부활 등 불법 전이를 커맨드층에서 차단.
 * 범용 편집기·개발도구 등 canTransition 을 안 태우는 경로도 여기서 덮인다.
 * from 은 rec.status 우선, 없으면 현재 레코드를 조회. 판정 불가하면(둘 다 미상) 막지 않음.
 */
async function assertLegalContractStatus(args: CommitUpdateArgs, companyId: string): Promise<void> {
  if (args.entity !== 'contract') return;
  const to = (args.patch as EntityRecord | undefined)?.status;
  if (to === undefined || to === null || to === '') return; // status 미포함/미변경
  let from = (args.rec as EntityRecord | null | undefined)?.status;
  if (from === undefined) {
    const cur = await getStore().get('contract', companyId, args.key).catch(() => null);
    from = (cur as EntityRecord | null)?.status as string | undefined;
  }
  if (!canSetStatus(from, to)) {
    throw new Error(`종료된 계약(${String(from)})의 상태를 ${String(to)}(으)로 되돌릴 수 없습니다. 재개가 필요하면 새 계약을 만드세요.`);
  }
}

export async function commitUpdate(args: CommitUpdateArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec);
  await assertLegalContractStatus(args, companyId);
  await getStore().update(args.entity, companyId, args.key, args.patch);
  // 차량 상태가 상품대기/상품화면 프리패스 매물로 자동 등록(fire-and-forget·env 게이트).
  if (args.entity === 'vehicle') syncVehicleToFreepass({ ...(args.rec as EntityRecord | null || {}), ...args.patch });
  return { companyId };
}

export async function commitSave(args: CommitSaveArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec ?? args.records[0]);
  await getStore().save(args.entity, companyId, args.records);
  if (args.entity === 'vehicle') for (const r of args.records) syncVehicleToFreepass(r);
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
