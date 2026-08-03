import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './api-auth';
import { consumeRateLimit, type RateLimitPolicy } from './rate-limit';

function rejected(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { ok: false, error: 'too many requests' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
  );
}

function documentId(scope: string, uid: string): string {
  const digest = createHash('sha256').update(uid).digest('hex').slice(0, 32);
  return `${scope.replace(/[^a-z0-9_-]/gi, '_')}_${digest}`;
}

export async function enforceApiRateLimit(
  scope: string,
  uid: string,
  policy: RateLimitPolicy,
): Promise<NextResponse | null> {
  // Local preview remains dependency-free and deterministic.
  if (process.env.NODE_ENV !== 'production') {
    const result = consumeRateLimit(`${scope}:${uid}`, policy);
    return result.allowed ? null : rejected(result.retryAfterSeconds);
  }

  try {
    const db = getFirestore(getAdminApp());
    const ref = db.collection('_api_rate_limits').doc(documentId(scope, uid));
    let result: { allowed: boolean; retryAfterSeconds: number } | null = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const now = Date.now();
      try {
        result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const data = snap.data() as { count?: number; resetAt?: number } | undefined;
          const resetAt = Number(data?.resetAt) || 0;
          const count = resetAt > now ? Number(data?.count) || 0 : 0;
          const nextResetAt = resetAt > now ? resetAt : now + policy.windowMs;
          if (count >= policy.limit) {
            return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((nextResetAt - now) / 1000)) };
          }
          tx.set(ref, {
            scope,
            uidHash: documentId('', uid).slice(1),
            count: count + 1,
            resetAt: nextResetAt,
            updatedAt: now,
          });
          return { allowed: true, retryAfterSeconds: 0 };
        });
        break;
      } catch (error) {
        const code = Number((error as { code?: unknown })?.code);
        if (code !== 10 || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    if (!result) throw new Error('rate limit transaction did not complete');
    return result.allowed ? null : rejected(result.retryAfterSeconds);
  } catch (error) {
    console.error('[rate-limit]', error);
    return NextResponse.json(
      { ok: false, error: 'rate limit service unavailable' },
      { status: 503, headers: { 'Retry-After': '30' } },
    );
  }
}
