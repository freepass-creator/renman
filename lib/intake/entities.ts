/**
 * 통합 인제스천 SSOT — 엔티티별 필드 스키마를 한 곳에 정의.
 * 3방식(직접입력 / 엑셀템플릿 / OCR)이 전부 이 스키마에서 파생되어 "일관되게" 동작한다.
 *   · OCR    : field.ocrFrom (추출키) → field.key 로 매핑
 *   · 엑셀   : fields → 템플릿 컬럼 자동 생성 + 파싱
 *   · 직접입력: fields → 폼 자동 생성
 * field.manual = 증명서/엑셀로 안 오고 사람이 채워야 하는 값 (예: 제조사 스펙 → 추후 차종마스터 연동)
 * 데이터 층(원장·이벤트) = lib/domain/layers ENTITY_LAYER — 새 엔티티는 층 먼저.
 */
import type { DataLayer } from '@/lib/domain/layers';
import { ENTITY_LAYER } from '@/lib/domain/layers';

export type FieldType = 'text' | 'number' | 'date' | 'select';

export type Field = {
  key: string;          // 표준(canonical) 필드명
  label: string;        // 표시명
  type: FieldType;
  required?: boolean;
  options?: string[];   // select
  ocrFrom?: string;     // OCR 추출 키 → 이 필드
  manual?: boolean;     // 사람 직접입력 (OCR/엑셀로 안 옴)
  note?: string;
};

export type Entity = {
  key: string;          // 'vehicle'
  label: string;        // '차량'
  /** 데이터 층 — layers.ts ENTITY_LAYER 와 동기 */
  layer: DataLayer;
  ocrType?: string;     // OCR 라우트 type (없으면 OCR 불가 = 거래내역 등 엑셀/직접입력만)
  source: string;       // 어디서 오는지 (증명서 / 엑셀)
  idFrom: string;       // 자연키 (단일 필드)
  keyFields?: string[]; // 복합 자연키 (거래내역 등 단일키 없을 때) — dedup 용
  fields: Field[];
};

