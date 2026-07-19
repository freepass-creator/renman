/**
 * 데이터 저장 레이어 — 멀티테넌트(companyId 스코프) + 어댑터 seam.
 *   · Firebase 설정 있으면 → FirestoreAdapter (실 저장, 회사별 격리)
 *   · 없으면            → LocalAdapter (localStorage, dev 미리보기)
 * 어느 쪽이든 동일 인터페이스 → Firestore 전환은 설정값만 넣으면 됨.
 * 모든 문서: { ...record, companyId, _key(자연키), createdAt, createdBy }. dedup = 자연키(entity.idFrom).
 */
import { ENTITIES, type EntityRecord } from './intake/entities';
import { getFirebaseApp, firebaseReady } from './firebase/client';
import { COMPANIES, ALL_COMPANIES } from './companies';
import { notifySaved } from './ui-bus';
import {
  buildAuditLog, beforeSubset, type AuditAction,
  stampCreateFields, stampUpdateFields, stampDeleteFields, stampRestoreFields,
} from './audit';
import { newId } from './domain/ids';
import { assertMoneyMutable } from './finance/period-lock';
import { assertNoLockConflict, peelExpectedUpdatedAt } from './lock-conflict';
import { withTimeout } from './async';

/** 감사 트레일이 저장되는 내부 컬렉션 — ENTITIES엔 등록 안 함(인제스천/목록 오염 방지). */
export const AUDIT_COLL = 'audit_logs';

export type SaveResult = { saved: number; duplicates: number; backend: string };

export interface StoreAdapter {
  backend: string;
  save(entityKey: string, companyId: string, records: EntityRecord[]): Promise<SaveResult>;
  list(entityKey: string, companyId: string): Promise<EntityRecord[]>;
  get(entityKey: string, companyId: string, key: string): Promise<EntityRecord | null>;
  update(entityKey: string, companyId: string, key: string, patch: EntityRecord): Promise<void>;
  remove(entityKey: string, companyId: string, key: string, reason?: string): Promise<void>;   // #6 소프트삭제
  listDeleted(entityKey: string, companyId: string): Promise<EntityRecord[]>;
  restore(entityKey: string, companyId: string, key: string): Promise<void>;
}

function naturalKey(entityKey: string, rec: EntityRecord): string {
  if (entityKey === AUDIT_COLL) return String(rec.id ?? ''); // 감사로그는 자체 id
  if (entityKey === 'issued_doc') return String(rec.docNo ?? rec.id ?? ''); // 발급문서=문서번호 키
  const e = ENTITIES[entityKey];
  if (!e) return '';
  const v = e.idFrom ? rec[e.idFrom] : undefined;
  if (v != null && v !== '') return String(v);
  // 복합 자연키 (거래내역 등) — keyFields 값을 join 해 dedup
  if (e.keyFields) {
    const parts = e.keyFields.map((k) => String(rec[k] ?? '')).filter(Boolean);
    if (parts.length) return parts.join('|');
  }
  return '';
}

/** 저장용 키 — 자연키 없으면(예: 계약번호 미입력) 불변 시스템 id를 자연키로 승격해 _key 빈값을 방지.
 *  _key=''는 인도·반납·수납 매칭·update 대상을 못 잡게 만듦 → 신규 저장은 항상 유일 키 보장. rec.id를 확정(부수효과). */
function persistKeyOf(entityKey: string, rec: EntityRecord): string {
  const nk = naturalKey(entityKey, rec);
  if (nk) return nk;
  if (!rec.id) rec.id = newId(entityKey);
  return String(rec.id);
}

/** 저장 레코드 표준 스탬프 SSOT — companyId·자연키(_key)·불변 시스템 id(veh_/ctr_…)·생성메타를 한 곳에서 부착.
 *  id는 최초 1회만 발급(재저장·수정 시 기존 id 유지). 자연키(_key)는 dedup·매칭용으로 병행 유지.
 *  어댑터(Local·Firestore) 저장이 이 함수만 거침 → 식별코드 발급 단일 출처. */
