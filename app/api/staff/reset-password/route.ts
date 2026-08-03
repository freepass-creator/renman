/**
 * 비밀번호 재설정 링크 발급 — 본사 전용.
 * 메일 인프라 없음 → 링크를 응답에 담아 화면에서 복사·전달.
 */
import { NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { requireAuth, getAdminApp } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { authErrorMessage } from '@/lib/staff-admin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (actor.systemRole !== 'hq') {
    return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
  }
  const limited = await enforceApiRateLimit('staff-reset-password', actor.uid, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { email?: string } | null;
  const email = String(body?.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'email required' }, { status: 400 });
  }

  try {
    const auth = getAuth(getAdminApp());
    const link = await auth.generatePasswordResetLink(email);
    return NextResponse.json({ ok: true, email, link });
  } catch (e) {
    return NextResponse.json({ error: authErrorMessage(e, '비밀번호 재설정 링크 발급 실패') }, { status: 400 });
  }
}
