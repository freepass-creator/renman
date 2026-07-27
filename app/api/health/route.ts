import { NextResponse } from 'next/server';
import packageJson from '@/package.json';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: packageJson.name,
    version: packageJson.version,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').slice(0, 12) || null,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
