/**
 * 자산 손익 엔진 — 렌터카 ERP의 궁극 지표. 차 한 대가 이익의 단위.
 *   수입 = 그 차의 계약 수금(_paidTotal 합)
 *   지출 = 취득 감가(누적) + 보험료 + 정비/수리비 + 할부이자(기간 귀속)
 *   손익 = 수입 − 지출 · 회수율 = 수입 ÷ 취득가
 * 별도 재무화면으로 부풀리지 않고 자산(차량)에 얹힌 렌즈로 쓴다. (feedback_no_finance_fixation)
 *
 * 할부이자 = lib/finance/loan-schedule `loanTotalsInRange` SSOT (app/pnl과 동일 정의).
 * TODO: 과태료(penalty.amount · plate join)를 차량 비용에 포함할지는 별도 판단 — 지금은 이자만.
 */
import type { EntityRecord } from './intake/entities';
import { computeAssetLedgerEntry } from './payments/asset-ledger';
import type { Vehicle } from './payments/types';
import { loanTotalsInRange } from './finance/loan-schedule';

export type AssetPnL = {
  revenue: number;        // 수입(수금)
  cost: number;           // 지출 합
  depreciation: number;   // 감가(누적)
  insuranceCost: number;  // 보험료
  maintCost: number;      // 정비/수리
  /** 할부이자(금융비용) — loanTotalsInRange 기간 귀속. pnl과 동일 SSOT. */
  loanInterest: number;
  profit: number;         // 손익
  bookValue: number | null;
  acquisition: number;    // 취득가
  recoveryRate: number;   // 회수율 = 수입/취득가 (0~)
  loanRemaining: number;  // 할부 잔여원금(부채 참고)
};

function sameplate(rec: EntityRecord, plate: string) { return String(rec.plate || '') === plate; }

/** 차량 1대의 손익 산출 — 그 차에 귀속된 계약·보험·이력·할부이자에서 파생.
 *  @param range 이자 기간(from~to, YYYY-MM-DD). 기본=개시~today(누적). app/pnl PeriodBar와 동일 규약. */
export function assetEconomics(
  vehicle: EntityRecord,
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  history: EntityRecord[],
  today: string,
  range?: { from?: string; to?: string },
): AssetPnL {
  const plate = String(vehicle.plate || '');
  const acquisition = Number(vehicle.acquisitionPrice) || 0;

  const revenue = contracts.filter((c) => sameplate(c, plate)).reduce((s, c) => s + (Number(c._paidTotal) || 0), 0);

  const led = acquisition
    ? computeAssetLedgerEntry({
        id: plate, plate, model: String(vehicle.carName || ''), status: '운행',
        purchasePrice: acquisition, firstRegisteredDate: String(vehicle.firstReg || vehicle.acquisitionDate || ''),
      } as unknown as Vehicle, today)
    : null;
  const depreciation = led ? led.accumulatedDepreciation : 0;
  const insuranceCost = insurances.filter((i) => sameplate(i, plate)).reduce((s, i) => s + (Number(i.totalPremium) || 0), 0);
  const maintCost = maintCostOf(plate, history);

  // 할부이자 — pnl `loanTotalsInRange`와 동일. 기본 구간=전체~today.
  const from = range?.from ?? '';
  const to = range?.to ?? today;
  const loanInterest = loanTotalsInRange([vehicle], from, to).interest;
  // TODO: 과태료(penalty.amount, plate join) — 차량 비용 포함 여부는 별도 판단. 지금은 이자만.

  const cost = depreciation + insuranceCost + maintCost + loanInterest;
  const profit = revenue - cost;
  return {
    revenue, cost, depreciation, insuranceCost, maintCost, loanInterest, profit,
    bookValue: led ? led.bookValue : null,
    acquisition,
    recoveryRate: acquisition ? revenue / acquisition : 0,
    loanRemaining: Number(vehicle.loanRemainingPrincipal) || 0,
  };
}

/** 정비/수리 누계 — assetEconomics와 동일 필터(plate + cost). */
export function maintCostOf(plate: string, history: EntityRecord[]): number {
  if (!plate) return 0;
  return history.filter((h) => sameplate(h, plate)).reduce((s, h) => s + (Number(h.cost) || 0), 0);
}

export type MaintFleetStat = {
  plate: string;
  maintCost: number;
  maintCount: number;
  maintLastDate: string;
  /** 함대 대당 평균 대비 배수(평균 0이면 0). */
  vsAvg: number;
};

/** 함대 정비비 랭킹 — 기존 maintCostOf 재사용. 평균 대비 배수·건수·최근일. */
export function fleetMaintRanking(vehicles: EntityRecord[], history: EntityRecord[]): MaintFleetStat[] {
  const rows: Omit<MaintFleetStat, 'vsAvg'>[] = [];
  for (const v of vehicles) {
    const plate = String(v.plate || '');
    if (!plate) continue;
    const items = history.filter((h) => sameplate(h, plate) && (Number(h.cost) || 0) > 0);
    let maintLastDate = '';
    for (const h of items) {
      const d = String(h.date || h.workDate || '').slice(0, 10);
      if (d > maintLastDate) maintLastDate = d;
    }
    rows.push({
      plate,
      maintCost: items.reduce((s, h) => s + (Number(h.cost) || 0), 0),
      maintCount: items.length,
      maintLastDate,
    });
  }
  const withCost = rows.filter((r) => r.maintCost > 0);
  const avg = withCost.length
    ? withCost.reduce((s, r) => s + r.maintCost, 0) / withCost.length
    : 0;
  return rows
    .map((r) => ({ ...r, vsAvg: avg > 0 ? r.maintCost / avg : 0 }))
    .sort((a, b) => b.maintCost - a.maintCost || b.maintCount - a.maintCount || a.plate.localeCompare(b.plate, 'ko'));
}
