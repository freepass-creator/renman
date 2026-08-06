'use client';
// 법인(회사) 마스터 — 모든 자산(차)·자금(계좌)이 "어느 법인의 X"로 귀속되는 뿌리 설정.
// 법인별 소재지·차고지·등록대수·증차신청·공문 등 운영 기준의 SSOT. 모듈형(접기·추가·제거).
// 저장 = Firestore(company_master/{companyId}) + localStorage 캐시 이중화.
//
// ★왜 서버여야 하는가: 내용증명·과태료 변경부과 공문·거래사실확인서가 이 마스터에서 대표자·주소·
//   사업자번호·전화를 읽어 «인쇄»한다(PrintHost·PenaltyDocs·docs/issue). localStorage만이면
//   입력하지 않은 PC에서 뽑은 대외문서가 공란으로 나가 무효가 되고, 캐시를 지우면 전 법인 마스터가
//   소실된다. 읽기 호출부가 7곳 모두 동기이므로 «부팅 시 원격→캐시 하이드레이트» 방식으로
//   호출부를 바꾸지 않고 서버화한다(회계마감 period-lock과 같은 패턴).
const LS_KEY = 'jpk:company-master';
const COLL = 'company_master';

export type Garage = { id: string; name?: string; address?: string; capacity?: number; note?: string };
export type RegApplication = {
  id: string; date?: string; kind: '증차' | '감차'; count?: number; office?: string;
  status: '준비' | '접수' | '승인' | '반려'; resultDate?: string; note?: string;
};
export type OfficialDoc = {
  id: string; date?: string; direction: '발신' | '수신'; title?: string; counterpart?: string; docNo?: string; note?: string;
};

/** 법인 첨부 문서 — 사업자등록증·등기부·정관 등. 종류는 `lib/doc-kinds` 목록을 쓴다(두 벌 금지). */
export type CompanyDoc = {
  id: string; kind?: string; title?: string;
  fileName?: string; url?: string; uploadedAt?: string; uploadedBy?: string;
};

/**
 * 법인카드 — 지출.
 * ★매칭 키는 `cardMask` = **카드사가 준 마스킹 문자열 원문**이다.
 *   실파일(신한 25년 이용내역)이 `9410-64**-****-9` 로 온다 — **끝 4자리를 안 준다**.
 *   카드사마다 가리는 자리가 달라서 «끝 4자리»를 키로 잡으면 영영 안 맞는다.
 *   원문을 그대로 저장하고 `cardMaskMatches()` 로 비교한다(docs/UPLOAD-FORMATS.md §3).
 */
export type CorporateCard = {
  id: string; cardName?: string; cardCompany?: string;
  cardMask?: string;   // ★ 카드사 표기 원문 (9410-64**-****-9)
  cardLast4?: string;  // 아는 경우만. 없어도 매칭은 cardMask 로 된다
  holder?: string; purpose?: string;
  /** @deprecated 구 스키마(`{no, alias}`) 호환. 읽기만 하고 새로 쓰지 말 것. */
  no?: string; alias?: string;
};

/**
 * 마스킹 카드번호 비교 — 별(*)은 «무엇이든»이다.
 * 자릿수가 같고, 가려지지 않은 자리가 전부 일치하면 같은 카드로 본다.
 * `9410-64**-****-9` vs `9410-6412-3456-789` → 자릿수 다름 → false (안전하게 불일치)
 */
export function cardMaskMatches(a: string, b: string): boolean {
  const na = (a || '').replace(/[^0-9*]/g, '');
  const nb = (b || '').replace(/[^0-9*]/g, '');
  if (!na || !nb || na.length !== nb.length) return false;
  for (let i = 0; i < na.length; i++) {
    if (na[i] === '*' || nb[i] === '*') continue;
    if (na[i] !== nb[i]) return false;
  }
  return true;
}
/** 자동이체 CMS — 수입. `cmsId` 가 입금거래 매칭 키. */
export type AutoTransfer = {
  id: string; providerName?: string; cmsId?: string; alias?: string; purpose?: string;
};
/**
 * 카드매출·PG 정산 채널 — 수입.
 * ⚠ 처음엔 `terminalId`(단말기 ID)를 키로 잡았는데 **실제 정산 파일에 단말기 ID가 없다.**
 *   `일별정산내역_*.csv` 는 「결제수단(CMS / 카드(비회원)) + 정산일」 단위로만 온다 —
 *   **단말기 단위가 아니라 PG사 정산 단위**다(docs/UPLOAD-FORMATS.md §3-2).
 *   그래서 매칭 키는 `settleMethod`(정산 파일의 «결제수단» 표기 원문)다.
 */
