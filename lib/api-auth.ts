/**
 * 공용 API 인증.
 * · API_SHARED_SECRET 설정 시 Bearer 토큰 필수.
 * · production 에서는 시크릿 미설정 = 503 (OCR/문자 무단 호출 차단).
 * · 로컬(development)만 시크릿 없이 통과.
 */
import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export type AuthedActor = { uid: string; email: string };

export async function requireAuth(): Promise<AuthedActor | NextResponse> {
  const h = await headers();
  const auth = h.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const secret = (process.env.API_SHARED_SECRET || '').trim();

  if (secret) {
    if (token !== secret) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    return { uid: 'api', email: 'api@server' };
  }

  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'API_SHARED_SECRET required in production' },
      { status: 503 },
    );
  }

  return { uid: 'local-dev', email: 'local@dev' };
}
