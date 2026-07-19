/** 법인 레지스트리 — session·store 공유. 한 회사가 법인 여러 개. 본사 합본 스코프(ALL)도 여기.
 *  기본 3사(스위치플랜·프라임구독·손오공렌터카) + ERP에서 추가/수정/삭제(회사관리). localStorage 보존.
 *  COMPANIES/COMPANY_DEFS 는 in-place 갱신되는 라이브 배열 — 소비처가 렌더마다 map 하므로 반영됨. */
export type CompanyDef = { id: string; label: string; short?: string };
export const ALL_COMPANIES = '__ALL__';

const DEFAULTS: CompanyDef[] = [
  { id: 'switchplan', label: '스위치플랜', short: '스위치' },
  { id: 'prime', label: '프라임구독', short: '프라임' },
  { id: 'sonogong', label: '손오공렌터카', short: '손오공' },
];
const LS = 'jpk:companies';

function hydrate(): CompanyDef[] {
  if (typeof window === 'undefined') return DEFAULTS.map((c) => ({ ...c }));
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter((c: CompanyDef) => c && c.id).map((c: CompanyDef) => ({ ...c }));
  } catch { /* ignore */ }
  return DEFAULTS.map((c) => ({ ...c }));
}

export const COMPANY_DEFS: CompanyDef[] = hydrate();
export const COMPANIES: string[] = COMPANY_DEFS.map((c) => c.id);

function persist() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS, JSON.stringify(COMPANY_DEFS));
  window.dispatchEvent(new Event('jpk:companies-change'));
}
function syncIds() { COMPANIES.length = 0; for (const c of COMPANY_DEFS) COMPANIES.push(c.id); }

function slug(name: string): string {
  const ascii = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return ascii || `co${Date.now().toString(36)}`;
}

export function companyDefs(): CompanyDef[] { return COMPANY_DEFS.map((c) => ({ ...c })); }

/** 회사 추가 — 반환 id. 실패(빈 이름·id 중복) 시 null. */
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

export function companyLabel(id: unknown): string {
  const s = String(id || '');
  if (s === ALL_COMPANIES) return '전체';
  return COMPANY_DEFS.find((c) => c.id === s)?.label || s || '—';
}
export function companyShort(id: unknown): string {
  const s = String(id || '');
  const c = COMPANY_DEFS.find((x) => x.id === s);
  return c?.short || c?.label || s;
}

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
