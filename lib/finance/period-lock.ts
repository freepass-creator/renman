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

/** 로컬 캐시 봉투 — updatedAt으로 원격과 last-write-wins 비교(해제도 전파돼야 하므로 «합집합»은 못 쓴다). */
type LocalEnvelope = { __v: 2; map: ClosedPeriodsMap; updatedAt: string };

function readEnvelope(company: string): { map: ClosedPeriodsMap; updatedAt: string } {
  return { map: readMap(company), updatedAt: readUpdatedAt(company) };
}

function readUpdatedAt(company: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = localStorage.getItem(KEY(company));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { __v?: number; updatedAt?: string };
    return parsed && typeof parsed === 'object' && parsed.__v === 2 ? String(parsed.updatedAt || '') : '';
  } catch { return ''; }
}

function readMap(company: string): ClosedPeriodsMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY(company));
    if (!raw) return {};
    let parsed = JSON.parse(raw);
    // 신포맷 봉투 → 내부 map 사용
    if (parsed && typeof parsed === 'object' && (parsed as LocalEnvelope).__v === 2) {
      parsed = (parsed as LocalEnvelope).map;
    }
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

function writeMap(company: string, map: ClosedPeriodsMap, updatedAt = new Date().toISOString()) {
  writeLocal(company, map, updatedAt);
  // Firestore 이중 기록 — 다기기/다사용자 동기화(로컬 캐시 + 원격). 실패해도 로컬 가드는 유지.
  void persistRemote(company, map, updatedAt);
}

/** 원격 반영 없이 로컬 캐시만 갱신(하이드레이트 경로 — 되쓰기 루프 방지). */
function writeLocal(company: string, map: ClosedPeriodsMap, updatedAt: string) {
  try {
    const env: LocalEnvelope = { __v: 2, map, updatedAt };
    localStorage.setItem(KEY(company), JSON.stringify(env));
    window.dispatchEvent(new Event('jpk:closed-change'));
  } catch { /* 무시 */ }
}

async function persistRemote(company: string, map: ClosedPeriodsMap, updatedAt: string): Promise<void> {
  try {
    const { firebaseReady, getFirebaseApp } = await import('../firebase/client');
    if (!firebaseReady()) return;
    const { getFirestore, doc, setDoc } = await import('firebase/firestore');
    // ★merge를 쓰지 않는다 — merge:true는 map의 «키 삭제»(마감 해제)를 원격에 반영하지 못해
    //   해제한 달이 다른 기기에서 되살아난다. 이 문서는 우리가 전권 소유하므로 전체 교체가 맞다.
    await setDoc(doc(getFirestore(getFirebaseApp()!), 'period_locks', company), {
      companyId: company, map, updatedAt,
    });
  } catch (e) { console.warn('period-lock 원격 저장 실패', e); }
}

async function hydrateRemote(company: string): Promise<{ map: ClosedPeriodsMap; updatedAt: string } | null> {
  try {
    const { firebaseReady, getFirebaseApp } = await import('../firebase/client');
    if (!firebaseReady()) return null;
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(getFirestore(getFirebaseApp()!), 'period_locks', company));
    if (!snap.exists()) return null;
    const data = snap.data() as { map?: ClosedPeriodsMap; updatedAt?: string };
    if (!data.map || typeof data.map !== 'object') return null;
    return { map: data.map, updatedAt: String(data.updatedAt || '') };
  } catch { return null; }
}

/* ── 원격 하이드레이트 ──────────────────────────────────────────────
   왜 필요한가: 가드가 읽는 곳은 localStorage다. 설정 페이지를 한 번도 열지 않은 기기·새 브라우저·
   시크릿창에서는 «마감이 하나도 없는 것»으로 보여 마감월 거래가 그대로 수정된다(QA 출시차단).
   ★서버 강제는 firestore.rules(moneyUpdatable)가 담당하고, 여기는 «UI가 미리 막아 헛수고를
     시키지 않게» 하는 역할이다 — 이 하이드레이트가 실패해도 경계는 뚫리지 않는다. */
const _hydrated = new Set<string>();
const _hydrating = new Map<string, Promise<void>>();

/** 회사 스코프가 정해지는 시점(store.list 등)에 호출 — 회사당 1회, 실패는 조용히 넘긴다. */
export function ensurePeriodLocksHydrated(company: string): Promise<void> {
  if (!company || typeof window === 'undefined' || _hydrated.has(company)) return Promise.resolve();
  const inflight = _hydrating.get(company);
  if (inflight) return inflight;
  const p = hydrateRemote(company)
    .then((remote) => {
      if (!remote) return;
      const local = readEnvelope(company);
      // last-write-wins — 마감(추가)도 해제(삭제)도 양방향 전파된다.
      if (remote.updatedAt && remote.updatedAt > local.updatedAt) {
        writeLocal(company, remote.map, remote.updatedAt);
      } else if (!local.updatedAt) {
        // 로컬이 구포맷(타임스탬프 없음) — 마감 누락이 더 위험하므로 합집합으로 채운다.
        writeLocal(company, { ...local.map, ...remote.map }, remote.updatedAt || new Date().toISOString());
      }
    })
    .then(() => { _hydrated.add(company); })   // ★성공했을 때만 «완료» — 실패를 완료로 찍으면 세션 내내 재시도가 없다
    .catch(() => { /* 원격 조회 실패 — 다음 호출에서 재시도. 서버 규칙이 실제 경계이므로 안전 */ })
    .finally(() => { _hydrating.delete(company); });
  _hydrating.set(company, p);
  return p;
}