export const ENTITIES: Record<string, Entity> = {
  vehicle: {
    key: 'vehicle', label: '차량', layer: ENTITY_LAYER.vehicle, ocrType: 'vehicle_reg', source: '자동차등록증', idFrom: 'plate',
    fields: [
      { key: 'plate', label: '차량번호', type: 'text', required: true, ocrFrom: 'car_number' },
      { key: 'vin', label: '차대번호(VIN)', type: 'text', ocrFrom: 'vin' },
      { key: 'carName', label: '차명(등록증 원문)', type: 'text', ocrFrom: 'car_name', note: '등록증 표기 그대로' },
      { key: 'usage', label: '용도', type: 'text', ocrFrom: 'usage_type' },
      { key: 'firstReg', label: '최초등록일', type: 'date', ocrFrom: 'first_registration_date' },
      { key: 'yearMonth', label: '제작연월', type: 'text', ocrFrom: 'car_year_month' },
      { key: 'displacement', label: '배기량(cc)', type: 'number', ocrFrom: 'displacement' },
      { key: 'fuel', label: '연료', type: 'text', ocrFrom: 'fuel_type' },
      { key: 'seats', label: '승차정원', type: 'number', ocrFrom: 'seats' },
      { key: 'inspectionTo', label: '검사만료일', type: 'date', ocrFrom: 'inspection_to' },
      { key: 'mileage', label: '주행거리(km)', type: 'number', ocrFrom: 'mileage' },
      { key: 'ownerName', label: '소유자', type: 'text', ocrFrom: 'owner_name' },
      { key: 'vehicleType', label: '차종', type: 'text', ocrFrom: 'vehicle_type', note: '경형/중형 승용·SUV·화물' },
      // ── 자산상태(라이프사이클, v5 VehicleStatus) ──
      { key: 'status', label: '자산상태', type: 'select', manual: true,
        options: ['구매대기', '등록대기', '상품화', '상품대기', '운행', '연장대기', '종료대기', '휴차', '정비', '사고', '매각대기', '매각', '말소'] },
      { key: 'assetCode', label: '자산코드', type: 'text', manual: true, note: '회사별 자동발급(CP02VH0001)' },
      // ── 취득/매입 (매입계약서·세금계산서 → 감가 기준) ──
      { key: 'acquisitionPrice', label: '매입가(원)', type: 'number', ocrFrom: 'acquisition_price' },
      { key: 'purchasedDate', label: '매입완료일', type: 'date', manual: true },
      { key: 'acquisitionDate', label: '취득일(감가기준)', type: 'date', manual: true, note: '미입력시 최초등록일' },
      { key: 'supplier', label: '매입처', type: 'text', manual: true },
      // ── 금융(할부/리스) — 자산의 부채측 ──
      { key: 'loanCashOnly', label: '할부없음(현금)', type: 'select', options: ['예', '아니오'], manual: true },
      { key: 'loanCompany', label: '할부/리스사', type: 'text', manual: true, note: '현대캐피탈 등' },
      { key: 'loanMonths', label: '할부개월', type: 'number', manual: true },
      { key: 'loanPrincipal', label: '할부원금(원)', type: 'number', manual: true, note: '상환스케줄 기준' },
      { key: 'loanRate', label: '연이율(%)', type: 'number', manual: true },
      { key: 'loanRemainingPrincipal', label: '잔여원금(원)', type: 'number', manual: true },
      { key: 'loanStartDate', label: '할부개시일', type: 'date', manual: true },
      // ── 보험 요약(증권은 별 엔티티, 빠른조회용 denorm) ──
      { key: 'insuranceCompany', label: '보험사', type: 'text', manual: true },
      { key: 'insurancePolicyNo', label: '증권번호', type: 'text', manual: true },
      { key: 'insuranceExpiryDate', label: '보험만기', type: 'date', manual: true },
      // ── GPS (시동제어·관제, 로드맵 연동) ──
      { key: 'gpsProvider', label: 'GPS 공급사', type: 'text', manual: true },
      { key: 'gpsDeviceId', label: 'GPS 단말번호', type: 'text', manual: true },
      { key: 'gpsInstalledDate', label: 'GPS 설치일', type: 'date', manual: true },
      { key: 'gpsControl', label: '시동제어', type: 'select', options: ['가능', '불가'], manual: true, note: '미납 원격 시동잠금' },
      // ── 처분/매각 (매각계약서 → 처분손익) ──
      { key: 'saleDate', label: '매각일', type: 'date', manual: true },
      { key: 'salePrice', label: '매각가(원)', type: 'number', manual: true },
      // ── 제조사 5단계 스펙 = 등록증에 없음 → 직접입력 / 차종마스터 연동 ──
      { key: 'maker', label: '제조사', type: 'text', manual: true, note: '차종마스터 연동 예정' },
      { key: 'modelLine', label: '모델', type: 'text', manual: true, note: '차종마스터 연동 예정' },
      { key: 'subModel', label: '세부모델', type: 'text', manual: true },
      { key: 'variant', label: '모델구분', type: 'text', manual: true },
      { key: 'trim', label: '트림', type: 'text', manual: true },
      { key: 'exteriorColor', label: '외부색상', type: 'text', manual: true },
      { key: 'interiorColor', label: '내부색상', type: 'text', manual: true },
    ],
  },
  // 차량 이력 — v5 HistoryEntry(scope=vehicle). 정비·사고·검사·세차·위반·부품교체·보험을 한 엔티티로.
  history: {
    key: 'history', label: '차량이력', layer: ENTITY_LAYER.history, source: '정비/사고/검사 명세·영수증(엑셀/직접)', idFrom: 'histKey',
    keyFields: ['plate', 'date', 'category', 'cost'],
    fields: [
      { key: 'plate', label: '차량번호', type: 'text', required: true },
      { key: 'date', label: '이력일', type: 'date', required: true },
      { key: 'category', label: '카테고리', type: 'select', options: ['정비', '사고', '검사', '세차', '주유', '통행료', '주차', '소모품', '위반', '보험', '부품교체', '기타'] },
      { key: 'title', label: '제목', type: 'text' },
      { key: 'vendor', label: '업체', type: 'text' },
      { key: 'mileage', label: '주행거리(km)', type: 'number' },
      { key: 'cost', label: '비용(원)', type: 'number' },
      { key: 'status', label: '상태', type: 'select', options: ['완료', '진행', '예정'] },
      { key: 'description', label: '상세', type: 'text', manual: true },
    ],
  },
  customer: {
    key: 'customer', label: '손님', layer: ENTITY_LAYER.customer, ocrType: 'license', source: '운전면허증', idFrom: 'licenseNo',
    fields: [
      { key: 'name', label: '성명', type: 'text', required: true, ocrFrom: 'holder_name' },
      { key: 'licenseNo', label: '면허번호', type: 'text', ocrFrom: 'license_no' },
      { key: 'licenseType', label: '면허종류', type: 'text', ocrFrom: 'license_type' },
      { key: 'birth', label: '생년월일', type: 'date', ocrFrom: 'birth_date' },
      { key: 'residentFront', label: '주민번호 앞6', type: 'text', ocrFrom: 'resident_no' },
      { key: 'address', label: '주소', type: 'text', ocrFrom: 'address' },
      { key: 'licenseExpiry', label: '적성검사 만료', type: 'date', ocrFrom: 'expiry_date' },
      { key: 'conditions', label: '면허조건', type: 'text', ocrFrom: 'conditions' },
      { key: 'issuer', label: '발급기관', type: 'text', ocrFrom: 'issuer' },
      { key: 'phone', label: '연락처', type: 'text', manual: true, note: '면허증에 없음 → 직접입력' },
    ],
  },
  insurance: {
    key: 'insurance', label: '보험', layer: ENTITY_LAYER.insurance, ocrType: 'insurance_policy', source: '자동차보험증권', idFrom: 'policyNo',
    fields: [
      { key: 'policyNo', label: '증권번호', type: 'text', required: true, ocrFrom: 'policy_no' },
      { key: 'insurer', label: '보험사', type: 'text', ocrFrom: 'insurer' },
      { key: 'productName', label: '상품명', type: 'text', ocrFrom: 'product_name' },
      { key: 'plate', label: '차량번호', type: 'text', ocrFrom: 'car_number' },
      { key: 'contractor', label: '계약자', type: 'text', ocrFrom: 'contractor' },
      { key: 'insured', label: '피보험자', type: 'text', ocrFrom: 'insured' },
      { key: 'startDate', label: '시작일', type: 'date', ocrFrom: 'start_date' },
      { key: 'endDate', label: '만기일', type: 'date', ocrFrom: 'end_date' },
      { key: 'driverScope', label: '운전범위', type: 'text', ocrFrom: 'driver_scope' },
      { key: 'driverAge', label: '운전연령', type: 'text', ocrFrom: 'driver_age' },
      // 가입담보·보상한도 7종 (증권 OCR에서 추출). 사고 시 담보 즉시 확인.
      { key: 'cov_personal_1', label: '대인배상Ⅰ', type: 'text', ocrFrom: 'cov_personal_1' },
      { key: 'cov_personal_2', label: '대인배상Ⅱ', type: 'text', ocrFrom: 'cov_personal_2' },
      { key: 'cov_property', label: '대물배상', type: 'text', ocrFrom: 'cov_property' },
      { key: 'cov_self_accident', label: '자기신체/자동차상해', type: 'text', ocrFrom: 'cov_self_accident' },
      { key: 'cov_uninsured', label: '무보험차상해', type: 'text', ocrFrom: 'cov_uninsured' },
      { key: 'cov_self_vehicle', label: '자기차량손해', type: 'text', ocrFrom: 'cov_self_vehicle' },
      { key: 'cov_emergency', label: '긴급출동', type: 'text', ocrFrom: 'cov_emergency' },
      { key: 'deductibleMan', label: '물적할증(만원)', type: 'number', ocrFrom: 'deductible_man' },
      { key: 'totalPremium', label: '총보험료(원)', type: 'number', ocrFrom: 'total_premium' },
      { key: 'paidPremium', label: '납입보험료(원)', type: 'number', ocrFrom: 'paid_premium' },
      { key: 'autoDebitBank', label: '자동이체 은행', type: 'text', ocrFrom: 'auto_debit_bank' },
    ],
  },
  contract: {
    key: 'contract', label: '계약', layer: ENTITY_LAYER.contract, ocrType: 'rental_contract', source: '렌탈계약서', idFrom: 'contractNo',
    fields: [
      { key: 'contractNo', label: '계약번호', type: 'text', ocrFrom: 'contract_no' },
      { key: 'contractDate', label: '계약일', type: 'date', ocrFrom: 'contract_date' },
      { key: 'contractorName', label: '임차인', type: 'text', required: true, ocrFrom: 'contractor_name' },
      { key: 'contractorPhone', label: '연락처', type: 'text', ocrFrom: 'contractor_phone' },
      { key: 'contractorBirth', label: '생년월일', type: 'date', ocrFrom: 'contractor_birth', note: '만나이 산출 → 운전자 연령·보험 허용연령 대조. 주민번호는 저장하지 않음' },
      { key: 'contractorLicenseNo', label: '면허번호', type: 'text', ocrFrom: 'contractor_license_no' },
      { key: 'contractorAddress', label: '주소', type: 'text', ocrFrom: 'contractor_address' },
      { key: 'plate', label: '차량번호', type: 'text', ocrFrom: 'car_number' },
      { key: 'carName', label: '차종', type: 'text', ocrFrom: 'car_name' },
      { key: 'rentalMonths', label: '대여기간(개월)', type: 'number', ocrFrom: 'rental_period_months' },
      { key: 'startDate', label: '시작일', type: 'date', ocrFrom: 'start_date' },
      { key: 'endDate', label: '종료일', type: 'date', ocrFrom: 'end_date' },
      { key: 'driverAgeMin', label: '최소운전연령', type: 'number', ocrFrom: 'driver_age_min' },
      { key: 'annualMileageLimit', label: '연주행한도(km)', type: 'number', ocrFrom: 'annual_mileage_limit_km' },
      { key: 'monthlyRent', label: '월대여료(원)', type: 'number', manual: true, note: '계약서 표기 없으면 직접입력' },
      { key: 'deposit', label: '보증금(원)', type: 'number', manual: true },
      // ── 표준약관·법정 필수기재(자동차대여 표준약관·여객자동차법 정합) ──
      { key: 'licenseType', label: '면허종별', type: 'text', ocrFrom: 'license_type', note: '1종/2종 보통 등' },
      { key: 'pickupPlace', label: '인수장소', type: 'text', manual: true },
      { key: 'returnPlace', label: '반환장소', type: 'text', manual: true },
      { key: 'paymentDay', label: '자동이체일', type: 'number', manual: true, note: '매월 N일 (미입력=25일)' },
      { key: 'paymentTiming', label: '납부시점', type: 'select', options: ['선불', '후불'], manual: true, note: '선불=계약일 기준, 후불=익월' },
      { key: 'reservationFee', label: '예약금(원)', type: 'number', manual: true, note: '대여예정요금 10% 범위' },
      { key: 'lateFeeRate', label: '지연손해금율(%)', type: 'number', manual: true },
      { key: 'earlyTerminationRate', label: '중도해지 위약금율(%)', type: 'number', manual: true, note: '표준 10%' },
      { key: 'cdw', label: '자차보험(CDW)', type: 'select', options: ['가입', '미가입'], manual: true, note: '미가입 시 임차인 실손 배상' },
      { key: 'deductible', label: '면책금/자기부담금(원)', type: 'number', manual: true },
      { key: 'superCover', label: '완전면책 특약', type: 'select', options: ['없음', '있음'], manual: true },
      { key: 'additionalDrivers', label: '추가운전자', type: 'text', manual: true, note: '이름/면허 콤마구분' },
      { key: 'withDriver', label: '기사포함', type: 'select', options: ['자가운전', '기사포함'], manual: true, note: '기사포함=11~15인승·6h↑/공항항만 요건' },
      { key: 'fuelOut', label: '인수 연료량', type: 'text', manual: true, note: '만탱/1·2 등' },
      { key: 'fuelIn', label: '반납 연료량', type: 'text', manual: true },
      // ── 베이스 정합성용(운영현황+리스크 최소 레코드) ──
      { key: 'driverAge', label: '운전자 연령', type: 'number', manual: true, note: '실제 임차인 연령(생년월일 입력 시 자동 산출). 보험 허용연령 미달이면 경고' },
      { key: 'insuranceAge', label: '보험 허용연령', type: 'number', manual: true, note: '보험 운전가능 최소연령 → 운전자<허용이면 경고' },
      // ── 라이프사이클(상태전이 — 인도/반납/연장/해지) ──
      { key: 'status', label: '계약상태', type: 'select', options: ['대기', '운행', '반납', '해지', '채권'], manual: true },
      { key: 'deliveredDate', label: '인도일', type: 'date', manual: true, note: '인도 처리 시 기록 → 운행' },
      { key: 'returnScheduledDate', label: '반납예정일', type: 'date', manual: true },
      { key: 'returnedDate', label: '반납/해지일', type: 'date', manual: true, note: '반납 시 일할정산 자동' },
      { key: 'depositSettledDate', label: '보증금 정산일', type: 'date', manual: true, note: '반환/충당 완료 표시' },
      { key: 'endReason', label: '종료사유', type: 'select', options: ['정상종료', '중도해지', '채권보전'], manual: true },
    ],
  },
  bank_tx: {
    key: 'bank_tx', label: '계좌 거래', layer: ENTITY_LAYER.bank_tx, source: '은행 거래내역(엑셀/CSV)', idFrom: 'txKey', keyFields: ['txDate', 'amount', 'withdraw', 'counterparty'],
    fields: [
      { key: 'account', label: '계좌번호', type: 'text', required: true, note: '어느 법인의 어느 계좌' },
      { key: 'txDate', label: '거래일', type: 'date', required: true },
      { key: 'amount', label: '입금', type: 'number' },
      { key: 'withdraw', label: '출금', type: 'number' },
      { key: 'balance', label: '잔액', type: 'number' },
      { key: 'counterparty', label: '거래상대/적요', type: 'text' },
      { key: 'memo', label: '내용', type: 'text' },
      { key: 'method', label: '수단', type: 'text', note: '계좌/CMS/카드/현금' },
    ],
  },
  card_tx: {
    key: 'card_tx', label: '법인카드', layer: ENTITY_LAYER.card_tx, source: '법인카드 내역(엑셀/CSV)', idFrom: 'txKey', keyFields: ['txDate', 'amount', 'approvalNo'],
    fields: [
      { key: 'txDate', label: '거래일', type: 'date', required: true },
      { key: 'amount', label: '금액', type: 'number' },
      { key: 'merchant', label: '가맹점', type: 'text' },
      { key: 'approvalNo', label: '승인번호', type: 'text' },
      { key: 'cardLast4', label: '카드끝4', type: 'text' },
      { key: 'category', label: '분류', type: 'text', manual: true },
    ],
  },
  penalty: {
    key: 'penalty', label: '과태료', layer: ENTITY_LAYER.penalty, ocrType: 'penalty', source: '과태료/통행료 고지서', idFrom: 'noticeNo',
    fields: [
      { key: 'docType', label: '종류', type: 'text', ocrFrom: 'doc_type' },
      { key: 'noticeNo', label: '고지서번호', type: 'text', ocrFrom: 'notice_no' },
      { key: 'issuer', label: '발급기관', type: 'text', ocrFrom: 'issuer' },
      { key: 'plate', label: '차량번호', type: 'text', required: true, ocrFrom: 'car_number' },
      { key: 'violationDate', label: '위반일시', type: 'text', ocrFrom: 'date' },
      { key: 'location', label: '위반장소', type: 'text', ocrFrom: 'location' },
      { key: 'description', label: '위반내용', type: 'text', ocrFrom: 'description' },
      { key: 'amount', label: '금액(원)', type: 'number', ocrFrom: 'amount' },
      { key: 'dueDate', label: '납부기한', type: 'date', ocrFrom: 'due_date' },
      { key: 'payAccount', label: '납부계좌', type: 'text', ocrFrom: 'pay_account' },
      // ── 변경부과(명의자→실운전자 재부과) 워크플로우 ──
      { key: 'reassignStatus', label: '변경부과 상태', type: 'select', options: ['접수', '임차인확인', '변경부과신청', '변경부과완료', '종결'], manual: true },
      { key: 'driverName', label: '실운전자(임차인)', type: 'text', manual: true, note: '위반일시 기준 자동매칭' },
      { key: 'driverPhone', label: '실운전자 연락처', type: 'text', manual: true },
      { key: 'reassignDate', label: '변경부과일', type: 'date', manual: true },
      { key: 'billedToRenter', label: '임차인 청구', type: 'select', options: ['미청구', '청구', '수납완료'], manual: true },
    ],
  },
  // 수집함 — 현장에서 폰으로 먼저 올린 사진·문서·서명. '대기'로 쌓였다가 차량/계약/자금에 매칭.
  inbox: {
    key: 'inbox', label: '수집함', layer: ENTITY_LAYER.inbox, source: '현장 업로드(사진·문서·서명)', idFrom: 'inboxKey',
    fields: [
      { key: 'inboxKey', label: '키', type: 'text' },
      { key: 'url', label: '파일', type: 'text' },
      { key: 'filename', label: '파일명', type: 'text' },
      { key: 'kind', label: '종류', type: 'select', options: ['사진', '문서', '서명', '기타'], manual: true },
      { key: 'plate', label: '차량번호', type: 'text', manual: true, note: '매칭 대상 차(선택)' },
      { key: 'note', label: '메모', type: 'text', manual: true },
      { key: 'status', label: '상태', type: 'select', options: ['대기', '매칭'], manual: true },
      { key: 'matchedEntity', label: '연결 대상', type: 'text', manual: true },
      { key: 'matchedKey', label: '연결 키', type: 'text', manual: true },
      { key: 'uploadedBy', label: '올린이', type: 'text' },
      { key: 'uploadedAt', label: '올린시각', type: 'text' },
    ],
  },
};

export type EntityRecord = Record<string, unknown>;

/** OCR 추출 결과 → 표준 엔티티 레코드 매핑 */
export function mapOcrToEntity(entityKey: string, ocr: Record<string, unknown>): EntityRecord {
  const e = ENTITIES[entityKey];
  const rec: EntityRecord = {};
  if (!e) return rec;
  for (const f of e.fields) {
    if (f.ocrFrom && ocr[f.ocrFrom] != null && ocr[f.ocrFrom] !== '') {
      rec[f.key] = ocr[f.ocrFrom];
    }
  }
  return rec;
}

export const ENTITY_LIST = Object.values(ENTITIES);
