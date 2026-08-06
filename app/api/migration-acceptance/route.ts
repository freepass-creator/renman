import { NextResponse } from 'next/server';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { requiresContractLink } from '@/lib/finance/cash-rules';
import {
  MIGRATION_COLL, ACCEPTANCE_ENTITIES, acceptanceDocId, baselineDocId,
  verifyAcceptance, acceptanceFailureMessage,
  type MigrationBaseline, type MigrationCounts,
} from '@/lib/migrate/acceptance';

export const runtime = 'nodejs';

/**
 * 마이그레이션 승인 — 「이 데이터로 오픈한다」를 서버가 **직접 확인하고** 남긴다.
 *
 * 핵심: **클라가 보낸 숫자를 승인 근거로 쓰지 않는다.** 클라가 세어 보낸 건수를 그대로 적으면
 * localStorage 에만 들어간 반영도 「승인됨」이 된다(P0-1 로컬/원격 혼합 승인). 그래서 서버가
 * Firestore 실물을 다시 세어 기준선(migration-baseline)과 대조하고, 통과할 때만 기록한다.
 *
 * fail-closed 지점:
 *   · 로컬 개발 액터·본사 아닌 계정 → 403
 *   · 기준선 없음 → 409 (비교할 것이 없으면 «통과»가 아니라 «승인 불가»)
 *   · runId 불일치 → 409 (기록되지 않은 실행을 승인시키는 경로 차단)
 *   · 실물이 기준선에 못 미침 → 409 + 어긋난 항목
 */
async function countActual(db: Firestore, companyId: string): Promise<MigrationCounts> {
  const perEntity: Record<string, number> = {};
  let count = 0;
  let sum = 0;

  await Promise.all(ACCEPTANCE_ENTITIES.map(async (entity) => {
    const snap = await db.collection(entity).where('companyId', '==', companyId).get();
    const rows = snap.docs.map((d) => d.data()).filter((r) => !r.deletedAt);
    perEntity[entity] = rows.length;
    if (entity !== 'bank_tx') return;
    // 수납 = 계약성 입금. 정의는 lib/finance/cash-rules 하나를 쓴다(화면·정합성 검사와 같은 눈).
    for (const r of rows) {
      const amount = Number(r.amount) || 0;
      if (amount > 0 && requiresContractLink(r.category)) { count++; sum += amount; }
    }
  }));

  return { perEntity, receipts: { count, sum } };
}

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole === 'local') {
    return NextResponse.json({
      error: '로컬 미리보기에서는 마이그레이션을 승인할 수 없습니다 — 반영이 브라우저에만 저장됩니다',
    }, { status: 403 });
  }
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: '마이그레이션 승인은 본사만 할 수 있습니다' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('migration-acceptance', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { companyId?: string; runId?: string } | null;
  const companyId = String(body?.companyId || '');
  const runId = String(body?.runId || '');
  if (!companyId || companyId.includes('__') || companyId.includes('/') || !runId || runId.includes('/')) {
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 });
  }

  const db = getFirestore(getAdminApp());
  const baseSnap = await db.collection(MIGRATION_COLL).doc(baselineDocId(companyId)).get();
  if (!baseSnap.exists) {
    return NextResponse.json({ error: '기준선이 없어 승인할 수 없습니다 — 반영을 다시 실행하세요' }, { status: 409 });
  }
  const baseline = baseSnap.data() as MigrationBaseline;
  if (baseline.runId !== runId) {
    return NextResponse.json({
      error: '기준선의 실행 번호와 다릅니다 — 그 사이 다른 반영이 있었습니다. 반영부터 다시 하세요',
    }, { status: 409 });
  }

  const actual = await countActual(db, companyId);
  const verdict = verifyAcceptance(baseline, actual);
  if (!verdict.ok) {
    return NextResponse.json({ error: acceptanceFailureMessage(verdict), mismatches: verdict.mismatches }, { status: 409 });
  }

  const acceptance = {
    companyId, runId,
    packMode: baseline.packMode,
    baselineDate: baseline.baselineDate,
    expected: { perEntity: baseline.perEntity, receipts: baseline.receipts },
    // 실제 숫자를 그대로 남긴다 — 기준선보다 «많은» 경우(반영 뒤 정상 입력)를 나중에 설명할 수 있게.
    actual,
    acceptedAt: new Date().toISOString(),
    acceptedBy: actor.email || actor.uid,
  };

  try {
    // 같은 실행을 두 번 승인하거나 기존 승인을 덮어쓰지 않는다 — 승인은 사후에 바뀌면 안 되는 기록이다.
    await db.collection(MIGRATION_COLL).doc(acceptanceDocId(companyId, runId)).create(acceptance);
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code === 6 || code === 'already-exists') {
      return NextResponse.json({ error: '이미 승인된 반영입니다' }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ accepted: true, acceptance });
}
