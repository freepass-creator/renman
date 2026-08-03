import { spawn } from 'node:child_process';

const port = Number(process.env.SMOKE_PORT || 6016);
const production = process.argv.includes('--production');
const base = production
  ? (process.env.SMOKE_BASE_URL || 'https://renman.vercel.app').replace(/\/$/, '')
  : `http://127.0.0.1:${port}`;
const routes = [
  '/', '/admin', '/asset', '/audit', '/cash', '/company', '/contract',
  '/contract-history', '/dispatch', '/docs', '/finance', '/financials',
  '/inbox', '/ingest', '/ingest/bulk', '/ingest/classify', '/integrity',
  '/m', '/m/entry', '/m/ops', '/manage', '/ops', '/payments', '/penalty',
  '/pnl', '/receivables', '/repair', '/search', '/settings', '/sheet',
  '/trash', '/vat', '/work',
];

const server = production ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});
let logs = '';
server?.stdout.on('data', (chunk) => { logs += chunk.toString(); });
server?.stderr.on('data', (chunk) => { logs += chunk.toString(); });

async function waitUntilReady() {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await fetch(base)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`server did not become ready\n${logs}`);
}

try {
  await waitUntilReady();
  const failures: string[] = [];
  for (const route of routes) {
    const response = await fetch(base + route);
    if (response.status !== 200) failures.push(`${route}: ${response.status}`);
  }
  const health = await fetch(`${base}/api/health`);
  const healthBody = await health.json() as { ok?: boolean; environment?: string; releaseIdentified?: boolean };
  if (health.status !== 200 || healthBody.ok !== true) failures.push('/api/health: invalid response');
  if (production && (healthBody.environment !== 'production' || healthBody.releaseIdentified !== true)) {
    failures.push('/api/health: production release identity missing');
  }

  if (production) {
    const unauthorized = await fetch(`${base}/api/entities/vehicle`);
    if (unauthorized.status !== 401) failures.push(`/api/entities/vehicle: expected 401, got ${unauthorized.status}`);
  }

  const page = await fetch(base);
  const requiredHeaders = [
    'content-security-policy',
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'permissions-policy',
  ];
  for (const header of requiredHeaders) {
    if (!page.headers.get(header)) failures.push(`missing header: ${header}`);
  }
  if (page.headers.get('x-powered-by')) failures.push('x-powered-by must be disabled');
  if (!health.headers.get('cache-control')?.includes('no-store')) failures.push('health cache-control must be no-store');
  if (failures.length) throw new Error(`smoke failures\n${failures.join('\n')}\n${logs}`);
  console.log(`smoke${production ? ':production' : ''}: ${routes.length}/${routes.length} routes + health/security headers${production ? ' + auth boundary' : ''} passed`);
} finally {
  server?.kill('SIGTERM');
}