export type CardTerminal = {
  id: string;
  pgProvider?: string;    // PG·VAN 사
  settleMethod?: string;  // ★ 정산 파일의 «결제수단» 표기 그대로 (CMS / 카드(비회원) …)
  merchantNo?: string;
  terminalId?: string;    // 있으면 받되 매칭 키는 아니다
  alias?: string;
};

export type CompanyMaster = {
  registeredNameRaw?: string; // 사업자등록증 상호 원문(표시는 법인격만 제거)
  bizNo?: string;        // 사업자등록번호
  corpNo?: string;       // 법인등록번호
  ceo?: string;          // 대표
  address?: string;      // 본점(사무실) 소재지
  businessAddress?: string;
  headquartersAddress?: string;
  openDate?: string;
  entityType?: string;
  industry?: string[];
  category?: string[];
  email?: string;
  taxOffice?: string;
  businessRegistration?: { fileName?: string; url?: string; uploadedAt?: string; issueDate?: string };
  phone?: string;        // 대표 전화
  garages?: Garage[];    // 차고지(들) — 주소 + 수용대수
  parking?: string[];    // 사무실 주차장(들)
  /* ★자금 채널 — 단순 마스터가 아니라 «업로드한 거래를 어느 회사로 귀속시킬지» 정하는 매칭 키다.
     이게 없으면 자금을 올려도 회사가 안 붙어 미배정으로 쌓인다(jpkerp5 모델 이식).
     계좌는 renman에 `bank_account` 엔티티가 이미 SSOT라 여기 두지 않는다 — 두 벌 금지. */
  cards?: CorporateCard[];          // 법인카드(지출) — 매칭 키 = cardMask(마스킹 원문)
  autoTransfers?: AutoTransfer[];   // 자동이체 CMS(수입) — 은행엔 «CMS집금» 총액 1줄, 상세와 1:N 대사
  cardTerminals?: CardTerminal[];   // 카드매출·PG 정산(수입) — 매칭 키 = settleMethod
  /** 첨부 문서 — 종류에 얽매이지 않고 여러 개(VEHICLE360-SPEC §3-1 과 같은 원칙). */
  documents?: CompanyDoc[];
  registeredCount?: number;          // 관청 등록 대수
  regApplications?: RegApplication[]; // 증차·감차 신청 이력
  officialDocs?: OfficialDoc[];       // 공문 대장(발신·수신)
  modules?: string[];    // 활성 모듈 키(순서 = 표시 순서)
  collapsed?: string[];  // 접힌 모듈 키
};

type MasterMap = Record<string, CompanyMaster>; // companyId → master

