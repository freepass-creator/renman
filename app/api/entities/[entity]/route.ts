import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { ENTITIES } from '@/lib/intake/entities';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

/**
 * 문서 ID = `${companyId}__${안전화된 자연키}` (lib/store.ts firestoreDocId와 동일 규약).
 * ★이 라우트는 Admin SDK라 firestore.rules 격리를 우회한다 → 여기서 반드시 접두어를 검증해야
 *   타 법인 문서 하드 덮어쓰기를 막을 수 있다(QA 출시차단 #1).
 */
function docIdBelongsTo(id: string, companyId: string): boolean {
  // ★companyId 자체에 '__'가 있으면 접두어 검증이 무의미해진다(`a__b__k` = companyId 'a__b'의 문서와 동일 ID).
  //   회사 id는 영숫자 slug(lib/companies slug())이므로 '__'·'/'는 있을 수 없다.
  if (!companyId || companyId.includes('__') || companyId.includes('/')) return false;
  const prefix = `${companyId}__`;
  if (!id.startsWith(prefix)) return false;
  const key = id.slice(prefix.length);
  if (!key) return false;
  if (key.includes('/')) return false; // 경로 구분자(정상 경로는 %2F로 인코딩됨)
  // Firestore 문서 ID 제약은 «1,500바이트» — UTF-16 길이로 재면 한글 키를 잘못 통과시킨다.
  if (Buffer.byteLength(id, 'utf8') > 1_500) return false;
  return true;
}

export async function GET(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const limited = await enforceApiRateLimit('entity-read', actor.uid, { limit: 240, windowMs: 60_000 });
  if (limited) return limited;

  const { entity } = await ctx.params;
  if (!Object.hasOwn(ENTITIES, entity)) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });

  const url = new URL(req.url);
  const requestedCompany = url.searchParams.get('companyId') || '';
  const companies = actor.systemRole === 'hq'
    ? (requestedCompany === '__ALL__' ? ['switchplan', 'prime', 'sonogong'] : [requestedCompany])
    : [actor.companyId || ''];
  if (!companies.every(Boolean)) return NextResponse.json({ error: 'company required' }, { status: 400 });
  if (actor.systemRole === 'tenant' && companies[0] !== actor.companyId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = getFirestore(getAdminApp());
  const groups = await Promise.all(companies.map(async (companyId) => {
    const snap = await db.collection(entity).where('companyId', '==', companyId).get();
    return snap.docs.map((doc) => doc.data()).filter((row) => !row.deletedAt);
  }));
  return NextResponse.json({ rows: groups.flat() });
}

export async function POST(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const limited = await enforceApiRateLimit('entity-write', actor.uid, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;

  const { entity } = await ctx.params;
  if (!Object.hasOwn(ENTITIES, entity)) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });
  const body = await req.json().catch(() => null) as {
    companyId?: string;
    docs?: Array<{ id?: string; data?: Record<string, unknown> }>;
  } | null;
  const companyId = String(body?.companyId || '');
  const docs = Array.isArray(body?.docs) ? body.docs : [];
  if (!companyId || docs.length < 1 || docs.length > 500) {
    return NextResponse.json({ error: 'invalid write payload' }, { status: 400 });
  }
  if (actor.systemRole !== 'hq' && actor.companyId !== companyId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const db = getFirestore(getAdminApp());
  const batch = db.batch();
  for (const item of docs) {
    const id = String(item.id || '');
    const data = item.data && typeof item.data === 'object' ? item.data : null;
    if (!id || !data || String(data.companyId || '') !== companyId) {
      return NextResponse.json({ error: 'invalid document' }, { status: 400 });
    }
    // ★문서 ID가 그 법인 소유인지 검증 — 없으면 타 법인 문서를 덮어쓸 수 있다.
    if (!docIdBelongsTo(id, companyId)) {
      return NextResponse.json({ error: 'document id must belong to companyId' }, { status: 400 });
    }
    batch.set(db.collection(entity).doc(id), data);
  }
  await batch.commit();
  return NextResponse.json({ saved: docs.length });
}
