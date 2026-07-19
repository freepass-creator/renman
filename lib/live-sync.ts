'use client';
// 실시간 반영 — Firestore onSnapshot으로 원격(다른 탭·다른 사용자) 변경을 감지해 notifySaved 발화.
//   v5의 RTDB onValue "저장하면 전 화면·전 사용자 자동갱신"을 v6에 그래프팅. 스토어 list는 그대로.
//   로컬 쓰기(hasPendingWrites)는 store가 이미 자동 notify하므로 무시 → 이중발화 없음.
//   초기 스냅샷도 무시(useReloadOnSaved 소비처가 이미 1회 로드). Firebase 모드에서만 동작.
import { getFirebaseApp, firebaseReady } from './firebase/client';
import { COMPANIES, ALL_COMPANIES } from './companies';
import { notifySaved } from './ui-bus';

// 화면이 실시간으로 봐야 하는 핵심 엔티티(운영·리스크·자산·계약·재무).
const LIVE_ENTITIES = ['contract', 'vehicle', 'bank_tx', 'insurance', 'penalty', 'history'];

/** 현재 회사 스코프의 핵심 컬렉션을 구독. 원격 변경 시 notifySaved → 전 화면 재조회. 반환=구독 해제. */
export function startLiveSync(companyId: string): () => void {
  if (!companyId || !firebaseReady() || typeof window === 'undefined') return () => {};
  let unsubs: Array<() => void> = [];
  let cancelled = false;
  (async () => {
    try {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      if (cancelled) return;
      const db = getFirestore(getFirebaseApp()!);
      const companies = companyId === ALL_COMPANIES ? COMPANIES : [companyId];
      for (const ent of LIVE_ENTITIES) {
        for (const co of companies) {
          let first = true;
          const q = query(collection(db, ent), where('companyId', '==', co));
          const unsub = onSnapshot(q, (snap) => {
            if (first) { first = false; return; }           // 초기 스냅샷 무시(이미 로드됨)
            if (snap.metadata.hasPendingWrites) return;      // 내 탭 쓰기는 store 자동 notify가 처리
            notifySaved();                                   // 원격 변경 → 전 화면 갱신
          }, () => { /* 권한/네트워크 오류는 조용히 — 폴백은 notifySaved 수동경로 */ });
          unsubs.push(unsub);
        }
      }
    } catch { /* firestore 로드 실패 시 실시간 없이 진행 */ }
  })();
  return () => { cancelled = true; unsubs.forEach((u) => u()); unsubs = []; };
}