/** 마감월 YYYY-MM 목록(정렬). UI·호환용. */
export function getClosedPeriods(company: string): string[] {
  // __history:YYYY-MM 는 해제 이력 보관용 키 — «마감된 달»이 아니다.
  return Object.keys(readMap(company)).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
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

export type PeriodOpResult = { ok: boolean; closed: string[]; message?: string };

/**
 * 마감·해제 = «원격 읽기 → 한 달만 변경 → 쓰기» 트랜잭션.
 *
 * ★왜 로컬 map을 원격에 밀어넣으면 안 되는가: 이 문서는 전체 교체로 저장된다(해제=키 삭제가
 *   반영돼야 하므로 merge 불가). 로컬 캐시는 «내가 앱을 열었을 때»의 스냅샷이고 하이드레이트는
 *   회사당 세션 1회뿐이라, 그 사이 다른 사람이 건 마감이 로컬에 없다. 그 상태로 전체 교체하면
 *   그 마감이 원격에서 소리없이 사라지고 rules·API가 그 달을 «열린 달»로 취급한다.
 *   → 원격을 기준(base)으로 삼아 트랜잭션 안에서 한 달만 바꾼다. 동시 마감도 안전하다.
 *
 * 해제 이력(reopenHistory)도 문서에 실제로 남긴다 — 이전 구현은 계산해놓고 버렸다.
 */
async function mutateRemoteMap(
  company: string,
  apply: (base: ClosedPeriodsMap) => ClosedPeriodsMap,
): Promise<{ ok: boolean; map: ClosedPeriodsMap; message?: string }> {
  const at = new Date().toISOString();
  try {
    const { firebaseReady, getFirebaseApp } = await import('../firebase/client');
    if (!firebaseReady()) return { ok: false, map: readMap(company), message: 'Firebase 미초기화' };
    const { getFirestore, doc, runTransaction } = await import('firebase/firestore');
    const db = getFirestore(getFirebaseApp()!);
    const ref = doc(db, 'period_locks', company);
    let next: ClosedPeriodsMap = {};
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const remote = snap.exists() ? (snap.data() as { map?: ClosedPeriodsMap }).map : undefined;
      const base = remote && typeof remote === 'object' ? remote : {};
      next = apply({ ...base });
      tx.set(ref, { companyId: company, map: next, updatedAt: at });
    });
    // 원격 성공 후에만 로컬 캐시를 원격과 동일하게 맞춘다(되쓰기 없음).
    writeLocal(company, next, at);
    return { ok: true, map: next };
  } catch (e) {
    return { ok: false, map: readMap(company), message: (e as Error).message };
  }
}

export async function closePeriod(company: string, yyyymm: string, actor: string, note?: string): Promise<PeriodOpResult> {
  const ym = toYm(yyyymm);
  if (!ym) return { ok: false, closed: getClosedPeriods(company), message: '월 형식이 올바르지 않습니다' };
  const r = await mutateRemoteMap(company, (base) => ({
    ...base,
    [ym]: {
      closedAt: new Date().toISOString(),
      closedBy: actor || 'unknown',
      note: note?.trim() || undefined,
      reopenHistory: base[ym]?.reopenHistory,
    },
  }));
  return { ok: r.ok, closed: Object.keys(r.map).sort(), message: r.message };
}

/** 재오픈 — 사유 필수(v5와 동일). 해제 이력을 문서에 남긴다. */
export async function reopenPeriod(company: string, yyyymm: string, actor: string, reason: string): Promise<PeriodOpResult> {
  const ym = toYm(yyyymm);
  if (!ym) return { ok: false, closed: getClosedPeriods(company), message: '월 형식이 올바르지 않습니다' };
  if (!reason?.trim()) throw new Error('마감 해제 사유가 필요합니다');
  let existed = true;
  const r = await mutateRemoteMap(company, (base) => {
    const prev = base[ym];
    if (!prev) { existed = false; return base; }
    const next = { ...base };
    delete next[ym];
    /* 해제 이력은 «해제된 달의 키»에 남길 수 없다(그 키를 지우므로) → 별도 이력 키에 누적.
       다음에 같은 달을 다시 마감하면 closePeriod가 base[ym]?.reopenHistory를 승계하지 못하므로
       이력 전용 키(__history)에 모아 감사 추적이 끊기지 않게 한다. */
    const histKey = `__history:${ym}`;
    const prevHist = (base as Record<string, ClosedPeriod>)[histKey]?.reopenHistory || prev.reopenHistory || [];
    (next as Record<string, ClosedPeriod>)[histKey] = {
      closedAt: prev.closedAt,
      closedBy: prev.closedBy,
      note: prev.note,
      reopenHistory: [...prevHist, { at: new Date().toISOString(), by: actor || 'unknown', reason: reason.trim() }],
    };
    return next;
  });
  if (!existed) return { ok: true, closed: Object.keys(r.map).sort(), message: '이미 열린 기간입니다' };
  return { ok: r.ok, closed: Object.keys(r.map).sort(), message: r.message };
}

/** @deprecated close/reopen 사용. 호환: 있으면 재오픈(사유=토글), 없으면 마감. */
export async function toggleClosedPeriod(company: string, ym: string, actor = 'operator'): Promise<string[]> {
  const cur = getClosedPeriods(company);
  if (cur.includes(ym)) return (await reopenPeriod(company, ym, actor, '토글 해제')).closed;
  return (await closePeriod(company, ym, actor)).closed;
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
    void ensurePeriodLocksHydrated(companyId).then(() => { if (!cancelled) reload(); });
    const on = () => reload();
    window.addEventListener('jpk:closed-change', on);
    return () => { cancelled = true; window.removeEventListener('jpk:closed-change', on); };
  }, [companyId]);
  return { closed: Object.keys(map).sort(), map, reload };
}
