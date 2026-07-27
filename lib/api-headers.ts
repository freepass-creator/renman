'use client';

/** Build API headers from the current Firebase session's short-lived ID token. */
export async function apiAuthHeaders(extra?: HeadersInit): Promise<Headers> {
  const headers = new Headers(extra);
  const { getAuthClient, firebaseReady } = await import('./firebase/client');

  if (firebaseReady()) {
    const user = getAuthClient()?.currentUser;
    if (!user) throw new Error('로그인이 필요합니다.');
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }

  return headers;
}
