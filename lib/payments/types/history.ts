// jpkerp5 — 이력(차량/계약 귀속) 타입

/** 이력 — 두 가지 귀속 방식
 *  - scope='vehicle': 차량(plate)에 영구 귀속. 계약이 바뀌어도 그 차량에 계속 따라감. 정비/검사/사고/보험 등.
 *  - scope='contract': 그 계약에만 귀속. 계약 종료 시 그 계약 아카이브에 남음. 분쟁/클레임/메모 등.
 */
export type HistoryScope = 'vehicle' | 'contract';

export type HistoryCategory =
  // 차량 이력 (vehicle scope)
  | '정비' | '사고' | '검사' | '세차' | '위반' | '보험' | '부품교체'
  // 계약 이력 (contract scope)
  | '분쟁' | '클레임' | '수납이슈' | '메모' | '연락기록' | '법적조치'
  // 공통
  | '기타';

export type HistoryEntry = {
  id: string;
  scope: HistoryScope;
  contractId?: string;      // scope='contract'일 때 필수 / scope='vehicle'일 때 발생 시점 컨텍스트로 기록
  vehiclePlate?: string;    // scope='vehicle'일 때 필수
  date: string;             // YYYY-MM-DD
  category: HistoryCategory;
  title: string;
  description?: string;
  cost?: number;
  status: '완료' | '진행' | '예정';
  vendor?: string;
  /** 첨부 — OCR/파일 업로드 원본 (보험증권 패턴) */
  fileUrl?: string;
  fileName?: string;
  fileUploadedAt?: string;
  mileage?: number;
  /**
   * 카테고리별 상세 데이터 — 자유 형식 (스키마는 카테고리별 컨벤션):
   *  · 상품화: { workKind, workStatus }
   *  · 정비:   { maintType, workStatus }
   *  · 사고:   { accType, accRole, faultPct, accidentStatus, insTypes[],
   *             rentalCar, ourInsurance, otherInsurance, insuranceNo, insuranceContact,
   *             otherInsuranceNo, otherInsuranceContact,
   *             otherPlate, otherName, otherPhone, location,
   *             insuranceAmount, deductibleAmount, deductiblePaid, deductibleStatus }
   *  · 보험:   { insKind, insuranceCompany, ageAfter }
   *  · 세차:   { washType }
   *  · 위반:   { penaltyType, dueDate, location, payer, paidStatus }
   */
  meta?: Record<string, unknown>;
  createdAt: string;
  createdBy?: string;
};

/** legacy alias — 점진적 제거 */
export type VehicleHistoryCategory = HistoryCategory;
export type VehicleHistoryEntry = HistoryEntry;
