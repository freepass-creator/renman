# 차량 수선 이중 스키마 대조표 (조사 전용)

> 상태: **조사만**. 통합·마이그레이션은 별도 라운드.
> 원인: 차량360 `WorkForm`이 `history(_kind:'work')`에 **snake_case**로 저장하고,
> 업무 원장 `work_item` / `WORK_SECTIONS_BY_KIND` / entities 필드는 **camelCase**.

## 저장소

| 경로 | 엔티티 | 키 스타일 | 진입점 |
|---|---|---|---|
| 차량360 «차량 수선» | `history` (`_kind: 'work'`) | snake_case | `components/WorkForm.tsx` → `saveIntake('history', …)` |
| 업무 원장·생성 | `work_item` | camelCase | `lib/intake/entities.ts` + `lib/work-form-sections.ts` |

공통 파생(양쪽에 있음): `plate`, `category`, `date`, `title`, `companyId`, `amount`/`cost`, `author`/`createdBy`.

## 정비 (WorkForm `정비` ↔ work_item `정비·수선`)

| 의미 | WorkForm → history | work_item |
|---|---|---|
| 정비유형 | `maint_type` | `maintType` |
| 업체 | `vendor` | `vendor` |
| 비용 | `amount` (+파생 `cost`) | `amount` |
| 주행거리 | `mileage` | `mileage` |
| 다음정비 | `next_maint_date` | `nextMaintDate` |
| 메모 | `note` | `description` |
| 작업상태 | `work_status` | `status` (값셋도 다름: 접수/… vs 대기/진행/…) |

## 사고수리 (WorkForm `사고수리` ↔ work_item `사고`)

| 의미 | WorkForm → history | work_item |
|---|---|---|
| 가해/피해 | `acc_role` | `accRole` |
| 과실(%) | `fault_pct` | `faultPct` |
| 사고부위 | `damage_area` | `damageArea` |
| 골격손상 | `damage_frame` | `damageFrame` |
| 총수리비 | `amount` | `amount` |
| 보험처리금 | `insurance_amount` | `insuranceAmount` |
| 자기부담금 | `self_pay` | `selfPay` |
| 입고일 | `repair_in_date` | `repairInDate` |
| 출고예정 | `repair_out_date` | `repairOutDate` |
| 대차 | `rental_car` | `rentalCar` |
| 경위/상세 | `note` | `description` |
| 보험사 | `insurance_company` | `insuranceCompany` |
| 접수번호 | `insurance_no` | `insuranceNo` |
| 상대 차번 | `other_car` | `otherCar` |
| 상대 보험사 | `other_insurance` | `otherInsurance` |
| 상대 접수 | `other_insurance_no` | `otherInsuranceNo` |
| 보험유형 토글 | `ins_car` / `ins_property` / `ins_person` / `ins_self` / `ins_uninsured` (`Y`) | **work_item에 없음** |

## WorkForm만 있는 구분 (work_item 카테고리와 불일치)

| WorkForm category | 필드(snake) | work_item 대응 |
|---|---|---|
| `상품화` | `exterior`, `interior`, `tire_status`, `amount`, `note` | 없음(기타에도 동일 키 없음) |
| `세차` | `wash_type`, `amount`, `note` | 없음 |

## 통합 시 필요 작업 (이번 라운드 제외)

1. history snake → work_item camel 마이그레이션(또는 writer 단일화).
2. `category` 값 정규화: `정비`/`사고수리` vs `정비·수선`/`사고`.
3. `work_status` ↔ `status` 매핑.
4. 보험 토글(`ins_*`)을 work_item에 둘지 결정.
5. 차량360 수선 이력이 업무 원장 조회에 잡히는지(현재 `history` vs `work_item` 분리).

참조 파일: `components/WorkForm.tsx`, `lib/work-form-sections.ts`, `lib/intake/entities.ts` (`work_item`).
