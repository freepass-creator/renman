# 작업지시서 · 규격서 — jpkerp6 구조 통합

> 대상: Cursor(및 이어받는 작업자) · 기준일 2026-07-18
> 배경: 그때그때 임기응변으로 고친 것들이 쌓여 "사실 하나로 설계했어야 할 것이 N개로 갈라진" 상태.
> 8축 아키텍처 감사로 지도를 떴고, 그 결과를 실행 지시로 정리한 문서.

---

## 0. 절대 규격 (모든 작업 공통 — 예외 없음)

### 0.1 검증 게이트
작업 단위마다 **둘 다** 통과해야 완료:
```bash
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit     # EXIT 0
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/<route>  # 200
```
- ⚠️ **turbo dev 실행 중 `npm run build` 금지** (Windows에서 충돌)
- 포트 6006이 응답 없으면 좀비 프로세스 의심 → 리스너 PID kill 후 재기동 (코드 버그 아님)
- **빌드 캐시:** `.next`는 프로젝트 안 유지 (`docs/CACHE.md`). 백업 시 `.next`·`node_modules` 제외 (밖으로 빼면 Turbopack 깨짐)

### 0.2 SSOT 원칙 (가장 중요)
- **페이지는 배열만.** 집계·상태판정·저장 로직을 페이지에서 손롤(hand-roll)하지 말 것
- 같은 개념을 두 곳에서 계산하고 있으면 **그건 버그다.** 공용 원자로 뽑고 양쪽이 그것만 쓰게
- 새 기능 만들기 전 **반드시 grep으로 기존 구현 확인** (중복 구현이 이 프로젝트의 주된 부채)

### 0.3 저장(쓰기) 규격
```ts
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
const target = resolveWriteCompany(companyId, rec);   // 모호하면 null
if (!target) { toast(NEED_COMPANY, 'error'); return; }
```
- ❌ **금지**: `COMPANIES[0]`, `'switchplan'` 등 임의 폴백 → 합본 보기에서 **타 법인 조용한 오배치**(회사격리 위반)
- 삭제는 **soft-delete(`store.remove`)만**. 하드삭제 금지(복구는 `/trash`)
- 모든 변경은 `getStore()` 경유 → 감사로그 자동 기록

### 0.4 목록 로딩 규격
```ts
import { useEntityLists } from '@/lib/use-entity-lists';
const { data: [cs, hs], loading } = useEntityLists(['contract', 'history']);
```
- ❌ **금지**: `useState(loading)+useEffect+getStore().list` 보일러플레이트 복붙
- ❌ **금지**: `addEventListener('jpk:saved')` 손롤 구독 (훅에 내장돼 있음)
- 이 훅이 캐시 warm 체크(`listsCached`)로 **페이지 전환 스피너 튐**을 막아줌

### 0.5 기타 고정 규칙
- 커밋: **로컬만. push 금지** (명시 요청 시에만). commit author = `dudguq@gmail.com`
- 개인정보: **주민번호 원본 저장 금지** — 생년월일/연령만 파생 저장
- 확정된 기능·UI는 명시 요청 없이 변경 금지 (버그도 보고 후 수정)
- OCR 원본은 수기 교정과 무관하게 **영구 보존**

---

## 1. A그룹 — 지금 실제로 틀린 것 (우선 처리)

> 구조 개편이 아니라 **버그**. 작고, 지금 숫자/동작이 틀리며, B그룹의 사전정지 작업이기도 함.

### ✅ A-0. 회사스코프 오배치 — **완료**
- 조치: `lib/scope.ts` + finance·Wizard·QuickLog·WorkForm·ingest/IngestDialog/PenaltyUpload/DocIssueDialog
- `COMPANIES[0]`/`'switchplan'` 임의 폴백 저장 경로 제거

### ✅ A-1. 시동제어 통합 — **완료**
- 정본 `contract.engineDisabled` · `patchEngineLock` · Vehicle360도 동일 SSOT

### ✅ A-2. 총 미수 셀렉터 — **완료**
- `lib/snapshot/selectors.ts` `selectReceivables` · 홈/미수/리스크/재무/KPI 공유

### ✅ A-3. `loanCashOnly` — **완료**
- `lib/domain/vehicle-finance.ts` `isCashPurchase` · truthy 판정 제거

---

## 1b. (구 A섹션 상세 — 아카이브)

<details><summary>A-0~A-3 원문 증상·위치 (참고)</summary>

### A-0 (상세)
- 문제였던 것: 본사가 합본 보기에서 저장 시 조용히 `COMPANIES[0]`/`'switchplan'`에 기록
- 조치: `lib/scope.ts` 신설 + `finance`·`DeliveryWizard`·`ReturnWizard`·`QuickLogForm`·`WorkForm` 적용

### A-1 (상세)
정본 = `contract.engineDisabled`. Vehicle360 `logIgnition` → 활성 계약 토글. `gpsControl` = 장비 능력만.

