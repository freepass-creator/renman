/**
 * 고정자산대장 — 차량 1대 = 1대장 (ERP 표준).
 *
 *  · 취득가 (acquisition cost) = purchasePrice (없으면 contractDocPrice)
 *  · 취득일 (acquisition date) = acquisitionDate ?? firstRegisteredDate
 *  · 내용연수 = 60개월 (5년 정액법) — 렌터카 일반
 *  · 잔존가치 = 취득가의 10%
 *  · 월 감가 = (취득가 - 잔존가치) / 60
 *  · 감가누계 = 월 감가 × 경과개월 (최대 = 취득가 - 잔존가치)
 *  · 장부가 = 취득가 - 감가누계 (최소 = 잔존가치)
 *  · 처분손익 = salePrice - 장부가 (매각 시점 기준)
 *
 *  회사·차종별 다른 정책이 필요해지면 옵션 매개변수로 확장.
 */

import type { Vehicle } from './types';
import type { EntityRecord } from '@/lib/intake/entities';
import { VEHICLE_OUT } from '@/lib/domain/status';

/** 매각대금 없이 처분되는 상태 — 장부가 전액이 손실이 된다. */
const WRITE_OFF_STATUSES = new Set(['말소', '폐차']);

export type DepreciationPolicy = {
  /** 내용연수 (개월). 기본 60 (5년). */
  usefulLifeMonths: number;
  /** 잔존가치율 — 취득가 대비. 기본 0.10 (10%). */
  salvageRate: number;
};

export const DEFAULT_POLICY: DepreciationPolicy = {
  usefulLifeMonths: 60,
  salvageRate: 0.10,
};

/** EntityRecord(vehicle) → 감가엔진 Vehicle. status·saleDate·salePrice 실값 전달. */
export function vehicleRecordToAsset(rec: EntityRecord): Vehicle {
  const saleRaw = rec.salePrice;
  let salePrice: number | undefined;
  if (saleRaw !== undefined && saleRaw !== null && saleRaw !== '') {
    const n = Number(saleRaw);
    if (Number.isFinite(n)) salePrice = n;
  }
  return {
    id: String(rec._key || rec.plate || ''),
    plate: String(rec.plate || ''),
    model: String(rec.carName || ''),
    company: String(rec.companyId || '') as Vehicle['company'],
    status: (String(rec.status || '') || '구매대기') as Vehicle['status'],
    createdAt: String(rec.createdAt || ''),
    purchasePrice: Number(rec.acquisitionPrice) || undefined,
    firstRegisteredDate: String(rec.firstReg || '') || undefined,
    purchasedDate: String(rec.purchasedDate || '') || undefined,
    acquisitionDate: String(rec.acquisitionDate || '') || undefined,
    saleDate: String(rec.saleDate || '') || undefined,
    salePrice,
  };
}

export type AssetLedgerEntry = {
  vehicleId: string;
  plate: string;
  model: string;
  status: string;
  company?: string;
  /** 취득가 (원). 0 이면 미입력. */
  acquisitionCost: number;
  /** 취득일 (YYYY-MM-DD). undefined 이면 미입력. */
  acquisitionDate?: string;
  /** 경과 개월 (취득일~asOf). 매각 시 saleDate 기준. */
  monthsHeld: number;
  /** 잔존가치 (취득가 × salvageRate). */
  salvageValue: number;
  /** 누적 감가비 (취득가 - 잔존가치 한도). */
  accumulatedDepreciation: number;
  /** 장부가 (= 취득가 - 누적감가). 잔존가치 이상. */
  bookValue: number;
  /** 매각가 (처분 시) */
  salePrice?: number;
  /** 매각일 */
  saleDate?: string;
  /** 처분손익 = 매각가 - 장부가. 매각된 경우만. 양수 = 이익. */
  disposalGainLoss?: number;
  /** 처분 여부 */
  disposed: boolean;
  /** 말소·폐차 — 매각대금 없이 장부가 전액이 손실이 되는 처분. */
  scrapped?: boolean;
  /** 매각인데 매각가가 비어 있다 — 처분손익을 계산할 수 없다(입력 필요). */
  salePriceMissing?: boolean;
  /** 정책 적용 안 됨 (취득가/취득일 미입력) */
  incomplete: boolean;
};

function monthsBetween(startISO: string, endISO: string): number {
  if (!startISO || !endISO) return 0;
  const a = new Date(startISO).getTime();
  const b = new Date(endISO).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  // 30.44일 평균 = 1개월
  return Math.floor((b - a) / (1000 * 60 * 60 * 24 * 30.4375));
}

