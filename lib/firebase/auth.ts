'use client';
// Firebase Auth 배선 — firebaseReady()면 활성, 아니면 no-op(로컬 DEV는 session.tsx).
//   users/{uid} = { role: '본사'|'법인'(|레거시 운영자|위탁사), companyId }
//   본사(companyId=null) = 전 법인. 법인 소속 직원 = 배정 companyId만.
import { getFirebaseApp, firebaseReady } from './client';

/** 본사=전 법인 합본·전환 / 법인=배정된 법인만 */
export type Role = '본사' | '법인';
export type AuthProfile = { uid: string; name: string; email: string; role: Role; companyId: string | null };
export type FbUser = { uid: string; email: string | null } | null;

/** Firestore·구버전 값 → Role. 미배정이면 null. */
export function normalizeRole(raw: unknown): Role | null {
  const s = String(raw || '');
  if (s === '본사' || s === '운영자') return '본사';
  if (s === '법인' || s === '위탁사') return '법인';
  return null;
}

/** 마스터 HQ 이메일 — env로 교체 가능. Firestore rules의 isMaster()와 동일 값 유지. */
export const MASTER_EMAIL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MASTER_EMAIL
  ? process.env.NEXT_PUBLIC_MASTER_EMAIL
  : 'pyh@teamjpk.com').trim().toLowerCase();
function isMasterEmail(email: string | null): boolean {
  return (email || '').trim().toLowerCase() === MASTER_EMAIL;
}

export function watchAuth(cb: (u: FbUser) => void): () => void {
  if (!firebaseReady()) { cb(null); return () => {}; }
  let unsub = () => {};
  let dead = false;
  (async () => {
    const { getAuth, onAuthStateChanged } = await import('firebase/auth');
    if (dead) return;
    unsub = onAuthStateChanged(getAuth(getFirebaseApp()!), (u) => cb(u ? { uid: u.uid, email: u.email } : null));
  })();
  return () => { dead = true; unsub(); };
}

export async function signInEmail(email: string, password: string): Promise<void> {
  const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
  await signInWithEmailAndPassword(getAuth(getFirebaseApp()!), email.trim(), password);
}

export async function signOutUser(): Promise<void> {
  if (!firebaseReady()) return;
  const { getAuth, signOut } = await import('firebase/auth');
  await signOut(getAuth(getFirebaseApp()!));
}

export async function resetPassword(email: string): Promise<void> {
  const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
  await sendPasswordResetEmail(getAuth(getFirebaseApp()!), email.trim());
}

// 계정 만들기 — Auth + 프로필(역할·법인 없음). 본사가 role·companyId 배정해야 활성.
export async function signup(p: { email: string; password: string; name: string; phone?: string; department?: string }): Promise<void> {
  // 본사 마스터 이메일은 가입으로 절대 선점 불가(전 법인 HQ 권한이 이메일 문자열에 걸려 있어 탈취 방지). 마스터 계정은 콘솔서 사전생성.
  if (isMasterEmail(p.email)) throw new Error('허용되지 않은 이메일입니다.');
  const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
  const { getFirestore, doc, setDoc } = await import('firebase/firestore');
  const cred = await createUserWithEmailAndPassword(getAuth(getFirebaseApp()!), p.email.trim(), p.password);
  await setDoc(doc(getFirestore(getFirebaseApp()!), 'users', cred.user.uid), {
    name: p.name.trim(), email: p.email.trim(), phone: p.phone || '', department: p.department || '',
    createdAt: new Date().toISOString(),
  });
}

export async function loadProfile(uid: string, email: string | null): Promise<AuthProfile | null> {
  const { getFirestore, doc, getDoc } = await import('firebase/firestore');
  const snap = await getDoc(doc(getFirestore(getFirebaseApp()!), 'users', uid));
  const master = isMasterEmail(email);
  if (!snap.exists()) return master ? { uid, email: email || '', name: '마스터', role: '본사', companyId: null } : null;
  const d = snap.data() as { name?: string; role?: string; companyId?: string | null };
  const role = normalizeRole(d.role) ?? (master ? '본사' : null);
  if (!role) return null;
  // 법인 소속은 companyId 필수 — 없으면 미등록과 동일(데이터 안 보이게)
  if (role === '법인' && !d.companyId) return null;
  return { uid, email: email || '', name: String(d.name || email || uid), role, companyId: d.companyId ?? null };
}
