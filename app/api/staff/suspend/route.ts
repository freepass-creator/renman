/**
 * 직원 정지·해제 — 서버 조치(본사 전용).
 *
 * 왜 서버여야 하는가: 정지 명단이 브라우저 localStorage에만 있으면 본사 화면에서 «정지»를 눌러도
 *   직원 브라우저에는 전파되지 않아 그대로 로그인된다(QA 긴급). 실제 차단은 Firebase Auth 계정
 *   비활성화 + 리프레시 토큰 폐기로만 성립한다. 비활성 계정은 Firebase가 로그인 자체를 거부하므로
 *   클라이언트 게이트에 의존하지 않는다.
 *
 * 안전장치: 본사만 · 자기 계정 불가 · 마지막 hq 잠금 · revokeRefreshTokens · audit_logs.
 * body: `{ uid?, email?, suspend }` — uid 우선, 없으면 email.
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
  const limited = await enforceApiRateLimit('staff-suspend', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    uid?: string;
    email?: string;
    suspend?: boolean;
  } | null;
  const uidIn = String(body?.uid || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const suspend = body?.suspend === true;
  if (!uidIn && (!email || !email.includes('@'))) {
    return NextResponse.json({ error: 'uid 또는 email 필요' }, { status: 400 });
  }

  try {
    const auth = getAuth(getAdminApp());
    const user = uidIn
      ? await auth.getUser(uidIn)
      : await auth.getUserByEmail(email);

    if (suspend) {
      const self = rejectSelf(actor, user.uid);
      if (self) return self;
      const last = await rejectLastHq(user);
      if (last) return last;
    }

    await auth.updateUser(user.uid, { disabled: suspend });
    if (suspend) {
      await auth.revokeRefreshTokens(user.uid);
    }

    const claims = claimsOf(user);
    await writeStaffAudit(actor, {
      action: 'update',
      entityId: user.uid,
      label: suspend
        ? `계정정지 ${user.email || user.uid}`
        : `계정활성화 ${user.email || user.uid}`,
      before: { disabled: !!user.disabled, systemRole: claims.systemRole },
      after: { disabled: suspend, systemRole: claims.systemRole },
    });

    return NextResponse.json({
      ok: true,
      uid: user.uid,
      email: user.email || email,
      disabled: suspend,
    });
  } catch (e) {
    const msg = (e as { code?: string }).code === 'auth/user-not-found'
      ? '해당 이메일의 로그인 계정이 없습니다(대장에만 있는 직원일 수 있음)'
      : authErrorMessage(e, '정지 처리 실패');
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