function stampPersist(entityKey: string, companyId: string, rec: EntityRecord, key: string, by: string): EntityRecord {
  return { ...rec, companyId, _key: key, id: rec.id ?? newId(entityKey), createdAt: rec.createdAt ?? new Date().toISOString(), createdBy: rec.createdBy ?? by };
}

/**
 * Firestore 저장 안전화 — undefined는 거부되므로 **중첩(객체·배열)까지 재귀 제거**.
 * ±Infinity도 미지원 → null로 강등(NaN은 유효한 double이라 유지). null은 유지. Date는 통과.
 * (shallow만으론 계약의 _payments/_discounts 같은 중첩 배열 안 undefined를 못 잡음 → 배치 전체 거부 방지.)
 */
function pruneDeep<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => pruneDeep(x)).filter((x) => x !== undefined) as unknown as T;
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k in v as Record<string, unknown>) {
      const pv = pruneDeep((v as Record<string, unknown>)[k]);
      if (pv !== undefined) out[k] = pv;
    }
    return out as unknown as T;
  }
  if (typeof v === 'number' && !Number.isFinite(v) && !Number.isNaN(v)) return null as unknown as T; // ±Infinity → null
  return v;
}
function pruneUndefined(rec: EntityRecord): EntityRecord { return pruneDeep(rec) as EntityRecord; }

/**
 * Firestore 문서 ID 안전화 — 자연키에 '/'(경로 구분자)나 '%'가 들어가면 doc() 이 거부/오인식.
 * (예: bank_tx 자연키 …|counterparty 의 '고려/김인겸', '3600/6568/4851' → 문서참조 예외 → 배치 전체 실패)
 * '/'·'%'만 퍼센트 인코딩(주입 injective, 그 외 한글·'|'·'-' 등은 그대로) → 기존 vehicle/contract ID 불변.
 * ⚠️ 저장 필드 _key 는 원본 자연키 유지(중복 판정·매칭용) — 여기서 바꾸는 건 문서 ID뿐.
 */
