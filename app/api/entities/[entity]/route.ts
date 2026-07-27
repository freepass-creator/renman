import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { ENTITIES } from '@/lib/intake/entities';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const limited = await enforceApiRateLimit('entity-read', actor.uid, { limit: 240, windowMs: 60_000 });
  if (limited) return limited;

  const { entity } = await ctx.params;
  if (!ENTITIES[entity]) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });

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
  if (!ENTITIES[entity]) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });
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
    batch.set(db.collection(entity).doc(id), data);
  }
  await batch.commit();
  return NextResponse.json({ saved: docs.length });
}
