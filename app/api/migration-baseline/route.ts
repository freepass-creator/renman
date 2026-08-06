import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { MIGRATION_COLL, baselineDocId, type MigrationBaseline } from '@/lib/migrate/acceptance';

export const runtime = 'nodejs';

/**
 * 마이그레이션 기준선 — 「반영에 무엇을 넣었는가」를 서버에 남긴다.
 *
 * 승인(migration-acceptance)은 이 기준선과 Firestore 실물을 대조해서만 통과한다.
 * 기준선이 없으면 승인은 «비교할 것이 없으므로 통과»가 아니라 **거부**다(fail-closed).
 *
 * ★로컬 미리보기 액터(systemRole 'local')는 거부한다 — 그 반영은 브라우저에만 들어갔으므로
 *   서버에 기준선을 남기면 «서버에 없는 데이터»의 승인 근거가 된다(P0-1 로컬/원격 혼합).
 */
function requireHq(actor: { systemRole: string }): NextResponse | null {
  if (actor.systemRole === 'local') {
    return NextResponse.json({
      error: '로컬 미리보기에서는 마이그레이션 승인 경로를 쓸 수 없습니다 — Firebase 연결 후 다시 반영하세요',
    }, { status: 403 });
  }
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: '마이그레이션 기준선은 본사만 기록할 수 있습니다' }, { status: 403 });
  }
  return null;
}

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const denied = requireHq(actor);
  if (denied) return denied;
  const limited = await enforceApiRateLimit('migration-baseline-read', actor.uid, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const companyId = new URL(req.url).searchParams.get('companyId') || '';
  if (!companyId) return NextResponse.json({ error: 'company required' }, { status: 400 });

  const db = getFirestore(getAdminApp());
  const snap = await db.collection(MIGRATION_COLL).doc(baselineDocId(companyId)).get();
  return NextResponse.json({ baseline: snap.exists ? snap.data() : null });
}

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const denied = requireHq(actor);
  if (denied) return denied;
  const limited = await enforceApiRateLimit('migration-baseline-write', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    companyId?: string;
    packMode?: string;
    baselineDate?: string;
    perEntity?: Record<string, number>;
    receipts?: { count?: number; sum?: number };
  } | null;

  const companyId = String(body?.companyId || '');
  if (!companyId || companyId.includes('__') || companyId.includes('/')) {
    return NextResponse.json({ error: 'invalid companyId' }, { status: 400 });
  }
  const perEntityRaw = body?.perEntity && typeof body.perEntity === 'object' ? body.perEntity : {};
  const perEntity: Record<string, number> = {};
  for (const [k, v] of Object.entries(perEntityRaw)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) perEntity[k] = n;
  }
  const count = Number(body?.receipts?.count);
  const sum = Number(body?.receipts?.sum);
  if (!Number.isFinite(count) || !Number.isFinite(sum) || count < 0) {
    return NextResponse.json({ error: 'invalid receipts' }, { status: 400 });
  }

  /* runId 는 서버가 발급한다 — 클라가 정하면 같은 id 로 남의 실행을 덮어쓰거나
     기록되지 않은 실행을 승인시킬 수 있다. 기준선과 승인을 묶는 것은 서버의 몫. */
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const baseline: MigrationBaseline = {
    companyId,
    runId,
    packMode: String(body?.packMode || ''),
    baselineDate: String(body?.baselineDate || ''),
    perEntity,
    receipts: { count, sum },
    recordedAt: new Date().toISOString(),
    recordedBy: actor.email || actor.uid,
  };

  const db = getFirestore(getAdminApp());
  // 기준선은 «가장 최근 반영의 기대치» 하나만 유지한다(반영할 때마다 갱신). 승인 기록은 실행별로 쌓인다.
  await db.collection(MIGRATION_COLL).doc(baselineDocId(companyId)).set(baseline);
  return NextResponse.json({ runId, baseline });
}
