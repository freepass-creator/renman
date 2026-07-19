// jpkerp5 — 차량 마스터 + 차량 상태
import type { CompanyCode } from './common';

export type VehicleStatus =
  // ── 메인 라이프사이클 (X대기 → X완료 패턴) ──
  | '구매대기'      // → 구매완료 → 등록대기
  | '등록대기'      // → 등록완료 → 상품화대기
  | '상품화대기'    // → 상품화 착수 → 상품화중
  | '상품화중'      // → 상품화 완료 → 상품대기
  | '상품대기'      // 영업 가능 → 계약 생성 시 운행
  | '운행'          // 계약중 (표시: 계약중) → 반납예정일 D-90 진입 시 자동 만기임박
  | '연장대기'      // 운행 중 만기 임박 — 고객 연장 의사 있음, 새 조건 협의 중
  | '종료대기'      // 운행 중 만기 임박 — 고객 반납 의사 확정, 반납일 약속 잡음
  | '휴차대기'      // 반납 후 대기 → 매각/재상품화 결정
  | '매각검토'      // 휴차 차량 매각 여부 검토 중 (시세조사·견적·내부논의). 결론 후 매각대기 또는 휴차/재상품화
  | '매각대기'      // → 매각 완료 → 매각
  | '매각'          // terminal
  // ── legacy / 부수 ──
  | '인도대기' | '출고대기' | '재고' | '반납' | '휴차' | '임시배차' | '정비' | '사고';

