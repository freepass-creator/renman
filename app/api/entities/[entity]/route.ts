import { NextResponse } from 'next/server';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { ENTITIES } from '@/lib/intake/entities';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { MONEY_ENTITIES, findCreateOnlyConflicts, moneyConflictMessage } from '@/lib/finance/immutable-money';

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
 *
 * 대상 엔티티(MONEY_ENTITIES)는 create-only 경계와 같은 축이라 `lib/finance/immutable-money`가 SSOT.
 */

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
  const { entity } = await ctx.params;
  if (!Object.hasOwn(ENTITIES, entity)) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });
  // 한 화면이 차량·계약·업무를 병렬 조회한다. 모든 엔티티가 같은 카운터 문서를 갱신하면
  // 정상적인 첫 진입도 Firestore 트랜잭션 경합으로 503이 된다 → 엔티티별 버킷으로 분리한다.
  const limited = await enforceApiRateLimit(`entity-read-${entity}`, actor.uid, { limit: 240, windowMs: 60_000 });
  if (limited) return limited;

  const url = new URL(req.url);
  const requestedCompany = url.searchParams.get('companyId') || '';
  // 관리 회사는 클라이언트 레지스트리에서 설정한다. API가 특정 3사를 고정하지 않는다.
  // 합본 조회는 DispatchStore가 설정된 회사별로 분할 요청한다.
  if (actor.systemRole === 'hq' && requestedCompany === '__ALL__') {
    return NextResponse.json({ error: 'configured company required' }, { status: 400 });
  }
  const companies = actor.systemRole === 'hq' ? [requestedCompany] : [actor.companyId || ''];
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
  const { entity } = await ctx.params;
  if (!Object.hasOwn(ENTITIES, entity)) return NextResponse.json({ error: 'unknown entity' }, { status: 404 });
  const limited = await enforceApiRateLimit(`entity-write-${entity}`, actor.uid, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
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
  const money = MONEY_ENTITIES.has(entity);
  const col = db.collection(entity);
  const blockedMonths = new Set<string>();
  const writes: { id: string; data: Record<string, unknown> }[] = [];
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
      /* 기존 문서의 월까지 보던 검사는 아래 create-only 가 흡수했다 — 자금 원자는 이 경로로
         덮어쓸 수 없으므로(존재하면 409) «마감월 거래의 txDate를 열린 달로 바꿔 빼내는» 길이 없다. */
      if (ym && closed.has(ym)) { blockedMonths.add(ym); continue; }
    }
    writes.push({ id, data });
  }
  // ★일부만 저장하고 성공을 돌려주면 «넣었는데 없다»가 된다 → 마감월이 섞여 있으면 전량 거부.
  if (blockedMonths.size > 0) {
    const months = [...blockedMonths].sort().join(', ');
    return NextResponse.json({
      error: `마감된 기간(${months})의 자금거래가 포함되어 저장하지 않았습니다 — 설정에서 해당 월 마감을 해제한 뒤 다시 투입하세요`,
      blockedMonths: [...blockedMonths].sort(),
    }, { status: 409 });
  }

  /* ★자금 원자 create-only (`lib/finance/immutable-money`) — 이 라우트는 클라 dedup 뒤의
     «생성/임포트» 경로다(lib/store.ts save는 기존 문서를 다시 보내지 않는다). 그런데도 set이면
     같은 ID를 만들어 보내는 것만으로 통장 거래의 금액·일자를 갈아엎을 수 있었다 → 존재하면 거부.
     어느 거래가 걸렸는지 돌려줘 실무자가 «재투입인지 새 건인지»를 판단할 수 있게 한다. */
  if (money && writes.length > 0) {
    const ids = writes.map((w) => w.id);
    const snaps = await db.getAll(...[...new Set(ids)].map((id) => col.doc(id)));
    const conflicts = findCreateOnlyConflicts(ids, snaps.filter((s) => s.exists).map((s) => s.id));
    if (conflicts.length > 0) {
      return NextResponse.json({ error: moneyConflictMessage(conflicts), conflictIds: conflicts }, { status: 409 });
    }
  }

  const batch = db.batch();
  for (const { id, data } of writes) {
    const ref = col.doc(id);
    // 자금만 create — 선검사와 커밋 사이의 경합(같은 파일 동시 투입)까지 커밋 단계에서 막는 이중 방어.
    if (money) batch.create(ref, data);
    else batch.set(ref, data);
  }
  try {
    await batch.commit();
  } catch (error) {
    // ALREADY_EXISTS = 선검사 통과 후 누가 먼저 만든 것 → 서버 오류가 아니라 정당한 거부.
    const code = (error as { code?: unknown }).code;
    if (money && (code === 6 || code === 'already-exists')) {
      return NextResponse.json({
        error: '저장 직전에 같은 자금거래가 먼저 저장되어 취소했습니다 — 목록을 새로 고친 뒤 남은 건만 투입하세요',
        conflictIds: [],
      }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ saved: writes.length });
}
