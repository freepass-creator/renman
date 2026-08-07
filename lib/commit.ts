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
import { normalizeRecord, runIntakePostWrite, saveIntake } from './intake';
import type { AtomicEventSource } from './domain/atomic-event';

export type CommitUpdateArgs = {
  entity: string;
  sessionCompanyId: string;
  /** companyId 해소용(레코드에 있으면 우선) */
  rec?: EntityRecord | null;
  key: string;
  patch: EntityRecord;
  /** 원자 사건 출처. 문서교체·대량 OCR은 'ocr', 기본은 'manual'. */
  source?: AtomicEventSource;
};

export type CommitSaveArgs = {
  entity: string;
  sessionCompanyId: string;
  rec?: EntityRecord | null;
  records: EntityRecord[];
  source?: AtomicEventSource;
};

export type CommitRemoveArgs = {
  entity: string;
  sessionCompanyId: string;
  rec?: EntityRecord | null;
  key: string;
  reason?: string;
};

function resolveOrThrow(sessionCompanyId: string, rec?: EntityRecord | null): string {
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
  const patch = normalizeRecord(args.patch);
  await assertLegalContractStatus({ ...args, patch }, companyId);
  await getStore().update(args.entity, companyId, args.key, patch);
  const merged = normalizeRecord({ ...(args.rec as EntityRecord | null || {}), ...patch, _key: args.key, companyId });
  await runIntakePostWrite(args.entity, companyId, [merged], {
    context: { source: args.source || 'manual' }, writeKind: 'update',
  });
  // 차량 상태가 상품대기/상품화면 프리패스 매물로 자동 등록(fire-and-forget·env 게이트).
  if (args.entity === 'vehicle') syncVehicleToFreepass(merged);
  return { companyId };
}

export async function commitSave(args: CommitSaveArgs): Promise<{ companyId: string }> {
  const companyId = resolveOrThrow(args.sessionCompanyId, args.rec ?? args.records[0]);
  const result = await saveIntake(args.entity, companyId, args.records, {
    context: { source: args.source || 'manual' }, notify: false,
  });
  if (args.entity === 'vehicle') for (const r of result.records) syncVehicleToFreepass(r);
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
 * ★되돌림이 필요한 짝 쓰기는 `commitAllCompensated` 를 쓸 것.
 */
export async function commitAll(ops: CommitUpdateArgs[]): Promise<{ companyIds: string[] }> {
  const companyIds: string[] = [];
  for (const op of ops) {
    const { companyId } = await commitUpdate(op);
    companyIds.push(companyId);
  }
  return { companyIds };
}

/**
 * 되돌리기를 붙인 다중 커밋 — 중간에 실패하면 **이미 적용된 것을 역순으로 되돌린다.**
 *
 * ## 왜 필요한가 (P0-4)
 *   `commitAll` 은 트랜잭션이 아니다. 입금매칭은 bank_tx 와 계약을 함께 고치는데,
 *   두 번째에서 실패하면 「입금은 매칭됐는데 수납은 안 들어간」 반쪽 상태가 남는다.
 *   지금은 «순서»로만 완화하고 있다(복구 가능한 쪽이 먼저). 그건 사람이 손으로
 *   되돌릴 수 있다는 뜻이지 되돌아간다는 뜻이 아니다.
 *
 * ## 왜 «범용 되돌리기»가 아닌가
 *   건드린 키를 이전 값으로 복원하는 방식은 **틀린다.** 매칭 해제의 정답은
 *   「귀속만 되돌리고 1차 분류(계정과목)는 보존」이다 — 도메인 판단이다.
 *   그래서 되돌리기 패치는 **각 op 이 직접 들고 온다**(`undo`).
 *   `undo` 가 없는 op 은 되돌리지 않는다(되돌릴 필요가 없거나, 되돌리면 안 되는 것).
 *
 * ## 되돌리기도 실패하면
 *   삼키지 않는다. 원래 오류에 되돌리기 실패를 붙여 던진다 —
 *   반쪽 상태가 남았다는 사실이 화면까지 올라와야 한다.
 */
export type CompensatedOp = CommitUpdateArgs & {
  /** 이 op 이 적용된 뒤 실패했을 때 되돌릴 패치. 없으면 되돌리지 않는다. */
  undo?: EntityRecord;
};

export async function commitAllCompensated(ops: CompensatedOp[]): Promise<{ companyIds: string[] }> {
  const companyIds: string[] = [];
  const applied: CompensatedOp[] = [];
  try {
    for (const op of ops) {
      const { companyId } = await commitUpdate(op);
      companyIds.push(companyId);
      applied.push(op);
    }
    return { companyIds };
  } catch (error) {
    const failures: string[] = [];
    for (const op of [...applied].reverse()) {
      if (!op.undo) continue;
      try {
        // 되돌리기도 감사로그에 남는다 — 원인 op 과 같은 source 로(사람이 한 일의 되돌림이므로).
        await commitUpdate({ ...op, patch: op.undo });
      } catch (undoError) {
        failures.push(`${op.entity}/${op.key}: ${(undoError as Error).message}`);
      }
    }
    if (failures.length) {
      const detail = failures.join(' / ');
      throw new Error(`${(error as Error).message} — 되돌리기도 실패해 반쪽 상태가 남았습니다: ${detail}`);
    }
    throw error;
  }
}