function firestoreDocId(companyId: string, key: string): string {
  const safe = key.replace(/[%/]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${companyId}__${safe}`;
}

// ── 로컬 어댑터 (dev) ──
class LocalAdapter implements StoreAdapter {
  backend = 'local(localStorage)';
  private k(entityKey: string, companyId: string) { return `jpkerp6:${companyId}:${entityKey}`; }
  private read(entityKey: string, companyId: string): EntityRecord[] {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(this.k(entityKey, companyId)) || '[]'); } catch { return []; }
  }
  async list(entityKey: string, companyId: string) { return this.read(entityKey, companyId).filter((r) => !r.deletedAt); }
  async get(entityKey: string, companyId: string, key: string) {
    return this.read(entityKey, companyId).find((r) => String(r._key) === key) || null;
  }
  async remove(entityKey: string, companyId: string, key: string, reason = '') {
    await this.update(entityKey, companyId, key, { deletedAt: new Date().toISOString(), deletedReason: reason });
  }
  async listDeleted(entityKey: string, companyId: string) { return this.read(entityKey, companyId).filter((r) => r.deletedAt); }
  async restore(entityKey: string, companyId: string, key: string) {
    await this.update(entityKey, companyId, key, { deletedAt: null, deletedReason: null });
  }
  async update(entityKey: string, companyId: string, key: string, patch: EntityRecord) {
    const arr = this.read(entityKey, companyId);
    const i = arr.findIndex((r) => String(r._key) === key);
    if (i < 0) return;
    const { expected, data } = peelExpectedUpdatedAt(patch as Record<string, unknown>);
    assertNoLockConflict(`${entityKey}/${key}`, expected, arr[i].updatedAt);
    arr[i] = { ...arr[i], ...data, updatedAt: new Date().toISOString() };
    localStorage.setItem(this.k(entityKey, companyId), JSON.stringify(arr));
  }
  async save(entityKey: string, companyId: string, records: EntityRecord[]) {
    const existing = this.read(entityKey, companyId);
    const seen = new Set(existing.map((r) => String(r._key)));   // 삭제분 포함 — 재import가 의도적 소프트삭제를 부활시키지 않음(복원은 /trash 명시 경로만)
    let saved = 0, duplicates = 0;
    for (const rec of records) {
      const key = persistKeyOf(entityKey, rec);
      if (key && seen.has(key)) { duplicates++; continue; }
      existing.push(stampPersist(entityKey, companyId, rec, key, 'local'));
      if (key) seen.add(key);
      saved++;
    }
    localStorage.setItem(this.k(entityKey, companyId), JSON.stringify(existing));
    return { saved, duplicates, backend: this.backend };
  }
}

// ── Firestore 어댑터 (실 저장, 회사별 격리) ──
class FirestoreAdapter implements StoreAdapter {
  backend = 'firestore';
  async save(entityKey: string, companyId: string, records: EntityRecord[]): Promise<SaveResult> {
    const { getFirestore, collection, query, where, getDocs, getDoc, doc, setDoc, writeBatch } = await import('firebase/firestore');
    const db = getFirestore(getFirebaseApp()!);
    const col = collection(db, entityKey);
    const seen = new Set<string>();
    // dedup: 같은 회사·자연키 존재 확인. audit_logs는 id 유니크(무한증가) → 스캔 생략.
    if (entityKey !== AUDIT_COLL) {
      if (records.length > 5) {
        // 대량(import): 컬렉션 1회 스캔으로 기존 자연키 수집(N건에 read 1회).
        const snap = await withTimeout(getDocs(query(col, where('companyId', '==', companyId))));
        snap.forEach((d) => { const k = (d.data() as EntityRecord)._key; if (k) seen.add(String(k)); });   // 삭제분 포함(재import가 삭제를 부활 안 함)
      } else {
        // 단건·소량: 컬렉션 전량(수천 건) 스캔 대신 대상 문서만 getDoc 존재확인 → '뭐 저장할 때마다 멈춤' 제거.
        for (const rec of records) {
          const key = naturalKey(entityKey, rec);
          if (!key) continue;
          const one = await withTimeout(getDoc(doc(col, firestoreDocId(companyId, key))));
          if (one.exists()) seen.add(key);
        }
      }
    }
    let saved = 0, duplicates = 0;
    // 쓸 문서 모으기(중복 제외) → writeBatch로 500건씩 커밋. 3,639건 순차 setDoc(수분)을 몇 초로.
    const pending: { id: string; data: EntityRecord }[] = [];
    for (const rec of records) {
      const key = persistKeyOf(entityKey, rec);
      if (key && seen.has(key)) { duplicates++; continue; }
      const id = key ? firestoreDocId(companyId, key) : `${companyId}__${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      // Firestore는 undefined 필드를 거부 → 저장 전 제거(실파서 등 undefined 섞인 레코드도 안전).
      pending.push({ id, data: pruneUndefined(stampPersist(entityKey, companyId, rec, key, 'system')) });
      if (key) seen.add(key);
      saved++;
    }
    if (pending.length === 1) {
      await withTimeout(setDoc(doc(col, pending[0].id), pending[0].data));
    } else {
      // 500건씩 배치로 묶어 병렬 커밋 → 3,639건도 왕복 1회 수준(순차 대비 배치 수만큼 단축).
      const commits: Promise<void>[] = [];
      for (let i = 0; i < pending.length; i += 500) {
        const batch = writeBatch(db);
        for (const p of pending.slice(i, i + 500)) batch.set(doc(col, p.id), p.data);
        commits.push(withTimeout(batch.commit(), 30000));
      }
      await Promise.all(commits);
    }
    return { saved, duplicates, backend: this.backend };
  }
  async list(entityKey: string, companyId: string): Promise<EntityRecord[]> {
    try {
      const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
      const db = getFirestore(getFirebaseApp()!);
      const snap = await withTimeout(getDocs(query(collection(db, entityKey), where('companyId', '==', companyId))));
      return snap.docs.map((d) => d.data() as EntityRecord).filter((r) => !r.deletedAt);
    } catch (e) { console.warn(`Firestore list(${entityKey}) 대기 실패(DB·규칙 확인):`, (e as Error).message); throw e; }   // throw=실패를 캐시 안 함(DispatchStore가 다음에 재시도). 빈 회사와 로드실패 구분.
  }
  async get(entityKey: string, companyId: string, key: string): Promise<EntityRecord | null> {
    try {
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const db = getFirestore(getFirebaseApp()!);
      const snap = await withTimeout(getDoc(doc(db, entityKey, firestoreDocId(companyId, key))));
      return snap.exists() ? (snap.data() as EntityRecord) : null;
    } catch (e) { console.warn(`Firestore get(${entityKey}) 대기 실패(DB·규칙 확인):`, (e as Error).message); return null; }
  }
  async update(entityKey: string, companyId: string, key: string, patch: EntityRecord): Promise<void> {
    const { getFirestore, doc, getDoc, setDoc } = await import('firebase/firestore');
    const db = getFirestore(getFirebaseApp()!);
    const ref = doc(db, entityKey, firestoreDocId(companyId, key));
    const { expected, data } = peelExpectedUpdatedAt(patch as Record<string, unknown>);
    if (expected) {
      const snap = await withTimeout(getDoc(ref));
      const cur = snap.exists() ? (snap.data() as EntityRecord) : null;
      assertNoLockConflict(`${entityKey}/${key}`, expected, cur?.updatedAt);
    }
    await setDoc(ref, { ...data, updatedAt: new Date().toISOString() }, { merge: true });
  }
  async remove(entityKey: string, companyId: string, key: string, reason = ''): Promise<void> {
    await this.update(entityKey, companyId, key, { deletedAt: new Date().toISOString(), deletedReason: reason });
  }
  async listDeleted(entityKey: string, companyId: string): Promise<EntityRecord[]> {
    const { getFirestore, collection, query, where, getDocs } = await import('firebase/firestore');
    const db = getFirestore(getFirebaseApp()!);
    const snap = await getDocs(query(collection(db, entityKey), where('companyId', '==', companyId)));
    return snap.docs.map((d) => d.data() as EntityRecord).filter((r) => r.deletedAt);
  }
  async restore(entityKey: string, companyId: string, key: string): Promise<void> {
    await this.update(entityKey, companyId, key, { deletedAt: null, deletedReason: null });
  }
}

