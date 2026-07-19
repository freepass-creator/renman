/**
 * 회계기간 마감(period-lock) — 마감월 거래·수납 정정 차단. ERP #18.
 *   v5 closed-periods-store 학습 → v6 localStorage(+동일 API). 실서버 이관 시 저장만 교체.
 *   가드: store update/remove · classifyTx · 수납매칭에서 assert / lockReason.
 *
 * 훅(useClosedPeriods)만 클라이언트. 순수 가드는 서버·스토어에서도 import 가능.
 */
import { useEffect, useState } from 'react';

export type ClosedPeriod = {
  closedAt: string;
  closedBy: string;
  note?: string;
  reopenHistory?: Array<{ at: string; by: string; reason?: string }>;
};

export type ClosedPeriodsMap = Record<string, ClosedPeriod>;

const KEY = (company: string) => `jpk:closed:${company}`;

/** 마감월 수정 차단 에러 — safeUpdate가 toast로 처리. */
export class PeriodClosedError extends Error {
  constructor(public yyyymm: string) {
    super(`회계기간 마감됨 — ${yyyymm}월 거래는 수정할 수 없습니다. 설정에서 해제하거나 신규 분개(전기오류수정)로 처리하세요.`);
    this.name = 'PeriodClosedError';
  }
}

function toYm(date: unknown): string {
  const ym = String(date || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(ym) ? ym : '';
}

function readMap(company: string): ClosedPeriodsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY(company));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // 구포맷: string[] → map 승격
    if (Array.isArray(parsed)) {
      const map: ClosedPeriodsMap = {};
      for (const ym of parsed) {
        if (typeof ym === 'string' && /^\d{4}-\d{2}$/.test(ym)) {
          map[ym] = { closedAt: '', closedBy: 'legacy', note: '구포맷 승격' };
        }
      }
      return map;
    }
    if (parsed && typeof parsed === 'object') {
      const map: ClosedPeriodsMap = {};
      for (const [ym, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (!/^\d{4}-\d{2}$/.test(ym)) continue;
        if (v && typeof v === 'object' && (v as ClosedPeriod).closedAt != null) map[ym] = v as ClosedPeriod;
        else if (v === true) map[ym] = { closedAt: '', closedBy: 'legacy' };
      }
      return map;
    }
  } catch { /* 무시 */ }
  return {};
}

function writeMap(company: string, map: ClosedPeriodsMap) {
  try {
    localStorage.setItem(KEY(company), JSON.stringify(map));
    window.dispatchEvent(new Event('jpk:closed-change'));
  } catch { /* 무시 */ }
  // Firestore 이중 기록 — 다기기/다사용자 동기화(로컬 캐시 + 원격). 실패해도 로컬 가드는 유지.
  void persistRemote(company, map);
}

