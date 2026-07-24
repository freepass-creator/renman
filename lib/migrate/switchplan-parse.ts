/**
 * 스위치플랜 「사업현황.xlsx」 실파일 → jpkerp6 EntityRecord 라이브 파서.
 *
 * jpkerp5 lib/migrate/switchplan.ts(검증본)의 anchor-block 파서를 그대로 이식하되,
 * 산출을 강타입 Contract/Vehicle 이 아닌 v6 제네릭 EntityRecord(entities.ts 키)로 낸다.
 * 얼린 switchplan-data.json 을 소비하는 buildSwitchplanPack(병렬 경로)과 달리 이 모듈은
 * 실 xlsx 버퍼를 직접 파싱 → 자산 163·현보유 118·상환합계 157 등 차원이 유실되지 않는다.
 *
 * 미수 3정의(중요, v5 그대로):
 *   - carry   = 직원 running balance(도래 최신월) = 현재 실미수 → 씨앗값(net).
 *   - gross   = Σ청구 − Σ결제 (clamp≥0). 반납 정산 못 봄 → 교차검증용.
 *   - pastDue = 도래월별 max(0,청구−결제) 합. 묶음결제 시 과대 → 참고용.
 *
 * 차량 status·contract net미수 규칙(v5 migrate-switchplan commit 규칙):
 *   - 현보유(채권 활성 plate, 118) = '운행', 그 외 자산 = '매각'(비보유).
 *   - 계약 순미수(net) = carry → _paidTotal 역산(v6 수납엔진 정합).
 */

import * as XLSX from 'xlsx';
import type { EntityRecord } from '@/lib/intake/entities';
import { generateSchedules } from '@/lib/payments/payment-schedule';
import { normPlate } from '@/lib/plate';
import { todayKST } from '@/lib/contracts/dates'; // KST 기준 오늘(기본 today)
import { classifyVehicle, parseTrim } from '@/lib/domain/vehicle-master'; // 차종마스터 스냅(catalog 로드 시)·트림 분해

/* ─────────────── 셀 유틸 (v5 그대로) ─────────────── */

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}

function monthOfLabel(s: string): string {
  const m = String(s).match(/(\d{2})년\s*(\d{1,2})월/);
  return m ? `20${m[1]}-${m[2].padStart(2, '0')}` : '';
}

