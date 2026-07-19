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

const DISPOSED_STATUSES = new Set(['매각', '폐차']);

export function computeAssetLedgerEntry(
  v: Vehicle,
  asOfDate: string,
  policy: DepreciationPolicy = DEFAULT_POLICY,
): AssetLedgerEntry {
  const acquisitionCost = v.purchasePrice ?? v.contractDocPrice ?? 0;
  // 취득일 우선순위: 매입완료일(purchasedDate) > 명시 취득일(acquisitionDate) > 최초등록일
  const acquisitionDate = v.purchasedDate ?? v.acquisitionDate ?? v.firstRegisteredDate;
  const disposed = !!v.saleDate || DISPOSED_STATUSES.has(v.status ?? '');
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
  const disposalGainLoss = disposed && v.salePrice !== undefined
    ? v.salePrice - bookValue
    : undefined;

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
  for (const e of entries) {
    if (e.incomplete) { incompleteCount += 1; continue; }
    if (e.disposed) {
      disposedCount += 1;
      totalSalePrice += e.salePrice ?? 0;
      totalDisposalGainLoss += e.disposalGainLoss ?? 0;
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
  };
}