// ── 감사 데코레이터 (base 위, DispatchStore 아래) ──
// 모든 변경(save/update/remove/restore)에 inline actor 스탬프 + audit_logs 트레일 1건.
// audit_logs 자체 쓰기는 base로 직접 내려 재귀를 피한다(무감사).
class AuditingStore implements StoreAdapter {
  backend: string;
  constructor(private base: StoreAdapter) { this.backend = base.backend; }

  private label(entityKey: string, id: string, verb: string, extra = ''): string {
    const name = ENTITIES[entityKey]?.label || entityKey;
    return `${name} ${verb}${id ? ': ' + id : ''}${extra}`;
  }
  private async writeLog(companyId: string, p: { action: AuditAction; entityType: string; entityId: string; label: string; before?: EntityRecord | null; after?: EntityRecord | null }) {
    try {
      await this.base.save(AUDIT_COLL, companyId, [buildAuditLog({ companyId, ...p })]);
      // DispatchStore를 우회하므로 여기서 감사 캐시만 무효화(notifySaved는 본 엔티티 afterWrite가 담당).
      invalidateEntityCache(AUDIT_COLL);
    } catch { /* 감사 실패는 본 동작 안 막음 */ }
  }

  // 조회는 그대로 통과
  list(entityKey: string, companyId: string) { return this.base.list(entityKey, companyId); }
  get(entityKey: string, companyId: string, key: string) { return this.base.get(entityKey, companyId, key); }
  listDeleted(entityKey: string, companyId: string) { return this.base.listDeleted(entityKey, companyId); }

  async save(entityKey: string, companyId: string, records: EntityRecord[]): Promise<SaveResult> {
    if (entityKey === AUDIT_COLL) return this.base.save(entityKey, companyId, records);
    const stamped = records.map((r) => ({ ...r, ...stampCreateFields() }));
    const r = await this.base.save(entityKey, companyId, stamped);
    if (r.saved > 0) {
      if (stamped.length === 1) {
        const rec = stamped[0]; const id = naturalKey(entityKey, rec);
        void this.writeLog(companyId, { action: 'create', entityType: entityKey, entityId: id, label: this.label(entityKey, id, '등록'), after: rec });
      } else {
        void this.writeLog(companyId, { action: 'import', entityType: entityKey, entityId: '', label: this.label(entityKey, '', '일괄등록', ` (${r.saved}건)`) });
      }
    }
    return r;
  }

