// jpkerp5 — 수납/결제/자금(은행·카드) 타입

/** 결제방법 — 자유 입력 (CMS/카드/세금계산서/이체/후불/현금/기타 + 모빌러그장기/카랜장기/장기CMS 등 외부 채널) */
export type PaymentMethod = string;

/** 회차당 개별 납부 entry — 분납·선납 모두 수용 */
export type PaymentEntry = {
  date: string;          // YYYY-MM-DD — 실제 입금일
  amount: number;
  /** 출처 — 정산(스냅샷 자동완료) / 계좌·카드(자금일보 매칭) / 현금·수동(직접 등록) */
  source: '정산' | '계좌' | '카드' | '현금' | '수동';
  txId?: string;         // BankTransaction.id (source='계좌')
  cardTxId?: string;     // CardTransaction.id (source='카드')
  memo?: string;
  by?: string;           // 등록자 email (수동·현금 entry)
  at?: string;           // 등록 시각 ISO
  synthetic?: boolean;   // 재구성(스냅샷 자동정리) entry — 실입금 아님. 회계·期초 대사에서 실입금만 골라낼 때 구분(v5 검증본).
};

/** 청구할인 entry — 회차 청구금액을 차감 (자가조치/보상/사은품 등) */
export type DiscountEntry = {
  date: string;          // YYYY-MM-DD
  amount: number;        // 할인액 (양수로 저장, 표시는 마이너스)
  reason?: '자가조치' | '보상' | '사은품' | '캠페인' | '반납 일할' | '기타';
  memo?: string;
  by?: string;
  at?: string;
};

/** 보증금 차감 1건 — 반납 시점에 미납·손상·세금 등으로 환불액에서 차감.
 *  reason 예: '미납 회차 충당', '차량 손상 수리비', '미정산 자동차세', '클리닝 비용' 등. */
export type DepositDeduction = {
  id: string;
  date: string;                  // YYYY-MM-DD — 차감 결정일
  amount: number;                // 차감 금액 (원)
  reason: string;                // 차감 사유
  createdBy?: string;
  createdAt?: string;
};

/** Contract에 인라인으로 박는 회차. (PaymentSchedule 전체 모델의 contract-scope subset) */
export type PaymentScheduleInline = {
  seq: number;
  dueDate: string;
  amount: number;             // 청구금액 (원본 — 변경되지 않음)
  status: ScheduleStatus;
  /** 분납·선납 누적 — 빈 배열이면 미납. legacy: 없으면 paidAmount에서 derive. */
  payments?: PaymentEntry[];
  /** 청구할인 누적 — sum(discounts.amount)만큼 청구금액 차감됨 */
  discounts?: DiscountEntry[];
  /** sum(payments.amount) — payments에서 derive되지만 캐시 (legacy 호환) */
  paidAmount: number;
  /** sum(discounts.amount) — discounts에서 derive 캐시 */
  discountAmount?: number;
  /** 가장 최근 payments.date — legacy 호환 */
  paidAt?: string;
  notes?: string;
};

/** 수납 스케줄 1회차 */
export type ScheduleStatus = '예정' | '완료' | '부분납' | '연체' | '면제';

export type PaymentSchedule = {
  id: string;
  contractId: string;
  seq: number;                 // 회차
  dueDate: string;             // YYYY-MM-DD
  amount: number;
  status: ScheduleStatus;
  paidAmount: number;
  paidAt?: string;
  matches?: Array<{ txId: string; amount: number; matchedAt: string }>;
  notes?: string;
};