### A-2 (상세)
`selectReceivables(snap) → { total, misuActive, … }`. 음수=max(0,net).

### A-3 (상세)
`isCashPurchase = (v) => String(v ?? '') === '예'`.

</details>

---

## 1. A그룹 — ~~지금 틀린 것~~ → **전부 완료 (2026-07-20)**

> 아래는 이력 유지용. 신규 작업은 §2 B그룹.

### ~~A-0~~ ✅
### ~~A-1~~ ✅  
### ~~A-2~~ ✅
### ~~A-3~~ ✅

(상세 원문 증상은 위 1b 접기 참고)


## 2. B그룹 — 구조 개편 (각각 전용 세션 권장)

> 크고 위험함. **하나씩** 붙을 것. 각 건마다 착수 전 설계 확인 → 구현 → 적대적 자체검증(반례 찾기) 순서 권장.

### B-1. 미수 원장 엔진 통합 ★가장 중요·가장 위험 — **완화 적용(2026-07-21)**
**완화**: `buildContract`가 `_carryUnpaid` 분배를 앱수납 유무와 무관하게 선행 → 실수납은 FIFO(`applyPayment`). `!pays.length` 스위칭 제거. 대사 `tools/audit-unpaid-seed.ts` OK.
**잔여(본격 B-1)**: carry를 seq-0 버킷으로 승격·필드 스키마 정리·gross≠net 의미 복원.

**현재 (누더기 — 완화 전 원문)**
"개시 미수" 한 개념이 **3벌**로 저장되고 서로 보정돼야만 맞음:
`_carryUnpaid`(앵커) + `_paidTotal`(=개시시점 pastDue−carry 역산) + `_payments`(회차별)

그리고 `lib/contract-ops.ts:72` 의 **`!pays.length` 가드**가 "첫 앱수납"을 기점으로 미수 계산 알고리즘을 **런타임 스위칭** → 회차표와 헤드라인 net이 어긋남. 이걸 가리려고 `count`를 `ceil(net/rent)`로 역산하는 특례(`:160-162`)까지 붙어 있음.

부작용으로 `gross`와 `net`이 **문자 그대로 같은 식**(`:156-157`) — "도래미수" 지표는 가짜 컬럼.

**목표 설계**
개시 carry를 3번째 표현이 아니라 **회차 배열의 seq-0 期初이월 버킷**으로 승격 → 모든 납부(개시 baseline·실납부)를 하나의 FIFO PaymentEntry로 통일 → `net = schedGross = recalcContract().unpaidAmount` 항상 성립.
그러면 `seedNet` 특례 · `!pays.length` 분기 · `paid` 3분기 · `count` 역산 · `gross==net` 강제가 **전부 소멸**.

**주의**
- 전체 계약장부의 미수가 바뀌는 작업 → 반드시 **오픈 전 숫자 대사**(변경 전/후 총 미수 비교) 후 반영
- `cutoff`(`returnedDate<today?returnedDate:today`)가 `:76` `:139` `:180` **3곳 복제** → 헬퍼로 뽑아 동시 해결
- `distributeUnpaid`(`lib/payments/payment-schedule.ts:295-307`)의 "가장 오래된 회차 amount 부풀리기"가 회차표 폭증 원인 중 하나 → 버킷 방식으로 대체

### B-2. 쓰기 단일 퍼널 — **UI 핫스팟 완료(2026-07-21)**
**현재**: `lib/commit.ts` — `commitUpdate` · `commitSave` · `commitRemove` · `commitAll`(순차).
**이행**: Delivery/ReturnWizard · Vehicle360 · payments · **contract/receivables/inbox/penalty/list상세/IngestDialog/DocIssueDialog/inbox-upload**.
**잔여(엔진)**: `lib/intake.ts` 부수효과 쓰기 · Firestore 진짜 트랜잭션 · 전이 합법성 검증.

### B-3. 상태 SSOT 통합 + 죽은 코드 제거 — **1차 완료(2026-07-21)**
**삭제**: `lib/payments/contract-lifecycle.ts` · `lib/payments/risk-issues.ts` (죽은 루프).
**신설**: `lib/domain/status.ts` — 어휘·차량 파티션·`isDeliveryPending`/`isReturnable`·`collectionStage`.
**shim**: `collection.ts` · `dashboard-consts` IDLE/OUT · `contract-ops` 술어 → status.
**잔여(후속)**: `status==='운행'` 산재 통일 · 매각대기 IDLE vs 처분예정 제품결정 · Vehicle360 손롤 상태.

### B-4. 필드 스키마 SSOT
**현재**: 같은 엔티티에 필드 어휘가 **3벌**(entities.ts FieldDefs / 손으로 쓴 TS 타입 / EntityRecord 백). 어느 스키마에도 선언 안 된 **고스트 필드** 다수(`_paidTotal`·`_payments`·`_carryUnpaid`·`_key` 등) → 오타 한 번에 조용히 유실. `mileageOut`↔`returnMileage` 같은 **명명 비대칭**.

