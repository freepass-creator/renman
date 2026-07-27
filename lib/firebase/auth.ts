'use client';
// Firebase Auth 배선 — firebaseReady()면 활성, 아니면 no-op(로컬 DEV는 session.tsx).
//   권한 SSOT = Firebase Custom Claims(systemRole, companyId).
//   users/{uid}는 표시 이름 등 비권한 프로필만 저장.
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

// 계정 만들기 — Auth + 프로필. 관리자가 Custom Claims를 배정해야 활성.
export async function signup(p: {
  email: string;
  password: string;
  name: string;
  phone?: string;
  companyName?: string;
  businessNo?: string;
}): Promise<void> {
  // 본사 마스터 이메일은 가입으로 절대 선점 불가(전 법인 HQ 권한이 이메일 문자열에 걸려 있어 탈취 방지). 마스터 계정은 콘솔서 사전생성.
  const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
  const { getFirestore, doc, setDoc } = await import('firebase/firestore');
  const cred = await createUserWithEmailAndPassword(getAuth(getFirebaseApp()!), p.email.trim(), p.password);
  await setDoc(doc(getFirestore(getFirebaseApp()!), 'users', cred.user.uid), {
    name: p.name.trim(),
    email: p.email.trim(),
    phone: p.phone || '',
    companyName: p.companyName || '',
    businessNo: p.businessNo || '',
    createdAt: new Date().toISOString(),
  });
}

export async function loadProfile(uid: string, email: string | null): Promise<AuthProfile | null> {
  const { getAuth } = await import('firebase/auth');
  const { getFirestore, doc, getDoc } = await import('firebase/firestore');
  const authUser = getAuth(getFirebaseApp()!).currentUser;
  if (!authUser || authUser.uid !== uid) return null;
  const claims = (await authUser.getIdTokenResult()).claims;
  const systemRole = claims.systemRole;
  const companyClaim = typeof claims.companyId === 'string' ? claims.companyId : null;
  const role: Role | null = systemRole === 'hq' ? '본사' : systemRole === 'tenant' ? '법인' : null;
  if (!role || (role === '법인' && !companyClaim)) return null;

  const snap = await getDoc(doc(getFirestore(getFirebaseApp()!), 'users', uid));
  const data = snap.exists() ? snap.data() as { name?: string } : {};
  return {
    uid,
    email: email || '',
    name: String(data.name || email || uid),
    role,
    companyId: role === '본사' ? null : companyClaim,
  };
}
