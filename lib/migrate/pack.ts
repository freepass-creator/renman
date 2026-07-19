/**
 * 스위치플랜 시드 팩 — 단일 진입점.
 *   mode = NEXT_PUBLIC_MIGRATE_MODE | JPK_MIGRATE_MODE
 *     · auto   (기본) live xlsx 시도 → 실패 시 frozen JSON → demo
 *     · live   실파일(/api/migrate-source)만. 없으면 demo
 *     · frozen 얼린 switchplan-data.json만 (+보험·등록증 enrich)
 *     · demo   데모 팩만
 *
 * 페이지·seed는 여기만 호출. buildSwitchplanPack / FromBuffer 직접 호출 금지(마이그레이션 도구 제외).
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { buildSwitchplanPack } from '@/lib/migrate/switchplan';
import { buildDemoPack } from '@/lib/seed-demo';
import switchplanInsurance from '@/lib/migrate/switchplan-insurance.json';
import switchplanRegistration from '@/lib/migrate/switchplan-registration.json';

export type MigrateMode = 'auto' | 'live' | 'frozen' | 'demo';
export type SwitchplanEntityPack = Record<string, EntityRecord[]>;

const SWITCHPLAN_INSURANCE = switchplanInsurance as unknown as EntityRecord[];
const REG_BY_PLATE = new Map(
  (switchplanRegistration as Array<{ plate: string; inspectionTo?: string; vin?: string; firstReg?: string }>).map((r) => [r.plate, r]),
);
const INS_BY_PLATE = new Map<string, EntityRecord>();
for (const r of SWITCHPLAN_INSURANCE) {
  const k = String(r.plate || '');
  if (!k) continue;
  if (!INS_BY_PLATE.has(k) || String(r.status) !== '해지') INS_BY_PLATE.set(k, r);
}

function packHasRows(pack: SwitchplanEntityPack): boolean {
  return Object.values(pack).some((a) => Array.isArray(a) && a.length > 0);
}

function enrichVehicles(pack: SwitchplanEntityPack): SwitchplanEntityPack {
  if (Array.isArray(pack.vehicle)) {
    pack.vehicle = pack.vehicle.map((v) => {
      const plate = String(v.plate || '');
      const r = REG_BY_PLATE.get(plate);
      const ins = INS_BY_PLATE.get(plate);
      const add: Record<string, unknown> = {};
      if (r?.inspectionTo && !v.inspectionTo) add.inspectionTo = r.inspectionTo;
      if (r?.vin && !v.vin) add.vin = r.vin;
      if (r?.firstReg && !v.firstReg) add.firstReg = r.firstReg;
      if (ins?.endDate && !v.insuranceExpiryDate) add.insuranceExpiryDate = ins.endDate;
      if (ins?.insuranceAge != null && v.insuranceAge == null) add.insuranceAge = ins.insuranceAge;
      if (ins?.insurer && !v.insuranceCompany) add.insuranceCompany = ins.insurer;
      if (ins?.policyNo && !v.insurancePolicyNo) add.insurancePolicyNo = ins.policyNo;
      return Object.keys(add).length ? { ...v, ...add } : v;
    });
  }
  return pack;
}

function withInsurance(pack: SwitchplanEntityPack): SwitchplanEntityPack {
  pack.insurance = SWITCHPLAN_INSURANCE;
  return enrichVehicles(pack);
}

const b64ToBuf = (b64: string): ArrayBuffer => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

/** 클라/서버 공통 모드 해석. */
export function resolveMigrateMode(override?: string): MigrateMode {
  const raw = (override || process.env.NEXT_PUBLIC_MIGRATE_MODE || process.env.JPK_MIGRATE_MODE || 'auto').toLowerCase();
  if (raw === 'live' || raw === 'frozen' || raw === 'demo' || raw === 'auto') return raw;
  return 'auto';
}

async function loadLivePack(): Promise<SwitchplanEntityPack | null> {
  if (typeof window === 'undefined') return null;
  try {
    const r = await fetch('/api/migrate-source', { cache: 'no-store' });
    const j = await r.json();
    if (!j?.ok || !j.biz?.b64) return null;
    const [{ buildSwitchplanPackFromBuffer }, { parseSwitchplanJbo }] = await Promise.all([
      import('@/lib/migrate/switchplan-parse'),
      import('@/lib/migrate/switchplan-jbo-parse'),
    ]);
    const jbo = j.jbo?.b64 ? parseSwitchplanJbo(b64ToBuf(j.jbo.b64)) : null;
    const asOf = jbo?.bank_tx?.reduce((mx: string, t: EntityRecord) => {
      const d = String(t.txDate || '');
      return d > mx ? d : mx;
    }, '') || undefined;
    const pack = buildSwitchplanPackFromBuffer(b64ToBuf(j.biz.b64), asOf) as unknown as SwitchplanEntityPack;
    if (jbo) pack.bank_tx = jbo.bank_tx;
    if (!packHasRows(pack)) return null;
    return withInsurance(pack);
  } catch {
    return null;
  }
}

function loadFrozenPack(): SwitchplanEntityPack | null {
  const frozen = buildSwitchplanPack() as SwitchplanEntityPack;
  if (!packHasRows(frozen)) return null;
  return withInsurance(frozen);
}

/**
 * 회사별 시드 팩. switchplan만 실데이터 경로, 그 외는 데모.
 */
export async function buildCompanyPack(companyId: string, mode = resolveMigrateMode()): Promise<SwitchplanEntityPack> {
  if (companyId !== 'switchplan') return buildDemoPack(companyId);

  if (mode === 'demo') return buildDemoPack(companyId);

  if (mode === 'frozen') {
    return loadFrozenPack() || buildDemoPack(companyId);
  }

  if (mode === 'live') {
    return (await loadLivePack()) || buildDemoPack(companyId);
  }

  // auto
  return (await loadLivePack()) || loadFrozenPack() || buildDemoPack(companyId);
}