// 모듈 카탈로그 — "넣었다 지웠다" 대상. basic 은 항상 켬(제거 불가).
export const MODULE_CATALOG: { key: string; label: string; desc: string; core?: boolean }[] = [
  { key: 'basic', label: '기본 정보', desc: '법인명·대표·사업자번호·본점 소재지·연락처', core: true },
  { key: 'garage', label: '차고지', desc: '주소 + 수용대수 (등록대수 요건)' },
  { key: 'vehicleReg', label: '등록대수·증차신청', desc: '등록 대수 / 증차·감차 신청 워크플로우' },
  { key: 'officialDoc', label: '공문 대장', desc: '법인 명의 발신·수신 문서 대장' },
  { key: 'card', label: '법인카드', desc: '카드사·카드번호 표기 원문 — 카드 지출거래를 이 회사로 붙이는 키' },
  { key: 'license', label: '인허가 증빙', desc: '사업자등록증·대여사업 등록증·정관·등기부 (보관)' },
  /* ★자금 채널·계좌·임대차·문서 — 「필요에 맞춰서 등록」(사장님 확정 2026-08-06, AUDIT §6-2).
     경영관리 법인 패널이 섹션을 고정으로 박고 있었는데, 회사마다 필요한 게 다르다.
     섹션 = 모듈로 통일해 여기서 켜고 끈다. */
  { key: 'account', label: '법인계좌', desc: '은행·계좌번호 — 자금거래를 이 회사로 붙이는 키. 거래 붙으면 신원 잠금' },
  { key: 'cms', label: '자동이체 CMS', desc: 'CMS 사업자·ID — 은행엔 총액 1줄로 들어온다(상세와 대사)' },
  { key: 'terminal', label: '카드매출·PG 정산', desc: 'PG사·결제수단 표기 — 정산 입금을 이 회사로 붙이는 키' },
  { key: 'lease', label: '임대차', desc: '사무실·차고지 임대차 계약(임대인·보증금·만기)' },
  { key: 'document', label: '문서', desc: '종류에 얽매이지 않는 첨부 — 등기부·정관·인감 등' },
];
/** 신규 법인 기본 — 계좌는 «없으면 자금이 안 들어온다»라 처음부터 켠다. */
export const DEFAULT_MODULES = ['basic', 'account', 'garage', 'vehicleReg'];

