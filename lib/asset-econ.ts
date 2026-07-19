/**
 * 자산 손익 엔진 — 렌터카 ERP의 궁극 지표. 차 한 대가 이익의 단위.
 *   수입 = 그 차의 계약 수금(_paidTotal 합)
 *   지출 = 취득 감가(누적) + 보험료 + 정비/수리비 + (할부이자 — 데이터 있으면)
 *   손익 = 수입 − 지출 · 회수율 = 수입 ÷ 취득가
 * 별도 재무화면으로 부풀리지 않고 자산(차량)에 얹힌 렌즈로 쓴다. (feedback_no_finance_fixation)
 */
import type { EntityRecord } from './intake/entities';
import { computeAssetLedgerEntry } from './payments/asset-ledger';
import type { Vehicle } from './payments/types';

export type AssetPnL = {
  revenue: number;        // 수입(수금)
  cost: number;           // 지출 합
  depreciation: number;   // 감가(누적)
  insuranceCost: number;  // 보험료
  maintCost: number;      // 정비/수리
  profit: number;         // 손익
  bookValue: number | null;
  acquisition: number;    // 취득가
  recoveryRate: number;   // 회수율 = 수입/취득가 (0~)
  loanRemaining: number;  // 할부 잔여원금(부채 참고)
};

function sameplate(rec: EntityRecord, plate: string) { return String(rec.plate || '') === plate; }

/** 차량 1대의 손익 산출 — 그 차에 귀속된 계약·보험·이력에서 파생. */
export function assetEconomics(
  vehicle: EntityRecord,
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  history: EntityRecord[],
  today: string,
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
  const maintCost = history.filter((h) => sameplate(h, plate)).reduce((s, h) => s + (Number(h.cost) || 0), 0);

  const cost = depreciation + insuranceCost + maintCost;
  const profit = revenue - cost;
  return {
    revenue, cost, depreciation, insuranceCost, maintCost, profit,
    bookValue: led ? led.bookValue : null,
    acquisition,
    recoveryRate: acquisition ? revenue / acquisition : 0,
    loanRemaining: Number(vehicle.loanRemainingPrincipal) || 0,
  };
}
