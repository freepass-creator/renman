'use client';
/**
 * 전체 초기화 — 로컬(localStorage) + Firestore 실 삭제. 설정의 "전체 초기화"·"실데이터 불러오기(초기화 후)"에서 사용.
 * 소프트삭제가 아니라 하드 삭제(문서 제거) — 씨앗 재적재를 위한 리셋용. 운영자(마스터) 권한 필요.
 */
import { getFirebaseApp, firebaseReady } from './firebase/client';
import { ENTITY_LIST } from './intake/entities';
import { COMPANIES } from './companies';
import { clearStoreCache } from './store';

// ENTITY_LIST 외 컬렉션. audit_logs는 append-only(삭제 금지 규칙)라 Firestore 초기화 대상에서 제외 — 감사무결성 보존.
const LOCAL_EXTRA = ['audit_logs', 'issued_doc'];
const FIRESTORE_EXTRA = ['issued_doc']; // audit_logs 제외(append-only)

export async function wipeAllData(): Promise<{ deleted: number; backend: string }> {
  clearStoreCache();
  // 로컬 초기화(모든 회사 × 모든 엔티티) — 로컬은 규칙 없어 audit_logs도 제거
  if (typeof window !== 'undefined') {
    for (const c of COMPANIES) for (const e of [...ENTITY_LIST.map((x) => x.key), ...LOCAL_EXTRA]) {
      localStorage.removeItem(`jpkerp6:${c}:${e}`);
    }
  }
  if (!firebaseReady()) return { deleted: 0, backend: 'local' };

  const { getFirestore, collection, getDocs, writeBatch } = await import('firebase/firestore');
  const db = getFirestore(getFirebaseApp()!);
  const colls = [...new Set([...ENTITY_LIST.map((e) => e.key), ...FIRESTORE_EXTRA])];
  let deleted = 0;
  for (const cn of colls) {
    const snap = await getDocs(collection(db, cn));
    let batch = writeBatch(db), n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref); n++; deleted++;
      if (n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n > 0) await batch.commit();
  }
  clearStoreCache();
  return { deleted, backend: 'firestore' };
}

/** 회사 1개만 초기화(하드) — 개발도구 회사별 관리용. audit_logs 제외(append-only). */
export async function wipeCompany(companyId: string): Promise<{ deleted: number }> {
  clearStoreCache();
  if (typeof window !== 'undefined') {
    for (const e of [...ENTITY_LIST.map((x) => x.key), ...LOCAL_EXTRA]) localStorage.removeItem(`jpkerp6:${companyId}:${e}`);
  }
  if (!firebaseReady()) return { deleted: 0 };
  const { getFirestore, collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
  const db = getFirestore(getFirebaseApp()!);
  const colls = [...new Set([...ENTITY_LIST.map((e) => e.key), ...FIRESTORE_EXTRA])];
  let deleted = 0;
  for (const cn of colls) {
    const snap = await getDocs(query(collection(db, cn), where('companyId', '==', companyId)));
    let batch = writeBatch(db), n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref); n++; deleted++;
      if (n >= 400) { await batch.commit(); batch = writeBatch(db); n = 0; }
    }
    if (n > 0) await batch.commit();
  }
  clearStoreCache();
  return { deleted };
}
