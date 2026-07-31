/**
 * 오픈 전 회귀 게이트 — 돈/미수 테스트 + tsc + (가능하면) :6006 curl.
 *
 *   npm run open:gate
 *
 * curl은 SMOKE_BASE(기본 http://localhost:6006)가 살아 있을 때만. 죽으면 SKIP(실패 아님).
 * Windows에서는 undici fetch+AbortSignal이 UV assert로 죽어서 curl.exe를 씀.
 */
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const base = (process.env.SMOKE_BASE || 'http://localhost:6006').replace(/\/$/, '');
const moneyTests = [
  'tests/receivables.test.ts',
  'tests/deposit-offset.test.ts',
  'tests/money-r5-r7-r8.test.ts',
  'tests/cms-settle-subject.test.ts',
  'tests/bank-tx-key.test.ts',
];

const routes = ['/', '/receivables', '/work', '/cash', '/pnl', '/vat', '/risk', '/contract', '/asset'];

function run(label: string, command: string, args: string[]): boolean {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  if (r.error) {
    console.error(`✖ ${label} FAIL (${r.error.message})`);
    return false;
  }
  if (r.status !== 0) {
    console.error(`✖ ${label} FAIL (exit ${r.status})`);
    return false;
  }
  console.log(`✔ ${label}`);
  return true;
}

function httpCode(url: string, maxSec: number): { code: number; err?: string } {
  const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const r = spawnSync(
    bin,
    ['-s', '-o', 'NUL', '-w', '%{http_code}', '--max-time', String(maxSec), '-L', url],
    { encoding: 'utf8', shell: false },
  );
  if (r.error) return { code: 0, err: r.error.message };
  const code = Number(String(r.stdout || '').trim());
  if (!Number.isFinite(code) || code === 0) {
    return { code: 0, err: String(r.stderr || r.stdout || 'no response').trim() || 'no response' };
  }
  return { code };
}

function curlRoutes(): 'ok' | 'skip' | 'fail' {
  const probe = httpCode(base + '/', 5);
  if (probe.code === 0) {
    console.log(`\n○ curl SKIP — ${base} 응답 없음 (dev 서버 켠 뒤 재실행)`);
    if (probe.err) console.log(`  (${probe.err})`);
    return 'skip';
  }
  if (probe.code >= 500) {
    console.error(`✖ curl FAIL — probe ${base}/ → ${probe.code}`);
    return 'fail';
  }

  console.log(`\n▶ curl ${base}`);
  const fails: string[] = [];
  for (const path of routes) {
    const { code, err } = httpCode(base + path, 25);
    if (code === 200 || code === 304) {
      process.stdout.write(`  ${path} ${code}\n`);
    } else {
      fails.push(`${path} ${code || err || 'error'}`);
    }
  }
  if (fails.length) {
    console.error(`✖ curl FAIL\n${fails.map((f) => `  - ${f}`).join('\n')}`);
    return 'fail';
  }
  console.log(`✔ curl ${routes.length}/${routes.length}`);
  return 'ok';
}

const okVitest = run('vitest money/receivables', 'npx', ['vitest', 'run', ...moneyTests]);
const okTsc = run('tsc --noEmit', 'npx', ['tsc', '--noEmit']);
const curl = curlRoutes();

const ok = okVitest && okTsc && curl !== 'fail';
console.log('\n=== open:gate ===');
console.log(`vitest: ${okVitest ? 'OK' : 'FAIL'}`);
console.log(`tsc:    ${okTsc ? 'OK' : 'FAIL'}`);
console.log(`curl:   ${curl.toUpperCase()}`);
process.exit(ok ? 0 : 1);
