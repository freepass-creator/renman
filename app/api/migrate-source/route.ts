/**
 * 스위치플랜 마이그레이션 소스파일 자동 로더 (로컬 dev 전용).
 *
 * 브라우저는 디스크의 임의 파일을 못 읽으므로, 로컬 dev 서버(Node)가
 * MIGRATE_ROOT 의 사업현황.xlsx + 자금일보.xlsx 를 읽어 base64 로 넘긴다.
 *
 * 배포(production)에선 항상 403 — 서버 디스크 파일 노출 금지.
 * 경로: MIGRATE_ROOT | MIGRATE_BIZ_PATH | MIGRATE_JBO_PATH
 */
import { NextResponse } from 'next/server';
import { readFile, stat, readdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const MIGRATE_ROOT = process.env.MIGRATE_ROOT || 'C:\\dev\\jpkerp6-마이그레이션\\switchplan_스위치플랜';

async function loadOne(p: string): Promise<{ name: string; b64: string; mtime: string } | null> {
  try {
    const buf = await readFile(p);
    const { mtime } = await stat(p);
    return { name: path.basename(p), b64: buf.toString('base64'), mtime: mtime.toISOString() };
  } catch {
    return null;
  }
}

/** 폴더 안 xlsx 중 이름에 needle 포함(가장 큰 파일 우선 — 사업현황이 보통 큼). */
async function findXlsx(root: string, needle: string): Promise<string | null> {
  try {
    const names = await readdir(root);
    const hits = names
      .filter((n) => n.toLowerCase().endsWith('.xlsx') && !n.startsWith('~$') && n.includes(needle))
      .map((n) => path.join(root, n));
    if (!hits.length) return null;
    const scored = await Promise.all(hits.map(async (p) => ({ p, size: (await stat(p)).size })));
    scored.sort((a, b) => b.size - a.size);
    return scored[0].p;
  } catch {
    return null;
  }
}

async function resolveBizPath(): Promise<string> {
  if (process.env.MIGRATE_BIZ_PATH) return process.env.MIGRATE_BIZ_PATH;
  return (
    (await findXlsx(MIGRATE_ROOT, '사업현황')) ||
    path.join(MIGRATE_ROOT, '[스위치플랜] 사업현황.xlsx')
  );
}

async function resolveJboPath(): Promise<string> {
  if (process.env.MIGRATE_JBO_PATH) return process.env.MIGRATE_JBO_PATH;
  return (
    (await findXlsx(MIGRATE_ROOT, '자금일보')) ||
    path.join(MIGRATE_ROOT, '26년_스위치플랜_자금일보.xlsx')
  );
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: '로컬 dev 전용' }, { status: 403 });
  }
  const bizPath = await resolveBizPath();
  const jboPath = await resolveJboPath();
  const [biz, jbo] = await Promise.all([loadOne(bizPath), loadOne(jboPath)]);
  return NextResponse.json({
    ok: true,
    biz,
    jbo,
    bizPath,
    jboPath,
    migrateRoot: MIGRATE_ROOT,
    found: { biz: !!biz, jbo: !!jbo },
  });
}
