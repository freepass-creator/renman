// Gemini responseSchema 상수 모음 — 문서 유형별 구조화 스키마.
//   type-specs.ts 가 이 스키마들을 TYPE_SPECS 로 묶는다.
import { Type } from '@google/genai';

/**
 * 자동차등록증 본문 ① ~ ⑩ + 헤더(최초등록일·문서확인번호) + 1.제원 ⑪ ~ ㉔ + 4.검사 ㉚~㉟ 표기 항목만.
 * 등록증에 없는 추측 항목(제조사·모델명·세부모델·트림·색상·구동방식 등)은 의도적으로 제외.
 */
export const VEHICLE_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 헤더
    document_no: { type: Type.STRING, nullable: true, description: '문서확인번호 (등록증 우상단)' },
    first_registration_date: { type: Type.STRING, nullable: true, description: '최초등록일 YYYY-MM-DD' },
    cert_issue_date: { type: Type.STRING, nullable: true, description: '등록증 발급일 YYYY-MM-DD' },
    // 본문 ① ~ ⑩
    car_number: { type: Type.STRING, nullable: true, description: '① 자동차등록번호 (예: 01도9893)' },
    category_hint: { type: Type.STRING, nullable: true, description: '② 차종 (경형 승용 / 대형 승용 등)' },
    usage_type: { type: Type.STRING, nullable: true, description: '③ 용도 (자가용 / 영업용 등)' },
    car_name: { type: Type.STRING, nullable: true, description: '④ 차명 — 등록증에 적힌 그대로 (지프/짚/JEEP 등 임의 변환 절대 금지). 예: "모닝", "아슬란", "Model 3 Long Range", "지프 랭글러"' },
    type_number: { type: Type.STRING, nullable: true, description: '⑤ 형식 (예: JA51BA-T6-P)' },
    car_year_month: { type: Type.STRING, nullable: true, description: '⑤ 제작연월 YYYY-MM (예: 2017-09)' },
    vin: { type: Type.STRING, nullable: true, description: '⑥ 차대번호' },
    engine_type: { type: Type.STRING, nullable: true, description: '⑦ 원동기형식' },
    address: { type: Type.STRING, nullable: true, description: '⑧ 사용본거지' },
    owner_name: { type: Type.STRING, nullable: true, description: '⑨ 성명(명칭)' },
    owner_biz_no: { type: Type.STRING, nullable: true, description: '⑩ 생년월일/법인등록번호' },
    // 1. 제원 ⑪ ~ ㉔
    approval_number: { type: Type.STRING, nullable: true, description: '⑪ 제원관리번호(형식승인번호)' },
    length_mm: { type: Type.INTEGER, nullable: true, description: '⑫ 길이 mm' },
    width_mm: { type: Type.INTEGER, nullable: true, description: '⑬ 너비 mm' },
    height_mm: { type: Type.INTEGER, nullable: true, description: '⑭ 높이 mm' },
    gross_weight_kg: { type: Type.INTEGER, nullable: true, description: '⑮ 총중량 kg' },
    seats: { type: Type.INTEGER, nullable: true, description: '⑯ 승차정원' },
    max_load_kg: { type: Type.INTEGER, nullable: true, description: '⑰ 최대적재량 kg' },
    displacement: { type: Type.INTEGER, nullable: true, description: '⑱ 배기량 cc' },
    rated_output: { type: Type.STRING, nullable: true, description: '⑲ 정격출력 (예: 76/6200)' },
    cylinders: { type: Type.STRING, nullable: true, description: '⑳ 기통수' },
    fuel_type: { type: Type.STRING, nullable: true, description: '㉑ 연료종류 (예: 휘발유(무연))' },
    fuel_efficiency: { type: Type.NUMBER, nullable: true, description: '㉑ 연료소비율 km/L' },
    // 4. 검사 ㉚ ~ ㉟
    inspection_from: { type: Type.STRING, nullable: true, description: '㉚ 검사 유효기간 시작 YYYY-MM-DD' },
    inspection_to: { type: Type.STRING, nullable: true, description: '㉛ 검사 유효기간 만료 YYYY-MM-DD' },
    mileage: { type: Type.INTEGER, nullable: true, description: '㉝ 주행거리 km' },
    inspection_type: { type: Type.STRING, nullable: true, description: '㉟ 검사 구분 (예: 종합검사(경과))' },
    // 푸터
    acquisition_price: { type: Type.INTEGER, nullable: true, description: '자동차 출고(취득)가격 원' },
  },
  required: [
    'document_no', 'first_registration_date', 'cert_issue_date',
    'car_number', 'category_hint', 'usage_type', 'car_name', 'type_number', 'car_year_month',
    'vin', 'engine_type', 'address', 'owner_name', 'owner_biz_no',
    'approval_number', 'length_mm', 'width_mm', 'height_mm', 'gross_weight_kg',
    'seats', 'max_load_kg', 'displacement', 'rated_output', 'cylinders',
    'fuel_type', 'fuel_efficiency',
    'inspection_from', 'inspection_to', 'mileage', 'inspection_type',
    'acquisition_price',
  ],
};