export function computeAssetLedgerEntry(
  v: Vehicle,
  asOfDate: string,
  policy: DepreciationPolicy = DEFAULT_POLICY,
): AssetLedgerEntry {
  const acquisitionCost = v.purchasePrice ?? v.contractDocPrice ?? 0;
  // 취득일 우선순위: 매입완료일(purchasedDate) > 명시 취득일(acquisitionDate) > 최초등록일
  const acquisitionDate = v.purchasedDate ?? v.acquisitionDate ?? v.firstRegisteredDate;
  const disposed = !!v.saleDate || VEHICLE_OUT.has(v.status ?? '');
  const cutoffDate = disposed && v.saleDate ? v.saleDate : asOfDate;
  const incomplete = acquisitionCost <= 0 || !acquisitionDate;

  if (incomplete) {
    return {
      vehicleId: v.id,
      plate: v.plate,
      model: v.model ?? '',
      status: v.status ?? '',
      company: v.company,
      acquisitionCost,
      acquisitionDate,
      monthsHeld: 0,
      salvageValue: 0,
      accumulatedDepreciation: 0,
      bookValue: acquisitionCost,
      salePrice: v.salePrice,
      saleDate: v.saleDate,
      disposed,
      incomplete: true,
    };
  }

  const monthsHeld = monthsBetween(acquisitionDate!, cutoffDate);
  const salvageValue = Math.round(acquisitionCost * policy.salvageRate);
  const depreciableBase = Math.max(0, acquisitionCost - salvageValue);
  const monthlyDep = depreciableBase / policy.usefulLifeMonths;
  const accumulatedDepreciation = Math.min(
    Math.round(monthlyDep * monthsHeld),
    depreciableBase,
  );
  const bookValue = Math.max(salvageValue, acquisitionCost - accumulatedDepreciation);
  /* 처분손익 = 매각가 − 장부가.
     ★말소·폐차는 «매각대금이 없는 것이 정상»이다 → 남은 장부가를 전액 손실로 잡아야 한다.
       이전 구현은 salePrice 가 없으면 undefined 를 돌려주고 합계가 그것을 0 으로 더했다.
       그러면 처분 차량은 자산 총계에서 빠지는데 손실은 어디에도 안 나타나 «장부가가 조용히 사라진다»
       (자기자본만 줄고 손익에 흔적이 없다 — 회계적으로 유형자산처분손실로 잡아야 한다).
     ★단 «매각»인데 매각가가 비어 있으면 입력 누락이므로 손실로 단정하지 않고 salePriceMissing 으로
       표시한다. 0원 손실도 아니고 전액 손실도 아니다 — 사람이 채워야 한다. */
  const scrapped = disposed && WRITE_OFF_STATUSES.has(v.status ?? '');
  const salePriceMissing = disposed && !scrapped && v.salePrice === undefined;
  const disposalGainLoss = !disposed
    ? undefined
    : v.salePrice !== undefined
      ? v.salePrice - bookValue
      : scrapped
        ? -bookValue          // 말소·폐차 = 장부가 전액 손실
        : undefined;          // 매각가 미입력 = 판단 보류

  return {
    vehicleId: v.id,
    plate: v.plate,
    model: v.model ?? '',
    status: v.status ?? '',
    company: v.company,
    acquisitionCost,
    acquisitionDate,
    monthsHeld,
    salvageValue,
    accumulatedDepreciation,
    bookValue,
    salePrice: v.salePrice,
    saleDate: v.saleDate,
    disposalGainLoss,
    disposed,
    scrapped,
    salePriceMissing,
    incomplete: false,
  };
}

export type AssetLedgerSummary = {
  totalAcquisition: number;
  totalAccumulatedDep: number;
  totalBookValue: number;
  totalSalePrice: number;
  totalDisposalGainLoss: number;
  activeCount: number;
  disposedCount: number;
  incompleteCount: number;
  /** 매각인데 매각가가 없어 처분손익에 반영되지 못한 건수 — 합계가 불완전하다는 표시. */
  salePriceMissingCount: number;
};

export function summarizeLedger(entries: AssetLedgerEntry[]): AssetLedgerSummary {
  let totalAcquisition = 0;
  let totalAccumulatedDep = 0;
  let totalBookValue = 0;
  let totalSalePrice = 0;
  let totalDisposalGainLoss = 0;
  let activeCount = 0;
  let disposedCount = 0;
  let incompleteCount = 0;
  let salePriceMissingCount = 0;
  for (const e of entries) {
    if (e.incomplete) { incompleteCount += 1; continue; }
    if (e.disposed) {
      disposedCount += 1;
      totalSalePrice += e.salePrice ?? 0;
      // 말소·폐차는 −장부가가 들어온다. 매각가 미입력은 undefined 이므로 합계에 넣지 않고 따로 센다.
      if (e.disposalGainLoss !== undefined) totalDisposalGainLoss += e.disposalGainLoss;
      else if (e.salePriceMissing) salePriceMissingCount += 1;
    } else {
      activeCount += 1;
      totalAcquisition += e.acquisitionCost;
      totalAccumulatedDep += e.accumulatedDepreciation;
      totalBookValue += e.bookValue;
    }
  }
  return {
    totalAcquisition,
    totalAccumulatedDep,
    totalBookValue,
    totalSalePrice,
    totalDisposalGainLoss,
    activeCount,
    disposedCount,
    incompleteCount,
    salePriceMissingCount,
  };
}
