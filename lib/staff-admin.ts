/**
 * 직원 Auth 관리 — 서버 전용 헬퍼 (listUsers · 마지막 hq 잠금 · audit_logs).
 * Custom Claims(systemRole/companyId)가 권한 SSOT. 이메일 화이트리스트 방식 금지.
 */
import 'server-only';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { buildAuditLog, setAuditActor, type AuditAction } from '@/lib/audit';
import { getAdminApp, type AuthedActor } from '@/lib/api-auth';

export type StaffSystemRole = 'hq' | 'tenant' | null;

export type AuthStaffRow = {
  uid: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string;
  disabled: boolean;
  provider: string;
  systemRole: StaffSystemRole;
  companyId: string | null;
};

export function claimsOf(u: UserRecord): { systemRole: StaffSystemRole; companyId: string | null } {
  const c = (u.customClaims || {}) as { systemRole?: unknown; companyId?: unknown };
  const systemRole = c.systemRole === 'hq' || c.systemRole === 'tenant' ? c.systemRole : null;
  const companyId = typeof c.companyId === 'string' && c.companyId ? c.companyId : null;
  return { systemRole, companyId: systemRole === 'hq' ? null : companyId };
}

export function providerOf(u: UserRecord): string {
  const p = u.providerData?.[0]?.providerId || 'password';
  if (p === 'password') return 'email';
  if (p.startsWith('google')) return 'google';
  return p;
}

export function toAuthStaffRow(u: UserRecord): AuthStaffRow {
  const { systemRole, companyId } = claimsOf(u);
  return {
    uid: u.uid,
    email: u.email || '',
    displayName: u.displayName || '',
    createdAt: u.metadata.creationTime || '',
    lastSignInAt: u.metadata.lastSignInTime || '',
    disabled: !!u.disabled,
    provider: providerOf(u),
    systemRole,
    companyId,
  };
}

/** listUsers 페이지네이션으로 전체 순회. */
export async function listAllAuthUsers(): Promise<UserRecord[]> {
  const auth = getAuth(getAdminApp());
  const out: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    out.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/** 활성(비활성 아님) hq 계정 수. */
export async function countActiveHq(excludeUid?: string): Promise<number> {
  const users = await listAllAuthUsers();
  return users.filter((u) => {
    if (excludeUid && u.uid === excludeUid) return false;
    if (u.disabled) return false;
    return claimsOf(u).systemRole === 'hq';
  }).length;
}

/** 자기 계정 보호. */
export function rejectSelf(actor: AuthedActor, targetUid: string): NextResponse | null {
  if (targetUid && targetUid === actor.uid) {
    return NextResponse.json({ error: '자기 계정은 정지·강등·삭제할 수 없습니다' }, { status: 400 });
  }
  return null;
}

/**
 * 마지막 hq 잠금 — 대상이 활성 hq 이고, 본인을 제외한 활성 hq 가 0이면 거부.
 * suspend/강등/삭제 전에 호출. (이미 disabled 인 hq 는 잠금 대상 아님)
 */
export async function rejectLastHq(target: UserRecord): Promise<NextResponse | null> {
  if (target.disabled) return null;
  if (claimsOf(target).systemRole !== 'hq') return null;
  const others = await countActiveHq(target.uid);
  if (others < 1) {
    return NextResponse.json({ error: '마지막 본사 계정은 정지·강등·삭제할 수 없습니다' }, { status: 400 });
  }
  return null;
}

export function authErrorMessage(e: unknown, fallback: string): string {
  const code = (e as { code?: string }).code;
  if (code === 'auth/user-not-found') return '해당 계정을 찾을 수 없습니다';
  if (code === 'auth/invalid-email') return '이메일 형식이 올바르지 않습니다';
  if (code === 'auth/email-not-found') return '해당 이메일의 로그인 계정이 없습니다';
  return (e as Error).message || fallback;
}

/** audit_logs append — Admin SDK. byUid = actor.uid 필수(규칙·감사 SSOT). */
export async function writeStaffAudit(
  actor: AuthedActor,
  p: {
    action: AuditAction;
    entityId: string;
    label: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
): Promise<void> {
  setAuditActor({
    uid: actor.uid,
    name: actor.email || actor.uid,
    email: actor.email || '',
    role: actor.systemRole,
  });
  try {
    const log = buildAuditLog({
      action: p.action,
      entityType: 'auth_user',
      entityId: p.entityId,
      companyId: actor.companyId || '_hq',
      label: p.label,
      before: p.before ?? null,
      after: p.after ?? null,
    });
    // byUid는 buildAuditLog가 actor에서 채움 — 한 번 더 고정
    log.byUid = actor.uid;
    log.byEmail = actor.email || '';
    await getFirestore(getAdminApp()).collection('audit_logs').doc(log.id).set(log);
  } finally {
    setAuditActor(null);
  }
}
