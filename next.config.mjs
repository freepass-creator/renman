/** @type {import('next').NextConfig} */
const nextConfig = {
  // QA/CI can build into an isolated directory without corrupting a running
  // developer server's .next output (NEXT_DIST_DIR=.next-qa).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  reactStrictMode: false,
  async headers() {
    // Next 개발 번들의 Fast Refresh는 eval을 사용한다. 운영 CSP는 계속 eval을 차단한다.
    const scriptSrc = process.env.NODE_ENV === 'production'
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      scriptSrc,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      'upgrade-insecure-requests',
    ].join('; ');
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ];
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};
export default nextConfig;