async function persistRemote(company: string, map: ClosedPeriodsMap): Promise<void> {
  try {
    const { firebaseReady, getFirebaseApp } = await import('../firebase/client');
    if (!firebaseReady()) return;
    const { getFirestore, doc, setDoc } = await import('firebase/firestore');
    await setDoc(doc(getFirestore(getFirebaseApp()!), 'period_locks', company), {
      map, updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) { console.warn('period-lock 원격 저장 실패', e); }
}

async function hydrateRemote(company: string): Promise<ClosedPeriodsMap | null> {
  try {
    const { firebaseReady, getFirebaseApp } = await import('../firebase/client');
    if (!firebaseReady()) return null;
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(getFirestore(getFirebaseApp()!), 'period_locks', company));
    if (!snap.exists()) return null;
    const data = snap.data() as { map?: ClosedPeriodsMap };
    return data.map && typeof data.map === 'object' ? data.map : null;
  } catch { return null; }
}

/** 마감월 YYYY-MM 목록(정렬). UI·호환용. */
export function getClosedPeriods(company: string): string[] {
  return Object.keys(readMap(company)).sort();
}

export function getClosedPeriodsMap(company: string): ClosedPeriodsMap {
  return readMap(company);
}

export function isPeriodClosed(map: ClosedPeriodsMap, yyyymm: string): boolean {
  return !!map[yyyymm]?.closedAt || (yyyymm in map);
}

export function isPeriodLocked(company: string, date: unknown): boolean {
  const ym = toYm(date);
  if (!ym) return false;
  return isPeriodClosed(readMap(company), ym);
}

export function isDateInClosedPeriod(map: ClosedPeriodsMap, date: string | undefined): boolean {
  const ym = toYm(date);
  return ym ? isPeriodClosed(map, ym) : false;
}

/** 막히면 사유 문자열, 통과면 null. */
export function lockReason(company: string, date: unknown): string | null {
  const ym = toYm(date);
  if (!ym || !isPeriodLocked(company, ym)) return null;
  return `${ym}은 마감된 기간입니다 — 설정에서 마감 해제 후 수정하세요`;
}

/** 막히면 PeriodClosedError throw. */
export function assertNotLocked(company: string, date: unknown): void {
  const ym = toYm(date);
  if (ym && isPeriodLocked(company, ym)) throw new PeriodClosedError(ym);
}

/** 자금 엔티티 레코드에서 마감 판정용 일자 추출. */
export function moneyTxDate(entityKey: string, rec: Record<string, unknown> | null | undefined): string {
  if (!rec) return '';
  if (entityKey === 'bank_tx' || entityKey === 'card_tx') return String(rec.txDate || '');
  return '';
}

/** 자금 엔티티 update/remove 가드 — 통과 또는 throw. */
export function assertMoneyMutable(entityKey: string, companyId: string, before: Record<string, unknown> | null, patch?: Record<string, unknown>): void {
  if (entityKey !== 'bank_tx' && entityKey !== 'card_tx') return;
  const date = moneyTxDate(entityKey, before) || moneyTxDate(entityKey, patch || null);
  assertNotLocked(companyId, date);
}

export function closePeriod(company: string, yyyymm: string, actor: string, note?: string): string[] {
  const ym = toYm(yyyymm);
  if (!ym) return getClosedPeriods(company);
  const map = readMap(company);
  map[ym] = {
    closedAt: new Date().toISOString(),
    closedBy: actor || 'unknown',
    note: note?.trim() || undefined,
    reopenHistory: map[ym]?.reopenHistory,
  };
  writeMap(company, map);
  return Object.keys(map).sort();
}

/** 재오픈 — 사유 필수(v5와 동일). */
export function reopenPeriod(company: string, yyyymm: string, actor: string, reason: string): string[] {
  const ym = toYm(yyyymm);
  if (!ym) return getClosedPeriods(company);
  if (!reason?.trim()) throw new Error('마감 해제 사유가 필요합니다');
  const map = readMap(company);
  const prev = map[ym];
  if (!prev) return Object.keys(map).sort();
  const hist = [...(prev.reopenHistory || []), { at: new Date().toISOString(), by: actor || 'unknown', reason: reason.trim() }];
  delete map[ym];
  // 이력은 별도 키에 남기지 않음(단순화). 감사는 호출측/audit store.
  void hist;
  writeMap(company, map);
  return Object.keys(map).sort();
}

/** @deprecated close/reopen 사용. 호환: 있으면 재오픈(사유=토글), 없으면 마감. */
export function toggleClosedPeriod(company: string, ym: string, actor = 'operator'): string[] {
  const cur = getClosedPeriods(company);
  if (cur.includes(ym)) return reopenPeriod(company, ym, actor, '토글 해제');
  return closePeriod(company, ym, actor);
}

/** 설정 패널용 — 마감 목록 + 변경 이벤트 구독. */
export function useClosedPeriods(companyId: string): {
  closed: string[];
  map: ClosedPeriodsMap;
  reload: () => void;
} {
  const [map, setMap] = useState<ClosedPeriodsMap>({});
  const reload = () => setMap(getClosedPeriodsMap(companyId));
  useEffect(() => {
    reload();
    let cancelled = false;
    hydrateRemote(companyId).then((remote) => {
      if (cancelled || !remote) return;
      const local = readMap(companyId);
      const merged = { ...remote, ...local }; // 로컬(최신 기기) 우선
      writeMap(companyId, merged);
      setMap(merged);
    });
    const on = () => reload();
    window.addEventListener('jpk:closed-change', on);
    return () => { cancelled = true; window.removeEventListener('jpk:closed-change', on); };
  }, [companyId]);
  return { closed: Object.keys(map).sort(), map, reload };
}
