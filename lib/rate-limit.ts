export type RateLimitPolicy = { limit: number; windowMs: number };
export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + policy.windowMs };
    buckets.set(key, bucket);
  }

  if (bucket.count >= policy.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  if (buckets.size > 10_000) {
    for (const [bucketKey, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(bucketKey);
    }
  }
  return {
    allowed: true,
    remaining: policy.limit - bucket.count,
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
