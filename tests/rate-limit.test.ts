import { beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, resetRateLimitsForTests } from '@/lib/rate-limit';

describe('API rate limiter', () => {
  beforeEach(() => resetRateLimitsForTests());

  it('정해진 횟수까지 허용하고 이후 요청을 차단한다', () => {
    const policy = { limit: 2, windowMs: 10_000 };
    expect(consumeRateLimit('ocr:u1', policy, 1_000)).toMatchObject({ allowed: true, remaining: 1 });
    expect(consumeRateLimit('ocr:u1', policy, 1_001)).toMatchObject({ allowed: true, remaining: 0 });
    expect(consumeRateLimit('ocr:u1', policy, 1_002)).toMatchObject({ allowed: false, retryAfterSeconds: 10 });
  });

  it('사용자와 API 범위를 서로 격리한다', () => {
    const policy = { limit: 1, windowMs: 10_000 };
    expect(consumeRateLimit('ocr:u1', policy, 0).allowed).toBe(true);
    expect(consumeRateLimit('ocr:u2', policy, 0).allowed).toBe(true);
    expect(consumeRateLimit('notify:u1', policy, 0).allowed).toBe(true);
  });

  it('윈도우가 끝나면 다시 허용한다', () => {
    const policy = { limit: 1, windowMs: 1_000 };
    expect(consumeRateLimit('drive:u1', policy, 0).allowed).toBe(true);
    expect(consumeRateLimit('drive:u1', policy, 999).allowed).toBe(false);
    expect(consumeRateLimit('drive:u1', policy, 1_000).allowed).toBe(true);
  });
});
