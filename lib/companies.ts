/** 관리 회사 레지스트리 — 설정에 등록한 회사만 조회·저장 범위에 포함한다.
 *  DEFAULTS는 최초 미설정 개발/마이그레이션 환경의 1회 초기값일 뿐 고정 법인이 아니다.
 *  COMPANIES/COMPANY_DEFS 는 in-place 갱신되는 라이브 배열 — 소비처가 렌더마다 map 하므로 반영됨.
 *
 *  이름 규약:
 *    label = 사업자등록증 상호 원문(저장·공문용)
 *    화면 표시 = label에서 법인격 표기(주식회사/( 주 )/㈜)만 제거.
 *    short는 레거시 입력값으로만 보존하고 원장 회사명에는 사용하지 않는다.
 */
export type CompanyDef = { id: string; label: string; short?: string };
export const ALL_COMPANIES = '__ALL__';
/** 현재 렌터카 운영 대시보드의 관리 법인. 플랫폼/위탁 법인은 별도 업무 범위다. */
export const RENTAL_COMPANY_IDS = ['switchplan', 'prime'] as const;

export const DEFAULT_COMPANY_DEFS: CompanyDef[] = [
  { id: 'switchplan', label: '스위치플랜', short: '스위치' },
  { id: 'prime', label: '프라임구독', short: '프라임' },
  { id: 'sonogong', label: '손오공렌터카', short: '손오공' },
];
const LS = 'jpk:companies';

function hydrate(): CompanyDef[] {
  if (typeof window === 'undefined') return DEFAULT_COMPANY_DEFS.map((c) => ({ ...c }));
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || 'null');
    if (Array.isArray(saved)) {
      // 저장된 목록이 유일한 관리 범위다. 삭제한 초기 회사를 재삽입하지 않는다.
      return saved.filter((c: CompanyDef) => c && c.id && c.label).map((c: CompanyDef) => ({ ...c }));
    }
  } catch { /* ignore */ }
  return DEFAULT_COMPANY_DEFS.map((c) => ({ ...c }));
}

export const COMPANY_DEFS: CompanyDef[] = hydrate();
export const COMPANIES: string[] = COMPANY_DEFS.map((c) => c.id);

function persist() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS, JSON.stringify(COMPANY_DEFS));
  window.dispatchEvent(new Event('jpk:companies-change'));
}
function syncIds() { COMPANIES.length = 0; for (const c of COMPANY_DEFS) COMPANIES.push(c.id); }

function replaceCompanies(next: CompanyDef[]): void {
  COMPANY_DEFS.length = 0;
  for (const c of next) COMPANY_DEFS.push({ ...c });
  syncIds();
  persist();
}

function slug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ascii || `co${Date.now().toString(36)}`;
}

export function companyDefs(): CompanyDef[] { return COMPANY_DEFS.map((c) => ({ ...c })); }

export type CompanyMasterInput = {
  bizNo?: string;
  corpNo?: string;
  ceo?: string;
  address?: string;
  businessAddress?: string;
  headquartersAddress?: string;
  openDate?: string;
  entityType?: string;
  industry?: string[];
  category?: string[];
  email?: string;
  phone?: string;
  taxOffice?: string;
  businessRegistration?: {
    fileName?: string;
    url?: string;
    uploadedAt?: string;
    issueDate?: string;
  };
};

type RegistryResponse = { companies?: CompanyDef[]; company?: CompanyDef; error?: string };
let companyHydration: Promise<void> | null = null;

/** 서버의 관리회사 레지스트리를 현재 브라우저 캐시에 반영한다. 배열 참조는 유지한다. */
export function ensureCompaniesHydrated(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (companyHydration) return companyHydration;
  companyHydration = (async () => {
    const { firebaseReady } = await import('./firebase/client');
    if (!firebaseReady()) return;
    const { apiAuthHeaders } = await import('./api-headers');
    const res = await fetch('/api/companies', { headers: await apiAuthHeaders() });
    const json = await res.json().catch(() => ({})) as RegistryResponse;
    if (!res.ok) throw new Error(json.error || '관리회사 목록을 불러오지 못했습니다.');
    if (Array.isArray(json.companies)) replaceCompanies(json.companies);
  })().catch((error) => {
    console.warn('관리회사 목록 동기화 실패 — 마지막 로컬 캐시 유지', error);
  });
  return companyHydration;
}

