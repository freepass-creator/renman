// jpkerp5 — 계약(고객/차량/일정/금액 라이프사이클) 타입
import type { CompanyCode } from './common';
import type { VehicleStatus } from './vehicle';
import type { PaymentMethod, DepositDeduction, PaymentScheduleInline } from './banking';

export type ContractStatus = '대기' | '운행' | '반납' | '해지' | '채권';

/** 계약 = 고객/차량/일정/금액 라이프사이클 1회분 */
/**
 * 추가운전자 — 계약자/주운전자 외 추가로 등록된 운전 허락자.
 * identNo (주민번호) 로 보험연령 검증 — 보험연령보다 어리면 미커버 경고.
 */
export type AdditionalDriver = {
  name?: string;
  identNo?: string;       // 주민번호 — 보험연령 검증용
  relation?: string;      // 관계(배우자/자녀/직원 등)
  registeredAt?: string;  // 등록 시점 ISO
};

export type Contract = {
  id: string;
  contractNo: string;          // ICR-YYMM-XXXX
  company: CompanyCode;
  manager?: string;            // 담당자
  // 고객 (임베드)
  customerName: string;
  /**
   * 입금자명 별칭 — 가족·법인 계좌 등 customerName 과 다른 이름으로 입금되는 케이스.
   * receipt-match 의 buildMatchIndex 가 별칭도 byName 색인에 포함 → 자동 매칭에서 인식.
   */
  payerAliases?: string[];
  customerKind?: '개인' | '사업자' | '법인';
  /** 식별번호 — kind에 따라 주민번호/사업자번호/법인번호 1개. raw 그대로 저장 */
  customerIdentNo?: string;
  /** @deprecated customerIdentNo + customerKind 로 derive — 호환 위해 유지, 신규 코드는 maskIdent() 사용 */
  customerRegNoMasked?: string;
  customerPhone1: string;
  customerPhone2?: string;
  customerRegion?: string;
  customerDistrict?: string;
  // 면허 — RIMS 조회용 (계약자 본인 또는 주운전자)
  customerLicenseNo?: string;        // 면허번호 (예: 11-12-345678-90)
  customerLicenseStatus?: '정상' | '정지' | '취소' | '만료' | '결격' | '확인불가' | '미조회';
  customerLicenseCheckedAt?: string; // 마지막 RIMS 조회 시각 (ISO)
  customerLicenseExpiry?: string;    // RIMS 응답의 만료일
  customerLicenseType?: string;      // 1종/2종 등
  /** 면허증 OCR 원본 파일 — 검증 + 영구 보관 (보험증권 패턴) */
  customerLicenseCertUrl?: string;
  customerLicenseCertFileName?: string;
  customerLicenseCertUploadedAt?: string;
  // 주운전자 — 법인 계약일 때 또는 계약자 ≠ 운전자일 때만. 비어있으면 customerName이 운전자.
  driverName?: string;
  /** 주운전자 식별번호 — 주민번호(개인). 만연령·보험가능연령 매칭용. 비어있으면 customerIdentNo 사용 */
  driverIdentNo?: string;
  /**
   * 추가운전자 — 본인·주운전자 외 차량 운전 허락된 사람들.
   * 보험 미커버 검증 대상 (모두 보험연령 ≥ 이어야 함). 빈 어레이/undefined 면 검증 생략.
   */
  additionalDrivers?: AdditionalDriver[];
  // 차량 (임베드)
  vehiclePlate: string;
  vehicleModel: string;            // 자동 결합 풀네임 (예: '현대 아반떼 더 뉴 그랜저 GN7 가솔린 3.5 AWD 캘리그래피')
  vehicleStatus: VehicleStatus;
  // 5단 분류 (나중에 카탈로그 cascade 도입 시 인덱스/필터로 활용)
  vehicleMaker?: string;           // 제조사 (dropdown) — '현대'
  vehicleModelLine?: string;       // 모델 (dropdown) — '그랜저'
  vehicleSubModel?: string;        // 세부모델 (input) — '더 뉴 그랜저 GN7'
  vehicleVariant?: string;         // 모델구분 (input) — '가솔린 3.5 AWD' (연료·엔진·구동·인승)
  vehicleTrim?: string;            // 트림 (input) — '캘리그래피'
  // 차량별 고유 입력
  vehicleOptions?: string;         // 선택옵션 자유 입력 (예: '선루프, 풀옵션, 18인치휠')
  vehicleExteriorColor?: string;   // 외부 색상 (예: '화이트 펄')
  vehicleInteriorColor?: string;   // 내부 색상 (예: '베이지')
  // 기간
  contractDate: string;             // YYYY-MM-DD — 계약 체결일
  purchasedDate?: string;           // 차량 매입 완료일 (→ 등록대기)
  registeredDate?: string;          // 등록 완료일 (→ 상품화중)
  readiedDate?: string;             // 상품화 완료일 (→ 인도대기)
  deliveryScheduledDate?: string;
  deliveredDate?: string;           // 인도/출고 실제일 (→ 계약중)
  returnScheduledDate?: string;
  returnedDate?: string;
  termMonths: number;
  longTerm: boolean;
  // 금액
  monthlyRent: number;
  deposit: number;             // 계약상 보증금 (청구액)
  /** 실제 받은 보증금 금액 — 계약 보증금과 다를 수 있음 (분납·일부수령). 빈 값 = 미수령 */
  depositReceived?: number;
  depositReceivedDate?: string;     // 보증금 입금일 (YYYY-MM-DD)
  /** 보증금 차감 내역 — 반납 시 미납·손상·정비비 등으로 환불액에서 차감 */
  depositDeductions?: DepositDeduction[];
  /** 실제 환불한 보증금 금액 (반납 시점). 빈 값 = 미환불 */
  depositRefunded?: number;
  depositRefundedDate?: string;
  paymentDay: number;          // 매월 결제일 (1~31)
  paymentMethod: PaymentMethod;
  /**
   * 결제 시기 — 선불(당월 1일 인출) vs 후불(말일 결제)
   * default = '선불' (입력 안 했을 때 안전 가정)
   */
  paymentTiming?: '선불' | '후불';
  // 옵션
  insuranceAge?: number;
  selfInsured?: boolean;
  distanceLimitKm?: number;
  // 휴차기간 — vehicleStatus === '휴차' 일 때 사용
  idleSince?: string;       // 휴차 시작일
  idleUntil?: string;       // 휴차 종료 예정일 (정비 완료 예상 등)
  idleReason?: string;      // 사유 (사고/정비/대기 등)
  idleLocation?: string;    // 현재 위치 — 휴차 차량 보관 장소 (예: 본사 차고지, 분당 주차장 B-12)
  idleContact?: string;     // 위치 담당자 연락처 (보관소 관리자 등)
  // 임시배차 — vehicleStatus === '임시배차' 일 때
  tempReplacementPlate?: string;  // 실제로 나간 대체 차량번호 (예: K5 계약인데 K8 임시 출고)
  tempReplacementModel?: string;  // 대체 차종
  tempReason?: string;            // 임시배차 사유 (원본 차량 어디 있는지 등)
  tempSince?: string;             // 임시배차 시작일
  // 알림 대기 — 어떤 차량이 휴차/반납 되면 통보 (Phase 2)
  notifyOnAvailable?: string[];   // 차량번호 배열 — 이 차량들이 복귀하면 알림
  // 계약서 파일 (Firebase Storage)
  contractDocUrl?: string;        // 계약서 PDF/이미지 다운로드 URL
  contractDocFileName?: string;   // 원본 파일명
  contractDocUploadedAt?: string; // ISO timestamp — 업로드 시각
  // 시동제어 (미수 채권 회수용 — 차량 원격 시동 차단 상태)
  engineDisabled?: boolean;
  engineDisabledAt?: string;     // ISO timestamp — 제어 발효 시각
  engineDisabledBy?: string;     // 등록자 email
  engineDisabledReason?: string;
  engineReleasedAt?: string;     // 해제 시각(입금 확인 후)
  engineReleasedBy?: string;     // 해제자 email
  // 컴플라이언스 (계약상태 산출용)
  inspectionDueDate?: string;  // 다음 정기검사 예정일 (지나면 미수검)
  insuranceExpiryDate?: string; // 자동차보험 만기일
  vehicleTaxDueDate?: string;  // 자동차세 납부일
  hasViolations?: boolean;     // 과태료/단속 미처리 있음
  violationSince?: string;     // 위반 발생일
  // 상태
  status: ContractStatus;
  notes?: string;
  /**
   * 종료 사유 — 계약이 status 변경되어 종료될 때 명시. 과태료 부과 근거.
   *
   *  · 정상종료: 약정 만기 도래 + 정산 완료
   *  · 중도해지: 약정 만기 전 해지 (위약금 부과 근거)
   *  · 채권보전: 미수 잔액 남은 채로 종료 (채권 추심 대상)
   */
  endReason?: '정상종료' | '중도해지' | '채권보전';
  endedAt?: string;              // 종료 처리 일자 (YYYY-MM-DD)
  unpaidAtEnd?: number;          // 종료 시점 미수 잔액 (채권보전 산출 근거)
  earlyTerminationFee?: number;  // 중도해지 위약금 (부과 근거)
  endNotes?: string;             // 종료 사유 부연 (담당자 메모, 추심 단계 등)
  /** 선도구매 — 계약자 없이 회사가 미리 차량 구매 (재고 확보용) */
  isInventoryPurchase?: boolean;
  // 계약서 발송 상태
  documentStatus?: '미발송' | '발송완료' | '열람' | '서명완료' | '거절';
  documentSentAt?: string;       // ISO timestamp
  documentSentChannel?: '이메일' | 'SMS' | '카톡';
  documentSentTo?: string;
  documentSignedAt?: string;
  // 파생 (캐시) - 리스트 성능용
  currentSeq: number;          // 현재 회차 (최근 완료 + 1)
  totalSeq: number;            // 총 회차 = termMonths
  lastPaidDate?: string;
  lastPaidAmount?: number;
  unpaidAmount: number;        // 미수 합
  unpaidSeqCount: number;      // 미납 회차 수
  // 회차 스케줄 — 운영현황 업로드 시 자동 생성 + 미수 분배 (lib/payment-schedule.ts)
  schedules?: PaymentScheduleInline[];
  // 활성 리스크 이슈 (risk-ops.scanRisks 가 동적 계산 — 저장 X)
  // 운영현황 → 떨어진 계약은 receivables 페이지에서 자동 감지

  // 표준 timestamp (ERP #33) — Optimistic Lock 용
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};