  async update(entityKey: string, companyId: string, key: string, patch: EntityRecord): Promise<void> {
    if (entityKey === AUDIT_COLL) return this.base.update(entityKey, companyId, key, patch);
    const before = await this.base.get(entityKey, companyId, key);
    assertMoneyMutable(entityKey, companyId, before as Record<string, unknown> | null, patch as Record<string, unknown>);
    await this.base.update(entityKey, companyId, key, { ...patch, ...stampUpdateFields() });
    void this.writeLog(companyId, { action: 'update', entityType: entityKey, entityId: key, label: this.label(entityKey, key, '수정'), before: beforeSubset(before, patch), after: patch });
  }

  async remove(entityKey: string, companyId: string, key: string, reason = ''): Promise<void> {
    if (entityKey === AUDIT_COLL) return this.base.remove(entityKey, companyId, key, reason);
    const before = await this.base.get(entityKey, companyId, key);
    assertMoneyMutable(entityKey, companyId, before as Record<string, unknown> | null);
    await this.base.update(entityKey, companyId, key, stampDeleteFields(reason)); // deletedBy 포함(base.remove 대체)
    void this.writeLog(companyId, { action: 'delete', entityType: entityKey, entityId: key, label: this.label(entityKey, key, '삭제', reason ? ` (${reason})` : ''), before });
  }

  async restore(entityKey: string, companyId: string, key: string): Promise<void> {
    if (entityKey === AUDIT_COLL) return this.base.restore(entityKey, companyId, key);
    await this.base.update(entityKey, companyId, key, stampRestoreFields());
    void this.writeLog(companyId, { action: 'restore', entityType: entityKey, entityId: key, label: this.label(entityKey, key, '복구') });
  }
}

/**
 * 디스패치 스토어 — 호출 시점 companyId 인자를 보고 분기. 페이지는 항상 getStore().xxx(entity, companyId) 그대로.
 *   · companyId === ALL_COMPANIES (본사 합본): 전 법인을 가로질러 동작
 *       - 조회(list/get/listDeleted): 모든 법인에서 모아 반환 (각 레코드 companyId 보유 → 페이지에서 법인 표시)
 *       - 변경(update/remove/restore): 키가 속한 법인을 찾아 위임 (합본에서 바로 입금기록/삭제)
 *       - 저장(save): 대상 법인 모호 → 법인 선택 필요 (에러)
 *   · 그 외(단일 법인·직원 스코프): base 어댑터로 그대로 통과
 */
// 모듈 레벨 인메모리 캐시 — list 결과(Promise)를 재사용해 재조회·화면 전환을 즉시로.
// 저장/수정/삭제 시 해당 엔티티 캐시만 무효화(다음 list에서 신선하게 재조회). 세션 한정(새로고침 시 초기화).
const _listCache = new Map<string, Promise<EntityRecord[]>>();
function _invalidate(entityKey: string) { for (const k of [..._listCache.keys()]) if (k.startsWith(entityKey + '::')) _listCache.delete(k); }
export function clearStoreCache() { _listCache.clear(); }
/** 엔티티 단위 무효화 — 감사 등 단건 최신이 필요할 때 전체 clear 금지. */
export function invalidateEntityCache(entityKey: string) { _invalidate(entityKey); }
/** 캐시 hit 판정 — soft-load(스피너 생략)용. */
export function listsCached(entityKeys: readonly string[], companyId: string): boolean {
  return entityKeys.length > 0 && entityKeys.every((k) => _listCache.has(`${k}::${companyId}`));
}

