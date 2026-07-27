/**
 * Assign Firebase authorization claims.
 *
 * npm run admin:set-claims -- --email user@example.com --role hq
 * npm run admin:set-claims -- --email staff@example.com --role tenant --company prime
 * npm run admin:set-claims -- --uid abc123 --clear
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function arg(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '') : '';
}

const rawKey = (process.env.FIREBASE_ADMIN_KEY || '').trim();
if (!rawKey) throw new Error('FIREBASE_ADMIN_KEY is required');

const uidArg = arg('uid');
const email = arg('email');
const role = arg('role');
const companyId = arg('company');
const clear = process.argv.includes('--clear');

if (!uidArg && !email) throw new Error('--uid or --email is required');
if (!clear && role !== 'hq' && role !== 'tenant') throw new Error('--role must be hq or tenant');
if (!clear && role === 'tenant' && !companyId) throw new Error('--company is required for tenant users');

const app = initializeApp({ credential: cert(JSON.parse(rawKey)) });
const auth = getAuth(app);
const user = uidArg ? await auth.getUser(uidArg) : await auth.getUserByEmail(email);
const current = user.customClaims || {};

if (clear) {
  const { systemRole: _role, companyId: _company, ...rest } = current;
  await auth.setCustomUserClaims(user.uid, rest);
  console.log(`cleared authorization claims: ${user.uid}`);
} else {
  await auth.setCustomUserClaims(user.uid, {
    ...current,
    systemRole: role,
    ...(role === 'tenant' ? { companyId } : { companyId: null }),
  });
  await auth.revokeRefreshTokens(user.uid);
  console.log(`updated claims: ${user.uid} role=${role}${companyId ? ` company=${companyId}` : ''}`);
}
