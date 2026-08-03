/**
 * Custom Claims 권한 변경 — 본사 전용.
 * systemRole·companyId 만 교체, 나머지 claims 보존. 변경 후 revokeRefreshTokens.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import {
  authErrorMessage, claimsOf, rejectLastHq, rejectSelf, writeStaffAudit,
} from '@/lib/staff-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('staff-role', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    uid?: string;
    systemRole?: string;
    companyId?: string | null;
  } | null;

  const uid = String(body?.uid || '').trim();
  const systemRole = body?.systemRole === 'hq' || body?.systemRole === 'tenant' ? body.systemRole : null;
  const companyId = typeof body?.companyId === 'string' ? body.companyId.trim() : '';

  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });
  if (!systemRole) return NextResponse.json({ error: 'systemRole 은 hq 또는 tenant' }, { status: 400 });
  if (systemRole === 'tenant' && !companyId) {
    return NextResponse.json({ error: '법인(tenant)은 companyId 필수' }, { status: 400 });
  }

  const self = rejectSelf(actor, uid);
  if (self) return self;

  try {
    const auth = getAuth(getAdminApp());
    const user = await auth.getUser(uid);
    const before = claimsOf(user);

    // hq → tenant/제거 성격의 강등·정지성 변경 시 마지막 hq 잠금
    if (before.systemRole === 'hq' && systemRole !== 'hq') {
      const last = await rejectLastHq(user);
      if (last) return last;
    }

    const current = user.customClaims || {};
    await auth.setCustomUserClaims(uid, {
      ...current,
      systemRole,
      ...(systemRole === 'tenant' ? { companyId } : { companyId: null }),
    });
    await auth.revokeRefreshTokens(uid);

    await writeStaffAudit(actor, {
      action: 'update',
      entityId: uid,
      label: `권한변경 ${user.email || uid} → ${systemRole}${systemRole === 'tenant' ? `/${companyId}` : ''}`,
      before: { systemRole: before.systemRole, companyId: before.companyId },
      after: { systemRole, companyId: systemRole === 'tenant' ? companyId : null },
    });

    return NextResponse.json({
      ok: true,
      uid,
      systemRole,
      companyId: systemRole === 'tenant' ? companyId : null,
    });
  } catch (e) {
    return NextResponse.json({ error: authErrorMessage(e, '권한 변경 실패') }, { status: 400 });
  }
}