/** 차량 마스터 — 등록증 기준 (plate + model + company만). 디테일은 나중. */
export type Vehicle = {
  id: string;
  plate: string;            // 차량번호 (unique) — 자동차등록번호
  model: string;            // 풀네임 (5단 자동결합 또는 자유 입력)
  company: CompanyCode;
  status: VehicleStatus;    // 구매대기/등록대기/상품화중/상품대기 등
  purchasedDate?: string;
  registeredDate?: string;
  readiedDate?: string;
  notes?: string;
  currentContractId?: string;  // 운행중이면 계약 ID
  createdAt: string;

  // ─── 제조사 스펙 (5단 분류) ───
  vehicleMaker?: string;       // ① 제조사 — '현대'
  vehicleModelLine?: string;   // ② 모델 — '그랜저'
  vehicleSubModel?: string;    // ③ 세부모델 — '더 뉴 그랜저 GN7'
  vehicleVariant?: string;     // ④ 모델구분 — '가솔린 3.5 AWD'
  vehicleTrim?: string;        // ⑤ 트림 — '캘리그래피'
  vehicleOptions?: string;     // 선택옵션 자유 입력
  exteriorColor?: string;      // 외부 색상
  interiorColor?: string;      // 내부 색상

  // ─── 자동차 등록증 정보 ───
  vin?: string;                // 차대번호 (불변 — 차량 실제 unique id)
  /**
   * 차량번호 변경 이력 — 파손/임의변경 시 이전 plate 가 push 됨.
   * Contract 매칭에 사용: contract.vehiclePlate 가 vehicle.plate 또는 plateHistory[] 중 하나에 매치되면 같은 차량으로 인식.
   * 차대번호(VIN) / vehicle.id (자체코드) 는 변하지 않음.
   */
  plateHistory?: string[];
  manufacturedDate?: string;   // 제작연월일 (YYYY-MM-DD)
  firstRegisteredDate?: string;// 최초등록일 (YYYY-MM-DD)
  fuelType?: string;           // 사용연료
  displacementCc?: number;     // 배기량 (cc)
  seatingCapacity?: number;    // 승차정원
  garage?: string;             // 사용본거지 (차고지 주소)
  ownerName?: string;          // 소유자명
  registrationCertUrl?: string;       // 등록증 첨부 URL (Firebase Storage)
  registrationCertFileName?: string;  // 원본 파일명
  registrationCertUploadedAt?: string;// ISO timestamp
  insuranceCertUrl?: string;          // 보험가입증명서 첨부 URL (Firebase Storage)
  insuranceCertFileName?: string;
  insuranceCertUploadedAt?: string;
  /** 할부계약서 첨부 — OCR/파일 업로드 시 자동 보관 (보험증권 패턴) */
  loanContractUrl?: string;
  loanContractFileName?: string;
  loanContractUploadedAt?: string;
  /** 제조사 견적서 — 신차 가격 산정 근거 */
  manufacturerQuoteUrl?: string;
  manufacturerQuoteFileName?: string;
  manufacturerQuoteUploadedAt?: string;
  /** 발주서 — 매입 발주 원본 */
  purchaseOrderUrl?: string;
  purchaseOrderFileName?: string;
  purchaseOrderUploadedAt?: string;
  /** 정기검사증 첨부 */
  inspectionCertUrl?: string;
  inspectionCertFileName?: string;
  inspectionCertUploadedAt?: string;
  /** GPS 설치 증빙 (영수증·설치확인서) */
  gpsInstallUrl?: string;
  gpsInstallFileName?: string;
  gpsInstallUploadedAt?: string;
  /** 매각계약서·매도증 */
  disposalCertUrl?: string;
  disposalCertFileName?: string;
  disposalCertUploadedAt?: string;

  // ─── 자동차등록증 추가 필드 (v4 자산등록현황 컬럼 대응) ───
  assetCode?: string;          // 자산코드 — 회사 scope (예: CP02VH0001), 자동 발급
  vehicleType?: string;        // 차종 (경형 승용 / 중형 승용 / 대형 승용 / SUV / 화물 등)
  vehicleUsage?: string;       // 용도 (자가용 / 영업용 / 관용)
  vehicleFormat?: string;      // 형식 (예: JA51BA-T6-P)
  engineFormat?: string;       // 원동기형식 (예: G3LA / G4KR)
  ownerRegNo?: string;         // 성명/명칭의 생년월일 또는 법인등록번호 (110111-XXXXXXX)
  specMgmtNo?: string;         // 제원관리번호 (예: A01-1-00062-0)
  vehicleLength?: number;      // 길이 (mm)
  vehicleWidth?: number;       // 너비 (mm)
  vehicleHeight?: number;      // 높이 (mm)
  totalWeight?: number;        // 총중량 (kg)
  // ─── 매입 정보 ───
  purchasePrice?: number;
  insuranceAge?: number;
  /** 취득일 — 회사가 차량을 산 날 (신차/중고차 모두). 미입력 시 firstRegisteredDate fallback */
  acquisitionDate?: string;
  /** 매각가 — 처분 시점 받은 금액 */
  salePrice?: number;
  /** 매각일 — status='매각' 전환일 */
  saleDate?: string;

  // ─── 자산 관리 정보 (보험/할부/GPS) — 자산관리 표 컬럼 ───
  insuranceCompany?: string;       // 보험사 (예: 삼성화재)
  insurancePolicyNo?: string;      // 증권번호
  insuranceExpiryDate?: string;    // 자동차보험 만기일 (YYYY-MM-DD)
  loanCompany?: string;            // 할부사 (예: 현대캐피탈)
  loanMonths?: number;             // 할부개월 (예: 60)
  loanRemainingPrincipal?: number; // 잔여원금 (원)
  loanStartDate?: string;          // 할부 개시일
  loanCashOnly?: boolean;          // 할부 없음 (현금 일시불) — 명시적 표시. 미입력과 구분
  gpsProvider?: string;            // GPS 공급사 (예: 마카롱)
  gpsDeviceId?: string;            // GPS 단말번호

  // ─── 계약사실확인서 (자동차매매·임대차 등) ───
  contractDocUrl?: string;          // Firebase Storage URL
  contractDocFileName?: string;     // 원본 파일명
  contractDocUploadedAt?: string;   // ISO timestamp
  contractDocOcrAt?: string;        // OCR 처리 시각 (재처리 추적용)
  contractDocSeller?: string;       // 매도인 (또는 임대인)
  contractDocBuyer?: string;        // 매수인 (또는 임차인) — 보통 회사
  contractDocDate?: string;         // 계약 체결일 (YYYY-MM-DD)
  contractDocPrice?: number;        // 매매가 / 임대료 (원)
  contractDocNotes?: string;        // 비고 (특약 등)

  // 표준 timestamp (ERP #33) — Optimistic Lock 용
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};
