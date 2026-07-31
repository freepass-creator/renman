/**
 * 직원 정지·해제 — 서버 조치(본사 전용).
 *
 * 왜 서버여야 하는가: 정지 명단이 브라우저 localStorage에만 있으면 본사 화면에서 «정지»를 눌러도
 *   직원 브라우저에는 전파되지 않아 그대로 로그인된다(QA 긴급). 실제 차단은 Firebase Auth 계정
 *   비활성화 + 리프레시 토큰 폐기로만 성립한다. 비활성 계정은 Firebase가 로그인 자체를 거부하므로
 *   클라이언트 게이트에 의존하지 않는다.
 *
 * 안전장치: 본사만 호출 가능 · 자기 계정은 정지 불가(락아웃 방지) · 감사 목적 응답에 대상 uid 반환.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('staff-suspend', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { email?: string; suspend?: boolean } | null;
  const email = String(body?.email || '').trim().toLowerCase();
  const suspend = body?.suspend === true;
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }
  // ★자기 계정 정지 금지 — 본사가 스스로 잠기면 복구가 CLI뿐이다.
  if (suspend && email === String(actor.email || '').trim().toLowerCase()) {
    return NextResponse.json({ error: '자기 계정은 정지할 수 없습니다' }, { status: 400 });
  }

  try {
    const auth = getAuth(getAdminApp());
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { disabled: suspend });
    if (suspend) {
      // 이미 발급된 ID 토큰(최대 1시간)까지 무효화 — 폐기 없으면 정지 후에도 접근이 남는다.
      await auth.revokeRefreshTokens(user.uid);
    }
    return NextResponse.json({ ok: true, uid: user.uid, email, disabled: suspend });
  } catch (e) {
    const msg = (e as { code?: string; message?: string }).code === 'auth/user-not-found'
      ? '해당 이메일의 로그인 계정이 없습니다(대장에만 있는 직원일 수 있음)'
      : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
