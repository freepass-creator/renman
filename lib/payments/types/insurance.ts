// jpkerp5 — 자동차보험증권 / 렌터카공제 마스터 타입

/** 보험증권 분납 회차 — 1회차는 가입시 paid:true 자동 */
export type InsuranceInstallment = {
  cycle: number;
  dueDate: string;       // YYYY-MM-DD
  amount: number;        // 원
  paid?: boolean;
  paidDate?: string;
};

/**
 * 자동차보험증권 / 렌터카공제 마스터.
 * OCR 결과를 그대로 담을 수 있게 모든 필드 optional.
 * 갱신 시 새 증권 추가 — 이전 증권은 deletedAt 처리하지 말고 endDate로 자연 종료.
 */
export type InsurancePolicy = {
  id: string;
  companyCode?: string;
  vehicleId?: string;          // 매칭된 차량 (carNumber → Vehicle.plate 매칭)
  fileUrl?: string;
  fileName?: string;
  uploadedAt?: string;

  // 보험사·증권 정보
  insurer?: string;
  productName?: string;
  policyNo?: string;
  contractor?: string;
  insured?: string;
  bizNo?: string;

  // 기간
  startDate?: string;
  endDate?: string;

  // 차량
  carNumber?: string;
  carName?: string;
  carYear?: number;
  carClass?: string;
  displacement?: number;
  seats?: number;
  vehicleValueMan?: number;
  accessoryValueMan?: number;
  accessories?: string;

  // 운전 조건
  driverScope?: string;
  driverAge?: string;
  deductibleMan?: number;

  // 가입담보
  covPersonal1?: string;
  covPersonal2?: string;
  covProperty?: string;
  covSelfAccident?: string;
  covUninsured?: string;
  covSelfVehicle?: string;
  covEmergency?: string;

  // 보험료
  paidPremium?: number;
  totalPremium?: number;

  // 자동이체 + 분납
  autoDebitBank?: string;
  autoDebitAccount?: string;
  autoDebitHolder?: string;
  installments?: InsuranceInstallment[];

  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
};
