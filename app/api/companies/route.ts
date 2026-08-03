import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth, getAdminApp, type AuthedActor } from '@/lib/api-auth';
import { enforceApiRateLimit } from '@/lib/api-rate-limit';
import { DEFAULT_COMPANY_DEFS, type CompanyDef, type CompanyMasterInput } from '@/lib/companies';

export const runtime = 'nodejs';

type RegistryDoc = CompanyDef & {
  status?: 'active' | 'archived';
  registeredNameRaw?: string;
  bizNo?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  archivedAt?: string;
};

function canManage(actor: AuthedActor): boolean {
  return actor.systemRole === 'hq' || actor.systemRole === 'local';
}

function clean(value: unknown, max = 300): string | undefined {
  const out = String(value || '').trim();
  return out ? out.slice(0, max) : undefined;
}

function cleanList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map((v) => clean(v, 100)).filter((v): v is string => !!v).slice(0, 30);
  return out.length ? out : undefined;
}

function cleanUrl(value: unknown): string | undefined {
  const out = clean(value, 2_000);
  if (!out) return undefined;
  try {
    const url = new URL(out);
    return url.protocol === 'https:' || url.protocol === 'http:' ? out : undefined;
  } catch { return undefined; }
}

function cleanMaster(value: unknown): CompanyMasterInput {
  const src = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const doc = src.businessRegistration && typeof src.businessRegistration === 'object'
    ? src.businessRegistration as Record<string, unknown>
    : {};
  const businessRegistration = {
    fileName: clean(doc.fileName, 180),
    url: cleanUrl(doc.url),
    uploadedAt: clean(doc.uploadedAt, 40),
    issueDate: clean(doc.issueDate, 20),
  };
  return {
    bizNo: clean(src.bizNo, 20)?.replace(/[^0-9-]/g, ''),
    corpNo: clean(src.corpNo, 20)?.replace(/[^0-9-]/g, ''),
    ceo: clean(src.ceo, 80),
    address: clean(src.address, 400),
    businessAddress: clean(src.businessAddress, 400),
    headquartersAddress: clean(src.headquartersAddress, 400),
    openDate: clean(src.openDate, 20),
    entityType: clean(src.entityType, 30),
    industry: cleanList(src.industry),
    category: cleanList(src.category),
    email: clean(src.email, 180),
    taxOffice: clean(src.taxOffice, 100),
    businessRegistration: Object.values(businessRegistration).some(Boolean) ? businessRegistration : undefined,
  };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function publicCompany(value: RegistryDoc): CompanyDef {
  return withoutUndefined({ id: value.id, label: value.label, short: value.short });
}

function companyIdOf(name: string, bizNo?: string): string {
  const digits = String(bizNo || '').replace(/\D/g, '');
  if (digits.length === 10) return `co${digits}`;
  return `co${createHash('sha256').update(name).digest('hex').slice(0, 16)}`;
}

function splitCsv(value: unknown): string[] | undefined {
  const text = clean(value, 1_000);
  if (!text) return undefined;
  const out = text.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

function parseBusinessOcr(value: unknown): { registeredName: string; master: CompanyMasterInput } | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const registeredName = clean(raw.partner_name, 160) || '';
  if (!registeredName) return null;
  const businessAddress = clean(raw.address, 400);
  const headquartersAddress = clean(raw.hq_address, 400);
  return {
    registeredName,
    master: withoutUndefined({
      bizNo: clean(raw.biz_no, 20),
      corpNo: clean(raw.corp_no, 20),
      ceo: clean(raw.ceo, 80),
      address: headquartersAddress || businessAddress,
      businessAddress,
      headquartersAddress,
      openDate: clean(raw.open_date, 20),
      entityType: clean(raw.entity_type, 30),
      industry: splitCsv(raw.industry),
      category: splitCsv(raw.category),
      email: clean(raw.email, 180),
      taxOffice: clean(raw.tax_office, 100),
    }),
  };
}

export async function GET(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  const limited = await enforceApiRateLimit('company-registry-read', actor.uid, { limit: 120, windowMs: 60_000 });
  if (limited) return limited;
  try {
    const db = getFirestore(getAdminApp());
    if (actor.systemRole === 'tenant') {
      const id = actor.companyId || '';
      const snap = await db.collection('company_registry').doc(id).get();
      const stored = snap.exists ? snap.data() as RegistryDoc : undefined;
      if (stored?.status === 'archived') return NextResponse.json({ companies: [] });
      const fallback = DEFAULT_COMPANY_DEFS.find((c) => c.id === id);
      const row = stored?.label ? publicCompany({ ...stored, id }) : fallback;
      return NextResponse.json({ companies: row ? [row] : [] });
    }

    const snap = await db.collection('company_registry').get();
    const merged = new Map(DEFAULT_COMPANY_DEFS.map((c) => [c.id, { ...c }]));
    for (const doc of snap.docs) {
      const row = { ...doc.data(), id: doc.id } as RegistryDoc;
      if (row.status === 'archived') merged.delete(doc.id);
      else if (row.label) merged.set(doc.id, publicCompany(row));
    }
    return NextResponse.json({ companies: [...merged.values()] });
  } catch (error) {
    console.error('[company-registry:get]', error);
    return NextResponse.json({ error: '관리회사 목록을 불러오지 못했습니다.' }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (!canManage(actor)) return NextResponse.json({ error: '본사 운영자 권한이 필요합니다.' }, { status: 403 });
  const limited = await enforceApiRateLimit('company-registry-write', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const fromOcr = parseBusinessOcr(body?.businessRegistrationOcr);
  const registeredName = clean(body?.registeredName, 160) || fromOcr?.registeredName || '';
  if (!registeredName) return NextResponse.json({ error: '사업자등록증 상호가 필요합니다.' }, { status: 400 });
  const master = {
    ...(fromOcr?.master || {}),
    ...withoutUndefined(cleanMaster(body?.master)),
  };
  const id = companyIdOf(registeredName, master.bizNo);
  const now = new Date().toISOString();
  try {
    const db = getFirestore(getAdminApp());
    const ref = db.collection('company_registry').doc(id);
    const masterRef = db.collection('company_master').doc(id);
    let conflict = false;
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists && (existing.data() as RegistryDoc).status !== 'archived') { conflict = true; return; }
      tx.set(ref, withoutUndefined({
        id,
        label: registeredName,
        registeredNameRaw: registeredName,
        bizNo: master.bizNo,
        status: 'active',
        createdAt: existing.data()?.createdAt || now,
        createdBy: existing.data()?.createdBy || actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
      }));
      tx.set(masterRef, {
        companyId: id,
        master: withoutUndefined({ registeredNameRaw: registeredName, modules: ['basic', 'garage', 'vehicleReg'], ...master }),
        updatedAt: now,
      });
    });
    if (conflict) return NextResponse.json({ error: '이미 등록된 회사입니다.' }, { status: 409 });
    return NextResponse.json({ company: { id, label: registeredName } }, { status: 201 });
  } catch (error) {
    console.error('[company-registry:create]', error);
    return NextResponse.json({ error: '관리회사를 생성하지 못했습니다.' }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (!canManage(actor)) return NextResponse.json({ error: '본사 운영자 권한이 필요합니다.' }, { status: 403 });
  const limited = await enforceApiRateLimit('company-registry-write', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = clean(body?.companyId, 100) || '';
  if (!/^[a-z0-9_-]+$/i.test(id) || id.includes('__')) return NextResponse.json({ error: '올바르지 않은 회사 ID입니다.' }, { status: 400 });
  const registeredName = clean(body?.registeredName, 160);
  const short = clean(body?.short, 80);
  const masterPatch = cleanMaster(body?.masterPatch);
  const now = new Date().toISOString();
  try {
    const db = getFirestore(getAdminApp());
    const ref = db.collection('company_registry').doc(id);
    const masterRef = db.collection('company_master').doc(id);
    let label = registeredName || DEFAULT_COMPANY_DEFS.find((c) => c.id === id)?.label || id;
    await db.runTransaction(async (tx) => {
      const [registrySnap, masterSnap] = await Promise.all([tx.get(ref), tx.get(masterRef)]);
      const old = registrySnap.data() as RegistryDoc | undefined;
      label = registeredName || old?.label || label;
      tx.set(ref, withoutUndefined({
        ...old,
        id,
        label,
        registeredNameRaw: label,
        short: body && Object.hasOwn(body, 'short') ? short : old?.short,
        status: 'active',
        createdAt: old?.createdAt || now,
        createdBy: old?.createdBy || actor.uid,
        updatedAt: now,
        updatedBy: actor.uid,
      }));
      if (Object.values(masterPatch).some((v) => v !== undefined) || registeredName) {
        const oldMaster = (masterSnap.data() as { master?: Record<string, unknown> } | undefined)?.master || {};
        const businessRegistration = masterPatch.businessRegistration
          ? { ...(oldMaster.businessRegistration as Record<string, unknown> || {}), ...masterPatch.businessRegistration }
          : oldMaster.businessRegistration;
        tx.set(masterRef, {
          companyId: id,
          master: withoutUndefined({ ...oldMaster, ...masterPatch, businessRegistration, registeredNameRaw: label }),
          updatedAt: now,
        });
      }
    });
    return NextResponse.json({ company: withoutUndefined({ id, label, short }) });
  } catch (error) {
    console.error('[company-registry:update]', error);
    return NextResponse.json({ error: '관리회사 정보를 수정하지 못했습니다.' }, { status: 503 });
  }
}

export async function DELETE(req: Request) {
  const actor = await requireAuth(req);
  if (actor instanceof NextResponse) return actor;
  if (!canManage(actor)) return NextResponse.json({ error: '본사 운영자 권한이 필요합니다.' }, { status: 403 });
  const limited = await enforceApiRateLimit('company-registry-write', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const id = clean(body?.companyId, 100) || '';
  if (!/^[a-z0-9_-]+$/i.test(id) || id.includes('__')) return NextResponse.json({ error: '올바르지 않은 회사 ID입니다.' }, { status: 400 });
  const now = new Date().toISOString();
  try {
    const db = getFirestore(getAdminApp());
    const ref = db.collection('company_registry').doc(id);
    const existing = await ref.get();
    const old = existing.data() as RegistryDoc | undefined;
    const fallback = DEFAULT_COMPANY_DEFS.find((c) => c.id === id);
    await ref.set(withoutUndefined({
      ...old,
      id,
      label: old?.label || fallback?.label || id,
      status: 'archived',
      archivedAt: now,
      updatedAt: now,
      updatedBy: actor.uid,
    }));
    return NextResponse.json({ company: { id, label: old?.label || fallback?.label || id } });
  } catch (error) {
    console.error('[company-registry:archive]', error);
    return NextResponse.json({ error: '관리회사를 목록에서 제외하지 못했습니다.' }, { status: 503 });
  }
}