export const BUSINESS_REG_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    biz_no: { type: Type.STRING, nullable: true, description: '등록번호 XXX-XX-XXXXX' },
    corp_no: { type: Type.STRING, nullable: true, description: '법인등록번호 XXXXXX-XXXXXXX (법인만)' },
    partner_name: { type: Type.STRING, nullable: true, description: '법인명(단체명) — 주식회사 포함 그대로' },
    ceo: { type: Type.STRING, nullable: true, description: '대표자 이름 (예: "조규진"). 라벨 텍스트는 절대 값으로 가져오지 말 것' },
    ceo_type: { type: Type.STRING, nullable: true, description: '대표유형 — 라벨 "(대표유형)" 옆 값. 칸 자체가 비어있으면 null. **"대표유형" 같은 라벨 텍스트 자체를 값으로 절대 가져오지 말 것**' },
    open_date: { type: Type.STRING, nullable: true, description: '개업연월일 YYYY-MM-DD' },
    address: { type: Type.STRING, nullable: true, description: '사업장 소재지' },
    hq_address: { type: Type.STRING, nullable: true, description: '본점 소재지 (사업장과 같으면 같은 값)' },
    industry: { type: Type.STRING, nullable: true, description: '업태 — 여러 개면 콤마 join (예: "서비스, 부동산업")' },
    category: { type: Type.STRING, nullable: true, description: '종목 — 여러 개면 콤마 join (예: "렌터카, 매매업")' },
    email: { type: Type.STRING, nullable: true, description: '전자세금계산서 전용 전자우편주소' },
    entity_type: { type: Type.STRING, enum: ['corporate', 'individual'] },
    // 추가 — 등록증 하단부
    issue_date: { type: Type.STRING, nullable: true, description: '발급일자 YYYY-MM-DD (등록증 하단)' },
    tax_office: { type: Type.STRING, nullable: true, description: '발급 세무서 (예: "강서세무서")' },
    issue_reason: { type: Type.STRING, nullable: true, description: '발급사유 — 비어있을 수 있음 (신규/정정/재발급 등)' },
    single_tax_flag: { type: Type.BOOLEAN, nullable: true, description: '사업자단위 과세 적용사업자 여부 — 여(✓) true / 부(✓) false' },
  },
  required: [
    'biz_no', 'corp_no', 'partner_name', 'ceo', 'ceo_type', 'open_date', 'address',
    'hq_address', 'industry', 'category', 'email', 'entity_type',
    'issue_date', 'tax_office', 'issue_reason', 'single_tax_flag',
  ],
};

export const INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3, ...)' },
    due_date: { type: Type.STRING, nullable: true, description: '납부일 YYYY-MM-DD' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차 금액(원)' },
  },
  required: ['cycle', 'due_date', 'amount'],
};

