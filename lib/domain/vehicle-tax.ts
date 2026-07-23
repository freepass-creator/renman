/**
 * 차량 취득 개별소비세(개소세) 체인 — welrixtable src/lib/calc.js 이식.
 * 전부 원(KRW) 단위. round = Math.round (원 미만 반올림).
 *
 * renman 규격: 순수함수, 부수효과 없음. Vehicle360 등에서 vehicle EntityRecord의
 * consumerPrice/optionPrice/optionDiscount/taxExempt 필드를 읽어 입력으로 넘긴다.
 *
 * ⚠ M8 총액계수 caveat: TOTAL_COEFF = 1.141041 은 개소세 3.5% 시대의 총액계수다.
 *   welrix 엑셀은 개소세율을 5%로 올린 뒤에도 이 계수를 그대로 두었으므로(엑셀 충실),
 *   여기서도 원문 그대로 사용한다. 세율 현행화가 필요하면 이 상수를 반드시 재검토할 것.
 * ⚠ 반올림 순서 caveat: welrix는 C9(개소세+교육세)를 합산 후 1회 반올림하지만,
 *   여기서는 UI에 개소세·교육세를 분리 노출하려고 각각 반올림한다
 *   (개소세=round(F8*5%), 교육세=round(개소세*30%)). 두 값 합이 welrix C9와
 *   최대 1원 어긋날 수 있다. 또 welrix 비면세 부가세는 미반올림 float이나
 *   여기서는 원 단위로 반올림한다. => 세무신고용 정밀값 아님, 표시·견적용.
 */

export interface VehicleTaxInput {
  /** C5 차량가 = 제조사 소비자가격 (원) */
  consumerPrice: number;
  /** C6 선택품목 합계 (원). 기본 0 */
  optionPrice?: number;
  /** C6 옵션 할인 (원). C6 = optionPrice - optionDiscount. 기본 0 */
  optionDiscount?: number;
  /** 면세 여부 (vehicle.taxExempt === '면세'). 기본 false=과세 */
  exempt?: boolean;
  /** 취득세율. 기본 4%(일반), 포터 등 화물은 5%(0.05)로 오버라이드 */
  acqRate?: number;
  /** 등록비 (원). 기본 20만원 */
  registrationFee?: number;
  /** C14 용품비(부가세 제외분, welrix에서 용품/1.1). 기본 0 */
  accessoryCost?: number;
}

export interface VehicleTaxResult {
  consumerTotal: number;        // C7 소비자가(차량가+옵션순액)
  supplyPrice: number;          // C8 공급가액
  taxBase: number;              // F8 과세표준(공급가액×82%, 기준판매비율 18% 차감)
  exciseTax: number;            // 개소세 5%
  eduTax: number;               // 교육세(개소세×30%)
  vat: number;                  // C10 부가세 10%
  acquisitionBase: number;      // C11 취득가액(공급가액+개소세+교육세)
  acquisitionTax: number;       // C12 취득세
  registrationFee: number;      // C13 등록비
  totalAcquisitionCost: number; // C15 취득원가(취득가액+취득세+등록비+용품)
  netPrice: number;             // C7-(개소세+교육세): 개소세 제외 차량가격
}

// ── 상수 (renman 전용 세율 상수 없음 확인 → 합리적 기본값) ──
const TOTAL_COEFF = 1.141041;   // M8 총액계수 (welrix 원문, 위 caveat 참조)
const SALE_RATIO = 0.82;        // 과세표준 = 공급가액 × 82% (기준판매비율 18% 차감)
const EXCISE_RATE = 0.05;       // 개소세 5%
const EDU_RATE = 0.30;          // 교육세 = 개소세 × 30%
const VAT_RATE = 0.10;          // 부가세 10%
const DEFAULT_ACQ_RATE = 0.04;  // 취득세 4% (포터 등 5%는 acqRate 인자로)
const DEFAULT_REG_FEE = 200_000; // 등록비 기본 20만원

const round = Math.round;

export function computeVehicleTax(input: VehicleTaxInput): VehicleTaxResult {
  const {
    consumerPrice,
    optionPrice = 0,
    optionDiscount = 0,
    exempt = false,
    acqRate = DEFAULT_ACQ_RATE,
    registrationFee = DEFAULT_REG_FEE,
    accessoryCost = 0,
  } = input;

  const c6 = (optionPrice || 0) - (optionDiscount || 0);
  const consumerTotal = (consumerPrice || 0) + c6;               // C7

  const supplyPrice = exempt                                     // C8
    ? round(consumerTotal / 1.1)
    : round(consumerTotal / TOTAL_COEFF);

  const taxBase = round(supplyPrice * SALE_RATIO);               // F8

  const exciseTax = exempt ? 0 : round(taxBase * EXCISE_RATE);   // 개소세
  const eduTax = exempt ? 0 : round(exciseTax * EDU_RATE);       // 교육세
  const dutyTotal = exciseTax + eduTax;                          // ≈ C9

  const vat = exempt                                             // C10
    ? round(supplyPrice * VAT_RATE)
    : round((supplyPrice + dutyTotal) * VAT_RATE);

  const acquisitionBase = supplyPrice + dutyTotal;               // C11
  const acquisitionTax = round(acquisitionBase * acqRate);       // C12
  const totalAcquisitionCost =                                   // C15
    acquisitionBase + acquisitionTax + registrationFee + (accessoryCost || 0);

  const netPrice = consumerTotal - dutyTotal;                    // C7 - 개소세·교육세

  return {
    consumerTotal,
    supplyPrice,
    taxBase,
    exciseTax,
    eduTax,
    vat,
    acquisitionBase,
    acquisitionTax,
    registrationFee,
    totalAcquisitionCost,
    netPrice,
  };
}
