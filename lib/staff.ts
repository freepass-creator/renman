/** 직원(유저) 로스터 레지스트리 — 역할·법인·상태 관리 SSOT. localStorage 보존(회사 레지스트리와 동일 패턴).
 *  이건 "누가 어떤 권한으로 접근하는지"의 관리대장. 실제 로그인 계정(Firebase Auth users/{uid})은
 *  email 로 매칭해 연결한다 — 초대메일·비밀번호 재설정은 Auth 배선 시 활성(콘솔은 지금부터 역할·법인·상태를 관리).
 *  STAFF 는 in-place 갱신 라이브 배열 — 소비처가 렌더마다 map 하므로 반영됨. */
export type StaffRole = '본사' | '법인';
export type StaffStatus = '활성' | '정지';
export type StaffDef = {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  companyId: string | null;   // 법인 소속(본사=null=전 법인)
  department?: string;
  phone?: string;
  status: StaffStatus;
  note?: string;
};

const DEFAULTS: StaffDef[] = [
  { id: 'op1', name: '본사 마스터', email: 'pyh@teamjpk.com', role: '본사', companyId: null, department: '본사', status: '활성' },
  { id: 'ws_prime', name: '프라임구독 직원', email: 'ceo@prime.co.kr', role: '법인', companyId: 'prime', department: '운영', status: '활성' },
  { id: 'ws_sonogong', name: '손오공렌터카 직원', email: 'ceo@sonogong.co.kr', role: '법인', companyId: 'sonogong', department: '운영', status: '활성' },
];
const LS = 'jpk:staff';

function hydrate(): StaffDef[] {
  if (typeof window === 'undefined') return DEFAULTS.map((s) => ({ ...s }));
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || 'null');
    if (Array.isArray(saved) && saved.length) return saved.filter((s: StaffDef) => s && s.id && s.email).map((s: StaffDef) => ({ ...s }));
  } catch { /* ignore */ }
  return DEFAULTS.map((s) => ({ ...s }));
}

export const STAFF: StaffDef[] = hydrate();

function persist() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LS, JSON.stringify(STAFF));
  window.dispatchEvent(new Event('jpk:staff-change'));
}

function slug(email: string, name: string): string {
  const base = (email.split('@')[0] || name).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return base || `u${Date.now().toString(36)}`;
}

export function staffDefs(): StaffDef[] { return STAFF.map((s) => ({ ...s })); }
export function staffByEmail(email: string): StaffDef | undefined {
  const e = (email || '').trim().toLowerCase();
  return STAFF.find((s) => s.email.toLowerCase() === e);
}

/** 명단에서 정지된 이메일 — 로그인 게이트용. 명단에 없으면 null(미해당=통과). */
export function isStaffSuspended(email: string | null | undefined): boolean {
  if (!email) return false;
  const s = staffByEmail(email);
  return !!s && s.status === '정지';
}

/** 직원 추가 — 반환 id. 실패(빈 이름/이메일·이메일 중복) 시 null. */
export function addStaff(p: { name: string; email: string; role: StaffRole; companyId: string | null; department?: string; phone?: string }): string | null {
  const name = (p.name || '').trim(), email = (p.email || '').trim();
  if (!name || !email) return null;
  if (staffByEmail(email)) return null;   // 이메일 유일
  let id = slug(email, name), n = 1;
  while (STAFF.some((s) => s.id === id)) id = `${slug(email, name)}${++n}`;
  STAFF.push({
    id, name, email, role: p.role,
    companyId: p.role === '본사' ? null : (p.companyId || null),
    department: (p.department || '').trim() || undefined,
    phone: (p.phone || '').trim() || undefined,
    status: '활성',
  });
  persist();
  return id;
}
export function updateStaff(id: string, patch: Partial<StaffDef>): void {
  const s = STAFF.find((x) => x.id === id); if (!s) return;
  if (patch.name != null && patch.name.trim()) s.name = patch.name.trim();
  if (patch.email != null && patch.email.trim()) s.email = patch.email.trim();
  if (patch.role != null) { s.role = patch.role; if (patch.role === '본사') s.companyId = null; }
  if (patch.companyId !== undefined && s.role === '법인') s.companyId = patch.companyId || null;
  if (patch.department !== undefined) s.department = (patch.department || '').trim() || undefined;
  if (patch.phone !== undefined) s.phone = (patch.phone || '').trim() || undefined;
  if (patch.status != null) s.status = patch.status;
  if (patch.note !== undefined) s.note = (patch.note || '').trim() || undefined;
  persist();
}
export function setStaffStatus(id: string, status: StaffStatus): void { updateStaff(id, { status }); }
export function removeStaff(id: string): void {
  const i = STAFF.findIndex((x) => x.id === id); if (i < 0) return;
  STAFF.splice(i, 1); persist();
}
