import { NextResponse } from 'next/server';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
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

/**
 * 회계마감 — 서버 쓰기 경로의 마감월 차단.
 *
 * 왜 여기가 필요한가: 이 라우트는 Admin SDK라 firestore.rules를 우회한다. 규칙에는
 *   자금거래 update·delete 마감 가드가 있지만, «생성»(대량 임포트 포함)은 전부 이 라우트를 타므로
 *   규칙이 발동하지 않는다 → 마감한 달에 거래를 새로 밀어넣어 결산을 사후에 바꿀 수 있었다.
 *   마감의 의미는 «그 달의 숫자가 더 이상 변하지 않는다»이므로 유입도 막아야 한다.
 * 막힐 때는 어느 달이 막혔는지 알려준다 — 실무자가 «마감 해제 후 재투입»을 선택할 수 있게.
 */
const MONEY_ENTITIES = new Set(['bank_tx', 'card_tx']);

async function closedMonthsOf(db: Firestore, companyId: string): Promise<Set<string>> {
  try {
    const snap = await db.collection('period_locks').doc(companyId).get();
    if (!snap.exists) return new Set();
    const map = (snap.data() as { map?: Record<string, unknown> } | undefined)?.map;
    if (!map || typeof map !== 'object') return new Set();
    return new Set(Object.keys(map).filter((ym) => /^\d{4}-\d{2}$/.test(ym)));
  } catch {
    // 마감 정보를 못 읽으면 통과시키지 않는다 — 마감을 모르는 채 쓰는 것이 더 위험하다.
    throw new Error('period-lock-unreadable');
  }
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
  // 마감월 유입 차단 — 자금거래만(다른 엔티티는 마감 대상이 아니다).
  let closed: Set<string> = new Set();
  if (MONEY_ENTITIES.has(entity)) {
    try {
      closed = await closedMonthsOf(db, companyId);
    } catch {
      return NextResponse.json({ error: '회계마감 정보를 읽을 수 없어 자금거래를 저장하지 않았습니다 — 잠시 후 다시 시도하세요' }, { status: 503 });
    }
  }
  const blockedMonths = new Set<string>();
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
    if (closed.size > 0) {
      const ym = String(data.txDate || '').slice(0, 7);
      if (ym && closed.has(ym)) { blockedMonths.add(ym); continue; }
      /* ★기존 문서의 월도 봐야 한다 — 이 라우트의 set은 덮어쓰기이므로, 마감월 거래의 txDate를
         열린 달로 바꿔 «마감월에서 빼내는» 것이 신 데이터만 검사하면 통과한다.
         비용은 갱신 건에만 발생(신규는 존재하지 않으므로 exists=false). */
      const prev = await db.collection(entity).doc(id).get();
      if (prev.exists) {
        const prevYm = String((prev.data() as { txDate?: string }).txDate || '').slice(0, 7);
        if (prevYm && closed.has(prevYm)) { blockedMonths.add(prevYm); continue; }
      }
    }
    batch.set(db.collection(entity).doc(id), data);
  }
  // ★일부만 저장하고 성공을 돌려주면 «넣었는데 없다»가 된다 → 마감월이 섞여 있으면 전량 거부.
  if (blockedMonths.size > 0) {
    const months = [...blockedMonths].sort().join(', ');
    return NextResponse.json({
      error: `마감된 기간(${months})의 자금거래가 포함되어 저장하지 않았습니다 — 설정에서 해당 월 마감을 해제한 뒤 다시 투입하세요`,
      blockedMonths: [...blockedMonths].sort(),
    }, { status: 409 });
  }
  await batch.commit();
  return NextResponse.json({ saved: docs.length });
}