export const INSURANCE_POLICY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    insurer: { type: Type.STRING, nullable: true, description: '보험사 (예: DB손해보험, 전국렌터카공제조합)' },
    product_name: { type: Type.STRING, nullable: true, description: '상품명 (예: 프로미카다이렉트업무용(베이직형)자동차보험)' },
    policy_no: { type: Type.STRING, nullable: true, description: '증권번호/공제번호' },
    contractor: { type: Type.STRING, nullable: true, description: '계약자 명' },
    insured: { type: Type.STRING, nullable: true, description: '피보험자 명' },
    biz_no: { type: Type.STRING, nullable: true, description: '계약자 사업자번호 (예: 158-81-*****)' },
    start_date: { type: Type.STRING, nullable: true, description: '보험 시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '보험 종료일(만기) YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (\\d{2,3}[가-힣]\\d{4})' },
    car_name: { type: Type.STRING, nullable: true, description: '차명' },
    car_year: { type: Type.INTEGER, nullable: true, description: '연식 4자리' },
    car_class: { type: Type.STRING, nullable: true, description: '차종 (예: 승용대형_세단)' },
    displacement: { type: Type.INTEGER, nullable: true, description: '배기량 cc' },
    seats: { type: Type.INTEGER, nullable: true, description: '정원' },
    vehicle_value_man: { type: Type.INTEGER, nullable: true, description: '차량가액(만원)' },
    accessory_value_man: { type: Type.INTEGER, nullable: true, description: '부속가액(만원)' },
    accessories: { type: Type.STRING, nullable: true, description: '부속품 텍스트 그대로' },
    driver_scope: { type: Type.STRING, nullable: true, description: '운전가능범위 (누구나운전/임직원한정/기타)' },
    driver_age: { type: Type.STRING, nullable: true, description: '운전가능연령 (만21/24/26/30/35세이상한정 등)' },
    deductible_man: { type: Type.INTEGER, nullable: true, description: '물적사고할증금액(만원)' },
    cov_personal_1: { type: Type.STRING, nullable: true, description: '대인배상Ⅰ 한도/내용' },
    cov_personal_2: { type: Type.STRING, nullable: true, description: '대인배상Ⅱ 한도 (예: 1인당 무한)' },
    cov_property: { type: Type.STRING, nullable: true, description: '대물배상 한도 (예: 1사고당 3억원)' },
    cov_self_accident: { type: Type.STRING, nullable: true, description: '자기신체사고 또는 자동차상해 한도' },
    cov_uninsured: { type: Type.STRING, nullable: true, description: '무보험차상해 한도' },
    cov_self_vehicle: { type: Type.STRING, nullable: true, description: '자기차량손해 한도/공제 (미가입이면 미가입)' },
    cov_emergency: { type: Type.STRING, nullable: true, description: '긴급출동(프로미카SOS 등) 내용' },
    paid_premium: { type: Type.INTEGER, nullable: true, description: '납입한 보험료(원)' },
    total_premium: { type: Type.INTEGER, nullable: true, description: '총보험료(원)' },
    auto_debit_bank: { type: Type.STRING, nullable: true, description: '분납 자동이체 은행 (예: 신한은행(통합))' },
    auto_debit_account: { type: Type.STRING, nullable: true, description: '자동이체 계좌번호 (마스킹 포함)' },
    auto_debit_holder: { type: Type.STRING, nullable: true, description: '자동이체 예금주' },
    installments: {
      type: Type.ARRAY,
      description: '분납 회차별 정보. 비고란의 "분납보험료: 2회차: ... / 3회차: ..." 항목을 회차/날짜/금액으로 분해. 1회차는 보통 가입시 납입한 보험료',
      items: INSTALLMENT_SCHEMA,
    },
  },
  required: [
    'insurer', 'product_name', 'policy_no', 'contractor', 'insured', 'biz_no',
    'start_date', 'end_date', 'car_number', 'car_name', 'car_year', 'car_class',
    'displacement', 'seats', 'vehicle_value_man', 'accessory_value_man', 'accessories',
    'driver_scope', 'driver_age', 'deductible_man',
    'cov_personal_1', 'cov_personal_2', 'cov_property', 'cov_self_accident',
    'cov_uninsured', 'cov_self_vehicle', 'cov_emergency',
    'paid_premium', 'total_premium',
    'auto_debit_bank', 'auto_debit_account', 'auto_debit_holder',
    'installments',
  ],
};

export const DEPOSIT_INSTALLMENT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cycle: { type: Type.INTEGER, description: '회차 (1, 2, 3)' },
    amount: { type: Type.INTEGER, nullable: true, description: '회차별 보증금 (원)' },
  },
  required: ['cycle', 'amount'],
};

