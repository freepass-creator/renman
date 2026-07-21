/** @type {import('next').NextConfig} */
const nextConfig = {
  // 개발 버벅임 방지: StrictMode의 이중 마운트(effect·데이터패치·연산 2회)를 끔.
  // 프로덕션은 원래 단일 실행이라 영향 없음. 필요 시 true로 되돌려 이펙트 정합성 점검.
  reactStrictMode: false,
  // distDir는 기본 `.next` 유지 (밖으로 빼면 turbopack이 node_modules를 못 찾음).
  // 캐시 물리 위치는 정션: .next → ../cache/jpkerp6/.next  (docs/CACHE.md)
};
export default nextConfig;
