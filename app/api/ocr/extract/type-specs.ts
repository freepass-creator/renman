// 문서 유형별 스펙 — 라벨 + Gemini 프롬프트 + responseSchema.
//   route.ts POST 핸들러가 TYPE_SPECS[docType] 으로 조회.
import {
  VEHICLE_REG_SCHEMA,
  BUSINESS_REG_SCHEMA,
  INSURANCE_POLICY_SCHEMA,
  RENTAL_CONTRACT_SCHEMA,
  LICENSE_SCHEMA,
  PENALTY_SCHEMA,
  CONTRACT_DOC_SCHEMA,
  ESTIMATE_SCHEMA,
} from './schemas';

export interface TypeSpec {
  label: string;
  prompt: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}

export const TYPE_SPECS: Record<string, TypeSpec> = {
  vehicle_reg: {
    label: '자동차등록증',
    prompt: `이 문서는 한국 자동차등록증입니다.

## 절대 규칙 — 텍스트 원본 보존

**모든 텍스트 필드는 등록증에 적힌 그대로 추출. 절대 정규화·표준화·번역·교정 금지.**

특히 차명(car_name) 같은 외래어 한글 표기:
- 등록증에 "지프" 라고 적혀 있으면 → "지프" (절대 "짚"으로 변환 X)
- 등록증에 "짚" 이라고 적혀 있으면 → "짚" (절대 "지프"로 변환 X)
- 등록증에 "JEEP" 영문 표기면 → "JEEP" 그대로
- "모닝", "아슬란", "Model 3 Long Range", "올 뉴 K3 1.6 가솔린 럭셔리 A/T" 같은 띄어쓰기·괄호·영문혼용 모두 등록증 표기 그대로
- 같은 차종이라도 발급 시점·제조사 등록 방식에 따라 표기가 다를 수 있음 — 등록증이 진리

차명·차종·용도·연료·주소·제조사명 등 모든 한글/영문 필드 동일 원칙. 정규화 매핑테이블 사용 절대 금지.

## car_number (① 자동차등록번호) — 가장 중요

- 등록증 최상단 표 첫 행 ① 자동차등록번호 칸에 적혀 있음 (차종 / 용도 같은 행)
- 한국 번호판 포맷 \`\\d{2,3}[가-힣]\\d{4}\` (예: "01도9893", "15가4481", "123가4567")
- **외산차도 동일** — Tesla / BMW / Mercedes / MINI / Audi 등 한국 등록증엔 한국번호판 표기 (예: "15가4481" Model 3 Long Range)
- 중간에 공백·점·하이픈·전각 숫자 있어도 raw 그대로 반환 (서버에서 정규화)
- 17자 영문+숫자 = 차대번호(VIN) → 절대 car_number 아님
- 한글 한 글자가 반드시 들어감 (가/나/다/도/마/바/사/아/저/허 등) — 영문이면 plate 아님
- 차량번호판 칸이 비어있거나 신차 미발급 상태일 때만 null`,
    schema: VEHICLE_REG_SCHEMA,
  },
  business_reg: {
    label: '사업자등록증',
    prompt: `이 문서는 한국 사업자등록증 (법인 또는 개인) 입니다.

핵심 추출 규칙:
- biz_no: 등록번호 XXX-XX-XXXXX
- corp_no: 법인등록번호 XXXXXX-XXXXXXX (개인사업자면 null)
- partner_name: 법인명(단체명) — "주식회사 OOO" 그대로
- ceo: 대표자 이름. (대표유형) 표기는 ceo_type 으로 분리
- open_date / issue_date: "2017 년 01 월 01 일" 같은 한글 표기도 YYYY-MM-DD 로 변환
- address: 사업장 소재지
- hq_address: 본점 소재지 (사업장과 동일하면 같은 값 그대로)
- industry: 업태 — **여러 개일 수 있음**. 등록증 표 안에 줄 바꿔 여러 항목이면 콤마+공백 join. 예: "서비스" + "부동산업" → "서비스, 부동산업"
- category: 종목 — 동일 규칙. 예: "렌터카, 매매업"
- tax_office: 세무서장 위 표기 (예: "강서세무서")
- single_tax_flag: 사업자단위 과세 적용사업자 여부. 여(✓) → true, 부(✓) → false. 둘 다 비면 null
- issue_reason: 발급사유 칸 — 보통 비어있음. 비었으면 null
- entity_type: "법인사업자" → corporate, 개인 → individual

값 없으면 null. 한글 그대로 보존 (정규화 X).`,
    schema: BUSINESS_REG_SCHEMA,
  },
  insurance_policy: {
    label: '자동차보험증권',
    prompt: `이 문서는 한국의 자동차보험증권(또는 렌터카공제 가입증명서)입니다. 보통 1쪽 단위로 1대 차량의 보험 정보를 담고 있습니다.

## 핵심 추출 규칙

- **insurer**: 상단 로고/문구로 식별. "DB손해보험"·"DB손해보험주식회사" → "DB손해보험". "전국렌터카공제조합"·"KRMA" → "전국렌터카공제조합". 그 외는 원문.
- **product_name**: "프로미카다이렉트업무용(베이직형)자동차보험", "플러스자동차공제" 등 상단 상품명 텍스트 그대로.
- **policy_no**: "증권번호" 또는 "공제번호" 라벨 옆 값. 하이픈 포함 그대로.
- **start_date / end_date**: "보험기간 YYYY년 MM월 DD일 ~ YYYY년 MM월 DD일" → YYYY-MM-DD 두 개로 분해.
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 한글 없거나 하이픈/17자면 무조건 null.
- **car_year**: "연식 2017년" → 2017 (정수).
- **car_class**: "승용대형_세단 (2,500cc초과)" 같은 텍스트 그대로.
- **displacement**: "3,342CC" → 3342 (정수).
- **seats**: "정원 5 명" → 5.
- **vehicle_value_man / accessory_value_man**: "차량가액(부속가액) 1,331 만원(20만원)" → vehicle=1331, accessory=20.
- **accessories**: "블랙박스, 파노라마선루프" 등 부속품란 원문.
- **driver_scope**: "누구나운전" / "임직원한정" / "가족운전" 등.
- **driver_age**: "만21세이상한정", "만35세이상한정" 등.
- **deductible_man**: "(물적사고할증금액 : 200만원)" → 200.
- **cov_personal_1**: 대인배상Ⅰ 셀 ("자배법시행령에서 규정한 한도" 등).
- **cov_personal_2**: 대인배상Ⅱ 셀 ("1인당 무한" 등).
- **cov_property**: 대물배상 셀.
- **cov_self_accident**: "자기신체사고" 또는 "자동차상해" 한도 텍스트.
- **cov_uninsured**: 무보험차상해.
- **cov_self_vehicle**: 자기차량손해. "미가입"이면 "미가입".
- **cov_emergency**: "프로미카SOS 긴급출동서비스 (6)회, 긴급견인(40Km)" 같이 통째로.
- **paid_premium / total_premium**: "납입한 보험료 1,002,090 원", "총보험료 1,388,610 원" → 콤마 제거 정수.

## 분납 자동이체 / 회차별 분납

비고란에 "분납 자동이체 : 신한은행(통합) / 14001438**** / 스위치플랜(주)" 형태로 들어 있음:
- **auto_debit_bank** = "신한은행(통합)"
- **auto_debit_account** = "14001438****"  (마스킹 그대로)
- **auto_debit_holder** = "스위치플랜(주)"

그 다음 줄 "분납보험료: 2회차: 2026.04.14 / 77,300원, 3회차: 2026.05.14 / 77,300원, 4회차: ..." 형태:
- **installments**: 배열로 분해. **1회차 = 가입시 납입(= paid_premium 액수, due_date=start_date)**로 추가하고, 그 뒤 2회차/3회차/.../6회차 순서대로.
  예) 보험기간 2026-03-14 시작, 납입한보험료 1,002,090원, 분납 2회차 2026.04.14 / 77,300원 ...
  → installments = [
       { cycle: 1, due_date: "2026-03-14", amount: 1002090 },
       { cycle: 2, due_date: "2026-04-14", amount: 77300 },
       { cycle: 3, due_date: "2026-05-14", amount: 77300 },
       ...
     ]

분납 정보가 아예 없는 일시납 증권은 installments에 [{cycle:1, due_date:start_date, amount:total_premium}] 한 건만 넣음.

값 없으면 null. 차량번호는 포맷 안 맞으면 무조건 null.`,
    schema: INSURANCE_POLICY_SCHEMA,
  },
  rental_contract: {
    label: '자동차 렌탈(대여) 계약서',
    prompt: `이 PDF는 한국 시설대여 계약서 (자동차 임대차)입니다. 보통 다중 페이지 PDF 이며 페이지/섹션별로 정보가 흩어져 있을 수 있습니다:
- 1페이지: 차량·기간·결제 요약
- 2페이지: 임차인 인적사항·계약조건·결제방법·해지수수료
- 3페이지: 자동차보험 사항·정비서비스·특약사항
- 4페이지: 임대차 계약 사실 확인서
- 5페이지: 개인정보 동의서
- 9페이지: 자동이체신청서 (CMS) — auto_debit_bank/account/holder 여기서 추출
- 1페이지에 승계 확인서가 있을 때만 — predecessor_name/phone, succeeded_at

## 핵심 추출 규칙

### 임차인 (계약자)
- **contractor_name**: 성명 셀의 이름. "홍길동" 등
- **contractor_kind**: "개인사업자(해당 시 기입)" 박스에 사업자정보가 채워져 있으면 "사업자". 사업자 정보가 비어있고 주민번호만 있으면 "개인". 법인이면 "법인"
- **contractor_ident**: 주민번호(XXXXXX-XXXXXXX) 또는 사업자등록번호(XXX-XX-XXXXX). 신분에 맞는 거 우선
- **contractor_license_no**: 면허번호 (XX-XX-XXXXXX-XX 포맷)
- **contractor_phone**: 전화번호 / 휴대전화
- **contractor_address**: 주소 / 실거주지 (서울/경기 등)
- **contractor_emergency_phone**: "비상연락처" 또는 "가족 연락처" 셀의 번호
- **contractor_emergency_relation**: 비상연락처 옆/괄호 안에 있는 관계 — "부", "모", "배우자", "자녀", "형제" 등
- **contractor_biz_name**: 개인사업자 박스의 "상호" (있을 때)
- **contractor_biz_address**: "사업장소재지"

### 차량
- **car_number**: 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. "12가1234" 등. "차량번호(차대번호)" 셀 또는 상단 "계약서 번호" 줄 참고. 한글 없거나 17자 차대번호면 무조건 null
- **car_name**: "대여차종(모델명, 트림)" 셀. "G80", "올 뉴 K3 1.6 가솔린 럭셔리 A/T" 등
- **fuel**: "연료" 셀. "가솔린", "디젤", "하이브리드", "전기"
- **color**: "색상" 셀. "화이트/블랙", "흰색" 등 그대로
- **options**: "옵션" 셀. "선루프" 등
- **maintenance_product**: "정비상품" 셀. "정비제외" / "엔진오일 연1회" 등 한글 표기 그대로 보존
- **engine_oil_service**: 정비상품 본문 또는 특약/체크박스에 "엔진오일 서비스", "엔진오일 연1회" 라벨이 보이면 true. "정비제외"이거나 미언급이면 false
- **inspection_service**: "검사대행", "정기검사 대행" 라벨이 보이면 true. 미언급이면 false

### 계약 기간 / 주행거리
- **rental_period_months**: "대여기간" / "차량 인도일로부터 N개월". "차량 인도일로부터 48개월" → 48
- **start_date**: "계약시작일" YYYY-MM-DD. 비어있으면 null
- **end_date**: "계약종료일" YYYY-MM-DD. 비어있으면 null
- **driver_age_min**: "운전자 연령". "만 26세이상" → 26
- **initial_mileage_km**: "현재 주행거리" / "인수 시점 주행거리". "100,000Km" → 100000
- **annual_mileage_limit_km**: "연간 약정 주행거리". "3.0만Km" → 30000
- **excess_mileage_fee_kr / excess_mileage_fee_foreign**: "약정 초과시 1km 당 국산 200원, 수입 400원" → kr=200, foreign=400. 한 가지만 표기되면 다른 쪽은 null

### 결제
- **monthly_amount**: "월 대여료" 큰 숫자. "1,000,000" → 1000000
- **deposit_total**: 1·2·3회차 보증금 합. 일시납이면 1회차만
- **deposit_installments**: 보증금 분납 박스. "보증금 분납 여부 = 일시납"이면 1회차만, 분납이면 회차별 모두. amount 비어있으면 null로 (cycle만 채움)
- **purchase_option_amount**: "인수가격" 셀. "만기협의" / 숫자 / null
- **payment_account_bank**: "대여료 입금계좌" 라인의 은행명 (예: "신한은행")
- **payment_account_no**: 입금계좌번호 (140-013-750928 등)
- **payment_account_holder**: 입금계좌 예금주 = 회사명
- **autopay_day**: "대여료 자동이체일" 라인. 5/10/15/20/25 중 □ 체크된 거 우선. 체크 인식 어려우면 가장 명확한 숫자 1개

### 자동이체신청서 (CMS, 보통 9페이지)
- **auto_debit_bank**: 출금은행 (예: "국민은행", "신한은행")
- **auto_debit_account**: 출금계좌번호 (마스킹/하이픈 포함 그대로)
- **auto_debit_holder**: 예금주 (보통 임차인 본인)

### 자동차보험 (3페이지 보험 섹션)
- **insurer**: "보험사" / "보험회사" 셀. 예: "DB손해보험", "전국렌터카공제조합"
- **deductible_rate / deductible_min / deductible_max**: 자차면책금 문장 분해. "사고처리 비용의 20% 최소 50만원 ~ 최대 100만원" → rate=0.2, min=50, max=100. "%" 만 있고 만원 표기 없으면 rate 만 채움

### 승계 (1페이지 승계 확인서, 있을 때만)
- **predecessor_name**: 양도인 (이전 계약자) 이름
- **predecessor_phone**: 양도인 연락처
- **succeeded_at**: 승계 일자 YYYY-MM-DD ("YYYY년 MM월 DD일" 표기도 ISO 변환)

### 회사 (임대인)
- **company_name**: "렌트회사" 셀 또는 표지의 큰 회사명
- **company_ceo**: "대표자"
- **company_biz_no**: 회사 사업자번호 (XXX-XX-XXXXX)
- **company_phone**: 회사 연락처 (1544-3871 등)
- **company_address**: 회사 주소

## 추출 원칙
1. 라벨이 같은 줄/셀 또는 인접 셀에 있는 값을 우선 매칭
2. "년 월 일" 형태인데 빈 칸이면 null (placeholder)
3. 금액은 콤마 제거 후 정수
4. 차량번호 포맷 안 맞으면 무조건 null
5. 값 없으면 null. 한글 표기 그대로 보존 (정규화·번역 금지)`,
    schema: RENTAL_CONTRACT_SCHEMA,
  },
  license: {
    label: '운전면허증',
    prompt: `이 이미지는 한국 운전면허증 카드 (모바일 면허증 포함) 입니다.

## 핵심 필드

- **license_no**: 면허번호. 한국 면허번호는 \`\\d{2}-\\d{2}-\\d{6}-\\d{2}\` 패턴 (예: "11-12-345678-90"). 카드 정면 큰 글씨로 표기. 하이픈 그대로 보존.
- **license_type**: "1종 보통", "2종 보통", "1종 대형", "1종 특수(대형견인/소형견인/구난)", "2종 소형", "2종 원동기" 등 그대로.
- **holder_name**: 성명. 한자 병기 시 한글만.
- **resident_no**: 주민번호 앞 6자리(생년월일 부분)만. 뒷자리 1자(성별)는 birth_date 계산에만 사용. 풀 주민번호 저장 X.
- **birth_date**: 주민번호 7번째 자리로 세기 판정 — 1·2 → 19xx, 3·4 → 20xx, 5·6 → 19xx(외국인), 7·8 → 20xx(외국인). YYMMDD + 세기 → YYYY-MM-DD.
- **address**: 주소 (시/도 ~ 상세). 카드에 적힌 그대로.
- **issue_date**: 발급일 YYYY-MM-DD.
- **expiry_date**: "적성검사기간 ~ YYYY.MM.DD" 또는 "갱신만료일 YYYY.MM.DD". YYYY-MM-DD 로 변환.
- **serial_no**: 카드 우상단 연번/일련번호 (있을 때).
- **conditions**: 조건 (예: "A 수동", "안경", "자동변속기"). 비면 null.
- **issuer**: 발급기관 (예: "서울지방경찰청장", "경기남부지방경찰청장").

## 추출 원칙

- 값 없으면 null. 절대 추측 X.
- 카드가 일부만 보이거나 광택/그림자로 안 보이는 글자는 null.
- 주민번호 뒷 7자리는 절대 추출 X (개인정보 보호).
- birth_date 는 resident_no 앞 6자리 + 7번째 자리 조합으로 계산.`,
    schema: LICENSE_SCHEMA,
  },
  penalty: {
    label: '과태료/범칙금/통행료 고지서',
    prompt: `이 문서는 한국의 과태료·범칙금·통행료·주정차위반·속도위반·신호위반 등 교통 관련 부과 고지서입니다.

## 핵심 필드

- **car_number** (차량번호): 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 예 "01도9893", "12가3456". 한글이 없거나 하이픈 포함이면 절대 차량번호 아님.
- **doc_type** (구분): 다음 중 하나로 분류 — "과태료", "범칙금", "통행료", "주정차위반", "속도위반", "신호위반", "기타". 문서에 "통행료"가 있으면 "통행료". "주정차"는 "주정차위반". "속도"+"과태료"면 "속도위반". "신호"+"과태료"면 "신호위반". 기본은 "과태료".
- **notice_no** (고지서번호): 고지서 우상단 또는 OMR 영역의 번호. 하이픈/공백 제거.
- **issuer** (발급기관): "○○경찰서", "○○시청", "○○구청", "○○영업소" 등. 문서 발신/직인.
- **issue_date** (발송일): YYYY-MM-DD.
- **date** (위반일시): YYYY-MM-DD HH:mm (시간 표시 있을 때). 시간 없으면 YYYY-MM-DD.
- **location** (위반장소): 도로명·지번 그대로. 통행료면 영업소/대교/터널 이름.
- **description** (위반내용): "속도위반(50km/h 초과)", "주정차금지위반" 등 구체. 통행료면 "통행료 미납".
- **law_article** (적용법조): "도로교통법 제xx조" 형식.
- **amount** (금액): 실제 부과 금액(원) — 정수. 과태료/범칙금/통행료 중 메인 금액 하나.
- **due_date** (납부기한): YYYY-MM-DD.
- **pay_account** (납부계좌): "농협 123-4567-8901" 같이 은행+계좌 결합.

## 추출 원칙

1. 라벨이 같은 줄 또는 바로 다음 줄에 있는 값을 우선 매칭.
2. 금액은 콤마 제거 후 정수로 변환.
3. 라벨에 매칭되는 값이 명확하지 않으면 null.
4. 차량번호는 위 포맷에 안 맞으면 무조건 null.`,
    schema: PENALTY_SCHEMA,
  },
  contract_doc: {
    label: '계약사실확인서 (자동차매매·임대차)',
    prompt: `이 문서는 한국 자동차매매 계약사실확인서 또는 임대차 계약서입니다.

## 핵심 필드

- **car_number** (차량등록번호): 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 예 "12가3456". 신차 미발급이면 null.
- **vin** (차대번호): 17자 영문+숫자 조합. 차량번호와 다름. 라벨에 "차대번호", "VIN", "Chassis No" 등.
- **car_name** (차명/모델): "카니발", "포터", "K5", "Model 3 Long Range" 등 등록증/계약서 표기 그대로.
- **seller** (매도인/임대인): 보통 개인명. 회사면 회사명. 라벨 "매도인", "양도인", "임대인" 등.
- **buyer** (매수인/임차인): 보통 회사명 (예: "스위치플랜", "이벤저", 법인명). 라벨 "매수인", "양수인", "임차인" 등.
- **contract_date** (계약일): YYYY-MM-DD. 라벨 "계약일", "체결일", "매매일" 등.
- **price** (매매가/임대료): 콤마 제거 정수. 원 단위. 라벨 "매매대금", "매매가", "임대료", "보증금" 등.
- **notes** (특약/비고): 특약사항 1줄 요약. 없으면 null.

## 추출 원칙

1. 라벨 같은 줄 또는 바로 다음 줄 값 매칭.
2. 차량번호는 위 포맷 안 맞으면 null.
3. 매도인/매수인 칸은 보통 표 형태로 나뉨 — 좌측이 매도인, 우측이 매수인 (또는 위/아래).
4. 금액은 원 단위 정수.
5. 명확하지 않으면 null.`,
    schema: CONTRACT_DOC_SCHEMA,
  },
  estimate: {
    label: '견적서/수리 명세서',
    prompt: `이 문서는 한국 자동차 정비·사고수리·상품화·세차 견적서 또는 명세서(청구서/영수증)입니다.

## 핵심 필드
- **amount** (총액): 최종 청구/견적 합계 금액(원). "합계", "총액", "청구금액", "받으실금액", "총 결제금액" 라벨 우선. VAT 포함 최종 금액 하나. 콤마 제거 정수. **개별 항목 금액이 아니라 반드시 최종 합계**.
- **supply_amount** (공급가액): "공급가액" 라벨 값. 콤마 제거 정수.
- **vat** (부가세): "부가세" / "세액" 라벨 값. 콤마 제거 정수.
- **vendor** (업체): 견적/작업을 낸 정비소·공업사·세차장 상호. 상단 발행처/사업자명.
- **estimate_date** (견적일): 작성일/견적일/발행일 YYYY-MM-DD.
- **car_number** (차량번호): 정확히 \`\\d{2,3}[가-힣]\\d{4}\` 포맷. 한글 없거나 17자 차대번호면 null.
- **items** (항목): 주요 부품·공임 항목 3~5개를 콤마로 요약 (예: "앞범퍼 교환, 도색, 공임").

## 추출 원칙
1. 금액은 콤마 제거 후 정수.
2. amount는 최종 합계(총액) — 소계·개별 라인 금액과 혼동 금지.
3. 값 없으면 null. 차량번호 포맷 안 맞으면 null. 한글 표기 그대로 보존.`,
    schema: ESTIMATE_SCHEMA,
  },
};
