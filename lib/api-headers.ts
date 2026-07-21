/**
 * 클라이언트 → /api/* 공용 헤더.
 * production에서 API_SHARED_SECRET을 쓰면 같은 값을 NEXT_PUBLIC_API_SHARED_SECRET에도 넣는다.
 * (브라우저 노출 한계 — 장기적으로는 Firebase ID 토큰 검증으로 교체. DEPLOY.md)
 */
export function apiAuthHeaders(extra?: HeadersInit): HeadersInit {
  const secret = (process.env.NEXT_PUBLIC_API_SHARED_SECRET || '').trim();
  const base: Record<string, string> = {};
  if (secret) base.Authorization = `Bearer ${secret}`;
  if (!extra) return base;
  if (extra instanceof Headers) {
    extra.forEach((v, k) => { base[k] = v; });
    return base;
  }
  return { ...base, ...(extra as Record<string, string>) };
}
