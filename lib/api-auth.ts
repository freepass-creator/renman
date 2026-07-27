/**
 * Server API authentication.
 *
 * Production requests must carry a Firebase ID token. The token is verified
 * with Firebase Admin; browser-visible shared secrets are deliberately not
 * supported. Local development without Firebase remains available for the
 * repository's preview mode.
 */
import 'server-only';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';

export type AuthedActor = {
  uid: string;
  email: string;
  systemRole: 'hq' | 'tenant' | 'local';
  companyId: string | null;
};

export function getAdminApp() {
  const current = getApps()[0];
  if (current) return current;

  const raw = (process.env.FIREBASE_ADMIN_KEY || '').trim();
  if (raw) {
    const serviceAccount = JSON.parse(raw);
    return initializeApp({ credential: cert(serviceAccount) });
  }
  const keyFile = (process.env.FIREBASE_ADMIN_KEY_FILE || '').trim();
  if (keyFile) {
    const serviceAccount = JSON.parse(readFileSync(keyFile, 'utf8'));
    return initializeApp({ credential: cert(serviceAccount) });
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

export async function requireAuth(req: Request): Promise<AuthedActor | NextResponse> {
  if (process.env.NODE_ENV !== 'production' && !process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
    return { uid: 'local-dev', email: 'local@dev', systemRole: 'local', companyId: null };
  }

  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(token, true);
    const systemRole = decoded.systemRole;
    const companyId = typeof decoded.companyId === 'string' ? decoded.companyId : null;
    if (systemRole !== 'hq' && !(systemRole === 'tenant' && companyId)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return {
      uid: decoded.uid,
      email: decoded.email || '',
      systemRole,
      companyId: systemRole === 'hq' ? null : companyId,
    };
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