async function registryMutation(method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, unknown>): Promise<CompanyDef | null> {
  const { firebaseReady } = await import('./firebase/client');
  if (!firebaseReady()) return null;
  const { apiAuthHeaders } = await import('./api-headers');
  const res = await fetch('/api/companies', {
    method,
    headers: await apiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as RegistryResponse;
  if (!res.ok) throw new Error(json.error || '관리회사 저장에 실패했습니다.');
  return json.company || null;
}

export async function createManagedCompany(registeredName: string, master?: CompanyMasterInput): Promise<string | null> {
  const name = registeredName.trim();
  if (!name) return null;
  const remote = await registryMutation('POST', { registeredName: name, master });
  if (!remote) {
    const id = addCompany(name);
    if (id && master) {
      const { loadMaster, saveMaster } = await import('./company-master');
      await saveMaster(id, { ...loadMaster(id), registeredNameRaw: name, ...master });
    }
    return id;
  }
  replaceCompanies([...COMPANY_DEFS.filter((c) => c.id !== remote.id), remote]);
  return remote.id;
}

export async function updateManagedCompany(id: string, patch: Partial<CompanyDef>, masterPatch?: CompanyMasterInput): Promise<void> {
  const remote = await registryMutation('PATCH', { companyId: id, registeredName: patch.label, short: patch.short, masterPatch });
  if (!remote) {
    updateCompany(id, patch);
    if (masterPatch) {
      const { loadMaster, saveMaster } = await import('./company-master');
      await saveMaster(id, { ...loadMaster(id), ...masterPatch });
    }
    return;
  }
  replaceCompanies(COMPANY_DEFS.map((c) => c.id === id ? remote : c));
}

export async function archiveManagedCompany(id: string): Promise<void> {
  const remote = await registryMutation('DELETE', { companyId: id });
  if (!remote) { removeCompany(id); return; }
  replaceCompanies(COMPANY_DEFS.filter((c) => c.id !== id));
}

/** 회사 추가 — 반환 id. 실패(빈 이름·id 중복) 시 null. label=회사명, short=표시명. */
export function addCompany(label: string, short?: string): string | null {
  const name = (label || '').trim(); if (!name) return null;
  let id = slug(name), n = 1;
  while (COMPANIES.includes(id)) id = `${slug(name)}${++n}`;
  COMPANY_DEFS.push({ id, label: name, short: (short || '').trim() || undefined });
  syncIds(); persist();
  return id;
}
export function updateCompany(id: string, patch: Partial<CompanyDef>): void {
  const c = COMPANY_DEFS.find((x) => x.id === id); if (!c) return;
  if (patch.label != null && patch.label.trim()) c.label = patch.label.trim();
  if (patch.short !== undefined) c.short = (patch.short || '').trim() || undefined;
  persist();
}
export function removeCompany(id: string): void {
  const i = COMPANY_DEFS.findIndex((x) => x.id === id); if (i < 0) return;
  COMPANY_DEFS.splice(i, 1); syncIds(); persist();
}
export function setCompanyShort(id: string, short: string): void { updateCompany(id, { short }); } // 호환

/** 사호에서 법인격 문구만 제거. 사업자등록 상호의 나머지는 임의 축약하지 않는다. */
export function companyRegisteredName(name: unknown): string {
  const raw = String(name || '').trim();
  if (!raw) return '—';
  return raw
    .replace(/(?:㈜|\(\s*주\s*\)|주식회사)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || raw;
}

/** 화면용 회사명 — 사업자등록 상호에서 법인격 표기만 제거. */
export function companyLabel(id: unknown): string {
  const s = String(id || '');
  if (s === ALL_COMPANIES) return '전체';
  const label = COMPANY_DEFS.find((c) => c.id === s)?.label || s;
  return companyRegisteredName(label);
}
/** @deprecated 임의 약칭 금지. 호환성을 위해 companyLabel과 같은 값을 반환. */
export function companyShort(id: unknown): string {
  return companyLabel(id);
}
/** 원장/표 회사명 SSOT. */
export const companyDisplay = companyLabel;

// 회사별 구분 색(뱃지 톤). 기본 3사 고정 + 그 외는 해시로 안정 배정.
export function companyTone(id: unknown): 'blue' | 'green' | 'purple' | 'teal' | 'orange' | 'amber' | 'gray' {
  const s = String(id || '');
  const fixed: Record<string, 'blue' | 'green' | 'purple' | 'teal'> = { switchplan: 'teal', prime: 'blue', sonogong: 'purple' };
  if (fixed[s]) return fixed[s];
  if (!s || s === ALL_COMPANIES) return 'gray';
  const pool = ['teal', 'orange', 'amber', 'blue', 'green', 'purple'] as const;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return pool[h % pool.length];
}
