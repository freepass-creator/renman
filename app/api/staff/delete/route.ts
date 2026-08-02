/**
 * Auth 계정 삭제 — 본사 전용. soft 불가 · 되돌릴 수 없음.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  authErrorMessage, claimsOf, rejectLastHq, rejectSelf, writeStaffAudit,
} from '@/lib/staff-admin';

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('staff-delete', actor.uid, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { uid?: string } | null;
  const uid = String(body?.uid || '').trim();
  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

  const self = rejectSelf(actor, uid);
  if (self) return self;

  try {
    const auth = getAuth(getAdminApp());
    const user = await auth.getUser(uid);
    const last = await rejectLastHq(user);
    if (last) return last;

    const before = claimsOf(user);
    await auth.deleteUser(uid);

    await writeStaffAudit(actor, {
      action: 'delete',
      entityId: uid,
      label: `계정삭제 ${user.email || uid}`,
      before: {
        email: user.email || '',
        systemRole: before.systemRole,
        companyId: before.companyId,
        disabled: !!user.disabled,
      },
      after: null,
    });

    return NextResponse.json({ ok: true, uid, email: user.email || '' });
  } catch (e) {
    return NextResponse.json({ error: authErrorMessage(e, '계정 삭제 실패') }, { status: 400 });
  }
}
