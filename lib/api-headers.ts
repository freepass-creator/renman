'use client';

import { withTimeout } from './async';

/** Build API headers from the current Firebase session's short-lived ID token. */
export async function apiAuthHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  const { getAuthClient, firebaseReady } = await import('./firebase/client');

  if (firebaseReady()) {
    const user = getAuthClient()?.currentUser;
    if (!user) throw new Error('로그인이 필요합니다.');
    // getIdToken이 멈추면 목록 스피너가 영구 고정됨 → 상한.
    headers.set('Authorization', `Bearer ${await withTimeout(user.getIdToken(), 8_000, 'getIdToken')}`);
  }

  return headers;
}
