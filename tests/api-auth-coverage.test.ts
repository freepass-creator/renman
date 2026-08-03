import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const apiRoot = join(root, 'app', 'api');

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

const publicRoutes = new Set(['app/api/health/route.ts']);
const protectedRoutes = routeFiles(apiRoot)
  .map((path) => ({ path, label: relative(root, path).replaceAll('\\', '/') }))
  .filter(({ label }) => !publicRoutes.has(label));

describe('서버 API 인증 경계', () => {
  it('health 외 모든 API 라우트를 자동으로 검사한다', () => {
    expect(protectedRoutes.length).toBeGreaterThan(0);
  });

  for (const { path, label } of protectedRoutes) {
    it(`${label}의 모든 핸들러가 요청 처리 전에 인증을 종료한다`, () => {
      const source = readFileSync(path, 'utf8');
      const handlers = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)];
      expect(handlers.length, `${label}: HTTP 핸들러 없음`).toBeGreaterThan(0);
      expect(source, `${label}: requireAuth import 없음`).toContain("from '@/lib/api-auth'");

      handlers.forEach((handler, index) => {
        const start = handler.index ?? 0;
        const end = handlers[index + 1]?.index ?? source.length;
        const body = source.slice(start, end);
        const auth = body.indexOf('await requireAuth(req)');
        const rejectionReturn = body.indexOf('instanceof NextResponse');
        expect(auth, `${label} ${handler[1]}: requireAuth 호출 없음`).toBeGreaterThanOrEqual(0);
        expect(rejectionReturn, `${label} ${handler[1]}: 인증 실패 즉시 반환 없음`).toBeGreaterThan(auth);

        const sensitiveStarts = ['req.json()', 'req.formData()', 'getAdminApp()', 'fetch(']
          .map((needle) => body.indexOf(needle))
          .filter((position) => position >= 0);
        if (sensitiveStarts.length) {
          expect(Math.min(...sensitiveStarts), `${label} ${handler[1]}: 인증 전 요청 처리`).toBeGreaterThan(rejectionReturn);
        }
      });
    });
  }
});