export const RENTAL_CONTRACT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    // 계약 메타
    contract_no: { type: Type.STRING, nullable: true, description: '계약서 번호 (있으면)' },
    contract_date: { type: Type.STRING, nullable: true, description: '계약 체결일 YYYY-MM-DD' },

    // 임차인 (계약자)
    contractor_name: { type: Type.STRING, nullable: true, description: '임차인 성명' },
    contractor_kind: { type: Type.STRING, nullable: true, enum: ['개인', '사업자', '법인'] },
    contractor_ident: { type: Type.STRING, nullable: true, description: '주민번호 (XXXXXX-XXXXXXX) 또는 사업자등록번호 (XXX-XX-XXXXX)' },
    contractor_license_no: { type: Type.STRING, nullable: true, description: '운전면허번호 (XX-XX-XXXXXX-XX)' },
    contractor_phone: { type: Type.STRING, nullable: true, description: '임차인 휴대전화' },
    contractor_address: { type: Type.STRING, nullable: true, description: '주소 / 실거주지' },
    contractor_emergency_phone: { type: Type.STRING, nullable: true, description: '비상연락처/가족연락처' },
    contractor_emergency_relation: { type: Type.STRING, nullable: true, description: '비상연락처 관계 (부/모/배우자/자녀 등)' },
    contractor_biz_name: { type: Type.STRING, nullable: true, description: '개인사업자 상호 (있을 때)' },
    contractor_biz_address: { type: Type.STRING, nullable: true, description: '사업장 소재지' },

    // 차량
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 \\d{2,3}[가-힣]\\d{4}' },
    car_name: { type: Type.STRING, nullable: true, description: '차종/모델명 (예: G80, 올 뉴 K3 1.6 가솔린 럭셔리 A/T)' },
    fuel: { type: Type.STRING, nullable: true, description: '연료 (가솔린/디젤/하이브리드/전기 등)' },
    color: { type: Type.STRING, nullable: true, description: '색상 (예: 화이트/블랙)' },
    options: { type: Type.STRING, nullable: true, description: '옵션 (선루프, 후방카메라 등)' },
    maintenance_product: { type: Type.STRING, nullable: true, description: '정비상품 (정비제외/엔진오일 연1회 등)' },
    engine_oil_service: { type: Type.BOOLEAN, nullable: true, description: '엔진오일 연1회 가입 여부 (정비상품/특약/체크박스 기준)' },
    inspection_service: { type: Type.BOOLEAN, nullable: true, description: '검사대행 가입 여부' },

    // 계약 기간
    rental_period_months: { type: Type.INTEGER, nullable: true, description: '대여기간 개월. "차량 인도일로부터 48개월" → 48' },
    start_date: { type: Type.STRING, nullable: true, description: '계약시작일 YYYY-MM-DD' },
    end_date: { type: Type.STRING, nullable: true, description: '계약종료일 YYYY-MM-DD' },
    driver_age_min: { type: Type.INTEGER, nullable: true, description: '운전자 최소 연령. "만 26세이상" → 26' },
    initial_mileage_km: { type: Type.INTEGER, nullable: true, description: '현재 주행거리 km (계약 시점)' },
    annual_mileage_limit_km: { type: Type.INTEGER, nullable: true, description: '연간 약정 주행거리 km. "3.0만Km" → 30000' },
    excess_mileage_fee_kr: { type: Type.INTEGER, nullable: true, description: '약정 초과 km당 부과 (국산). "초과시 1km 당 국산 200원" → 200' },
    excess_mileage_fee_foreign: { type: Type.INTEGER, nullable: true, description: '약정 초과 km당 부과 (수입). "수입 400원" → 400' },

    // 결제
    monthly_amount: { type: Type.INTEGER, nullable: true, description: '월 대여료 (원, VAT 포함)' },
    deposit_total: { type: Type.INTEGER, nullable: true, description: '보증금 합계 (원). 분납이면 회차별 합산' },
    deposit_installments: {
      type: Type.ARRAY,
      description: '보증금 분납 회차별. 일시납이면 [{cycle:1, amount:전체}]. 분납이면 1·2·3회차 모두',
      items: DEPOSIT_INSTALLMENT_SCHEMA,
    },
    purchase_option_amount: { type: Type.STRING, nullable: true, description: '인수가격. "만기협의"/숫자/null' },
    payment_account_bank: { type: Type.STRING, nullable: true, description: '입금계좌 은행 (예: 신한은행)' },
    payment_account_no: { type: Type.STRING, nullable: true, description: '입금계좌번호 (140-013-750928)' },
    payment_account_holder: { type: Type.STRING, nullable: true, description: '입금계좌 예금주 (회사명)' },
    autopay_day: { type: Type.INTEGER, nullable: true, description: '자동이체일 (5/10/15/20/25 중 1, 체크된 거 우선)' },

    // 자동이체신청서 (CMS) — 보통 9페이지
    auto_debit_bank: { type: Type.STRING, nullable: true, description: '자동이체 출금은행 (CMS 신청서)' },
    auto_debit_account: { type: Type.STRING, nullable: true, description: '자동이체 출금계좌번호' },
    auto_debit_holder: { type: Type.STRING, nullable: true, description: '자동이체 예금주' },

    // 자동차보험 (계약서 본문에 명시된 것)
    insurer: { type: Type.STRING, nullable: true, description: '보험사 (예: DB손해보험, 전국렌터카공제조합)' },
    deductible_min: { type: Type.INTEGER, nullable: true, description: '자차 면책금 최소 (만원). "최소 50만원" → 50' },
    deductible_max: { type: Type.INTEGER, nullable: true, description: '자차 면책금 최대 (만원). "최대 100만원" → 100' },
    deductible_rate: { type: Type.NUMBER, nullable: true, description: '자차 면책 비율 (예: 0.2 = 20%). "사고처리 비용의 20%" → 0.2' },

    // 승계 (양도/양수, 1페이지에 승계 확인서 있을 때만)
    predecessor_name: { type: Type.STRING, nullable: true, description: '승계 (양도인) 이름 — 이전 계약자' },
    predecessor_phone: { type: Type.STRING, nullable: true, description: '승계 (양도인) 연락처' },
    succeeded_at: { type: Type.STRING, nullable: true, description: '승계 일자 YYYY-MM-DD' },

    // 회사 (임대인)
    company_name: { type: Type.STRING, nullable: true, description: '렌트회사명' },
    company_ceo: { type: Type.STRING, nullable: true, description: '대표자' },
    company_biz_no: { type: Type.STRING, nullable: true, description: '회사 사업자번호' },
    company_phone: { type: Type.STRING, nullable: true, description: '회사 연락처' },
    company_address: { type: Type.STRING, nullable: true, description: '회사 주소' },
  },
  required: [
    'contract_no', 'contract_date',
    'contractor_name', 'contractor_kind', 'contractor_ident', 'contractor_license_no',
    'contractor_phone', 'contractor_address',
    'contractor_emergency_phone', 'contractor_emergency_relation',
    'contractor_biz_name', 'contractor_biz_address',
    'car_number', 'car_name', 'fuel', 'color', 'options', 'maintenance_product',
    'engine_oil_service', 'inspection_service',
    'rental_period_months', 'start_date', 'end_date',
    'driver_age_min', 'initial_mileage_km', 'annual_mileage_limit_km',
    'excess_mileage_fee_kr', 'excess_mileage_fee_foreign',
    'monthly_amount', 'deposit_total', 'deposit_installments',
    'purchase_option_amount', 'payment_account_bank', 'payment_account_no',
    'payment_account_holder', 'autopay_day',
    'auto_debit_bank', 'auto_debit_account', 'auto_debit_holder',
    'insurer', 'deductible_min', 'deductible_max', 'deductible_rate',
    'predecessor_name', 'predecessor_phone', 'succeeded_at',
    'company_name', 'company_ceo', 'company_biz_no', 'company_phone', 'company_address',
  ],
};

