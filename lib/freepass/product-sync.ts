/**
 * 프리패스(freepasserp4) 상품 연동 — renman 차량 → erp4 product(매물) push.
 *   대상: 보유·상품대기(매각계열 제외) 차량 = "지금 세워둔, 다시 굴릴 차".
 *   매핑: 차종마스터 5단계가 erp4 product와 1:1 (네이밍 델타만 보정). enum은 best-effort 정규화 —
 *     정밀 보정은 erp4 commitSupplierProducts(snapToMaster)에 위임.
 *   전송: renman 서버 라우트(/api/freepass/push)로 보내고 거기서 시크릿 붙여 erp4로 포워딩(시크릿 서버 보관).
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { apiAuthHeaders } from '@/lib/api-headers';
import { loadMaster } from '@/lib/company-master';

/** erp4 product 페이로드(핵심 필드). commitSupplierProducts가 받는 형태. */
export type ErpProduct = Record<string, unknown>;

// 우리(renman) 공급사 코드 — erp4에서 이 매물들의 소유 테넌트 키(provider_company_code). 배포 시 env로.
export const PROVIDER_CODE = (process.env.NEXT_PUBLIC_FREEPASS_PROVIDER_CODE || 'renman').trim();

const FUEL_MAP: Record<string, string> = { '경유': '디젤', '휘발유': '가솔린', 'ev': '전기', 'gasoline': '가솔린', 'diesel': '디젤' };
const normFuel = (f: unknown) => { const t = String(f || '').trim(); return FUEL_MAP[t.toLowerCase()] || FUEL_MAP[t] || t; };
const DRIVE_MAP: Record<string, string> = { '전륜': '전륜(FF)', 'ff': '전륜(FF)', '후륜': '후륜(FR)', 'fr': '후륜(FR)', 'awd': '4륜(AWD)', '4륜': '4륜(AWD)', '4wd': '4륜(4WD)' };
const normDrive = (d: unknown) => { const t = String(d || '').trim(); return DRIVE_MAP[t.toLowerCase()] || DRIVE_MAP[t] || t; };

const SALE = new Set(['매각', '말소', '매각대기', '매각검토']);

/** 프리패스 상품 연동 대상 — 상품대기(매각계열 제외). */
export function eligibleForProduct(vehicles: EntityRecord[]): EntityRecord[] {
  return vehicles.filter((v) => {
    const s = String(v.status || '');
    return s === '상품대기' && !SALE.has(s);
  });
}

/** renman 차량 → erp4 product 페이로드. 5단계 네이밍 델타(modelLine→model·subModel→sub_model·trim→trim_name) + enum 정규화. */
export function vehicleToProduct(v: EntityRecord, providerCode = PROVIDER_CODE): ErpProduct {
  const plate = String(v.plate || '');
  // 사업자번호 — erp4가 이 값으로 공급사코드(provider_company_code) 매칭. provider_company_code는 폴백 기본값.
  const bizNo = String((loadMaster(String(v.companyId || '')) || {}).bizNo || '').replace(/[^0-9]/g, '');
  const raw: ErpProduct = {
    product_code: `${providerCode}_${plate}`,   // 자연키(idFrom)
    car_number: plate,                          // 필수
    business_no: bizNo,                         // 사업자번호 → erp4 공급사코드 매칭 키
    provider_company_code: providerCode,        // 소유 테넌트 키(폴백 — erp4가 business_no로 재해소)
    partner_code: providerCode,
    // 5단계 (네이밍 델타)
    maker: v.maker,
    model: v.modelLine,
    sub_model: v.subModel,
    variant: v.variant,
    trim_name: v.trim,
    // 스펙
    year: v.modelYear,
    fuel_type: normFuel(v.fuel),
    mileage: v.mileage,
    drive_type: normDrive(v.driveType),
    seats: v.seats,
    engine_cc: v.displacement,
    ext_color: v.exteriorColor,
    int_color: v.interiorColor,
    usage: v.usage,
    first_registration_date: v.firstReg,
    vin: v.vin,
    transmission: v.transmission,
    options: v.optionList,
    // 마켓 상태·구분(기본값 — erp4에서 조정)
    vehicle_status: '출고가능',
    product_type: '중고렌트',
    source: 'renman',
  };
  // 빈 값 제거 → erp4 소프트머지가 기존 값을 blank로 덮어쓰지 않도록.
  const out: ErpProduct = {};
  for (const k of Object.keys(raw)) { const val = raw[k]; if (val !== '' && val != null) out[k] = val; }
  // 가격맵(erp4 price = { [기간]: { rent, deposit } }, 원단위) — 대여료 있을 때만.
  const rent = Number(v.listRent) || 0, deposit = Number(v.listDeposit) || 0;
  if (rent) {
    const term = String(Number(v.listTerm) || 48);
    out.price = { [term]: { rent, deposit } };
  }
  // 보험료 포함 여부(erp4 표준필드 아님 — 커스텀 전달, 수신측 저장/무시). 정책(policy)은 프리패스 소관이라 미설정.
  if (v.insuranceIncluded) out.insurance_included = String(v.insuranceIncluded);
  return out;
}

export type PushResult = { ok: boolean; status?: number; created?: number; updated?: number; error?: string; body?: string };

/** erp4로 push — renman 서버 라우트 경유(시크릿 서버 보관). env 미설정이면 라우트가 미구성 응답. */
export async function pushToFreepass(products: ErpProduct[]): Promise<PushResult> {
  try {
    const res = await fetch('/api/freepass/push', {
      method: 'POST',
      headers: apiAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ products }),
    });
    const j = (await res.json().catch(() => ({}))) as PushResult;
    return { ...j, ok: res.ok && j.ok !== false, status: res.status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// 상품 등록 대상 상태 — 상품대기/상품화면 프리패스 매물로.
const PRODUCT_READY = new Set(['상품대기', '상품화']);
export const isProductReady = (rec: EntityRecord | null | undefined): boolean => !!rec && PRODUCT_READY.has(String(rec.status || ''));

/**
 * 차량 상태가 상품대기/상품화로 바뀌면 프리패스로 자동 push(fire-and-forget).
 *   · 클라에서만(라우트 fetch) · NEXT_PUBLIC_FREEPASS_SYNC==='1'일 때만(미설정=자동연동 꺼짐).
 *   · product_code 자연키 → erp4 upsert(idempotent). 저장 흐름을 막지 않음(비동기·에러 무시).
 */
export function syncVehicleToFreepass(rec: EntityRecord | null | undefined): void {
  if (typeof window === 'undefined') return;
  if (process.env.NEXT_PUBLIC_FREEPASS_SYNC !== '1') return;
  if (!isProductReady(rec)) return;
  void pushToFreepass([vehicleToProduct(rec as EntityRecord)]).catch(() => { /* 연동 실패 무시(비파괴) */ });
}