class DispatchStore implements StoreAdapter {
  backend: string;
  constructor(private base: StoreAdapter) { this.backend = base.backend; }
  private all(companyId: string) { return companyId === ALL_COMPANIES; }
  // 쓰기 후 공통: 캐시 무효화 + 저장 반영 브로드캐스트(자동). 페이지가 수동 notifySaved 안 해도 전 화면 갱신.
  private afterWrite(entityKey: string) { _invalidate(entityKey); notifySaved(); }
  async save(entityKey: string, companyId: string, records: EntityRecord[]) {
    if (this.all(companyId)) throw new Error('전체 합본 보기에서는 저장 대상 회사를 먼저 선택하세요.');
    const r = await this.base.save(entityKey, companyId, records); this.afterWrite(entityKey); return r;
  }
  async list(entityKey: string, companyId: string) {
    const ck = `${entityKey}::${companyId}`;
    let p = _listCache.get(ck);
    if (!p) {
      p = this.all(companyId)
        ? Promise.all(COMPANIES.map((c) => this.base.list(entityKey, c).catch(() => []))).then((a) => a.flat())   // 회사별 격리: 한 법인 오류가 합본 전체를 안 비움(정상분은 캐시)
        : this.base.list(entityKey, companyId);   // 단일 스코프는 throw→캐시제거→다음 재시도
      _listCache.set(ck, p);
      p.catch(() => _listCache.delete(ck)); // 실패는 캐시 안 함(다음에 재시도)
    }
    return p.catch(() => []); // 호출자에겐 빈 배열(행 방지) — 캐시는 위 catch로 제거돼 다음 조회 때 재시도
  }
  async listDeleted(entityKey: string, companyId: string) {
    if (!this.all(companyId)) return this.base.listDeleted(entityKey, companyId);
    return (await Promise.all(COMPANIES.map((c) => this.base.listDeleted(entityKey, c)))).flat();
  }
  async get(entityKey: string, companyId: string, key: string) {
    if (!this.all(companyId)) return this.base.get(entityKey, companyId, key);
    for (const c of COMPANIES) { const r = await this.base.get(entityKey, c, key); if (r) return r; }
    return null;
  }
  private async ownerOf(entityKey: string, key: string): Promise<string | null> {
    // 4개 회사 문서를 병렬 확인(순차 4왕복 → 1왕복). 합본 스코프 수정/삭제의 소유자 탐색 지연 제거.
    const hits = await Promise.all(COMPANIES.map(async (c) => ((await this.base.get(entityKey, c, key)) ? c : null)));
    return hits.find(Boolean) ?? null;
  }
  async update(entityKey: string, companyId: string, key: string, patch: EntityRecord) {
    if (!this.all(companyId)) { const r = await this.base.update(entityKey, companyId, key, patch); this.afterWrite(entityKey); return r; }
    const c = await this.ownerOf(entityKey, key);
    if (!c) throw new Error(`대상을 찾을 수 없어 저장하지 못했습니다 (${entityKey}). 새로고침 후 다시 시도하세요.`);   // 무성공(false '저장됨') 방지
    await this.base.update(entityKey, c, key, patch); this.afterWrite(entityKey);
  }
  async remove(entityKey: string, companyId: string, key: string, reason = '') {
    if (!this.all(companyId)) { const r = await this.base.remove(entityKey, companyId, key, reason); this.afterWrite(entityKey); return r; }
    const c = await this.ownerOf(entityKey, key);
    if (!c) throw new Error(`대상을 찾을 수 없어 삭제하지 못했습니다 (${entityKey}).`);
    await this.base.remove(entityKey, c, key, reason); this.afterWrite(entityKey);
  }
  async restore(entityKey: string, companyId: string, key: string) {
    if (!this.all(companyId)) { const r = await this.base.restore(entityKey, companyId, key); this.afterWrite(entityKey); return r; }
    const c = await this.ownerOf(entityKey, key);
    if (!c) throw new Error(`대상을 찾을 수 없어 복원하지 못했습니다 (${entityKey}).`);
    await this.base.restore(entityKey, c, key); this.afterWrite(entityKey);
  }
}

export function getStore(): StoreAdapter {
  // .env.local 의 NEXT_PUBLIC_FIREBASE_* 있으면 Firestore 실저장, 없으면 로컬(localStorage) 미리보기로 자동 전환.
  // 계층: DispatchStore(회사분기) → AuditingStore(감사) → base(Firestore/Local).
  const base = firebaseReady() ? new FirestoreAdapter() : new LocalAdapter();
  return new DispatchStore(new AuditingStore(base));
}
