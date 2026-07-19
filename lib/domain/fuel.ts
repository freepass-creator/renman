// 연료 잔량 레벨 — 인도(출고)·반납 정산 비교 기준. Vehicle360·현장폼(DeliveryWizard) 공용 SSOT.
//   기존 Vehicle360.tsx 인라인 중복 2곳을 여기로 통일.
export const FUEL_LEVELS = ['만(가득)', '3/4', '반', '1/4', '거의없음'] as const;
export type FuelLevel = (typeof FUEL_LEVELS)[number];