/** 은행 거래 — 입금·출금 통합 (자금일보 ledger entry 역할) */
export type BankTransaction = {
  id: string;
  txDate: string;              // YYYY-MM-DD (HH:mm 가능)
  /** 입금액 — 양수, 출금이면 0 또는 미입력 */
  amount: number;
  /** 출금액 — 양수 (입금 거래는 0/미입력) */
  withdraw?: number;
  /** 잔액 (해당 거래 직후) */
  balance?: number;
  counterparty: string;        // 입금자/상대 (출금이면 수취인)
  memo?: string;               // 적요/내용
  note?: string;               // 사용자 메모 (인라인 편집)
  /** 차량번호 직접 입력 — 매칭 계약 없을 때 자금일보에서 수기로 연결 */
  linkedVehiclePlate?: string;
  /** 거래처(계약자/공급사 등) 직접 입력 — 매칭 계약 외 자유 입력 */
  linkedCustomerName?: string;
  source?: string;             // KB/우리/신한/하나/농협 등 — 은행
  account?: string;            // 계좌번호 (회사 마스터의 BankAccount.accountNo와 매칭)
  companyCode?: string;        // 회사 코드 (자금일보 회사별 집계용)
  /** 결제 채널 — 적요에서 파생. 자동이체/카드/무통장/현금/인터넷뱅킹 */
  method?: string;
  /** 계정과목 — 분개. ledger-subjects.ts 의 enum */
  subject?: string;
  matchedContractId?: string;
  matchedScheduleId?: string;
  matchedScheduleSeq?: number; // schedule 의 회차 번호 (인라인 schedules 매칭용)
  matchedAt?: string;          // 매칭 처리 시각 (ISO)
  matchedBy?: string;          // 매칭 처리자 (이메일/uid)
  /**
   * 다중 매칭 — 한 거래로 여러 계약 한 번에 결제 (회사 일괄결제·가족 결합납부 등).
   * 비어있거나 1개면 matchedContractId 단일 매칭과 동일 의미. matches[].amount 합은 거래 amount 이하.
   */
  matches?: Array<{ contractId: string; amount: number; matchedAt?: string }>;
  /** CMS 집금 정산 ID — 1 deposit ↔ N 개별 CMS 거래 묶음. settlementRole='deposit' 가 집금건, 'item' 이 개별 CMS */
  settlementId?: string;
  settlementRole?: 'deposit' | 'item';
  /** 정산 메타 (집금건에만 저장) — 묶음 총액, 수수료 등 */
  settlementGrossAmount?: number;   // 개별 CMS 합계
  settlementFeeAmount?: number;     // 수수료 = gross - 실 입금액
  settlementItemCount?: number;     // 묶음 건수
  raw?: Record<string, unknown>;

  // 표준 timestamp (ERP #33) + 회계일자/시스템일자 분리 (#17)
  /** 시스템 import 시점 — 은행 명세 업로드한 ISO timestamp */
  importedAt?: string;
  importedBy?: string;
  /** 회계 인식일 — txDate(거래일)와 별도. 마감 처리 시 기준 (기본 = txDate) */
  accountedDate?: string;
  /** 표준 timestamp */
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};

/** 카드 입금 트랜잭션 */
export type CardTransaction = {
  id: string;
  /** 거래 종류 — '매출' (손님이 우리에게 카드 결제, 수입) / '법인카드' (직원이 법인카드로 지출) */
  kind?: '매출' | '법인카드';
  txDate: string;
  amount: number;
  approvalNo: string;
  cardLast4?: string;
  customerName?: string;       // 매출: 결제 고객명 / 법인카드: 가맹점명 가능
  source?: string;             // 카드사 (KB / 신한 / 현대 / BC 등)
  /** 단말기 ID — 카드매출(매입) 채널 식별. Company.cardTerminals[].terminalId 와 매칭 */
  terminalId?: string;
  /** 가맹점 번호 — 보조 매칭 키 (Company.cardTerminals[].merchantNo) */
  merchantNo?: string;
  companyCode?: string;        // 어느 회사의 거래·카드인지
  // ─── 법인카드 전용 ───
  merchant?: string;           // 가맹점명 (어디서 썼는지)
  category?: string;           // 용도 분류 (식비 / 주유 / 통행료 / 사무용품 / 정비 / 기타)
  usedBy?: string;             // 사용 직원 (이메일 또는 이름)
  approver?: string;           // 승인자 (관리자 검토 후)
  approved?: boolean;          // 결재 완료 여부
  /** 차량번호 직접 입력 — 법인카드 지출(특히 정비/주유/세차) 이 어느 차량 비용인지 매칭.
   *  Vehicle.plate 와 매칭되면 차량 dialog 자산탭 누적 지출에 포함. BankTx.linkedVehiclePlate 와 같은 패턴. */
  linkedVehiclePlate?: string;
  // ─── 매칭 ───
  matchedContractId?: string;
  matchedScheduleId?: string;
  /** 카드사 집금 정산 ID — 1 BankTransaction deposit ↔ N CardTransaction 묶음. role='item' 만 카드 측에 표시 */
  settlementId?: string;
  raw?: Record<string, unknown>;

  // 표준 timestamp (ERP #33) + 회계일자/시스템일자 분리 (#17)
  importedAt?: string;
  importedBy?: string;
  accountedDate?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};