// app 런타임 전용 id 생성(스크립트 아님 — Date/Math 사용 가능).
export function genId(prefix = 'm'): string { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

export function loadMasters(): MasterMap {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
export function loadMaster(companyId: string): CompanyMaster {
  const m = loadMasters()[companyId] || {};
  if (!m.modules || !m.modules.length) m.modules = [...DEFAULT_MODULES];
  return m;
}
export type SaveMasterResult = { ok: boolean; conflict?: boolean; message?: string };

/**
 * 법인 마스터 저장 — 낙관적 잠금(CAS).
 *
 * ★왜 CAS 인가: 이 문서는 «전체 교체»로 저장된다(차고지·공문대장 같은 배열의 삭제가 반영돼야 하므로
 *   merge 를 쓸 수 없다). 그런데 편집 화면이 하이드레이트 완료 «전»의 로컬 스냅샷을 들고 있거나
 *   다른 사람이 그 사이에 저장했으면, 전체 교체가 원격의 최신값을 통째로 지운다
 *   (차고지·증차신청·공문대장 전사 소실 = 되돌릴 수 없음).
 *   → baseUpdatedAt(내가 읽은 시점의 원격 스탬프)과 원격 현재값을 비교해 어긋나면 «거부»한다.
 *
 * 로컬 캐시는 원격 성공 후에만 갱신한다 — 실패한 값을 «최신»으로 찍으면 하이드레이트가
 * 그 기기를 영구히 복구하지 못한다.
 */
export async function saveMaster(
  companyId: string,
  m: CompanyMaster,
  opts?: { baseUpdatedAt?: string },
): Promise<SaveMasterResult> {
  if (typeof window === 'undefined' || !companyId) return { ok: false, message: '저장 대상이 없습니다' };
  const at = new Date().toISOString();
  const r = await persistRemote(companyId, m, at, opts?.baseUpdatedAt);
  if (r.ok) {
    writeCache(companyId, m);
    setStamp(companyId, at);
    return { ok: true };
  }
  if (r.conflict) {
    return { ok: false, conflict: true, message: '다른 기기·다른 사람이 먼저 저장했습니다 — 새로고침 후 다시 입력하세요(덮어쓰면 차고지·공문대장이 사라집니다)' };
  }
  // 원격에 못 닿았다 — 로컬만 갱신하되 «최신 스탬프»는 찍지 않는다(다음 하이드레이트가 원격을 이기게).
  writeCache(companyId, m);
  return { ok: false, message: r.message || '서버 저장 실패 — 이 PC에만 남았습니다. 연결 확인 후 다시 저장하세요(대외문서가 공란으로 인쇄될 수 있음)' };
}

/** 내가 읽은 시점의 원격 스탬프 — 저장 시 CAS 기준값. */
export function masterStampOf(companyId: string): string {
  return stamps()[companyId] || '';
}

function writeCache(companyId: string, m: CompanyMaster): void {
  try {
    const all = loadMasters();
    all[companyId] = m;
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch { /* 쿼터 초과 등 — 원격 저장은 계속 시도 */ }
  window.dispatchEvent(new Event('jpk:master-change'));
}

type PersistResult = { ok: boolean; conflict?: boolean; message?: string };

async function persistRemote(
  companyId: string,
  m: CompanyMaster,
  at: string,
  baseUpdatedAt?: string,
): Promise<PersistResult> {
  try {
    const { firebaseReady, getFirebaseApp } = await import('./firebase/client');
    if (!firebaseReady()) return { ok: false, message: 'Firebase 미초기화' };
    const { getFirestore, doc, runTransaction } = await import('firebase/firestore');
    const ref = doc(getFirestore(getFirebaseApp()!), COLL, companyId);
    let conflict = false;
    await runTransaction(getFirestore(getFirebaseApp()!), async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) {
        const remoteAt = String((snap.data() as { updatedAt?: string }).updatedAt || '');
        // baseUpdatedAt 이 없으면 «원격을 읽지 않은 채 저장»이므로, 원격이 존재하면 거부한다.
        if (remoteAt && remoteAt !== (baseUpdatedAt || '')) { conflict = true; return; }
      }
      // 배열 필드(차고지·공문 등)의 «삭제»가 반영돼야 하므로 merge를 쓰지 않는다(전체 교체).
      tx.set(ref, { companyId, master: m, updatedAt: at });
    });
    if (conflict) return { ok: false, conflict: true };
    return { ok: true };
  } catch (e) {
    console.warn('법인 마스터 원격 저장 실패', e);
    return { ok: false, message: (e as Error).message };
  }
}

/* ── 원격 하이드레이트 ────────────────────────────────────────────
   회사당 1회. 원격이 로컬보다 새로우면 캐시를 갈아끼운다(대외문서가 최신 법인정보를 쓰게).
   실패하면 조용히 로컬 캐시를 유지한다 — 문서 발행을 막지는 않되, 공란 인쇄는
   화면(경영관리·문서발행)에서 «미입력» 경고로 드러난다. */
const _hydrated = new Set<string>();
const _hydrating = new Map<string, Promise<void>>();
const STAMP_KEY = 'jpk:company-master:at';

function stamps(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); } catch { return {}; }
}
function setStamp(companyId: string, at: string): void {
  try {
    const all = stamps(); all[companyId] = at;
    localStorage.setItem(STAMP_KEY, JSON.stringify(all));
  } catch { /* 무시 */ }
}

export function ensureCompanyMasterHydrated(companyId: string): Promise<void> {
  if (!companyId || typeof window === 'undefined' || _hydrated.has(companyId)) return Promise.resolve();
  const inflight = _hydrating.get(companyId);
  if (inflight) return inflight;
  const p = (async () => {
    const { firebaseReady, getFirebaseApp } = await import('./firebase/client');
    if (!firebaseReady()) return;
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(getFirestore(getFirebaseApp()!), COLL, companyId));
    if (!snap.exists()) return;
    const data = snap.data() as { master?: CompanyMaster; updatedAt?: string };
    if (!data.master || typeof data.master !== 'object') return;
    const remoteAt = String(data.updatedAt || '');
    const localAt = stamps()[companyId] || '';
    if (!localAt || (remoteAt && remoteAt > localAt)) {
      writeCache(companyId, data.master);
      setStamp(companyId, remoteAt || new Date().toISOString());
    }
  })()
    .catch(() => { /* 원격 실패 — 로컬 캐시 유지 */ })
    .finally(() => { _hydrating.delete(companyId); _hydrated.add(companyId); });
  _hydrating.set(companyId, p);
  return p;
}