export const LICENSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    license_no: { type: Type.STRING, nullable: true, description: '면허번호 (XX-XX-XXXXXX-XX 12자리 숫자, 하이픈 포함 그대로)' },
    license_type: { type: Type.STRING, nullable: true, description: '면허종류 (1종 보통, 2종 보통, 1종 대형, 1종 특수, 2종 소형 등)' },
    holder_name: { type: Type.STRING, nullable: true, description: '성명' },
    resident_no: { type: Type.STRING, nullable: true, description: '주민등록번호 앞 6자리만 (생년월일 부분, YYMMDD)' },
    birth_date: { type: Type.STRING, nullable: true, description: '생년월일 YYYY-MM-DD (주민번호 7번째 자리로 세기 결정 — 1/2→19xx, 3/4→20xx)' },
    address: { type: Type.STRING, nullable: true, description: '주소' },
    issue_date: { type: Type.STRING, nullable: true, description: '발급일 YYYY-MM-DD' },
    expiry_date: { type: Type.STRING, nullable: true, description: '적성검사기간 만료일 또는 갱신만료일 YYYY-MM-DD' },
    serial_no: { type: Type.STRING, nullable: true, description: '카드 일련번호/연번 (우상단)' },
    conditions: { type: Type.STRING, nullable: true, description: '조건 (예: A (수동), 자동, 안경 등)' },
    issuer: { type: Type.STRING, nullable: true, description: '발급기관 (예: 서울지방경찰청장)' },
  },
  required: [
    'license_no', 'license_type', 'holder_name', 'resident_no', 'birth_date',
    'address', 'issue_date', 'expiry_date', 'serial_no', 'conditions', 'issuer',
  ],
};

