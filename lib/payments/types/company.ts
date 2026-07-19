// jpkerp5 — 회사 마스터(법인 정보 + 계좌/카드/CMS/단말기/거점/서류) + 거래처 타입
import type { CompanyCode } from './common';

/** 회사 마스터 — 법인 정보 + 계좌/카드 */
export type BankAccount = {
  id: string;
  bankName: string;       // KB / 우리 / 신한 / 하나 / 농협 등
  accountNo: string;      // 계좌번호
  accountHolder: string;  // 예금주 (회사명과 다를 수 있음)
  nickname?: string;      // 계좌 별명 — 입출금 내역에 표시. 없으면 계좌번호 전체 표시
  purpose?: string;       // 대여료수납/보증금/관리비 등
  isDefault?: boolean;
};

export type CorporateCard = {
  id: string;
  cardName: string;       // 카드 명 (예: 법인 BC, 운영비 카드)
  cardCompany: string;    // 카드사 (KB/신한/현대 등)
  cardLast4: string;      // 끝 4자리
  purpose?: string;       // 차량유지비/주유/유료도로 등
  holder?: string;        // 카드 명의자
};

/**
 * 자동이체(CMS) 마스터 — 회사 단위로 N개.
 * 거래 upload(BankTransaction) 시 cmsId 매칭으로 회사 자동 식별.
 */
export type AutoTransferChannel = {
  id: string;
  providerName: string;   // 위탁사·CMS 사업자 (예: KICC, 효성, KCP)
  cmsId: string;          // CMS 식별 ID (입금 거래의 counterparty 또는 memo 에서 추출)
  nickname?: string;      // 별명 (장기렌트CMS 등)
  bankAccountId?: string; // 정산 들어오는 회사 계좌 (BankAccount.id 참조)
  purpose?: string;       // 대여료/관리비/보증금 등
  isDefault?: boolean;
};

/**
 * 카드매출 단말기 마스터 — 회사 단위로 N개.
 * CardTransaction upload 시 terminalId 매칭으로 회사 자동 식별.
 */
export type CardTerminalChannel = {
  id: string;
  vanProvider: string;    // VAN 사 (KIS, NICE, KOCES, KICC 등)
  terminalId: string;     // 단말기 ID
  nickname?: string;      // 별명 (사무실 단말기 / 출고장 단말기 등)
  bankAccountId?: string; // 정산 입금 받는 계좌 (BankAccount.id 참조)
  merchantNo?: string;    // 가맹점 번호
  isDefault?: boolean;
};

export type LocationKind = '사무실' | '차고지' | '주차장';

export type CompanyLocation = {
  id: string;
  kind: LocationKind;
  name: string;            // 본사 / 강남지점 / 분당 차고지 등
  address: string;
  phone?: string;
  capacity?: number;       // 주차장 — 수용 대수
  notes?: string;
};

export type CompanyDocument = {
  id: string;
  title: string;           // 사업자등록증 / 법인등기부 / 인감증명 등
  fileUrl?: string;        // Firebase Storage URL (Phase 2)
  fileName?: string;
  uploadedAt: string;
  notes?: string;
};

export type Company = {
  id: string;
  code: string;                  // CP01 / CP02 — 자동 부여 (영구·재발급 X)
  name: string;                  // 회사명 (계약의 company 코드와 매칭)
  bizRegNo?: string;             // 사업자등록번호 (123-45-67890)
  corpRegNo?: string;            // 법인등록번호 (110111-1234567)
  ceo?: string;                  // 대표자
  address?: string;
  bizType?: string;              // 업태
  bizItem?: string;              // 종목
  mainPhone?: string;            // 대표 전화번호 — 손님 페이지 노출
  customerServicePhone?: string; // 고객센터 전화 (별도 운영 시) — 손님 페이지 노출
  /** 운영 구분 — 위탁/직영/기타. OCR/미지정 시 기본 '기타' */
  partnerKind?: '위탁' | '직영' | '기타';
  /** 표기명 — 화면에 노출할 짧은 명칭 (예: 정식 '스위치플랜 주식회사' / 표기 '스위치플랜'). 비어있으면 stripCorpAndEnglish(name) 자동 표시 */
  displayName?: string;
  /** 회사 정보 — 홈페이지·실무 담당자 */
  homepage?: string;             // 회사 홈페이지 URL
  contactName?: string;          // 실무 담당자 이름
  contactRole?: string;          // 직책 (예: 매니저)
  contactPhone?: string;
  contactEmail?: string;
  /** 법인 도장(인영) — 누끼 처리된 PNG. 내용증명·계약서 발신인란에 합성 */
  stampUrl?: string;
  stampFileName?: string;
  stampUploadedAt?: string;
  accounts: BankAccount[];               // 계좌 N개 (입출금)
  cards?: CorporateCard[];               // 법인카드 N개 (지출)
  autoTransfers?: AutoTransferChannel[]; // 자동이체/CMS N개 (수입)
  cardTerminals?: CardTerminalChannel[]; // 카드매출 단말기 N개 (수입)
  locations?: CompanyLocation[]; // 사무실/차고지/주차장 통합
  documents?: CompanyDocument[]; // 사업자등록증/등기부/인감 등 서류
  notes?: string;
  createdAt: string;
  // 표준 timestamp (ERP #33)
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};

/** 거래처 마스터 — 계약자 외 공급사·협력사·외주업체 등 */
export type Vendor = {
  id: string;
  name: string;                       // 거래처명 (필수)
  kind?: '공급사' | '협력사' | '외주' | '고객' | '기타';
  bizNo?: string;                     // 사업자등록번호 (10자리)
  ceo?: string;                       // 대표
  bizType?: string;                   // 업태
  bizCategory?: string;               // 종목
  address?: string;
  phone?: string;
  email?: string;
  /** 어느 회사가 거래하는 거래처인지 — 회사 분리 시 사용. 미지정이면 전체 공유 */
  companyCode?: CompanyCode;
  notes?: string;
  // 표준 timestamp (ERP #33)
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  deletedAt?: string;
  deletedBy?: string;
};
