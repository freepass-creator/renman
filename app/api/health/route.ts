import { NextResponse } from 'next/server';
import packageJson from '@/package.json';

export const dynamic = 'force-dynamic';

export function GET() {
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || '').slice(0, 12) || null;
  return NextResponse.json({
    ok: true,
    service: packageJson.name,
    version: packageJson.version,
    commit,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
    releaseIdentified: process.env.NODE_ENV !== 'production' || commit !== null,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