export const PENALTY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    doc_type: { type: Type.STRING, nullable: true, description: '과태료/범칙금/통행료/주정차위반/속도위반/신호위반/기타' },
    notice_no: { type: Type.STRING, nullable: true, description: '고지서번호 (있으면)' },
    issuer: { type: Type.STRING, nullable: true, description: '발급기관 (예: ○○경찰서, ○○시청)' },
    issue_date: { type: Type.STRING, nullable: true, description: '발송일/발급일 YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 (정확히 \\d{2,3}[가-힣]\\d{4})' },
    date: { type: Type.STRING, nullable: true, description: '위반일시 YYYY-MM-DD HH:mm (시간 없으면 YYYY-MM-DD)' },
    location: { type: Type.STRING, nullable: true, description: '위반장소' },
    description: { type: Type.STRING, nullable: true, description: '위반내용 (예: 주정차위반, 속도위반(50km/h 초과))' },
    law_article: { type: Type.STRING, nullable: true, description: '적용법조 (예: 도로교통법 제32조)' },
    amount: { type: Type.INTEGER, nullable: true, description: '실제 부과 금액 (원). 과태료 또는 통행료 등 메인 금액' },
    due_date: { type: Type.STRING, nullable: true, description: '납부기한 YYYY-MM-DD' },
    pay_account: { type: Type.STRING, nullable: true, description: '납부 가상계좌 (은행 + 계좌번호)' },
  },
  required: [
    'doc_type', 'notice_no', 'issuer', 'issue_date', 'car_number',
    'date', 'location', 'description', 'law_article',
    'amount', 'due_date', 'pay_account',
  ],
};

export const CONTRACT_DOC_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    car_number: { type: Type.STRING, nullable: true, description: '차량등록번호 (\\d{2,3}[가-힣]\\d{4}). 없으면 null' },
    vin: { type: Type.STRING, nullable: true, description: '차대번호 (17자 영문+숫자)' },
    car_name: { type: Type.STRING, nullable: true, description: '차명 / 모델명' },
    seller: { type: Type.STRING, nullable: true, description: '매도인 / 임대인 — 보통 개인명 또는 회사명' },
    buyer: { type: Type.STRING, nullable: true, description: '매수인 / 임차인 — 보통 회사명 (스위치플랜 등)' },
    contract_date: { type: Type.STRING, nullable: true, description: '계약 체결일 YYYY-MM-DD' },
    price: { type: Type.INTEGER, nullable: true, description: '매매가 / 임대료 (원, 콤마 제거 정수)' },
    notes: { type: Type.STRING, nullable: true, description: '특약사항 / 비고 (있으면 1줄 요약)' },
  },
  required: ['car_number', 'vin', 'car_name', 'seller', 'buyer', 'contract_date', 'price', 'notes'],
};

export const ESTIMATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    vendor: { type: Type.STRING, nullable: true, description: '견적/작업 업체 상호 (정비소·공업사·세차장 등) — 상단 발행처' },
    estimate_date: { type: Type.STRING, nullable: true, description: '견적일/작성일 YYYY-MM-DD' },
    car_number: { type: Type.STRING, nullable: true, description: '차량번호 \\d{2,3}[가-힣]\\d{4} (있으면). 포맷 안 맞으면 null' },
    amount: { type: Type.INTEGER, nullable: true, description: '최종 합계/청구 총액 (원, VAT 포함). "합계·총액·청구금액·받을금액" 라벨 우선. 개별 항목 금액이 아닌 최종 합계. 콤마 제거 정수' },
    supply_amount: { type: Type.INTEGER, nullable: true, description: '공급가액 (원)' },
    vat: { type: Type.INTEGER, nullable: true, description: '부가세/세액 (원)' },
    items: { type: Type.STRING, nullable: true, description: '주요 부품·공임 항목 3~5개 콤마 요약' },
  },
  required: ['vendor', 'estimate_date', 'car_number', 'amount', 'supply_amount', 'vat', 'items'],
};