function monthOfDate(s: string): string {
  const m = cellStr(s).match(/(\d{4})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}` : '';
}

function addMonth(ym: string, k: number): string {
  if (!ym) return '';
  const parts = ym.split('-').map(Number);
  let y = parts[0];
  let m = parts[1] + k;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function payDayNum(s: string): number {
  const raw = cellStr(s);
  if (/말/.test(raw)) return 31;
  const m = raw.match(/(\d{1,2})/);
  return m ? Math.min(31, Math.max(1, Number(m[1]))) : 1;
}

function addMonthsStr(yyyymmdd: string, months: number): string {
  if (!yyyymmdd) return '';
  const d = new Date(yyyymmdd);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function monthDiff(start: string, end: string): number {
  if (!start || !end) return 12;
  const ds = new Date(start);
  const de = new Date(end);
  if (isNaN(ds.getTime()) || isNaN(de.getTime())) return 12;
  return (de.getFullYear() - ds.getFullYear()) * 12 + (de.getMonth() - ds.getMonth());
}

/**
 * YYYY-MM-DD 정규화.
 * 엑셀 오기: 1930-xx → 2030-xx (연도 −100 센티널). 1930~1939만 +100.
 * 그 외 렌터카 운영 구간(2000~2045) 밖은 무효.
 */
const DATE_YEAR_MIN = 2000;
const DATE_YEAR_MAX = 2045;

function remapCenturyTypo(y: number): number {
  // 1930 → 2030, 1932 → 2032 …
  if (y >= 1930 && y <= 1939) return y + 100;
  return y;
}

function normDateStr(s: string): string {
  const m = cellStr(s).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = remapCenturyTypo(Number(m[1]));
  if (y < DATE_YEAR_MIN || y > DATE_YEAR_MAX) return '';
  return `${String(y).padStart(4, '0')}-${m[2]}-${m[3]}`;
}

/** '' / 0 / undefined → undefined (빈 값 제거) */
function clean<T>(v: T | '' | 0 | undefined): T | undefined {
  return (v === '' || v === 0 || v === undefined ? undefined : v) as T | undefined;
}

/** undefined 프로퍼티 제거 (Firestore/EntityRecord 정리) */
function pruneUndefined(rec: EntityRecord): EntityRecord {
  const out: EntityRecord = {};
  for (const k of Object.keys(rec)) if (rec[k] !== undefined) out[k] = rec[k];
  return out;
}

/* ─────────────── 상환합계 시트 → 차량 할부 ─────────────── */

export type SwitchplanLoan = {
  vehiclePlate: string;
  financer: string;
  startDate: string;
  maturityDate: string;
  months: number;
  rate: number;
  principal: number;
  totalInterest: number;
  fee: number;
  totalRepayment: number;
  cashOnly: boolean;
};

function buildLoans(wb: XLSX.WorkBook): SwitchplanLoan[] {
  const out: SwitchplanLoan[] = [];
  const sheet = wb.Sheets['상환합계'];
  if (!sheet) return out;
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  // 헤더 행 = '차량번호' 포함 행 (R0은 '당월상환액->' 합계)
  const hRow = G.findIndex((r) => (r as unknown[]).some((v) => cellStr(v) === '차량번호'));
  if (hRow < 0) return out;
  const h = (G[hRow] as unknown[]).map(cellStr);
  const ci = (lbl: string) => h.findIndex((x) => x === lbl);
  const col = {
    plate: ci('차량번호'), financer: ci('금융사'), start: ci('실행일'), maturity: ci('만기일'),
    months: ci('차'), rate: ci('금리'), payDay: ci('결제일'),
    principal: ci('할부원금'), interest: ci('총이자'), fee: ci('수수료'), total: ci('총상환금액'),
  };
  const getS = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
  const getN = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
  for (let r = hRow + 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plate = getS(row, col.plate);
    if (!plate) continue;
    const financer = getS(row, col.financer);
    const principal = getN(row, col.principal);
    const cashOnly = /현금/.test(financer) || (principal === 0 && getN(row, col.total) === 0);
    out.push({
      vehiclePlate: plate,
      financer,
      startDate: normDateStr(getS(row, col.start)),
      maturityDate: normDateStr(getS(row, col.maturity)),
      months: getN(row, col.months),
      rate: col.rate >= 0 ? (typeof row[col.rate] === 'number' ? (row[col.rate] as number) : cellNum(row[col.rate])) : 0,
      principal,
      totalInterest: getN(row, col.interest),
      fee: getN(row, col.fee),
      totalRepayment: getN(row, col.total),
      cashOnly,
    });
  }
  return out;
}

/** 할부 → 차량(vehicle) 할부 필드 패치 (entities.ts vehicle 키). v5 buildLoanFields 대응. */
export function loanToVehicleFields(l: SwitchplanLoan): EntityRecord {
  if (l.cashOnly) return { loanCashOnly: '예' };
  return pruneUndefined({
    loanCashOnly: '아니오',
    loanCompany: clean(l.financer),
    loanMonths: clean(l.months),
    loanStartDate: clean(l.startDate),
    loanPrincipal: clean(l.principal),
    loanRate: clean(l.rate),
  });
}

/** 할부 → 라이브 EntityRecord (plate + 할부필드). 팩 병합용. */
function loanRecord(l: SwitchplanLoan): EntityRecord {
  return pruneUndefined({ plate: l.vehiclePlate, ...loanToVehicleFields(l) });
}

/* ─────────────── 고객(기준) 조인 인덱스 ─────────────── */

type CustomerInfo = { ident: string; phone: string; kind: string; name: string };

function buildCustomerIndex(wb: XLSX.WorkBook): {
  byPlate: Map<string, CustomerInfo>;
  byPlateName: Map<string, string>;
} {
  const byPlate = new Map<string, CustomerInfo>();
  const byPlateName = new Map<string, string>();
  const sheet = wb.Sheets['고객(기준)'] ?? wb.Sheets['고객'];
  if (!sheet) return { byPlate, byPlateName };
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (G.length === 0) return { byPlate, byPlateName };
  const h = (G[0] as unknown[]).map(cellStr);
  const ci = (lbl: string) => h.findIndex((x) => x === lbl);
  const cPlate = ci('차량번호');
  const cIdent = ci('주민/법인번호');
  const cPhone = ci('본인연락처');
  const cKind = ci('구분');
  const cName = ci('코드명');
  for (let r = 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plate = normPlate(cellStr(row[cPlate]));
    if (!plate) continue;
    const info: CustomerInfo = {
      ident: cIdent >= 0 ? cellStr(row[cIdent]) : '',
      phone: cPhone >= 0 ? cellStr(row[cPhone]) : '',
      kind: cKind >= 0 ? cellStr(row[cKind]) : '',
      name: cName >= 0 ? cellStr(row[cName]) : '',
    };
    if (!byPlate.has(plate)) byPlate.set(plate, info);
    if (info.name && info.ident) byPlateName.set(`${plate}|${info.name}`, info.ident);
  }
  return { byPlate, byPlateName };
}

/* ─────────────── 자산 시트 → 차량 마스터 ─────────────── */

export type SwitchplanVehicle = {
  vehiclePlate: string;
  division: string;
  garage: string;
  acquisitionDate: string;
  firstRegisteredDate: string;
  inspectionTo: string;
  vin: string;
  maker: string;
  modelLine: string;
  subModel: string;
  fullModel: string;
  year: number;
  displacementCc: number;
  fuel: string;
  trim: string;
  options: string;
  exteriorColor: string;
  interiorColor: string;
  consumerPrice: number;
  vehiclePrice: number;
  purchasePrice: number;
  gps: string;
  disposed: boolean;   // 자산 시트 "20XX 매각" 섹션 아래 차 = 처분(매각). 미수 잔존으로 채권시트에 남아도 보유 아님.
};

function buildVehicles(wb: XLSX.WorkBook): SwitchplanVehicle[] {
  const out: SwitchplanVehicle[] = [];
  const sheet = wb.Sheets['자산'];
  if (!sheet) return out;
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  if (G.length === 0) return out;
  const h = (G[0] as unknown[]).map(cellStr);
  const ci = (lbl: string) => h.findIndex((x) => x === lbl);
  const col = {
    plate: ci('차량번호'), division: ci('구분'), garage: ci('등록지'),
    acq: ci('취득일'), firstReg: ci('최초등록일'), inspection: ci('차령만료일'), vin: ci('차대번호'),
    maker: ci('제조사'), model: ci('모델'), sub: ci('세부모델'), year: ci('연식'),
    disp: ci('배기량'), fuel: ci('연료'), trim: ci('트림'), options: ci('선택옵션'),
    ext: ci('외장색상'), int: ci('내장색상'),
    consumer: ci('소비자가격'), vprice: ci('차량가격'), purchase: ci('실제구입가격'),
    gps: ci('GPS'),
  };
  const get = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
  const getN = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
  // 자산 시트는 [보유] 다음에 "20XX 매각" 구분행으로 처분 섹션이 이어진다.
  // 그 구분행(plate 없음, 첫칸에 "…매각/처분/폐차/말소")을 만나면 이후 행은 전부 처분차.
  let inDisposed = false;
  for (let r = 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plate = get(row, col.plate);
    if (!plate) {
      if (/매각|처분|폐차|말소/.test(get(row, 0))) inDisposed = true;
      continue;
    }
    const maker = get(row, col.maker);
    const modelLine = get(row, col.model);
    const subModel = get(row, col.sub);
    const fullModel = [maker, subModel || modelLine].filter(Boolean).join(' ').trim();
    out.push({
      vehiclePlate: plate,
      division: get(row, col.division),
      garage: get(row, col.garage),
      acquisitionDate: normDateStr(get(row, col.acq)),
      firstRegisteredDate: normDateStr(get(row, col.firstReg)),
      inspectionTo: normDateStr(get(row, col.inspection)),
      vin: get(row, col.vin),
      maker, modelLine, subModel, fullModel,
      year: getN(row, col.year),
      displacementCc: getN(row, col.disp),
      fuel: get(row, col.fuel),
      trim: get(row, col.trim),
      options: get(row, col.options),
      exteriorColor: get(row, col.ext),
      interiorColor: get(row, col.int),
      consumerPrice: getN(row, col.consumer),
      vehiclePrice: getN(row, col.vprice),
      purchasePrice: getN(row, col.purchase),
      gps: get(row, col.gps),
      disposed: inDisposed,
    });
  }
  return out;
}

/** 자산 → 차량 EntityRecord (entities.ts vehicle 키). status/할부는 팩에서 병합.
 *  차종마스터가 로드돼 있으면(setCatalog/ensureCatalog) 자산 차종을 마스터에 스냅해 5단계 상위(제조사·모델·세부모델)를
 *  마스터 표준값으로 채운다("차종마스터 기본").
 *  · confidence==='high'(연식 적중)만 덮어씀.
 *  · review(최신세대 폴백)·none → 엑셀 원값 유지(비파괴). 원문은 carName에 보존. */
function vehicleRecord(a: SwitchplanVehicle): EntityRecord {
  const snap = classifyVehicle(a.fullModel || a.subModel || a.modelLine, a.firstRegisteredDate || String(a.year || ''));
  const matched = snap.confidence === 'high';
  const maker = matched ? snap.maker : clean(a.maker);
  const modelLine = matched ? snap.modelLine : clean(a.modelLine);
  const subModel = matched ? snap.subModel : clean(a.subModel);
  // 엑셀 트림 문자열 → 파워트레인(variant) + 트림 분해(erp3 parseTrim 규격).
  const pt = parseTrim(a.trim || '');
  const variant = pt.variant || undefined;
  const trim = pt.trim && pt.trim !== '(기본)' ? pt.trim : clean(a.trim);
  return pruneUndefined({
    plate: a.vehiclePlate,
    vin: clean(a.vin),
    carName: a.fullModel || undefined,
    usage: clean(a.division),
    firstReg: clean(a.firstRegisteredDate),
    inspectionTo: clean(a.inspectionTo),
    modelYear: a.year ? String(a.year) : undefined,     // 연식(제작연월과 별개)
    displacement: clean(a.displacementCc),
    fuel: clean(a.fuel),
    maker, modelLine, subModel,
    variant,                                            // 파워트레인(트림에서 분해)
    trim,
    optionList: clean(a.options),                       // 선택옵션(콤마구분)
    exteriorColor: clean(a.exteriorColor),
    interiorColor: clean(a.interiorColor),
    acquisitionDate: clean(a.acquisitionDate),
    // 실 매입가: 실제구입가격 대부분 공란 → 차량가격 fallback (v5 규칙)
    acquisitionPrice: clean(a.purchasePrice || a.vehiclePrice),
    consumerPrice: clean(a.consumerPrice),              // 소비자가격 → 개소세 계산 기준
    gpsProvider: a.gps && a.gps !== '-' ? a.gps : undefined,
  });
}

/* ─────────────── 원장 시트 파서 (채권/반납 공통, anchor-block) ─────────────── */

type LedgerEntry = { month: string; charged: number; paid: number; paidDate: string; method: string; carry: number };

type RawContract = {
  source: '운행중' | '종료';
  vehiclePlate: string;
  branch: string;
  customerName: string;
  monthlyRent: number;
  deposit: number;
  paymentDay: number;
  contractStart: string;
  contractEnd: string;
  ledger: LedgerEntry[];
};

function parseLedgerSheet(
  wb: XLSX.WorkBook,
  sheetName: string,
  source: '운행중' | '종료',
  hasMonthRow: boolean,
  warnings: string[],
): RawContract[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    warnings.push(`시트 없음: ${sheetName}`);
    return [];
  }
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  const hRow = hasMonthRow ? 1 : 0;
  const H = (G[hRow] as unknown[] | undefined)?.map(cellStr) ?? [];
  const M = hasMonthRow ? ((G[0] as unknown[] | undefined)?.map(cellStr) ?? []) : null;
  const ci = (lbl: string) => H.findIndex((x) => x === lbl);
  const col = {
    소속: ci('소속'),
    코드명: ci('코드명'),
    보증금: ci('보증금'),
    대여료: ci('대여료'),
    결제일: ci('결제일'),
    차량번호: ci('차량번호'),
    시작: ci('시작'),
    종료: ci('종료'),
  };
  const base = ci('청구금액');
  if (base < 0 || col.차량번호 < 0) {
    warnings.push(`${sheetName}: 헤더('청구금액'/'차량번호') 인식 실패`);
    return [];
  }
  const nBlocks = Math.floor((H.length - base) / 5);

  const out: RawContract[] = [];
  const seen = new Set<string>();

  for (let r = hRow + 1; r < G.length; r++) {
    const row = G[r] as unknown[];
    const plateRaw = cellStr(row[col.차량번호]);
    const plate = normPlate(plateRaw);
    const name = col.코드명 >= 0 ? cellStr(row[col.코드명]) : '';
    if (!plate) continue;
    // 코드명(고객명) 공백 = 세입자 없는 유휴 보유차(운행중 계약 아님) 또는 스필오버 → 계약화 제외.
    //   (사용자 확정: 채권시트 118=보유, 그중 이름있는 102=운행중 계약. 이름없는 행은 운행중 아님)
    if (!name) continue;

    const pDay = col.결제일 >= 0 ? payDayNum(cellStr(row[col.결제일])) : 1;
    const ledger: Array<LedgerEntry & { idx: number }> = [];
    for (let b = 0; b < nBlocks; b++) {
      const o = base + b * 5;
      const charged = cellNum(row[o]);
      const paid = cellNum(row[o + 1]);
      const paidDate = cellStr(row[o + 2]);
      const method = cellStr(row[o + 3]);
      const carry = cellNum(row[o + 4]);
      if (!(charged > 0 || paid > 0 || carry > 0)) continue;
      let month = M ? monthOfLabel(M[o + 2] ?? '') : '';
      if (!month) month = monthOfDate(paidDate);
      ledger.push({ month, charged, paid, paidDate, method, carry, idx: b });
    }
    if (ledger.length === 0) continue;

    // 반납: 월 라벨 없는 블록 앵커 보간 (idx 클수록 과거)
    if (!hasMonthRow) {
      for (const e of ledger) {
        if (e.month) continue;
        let anchor: (LedgerEntry & { idx: number }) | null = null;
        for (const a of ledger) {
          if (!a.month) continue;
          if (!anchor || Math.abs(a.idx - e.idx) < Math.abs(anchor.idx - e.idx)) anchor = a;
        }
        if (anchor) e.month = addMonth(anchor.month, anchor.idx - e.idx);
      }
    }

    // 완전중복 제거 (plate|name|원장서명)
    const sig = `${plate}|${name}|${ledger.map((e) => `${e.charged}:${e.paid}`).join(',')}`;
    if (seen.has(sig)) continue;
    seen.add(sig);

    out.push({
      source,
      vehiclePlate: plateRaw,
      branch: col.소속 >= 0 ? cellStr(row[col.소속]) : '',
      customerName: name,
      monthlyRent: col.대여료 >= 0 ? cellNum(row[col.대여료]) : 0,
      deposit: col.보증금 >= 0 ? cellNum(row[col.보증금]) : 0,
      paymentDay: pDay,
      contractStart: col.시작 >= 0 ? cellStr(row[col.시작]) : '',
      contractEnd: col.종료 >= 0 ? cellStr(row[col.종료]) : '',
      ledger: ledger.map(({ month, charged, paid, paidDate, method, carry }) => ({ month, charged, paid, paidDate, method, carry })),
    });
  }
  return out;
}

/** 원장 시트(채권/반납)의 모든 차량번호 — 코드명·원장 유무 무관.
 *  parseLedgerSheet 는 코드명 없는 스필오버 행을 계약에서 제외하지만, 그 plate 도 유효 자산이므로
 *  활성 자산 판정엔 이 전량 집합을 쓴다. (사업현황 유효자산 = 채권시트 전체 plate = 현보유 118) */
function collectLedgerPlates(wb: XLSX.WorkBook, sheetName: string, hasMonthRow: boolean): string[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  const hRow = hasMonthRow ? 1 : 0;
  const H = (G[hRow] as unknown[] | undefined)?.map(cellStr) ?? [];
  const ci = H.findIndex((x) => x === '차량번호');
  if (ci < 0) return [];
  const seen = new Set<string>();
  for (let r = hRow + 1; r < G.length; r++) {
    const plate = cellStr((G[r] as unknown[])[ci]).trim();
    if (plate) seen.add(plate);
  }
  return [...seen];
}

/* ─────────────── 미수 3정의 계산 ─────────────── */

type UnpaidContract = RawContract & {
  carryUnpaid: number;
  grossUnpaid: number;
  pastDueUnpaid: number;
  futureBilled: number;
  hasPenaltyMonth: boolean;
  hasOverpay: boolean;
  ledgerMonths: number;
  customerIdentNo?: string;
  customerPhone1?: string;
  customerKind?: string;
  vehicleModel?: string;
};

function computeUnpaid(c: RawContract, curMonth: string, todayDay: number): UnpaidContract {
  let sumCharged = 0;
  let sumPaid = 0;
  let pastDue = 0;
  let futureBilled = 0;
  let carrySeed = 0;
  let seedMonth = '';
  let hasPenaltyMonth = false;
  let hasOverpay = false;

  const isDue = (month: string): boolean => {
    if (!month) return true; // 월 미상 → 도래로 간주(보수적)
    if (month < curMonth) return true;
    if (month > curMonth) return false;
    return todayDay >= c.paymentDay;
  };

  for (const e of c.ledger) {
    const eff = e.charged > 0 ? e.charged : (e.paid > 0 ? e.paid : 0);
    sumCharged += eff;
    sumPaid += e.paid;
    if (c.monthlyRent > 0 && e.charged > 0 && Math.abs(e.charged - c.monthlyRent) > 1000) hasPenaltyMonth = true;
    if (e.paid > eff + 1000) hasOverpay = true;
    // 미수(carrySeed) = '결제일이 도래(경과)한 최신월'의 미납(누적잔액). ★ 청구했어도 결제일 도래 전(결제 예정)은
    //   미수 아님(사용자 정책). 기준일 = 계좌 입금 데이터 컷오프. 그래서 isDue 블록 안에서만 갱신 →
    //   당월 결제일 미도래 계약은 직전 도래월 잔액이 현재 미수(도래 전 청구분은 futureBilled로 분리, 미수 제외).
    if (isDue(e.month)) {
      pastDue += Math.max(0, eff - e.paid);
      if (e.month && (seedMonth === '' || e.month > seedMonth)) {
        seedMonth = e.month;
        carrySeed = e.carry;
      }
    } else {
      futureBilled += Math.max(0, eff - e.paid);
    }
  }

  return {
    ...c,
    carryUnpaid: Math.max(0, carrySeed),
    grossUnpaid: Math.max(0, sumCharged - sumPaid),
    pastDueUnpaid: pastDue,
    futureBilled,
    hasPenaltyMonth,
    hasOverpay,
    ledgerMonths: c.ledger.length,
  };
}

/* ─────────────── 계약(운행중/반납) → v6 계약 raw EntityRecord ─────────────── */

/** 운행중(채권) 계약 → 계약 raw(_carry/_kind). v5 toSnapshotRows 규칙. */
function currentToRaw(c: UnpaidContract): EntityRecord {
  // 시작일: 시작 컬럼이 정상(YYYY-MM-DD)이면 사용, 손상('26-' 등)이면 원장 최초월로 앵커(스케줄·미수 유실 방지).
  const months = c.ledger.map((e) => e.month).filter(Boolean).sort();
  const start = normDateStr(c.contractStart) || (months[0] ? `${months[0]}-01` : '');
  const end = normDateStr(c.contractEnd) || '';
  return pruneUndefined({
    contractorName: c.customerName,
    contractorPhone: clean(c.customerPhone1),
    plate: c.vehiclePlate,
    carName: c.vehicleModel || '미정',
    startDate: start,
    endDate: clean(end),
    contractDate: start,
    monthlyRent: c.monthlyRent,
    deposit: c.deposit,
    paymentDay: c.paymentDay,
    status: '운행',
    deliveredDate: start,
    returnScheduledDate: clean(end),
    _carry: c.carryUnpaid,
    _carryUnpaid: c.carryUnpaid,   // 실미수(직원 running balance) = net 앵커
    _kind: 'current',
    _branch: clean(c.branch),
  });
}

/** 반납(종료) 계약 → 계약 raw(_carry/_kind). v5 toReturnedContracts 규칙. */
function returnedToRaw(c: UnpaidContract): EntityRecord | null {
  const months = c.ledger.map((e) => e.month).filter(Boolean).sort();
  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];
  const contractDate = normDateStr(c.contractStart) || (firstMonth ? `${firstMonth}-01` : '');
  if (!contractDate) return null; // 시작·원장월 모두 없으면 skip (v5)
  const returnScheduledDate = normDateStr(c.contractEnd)
    || (lastMonth ? addMonthsStr(`${lastMonth}-01`, 1) : addMonthsStr(contractDate, 12));
  const lastPaid = c.ledger.map((e) => e.paidDate).filter(Boolean).sort().pop() || '';
  const returnedDate = lastPaid || returnScheduledDate || contractDate;
  return pruneUndefined({
    contractorName: c.customerName,
    contractorPhone: clean(c.customerPhone1),
    plate: c.vehiclePlate,
    carName: c.vehicleModel || '미정',
    startDate: contractDate,
    endDate: clean(returnScheduledDate),
    contractDate,
    monthlyRent: c.monthlyRent,
    deposit: c.deposit,
    paymentDay: Math.min(31, Math.max(1, c.paymentDay || 1)),
    status: '반납',
    deliveredDate: contractDate,
    returnScheduledDate: clean(returnScheduledDate),
    returnedDate,
    endReason: c.carryUnpaid > 0 ? '채권보전' : '정상종료',
    _carry: c.carryUnpaid,
    _carryUnpaid: c.carryUnpaid,   // 추심잔여(반납 후 회수 대상) = net 앵커
    _kind: 'returned',
    _branch: clean(c.branch),
  });
}

/* ─────────────── 메인 파서 ─────────────── */

export type SwitchplanTotals = {
  countCurrent: number;
  countReturned: number;
  carryCurrent: number;
  carryReturned: number;
  grossCurrent: number;
  grossReturned: number;
  pastDueCurrent: number;
  pastDueReturned: number;
  futureBilled: number;
  penaltyCount: number;
  overpayCount: number;
  vehicleCount: number;
  activeCount: number;
  loanCount: number;
};

export type SwitchplanParse = {
  vehicles: EntityRecord[];   // 자산 (163)
  contracts: EntityRecord[];  // 채권(운행중) + 반납(종료), _carry/_kind 포함
  loans: EntityRecord[];      // 상환합계 (할부, plate + 할부필드)
  activePlates: string[];     // 채권 시트 전체 plate (미수 원장 대상)
  disposedPlates: string[];   // 자산 "매각" 섹션 차 — 채권에 남아도 처분(매각)이라 현보유 제외
  totals: SwitchplanTotals;
  asOf: string;               // 미수 기준일 (YYYY-MM-DD)
  warnings: string[];
};

/** 사업현황.xlsx 버퍼 → 라이브 파싱 결과(전부 v6 EntityRecord). */
export function parseSwitchplanWorkbook(buf: ArrayBuffer, asOf?: string): SwitchplanParse {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const warnings: string[] = [];

  const now = asOf ? new Date(asOf) : new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayDay = now.getDate();
  const asOfStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const custIdx = buildCustomerIndex(wb);
  const vehicleList = buildVehicles(wb);
  const loanList = buildLoans(wb);

  const modelIdx = new Map<string, string>();
  for (const v of vehicleList) {
    const key = normPlate(v.vehiclePlate);
    if (v.fullModel && !modelIdx.has(key)) modelIdx.set(key, v.fullModel);
  }

  const enrich = (c: UnpaidContract): UnpaidContract => {
    const key = normPlate(c.vehiclePlate);
    const info = custIdx.byPlate.get(key);
    const identByName = custIdx.byPlateName.get(`${key}|${c.customerName}`);
    return {
      ...c,
      customerIdentNo: identByName || (info?.name === c.customerName ? info?.ident : undefined) || undefined,
      customerPhone1: info?.name === c.customerName ? info?.phone : undefined,
      customerKind: info?.name === c.customerName ? info?.kind : undefined,
      vehicleModel: modelIdx.get(key),
    };
  };

  const currentRaw = parseLedgerSheet(wb, '채권', '운행중', true, warnings).map((c) => enrich(computeUnpaid(c, curMonth, todayDay)));
  const returnedRaw = parseLedgerSheet(wb, '반납', '종료', false, warnings).map((c) => enrich(computeUnpaid(c, curMonth, todayDay)));

  const activePlates = collectLedgerPlates(wb, '채권', true);

  // 계약 raw EntityRecord (운행중 먼저, 반납 뒤) + 순번 contractNo(SP-YYMM-NNNN) 부여
  const currentRecs = currentRaw.map(currentToRaw);
  const returnedRecs = returnedRaw.map(returnedToRaw).filter((r): r is EntityRecord => r !== null);
  const contracts = [...currentRecs, ...returnedRecs];
  let seq = 0;
  for (const rec of contracts) {
    seq += 1;
    const cd = String(rec.contractDate || rec.startDate || '');
    const ym = /^(\d{4})-(\d{2})/.exec(cd);
    const prefix = ym ? `${ym[1].slice(2)}${ym[2]}` : '0000';
    rec.contractNo = `SP-${prefix}-${String(seq).padStart(4, '0')}`;
  }

  const sum = (arr: UnpaidContract[], f: (c: UnpaidContract) => number) => arr.reduce((s, c) => s + f(c), 0);

  return {
    asOf: asOfStr,
    vehicles: vehicleList.map(vehicleRecord),
    contracts,
    loans: loanList.map(loanRecord),
    activePlates,
    disposedPlates: vehicleList.filter((v) => v.disposed).map((v) => v.vehiclePlate),
    totals: {
      countCurrent: currentRaw.length,
      countReturned: returnedRaw.length,
      carryCurrent: sum(currentRaw, (c) => c.carryUnpaid),
      carryReturned: sum(returnedRaw, (c) => c.carryUnpaid),
      grossCurrent: sum(currentRaw, (c) => c.grossUnpaid),
      grossReturned: sum(returnedRaw, (c) => c.grossUnpaid),
      pastDueCurrent: sum(currentRaw, (c) => c.pastDueUnpaid),
      pastDueReturned: sum(returnedRaw, (c) => c.pastDueUnpaid),
      futureBilled: sum(currentRaw, (c) => c.futureBilled) + sum(returnedRaw, (c) => c.futureBilled),
      penaltyCount: [...currentRaw, ...returnedRaw].filter((c) => c.hasPenaltyMonth).length,
      overpayCount: [...currentRaw, ...returnedRaw].filter((c) => c.hasOverpay).length,
      vehicleCount: vehicleList.length,
      activeCount: activePlates.length,
      loanCount: loanList.length,
    },
    warnings,
  };
}

/* ─────────────── 팩 빌더 (net미수=carry 역산 · 차량 status · 할부 병합) ─────────────── */

const PAYMENT_DAY = 25; // v6 buildContract 고정값과 정합

function ymd(s: unknown): string {
  const t = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return '';
  const md = t.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!md) return '';
  let y = Number(md[1]);
  if (y >= 1930 && y <= 1939) y += 100; // 1930 → 2030
  if (y < DATE_YEAR_MIN || y > DATE_YEAR_MAX) return '';
  return `${String(y).padStart(4, '0')}-${md[2]}-${md[3]}`;
}

function monthDiffIso(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/** YYYY-MM-DD 의 일(day-of-month). 씨앗 계약 결제일=시작일 → 1회차 dueDate=시작일(선불)로 미수 배치 보장. */
function dayOfMonth(iso: string): number {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(iso);
  return m ? Math.min(31, Math.max(1, Number(m[1]))) : 1;
}
/** YYYY-MM-DD 에 개월 가감 → 같은 day 유지(월말 보정). start 결손 폴백 앵커용. */
function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * 계약 raw(_carry/_kind) → v6 계약 EntityRecord.
 * 순미수(net) = 원본 carry. 방식(v5 검증본과 동일):
 *   ① 결제일 = 시작일의 일자(선불) → 1회차 dueDate=시작일 → 반납일 이전 회차가 반드시 존재(미수 배치처 확보).
 *   ② _carryUnpaid = carry 를 그대로 넘겨 buildContract 가 반납일 cutoff로 분배(도래분 부족분은 期초이월 흡수).
 *   ③ _paidTotal(=도래분−carry)은 '납부 표시'용으로 유지(net 계산은 _carryUnpaid 우선).
 * v6 switchplan.ts buildContractRecord 와 동일 규칙(라이브 경로용 자립 이식).
 */
function buildContractRecord(c: EntityRecord, today: string): EntityRecord {
  let start = ymd(c.startDate);
  const returned = c._kind === 'returned';
  const cutoff = returned ? (ymd(c.returnedDate) || today) : today;
  const carry = Math.max(0, Number(c._carry) || 0);
  const rent = Number(c.monthlyRent) || 0;
  // start 결손인데 미수가 있으면 회수 대상이므로 앵커 생성(carry/rent 개월 전으로) — 미수 유실 방지.
  if (!start && carry > 0 && rent > 0) start = addMonthsIso(today, -(Math.ceil(carry / rent) + 1));

  // 소스 손상 방어: startDate 이전의 만기/반납예정일은 무효로 취급.
  const rawEnd = ymd(c.endDate);
  const validEnd = rawEnd && start && rawEnd >= start ? rawEnd : '';
  const rawRetSched = ymd(c.returnScheduledDate);
  const validRetSched = rawRetSched && start && rawRetSched >= start ? rawRetSched : '';

  let realTerm = validEnd ? monthDiffIso(start, validEnd) : (returned ? monthDiffIso(start, cutoff) : 12);
  if (realTerm < 1) realTerm = returned ? Math.max(1, monthDiffIso(start, cutoff) + 1) : 12;
  const elapsed = start ? monthDiffIso(start, cutoff) + 1 : 0;
  const rentalMonths = Math.max(realTerm, elapsed, 1);
  const sheetPayDay = Number(c.paymentDay);
  const payDay = (sheetPayDay >= 1 && sheetPayDay <= 31) ? sheetPayDay : (start ? dayOfMonth(start) : PAYMENT_DAY);

  let paidTotal = 0;
  // 개시 납부 표시값 = 도래분 − 실미수(carry). 헤드라인 net은 _carryUnpaid 앵커.
  // ★ B-1: 과거 원장 납부·할인을 _payments/_discounts로 재이관하지 않는다 — carry는 이미 그것이 반영된 실미수라,
  //   렌더 buildContract의 distributeUnpaid(carry) 위에 또 FIFO 차감하면 carry 이중차감(미수 유실). 회차표는 distributeUnpaid(carry)
  //   재구성으로 표시하고, 실 납부는 오픈 후 앱수납(_payments append)만 net에서 차감한다.
  if (start && rent > 0) {
    const schedules = generateSchedules({ contractDate: start, termMonths: rentalMonths, monthlyRent: rent, paymentDay: payDay, paymentTiming: '선불' });
    const pastDue = schedules.filter((s) => s.dueDate && s.dueDate <= cutoff).reduce((sum, s) => sum + s.amount, 0);
    paidTotal = Math.max(0, pastDue - carry);
  }

  const rec: EntityRecord = {
    contractNo: c.contractNo,
    contractorName: c.contractorName,
    plate: c.plate,
    carName: c.carName,
    rentalMonths,
    startDate: start,
    endDate: validEnd || undefined,
    contractDate: ymd(c.contractDate) || start,
    monthlyRent: rent,
    deposit: Number(c.deposit) || 0,
    paymentDay: payDay,
    paymentTiming: '선불',   // 소스에 선/후불 없음 — 기본 선불(계약 편집에서 후불로 변경)
    paymentMethod: '이체',
    status: c.status,
    deliveredDate: ymd(c.deliveredDate) || start,
    _paidTotal: paidTotal,
    _carryUnpaid: carry,   // net 앵커 — 반납/도래분 무관하게 실미수=carry 보장
  };
  if (c.contractorPhone) rec.contractorPhone = c.contractorPhone;
  if (returned) {
    rec.returnedDate = ymd(c.returnedDate);
    rec.endReason = c.endReason;
  } else if (validRetSched) {
    rec.returnScheduledDate = validRetSched;
  }
  return pruneUndefined(rec);
}

export type SwitchplanPackLive = {
  vehicle: EntityRecord[];
  contract: EntityRecord[];
  bank_tx: EntityRecord[];
};

/**
 * 사업현황.xlsx 버퍼 → 라이브 팩(vehicle/contract/bank_tx).
 *  - vehicle(163): 할부 병합 + status(현보유 118='운행', 그 외='매각').
 *  - contract: 채권+반납, net미수=carry 역산.
 *  - bank_tx: [] (자금일보는 switchplan-jbo-parse 로 별도 파싱).
 */
export function buildSwitchplanPackFromBuffer(buf: ArrayBuffer, today: string = todayKST()): SwitchplanPackLive {
  const parsed = parseSwitchplanWorkbook(buf, today);

  // 할부 인덱스 (plate → 할부필드)
  const loanByPlate = new Map<string, EntityRecord>();
  for (const l of parsed.loans) {
    const key = normPlate(String(l.plate || ''));
    if (key && !loanByPlate.has(key)) {
      const fields: EntityRecord = { ...l };
      delete fields.plate;
      loanByPlate.set(key, fields);
    }
  }
  const activeSet = new Set(parsed.activePlates.map((p) => normPlate(p)));
  const disposedSet = new Set(parsed.disposedPlates.map((p) => normPlate(p)));

  const vehicle = parsed.vehicles.map((v) => {
    const key = normPlate(String(v.plate || ''));
    // 자산 "매각" 섹션 차는 미수 잔존으로 채권시트에 남아도 처분(매각) — 현보유 제외.
    const status = disposedSet.has(key) ? '매각' : (activeSet.has(key) ? '운행' : '매각');
    const loan = loanByPlate.get(key) ?? {};
    return { ...v, ...loan, status };
  });

  const contract = parsed.contracts.map((c) => buildContractRecord(c, today));

  return { vehicle, contract, bank_tx: [] };
}