**목표**: `lib/schema/` 에 엔티티별 선언 1벌 → FieldDefs·TS 타입·런타임 검증을 전부 파생. 손으로 쓴 `types/{contract,vehicle}.ts` 폐기.

### B-5. 데이터 로딩층 전면 이행 — **거의 완료(2026-07-21)**
`lib/use-entity-lists.ts` (+ opts.companyId). 페이지 이행:
- ✅ receivables · dispatch · asset · contract · contract-history · financials · payments · docs · audit · list/[entity]
- ✅ integrity · inbox · penalty · manage · pnl · PenaltyDocs
- ✅ Vehicle360 · Customer360 · IngestDialog · ingest
- ⬜ 잔여(특수·유지): company/[id](법인 id≠세션) · trash/settings(일회성 export)
- 자금 3면은 이미 `useCashLedgerLists` / 홈·ops는 `useDashboardData`

덤으로 해결됨: 로딩 UX 통일 · 저장반영 누락.
※ 에러 노출까지 하려면 `store.ts` `DispatchStore.list` 가 실패를 삼키지 않게(현재 `p.catch(()=>[])`) 조정 필요 — **합본은 회사별 격리 유지**할 것.

---

## 3. 이미 만들어둔 공용 원자 (재사용 — 새로 만들지 말 것)

| 원자 | 용도 |
|---|---|
| `lib/scope.ts` | 쓰기 대상 법인 해소 (`resolveWriteCompany`) |
| `lib/commit.ts` | 쓰기 퍼널 (`commitUpdate`/`Save`/`Remove`/`All`) |
| `lib/domain/status.ts` | 상태 어휘·파티션·술어·회수 SLA |
| `lib/use-entity-lists.ts` | 목록 로딩 + 저장반영 + 튐방지 |
| `lib/use-cash-ledger-lists.ts` | 자금 원장(bank_tx+card_tx) 전용 로딩 |
| `lib/store.ts` `listsCached()` | 캐시 warm 체크 |
| `lib/contract-ops.ts` | `isDeliveryPending` · `isReturnable` · `computeReturnSettlement` · `patch*` |
| `lib/domain/fuel.ts` | `FUEL_LEVELS` (연료 잔량 enum) |
| `lib/domain/early-termination.ts` | 중도해지 위약금 |
| `lib/payments/ledger-subjects.ts` | 계정과목 · `groupOfLabel` · `vatOfLabel` |
| `components/ui` `Page`/`FacetPage` | 페이지 헤더 = `[제목][전체회사]` 자동 (페이지가 손롤 금지) |
| `components/ui` `TextLink` | 표·카드 안 인라인 링크(번호판·임차인·EmptyState CTA) — 손롤 `<button style>` 금지 |
| `components/WorkbenchBar` | 툴바 SSOT (검색·탭·뷰·액션) |

---

## 4. 권장 작업 순서

```
A-1 시동제어 통합      (작음, 독립)
A-3 loanCashOnly       (작음, 독립)
A-2 미수 집계 셀렉터    (중간) ─┐
                              ├→ B-1 원장 엔진 통합 (A-2가 선행되면 검증이 쉬움)
B-5 로딩층 이행         (중간, 독립·안전)
B-3 상태 SSOT + 죽은코드 제거 (B-2의 선행)
B-2 쓰기 단일 퍼널
B-4 필드 스키마 SSOT    (마지막 — 위 전부의 결론을 흡수)
```

---

## 5. 하지 말 것 (안티패턴 — 이 프로젝트가 실제로 겪은 것들)

- ❌ 기존 구현 확인 없이 새로 만들기 → 같은 기능 2벌 (예: 문자발송·soft-delete가 이미 있는데 또 만든 적 있음)
- ❌ 페이지에서 집계·상태판정 손롤 → 화면마다 숫자 다름
- ❌ 저장 대상 회사 임의 폴백 → 타 법인 오배치
- ❌ 렌더 문자열에서 정규식으로 숫자 추출해 합산
- ❌ 죽은 코드를 "혹시 몰라" 남기기 → 경쟁 SSOT가 되어 다음 사람을 속임
- ❌ 타입 선언이 실제 저장값과 다른 채로 방치 → 컴파일러가 거짓 안전감만 줌
- ❌ 큰 구조 변경을 검증(숫자 대사·tsc·렌더) 없이 반영

---

## 6. 참고 — 이 지시서의 근거
8축 아키텍처 감사(2026-07-18) 결과. 각 항목의 상세 위치·건수·위험 분석 원본은 대화 기록 및 메모리 `project_jpkerp6_launch_readiness` 참조.
오픈 전 배포 게이트(환경변수·Firestore rules 배포·크로스테넌트 검증 등)는 **`DEPLOY.md` 상단 "오픈 전 필수 게이트"** 참조.
