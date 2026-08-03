/**
 * Auth 계정 목록 — 본사 전용. Custom Claims 가 권한 SSOT.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { listAllAuthUsers, toAuthStaffRow } from '@/lib/staff-admin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('staff-list', actor.uid, { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const users = await listAllAuthUsers();
    const rows = users.map(toAuthStaffRow).sort((a, b) => {
      const ae = a.email || a.uid;
      const be = b.email || b.uid;
      return ae.localeCompare(be, 'ko');
    });
    return NextResponse.json({ users: rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || '목록 조회 실패' }, { status: 500 });
  }
}
