# 보증금 전체 원장 — 커서 구현 오더 (정밀 스코핑)

조사 기준: `D:\dev\renman` @ `redesign/pagedef-p0` (HEAD `eb53081`, 작업트리 미커밋 39개 유지) · 원본 `D:\dev\jpkerp5`
구현 없음 · 아래 줄번호는 모두 실제 파일 확인값

---

## 0. 결론 요약

- jpkerp5 원장(`lib/deposit.ts` 47줄 + `deposit-section.tsx` 128줄)은 **계약 필드 4개(`depositReceived`/`depositDeductions[]`/`depositRefunded`/`depositRefundedDate`)만으로 성립**하는 독립 원장임. 미수 원장과 연결이 없음.
- renman은 반대 구조임. 보증금 충당이 **미수 원장(`_payments`/`_charges`)에 실제 entry로 기록**되고, 그 기록이 미수(net)의 유일한 근거임(`lib/contract-ops.ts:196`, `lib/contracts/deposit-offset.ts:22-25`).
- 따라서 **jpkerp5 필드를 그대로 이식하면 미수 유실 3번째 사고가 남**. `depositDeductions[]`(독립 배열)에 차감을 담으면 그 차감이 `_charges`/`_payments`와 무관해져, 화면 「차감 합계」와 미수 원장이 각각 다른 진실을 갖게 됨.
- 실제 필요한 것은 **신설 상태 1개 + 투영(projection) 1개**뿐임:
  1. **신설 상태**: 환불이력 `_depositRefunds[]` (환불만은 기존 어느 배열에도 담을 수 없음 — §2 T2)
  2. **투영**: 「보증금 원장」 표 = 기존 `depositReceived` + `_payments(kind='deposit-offset')` + `_charges(차감 kind)` + `_depositRefunds`를 읽어 이벤트 행으로 펼치는 **읽기 전용 파생**
  3. 차감은 **새 배열 금지** — `_charges`(청구) + 짝이 되는 충당 `_payments`(chargeKind) 페어로 기록
- 여기에 **base 전환**(정산·충당의 기준을 청구액 `deposit` → 실수령 `depositReceived`)이 붙음. 이게 이번 오더의 위험 전량임.

---

## 1. 지금의 불변식 (깨면 미수 유실이 재발함)

| # | 불변식 | 근거(파일:줄) |
|---|---|---|
| I1 | 미수의 근거는 **원장 기록만**. view-time 차감·날짜 도장으로 net을 깎지 않음 | `lib/contract-ops.ts:196` · `lib/contracts/deposit-offset.ts:22-25` · `tests/deposit-offset.test.ts:47-60`(케이스 C = 레거시 날짜만 → 미수 유지) |
| I2 | **`chargeKind` 없는 `_payments` entry는 회차표를 깎는다** | `lib/contract-ops.ts:59`(`schedulePays = pays.filter(p => !p.chargeKind)`) → `:84-104` 회차 적용 |
| I3 | 충당 payment는 synthetic → `paid`·입금누계·수납피드에서 제외 | `lib/payments/payment-schedule.ts:315-320` · `lib/day-feed.ts:70` · `tests/money-r5-r7-r8.test.ts:81-100`(R7) |
| I4 | 이미 소진된 보증금은 `avail`에서 뺀다. 판정은 **kind + memo 문자열까지 흡수하는 넓은 판정** | `lib/contracts/settlement.ts:82-83` · `lib/contracts/deposit-offset.ts:28-38` |
| I5 | 씨앗(`_carryUnpaid`) 계약은 일할 재정산 금지 · 수납은 FIFO(`applyPayment`), seq 지정 금지 | `lib/contract-ops.ts:153-161`, `:90-98` · `lib/deposit.ts:63-76` |
| I6 | **충당 순서 고정: 미납 대여료 → 초과주행 → 위약금** | `lib/deposit.ts:5`, `:115-154` · `lib/contracts/charges.ts:10-14` |
| I7 | 청구↔수납 페어링은 **kind 단위 합계**. 같은 kind 2건의 개별 잔액은 산출 불가 | `lib/contracts/charges.ts:33-37`, `:40-47`, `:61-63` |
| I8 | 모든 정산 생성은 멱등(kind 있으면 skip) | `lib/deposit.ts:83`, `:93`, `:128-132` · `lib/contracts/deposit-offset.ts:12-20` |
| I9 | 상태 신호는 배지 색으로만 (행 틴트·좌측 레일 금지) | `components/ui/misc.tsx:216` 주석 — ※`lib/work-rail.ts`/`workRailStyle`은 **현 저장소에 존재하지 않음**(이미 제거됨). 되살리지 말 것 |

### 이번 오더가 «의도적으로» 바꾸는 불변식 3개

- **C1 base 전환**: 정산·충당의 기준을 `Number(rec.deposit)`(계약서 청구액) → `depositReceived`(실수령)로 바꿈. 실수령 미기록(`null`)이면 **정산 실행을 잠금**(금액 0으로 진행 금지).
- **C2 환불 반영**: `avail`/`remain` 계산에서 **환불액도 빼야 함**. 지금은 환불 개념이 없어 `settlement.ts:83`의 `avail = deposit − consumed`가 환불 후에도 그대로임 → 환불한 돈으로 또 충당하는 경로가 열림.
- **C3 차감 기록형식**: 차감 = `_charges` 1건 + 같은 kind를 겨냥한 충당 `_payments` 1건의 **페어**를 한 patch에 함께 write. 페어 없이 charge만 쓰면 미수가 부풀고, payment만 쓰면 미수가 근거 없이 깎임.

---

## 2. 함정 (근거 필수 — 이거 모르고 짜면 사고 남)

**T1. 차감을 `depositDeductions[]`로 이식 금지**
jpkerp5 `lib/deposit.ts:20-30`은 `received − Σdeductions − refunded`를 독립 계산함. renman에서 같은 배열을 만들면 그 차감이 `openChargesTotal`(`lib/contracts/charges.ts:50-59`)에 안 들어가 **미수에 반영되지 않는 채권**이 됨. `lib/payments/types/contract.ts:91-92`에 타입 선언만 v5에서 따라 들어와 있으나 **renman 어디에서도 쓰이지 않음**(grep 결과 사용처 0). 신규 코드에서 쓰지 말 것.

**T2. 환불액을 `_payments`에 넣으면 미수가 유실됨**
환불은 «나간 돈»임. `chargeKind` 없는 entry는 `lib/contract-oz.ts:59`… 정확히는 `lib/contract-ops.ts:59` 필터를 통과해 회차표를 깎음(I2). 음수 금액을 넣으면 `applyPayment`가 회차 상태를 왜곡함. → **`_depositRefunds[]` 신설이 유일한 안전 경로**.

**T3. 차감을 `chargeKind` 없는 충당 payment로 쓰면 두 겹으로 터짐**
(a) I2에 의해 대여료 회차가 깎임 = 미수 유실. (b) `lib/deposit.ts:128-132` `hasRentOffset` 판정이 그 entry를 **「대여료 충당 이미 완료」로 오인** → 이후 정산에서 1단계(미납 대여료)를 영구 skip → 충당 순서(I6) 붕괴.

**T4. 「차감」을 `recordedDepositOffsetAmount`에서 또 빼면 이중차감**
차감의 충당 payment는 `kind='deposit-offset'`이므로 이미 `lib/contracts/deposit-offset.ts:28-38` 합계에 포함됨. 미반환잔액을 `실수령 − Σ충당 − Σ차감 − Σ환불`로 쓰면 차감이 두 번 빠짐. **정답: `실수령 − recordedDepositOffsetAmount − Σ환불`**. (씨앗 carry 이중차감 사고와 동일 계열)

**T5. base 전환이 기존 테스트 fixture를 깨뜨림**
`tests/money-r5-r7-r8.test.ts:29`(`deposit: 300_000`)·`tests/deposit-offset.test.ts:26`(`deposit: 1_000_000`) 두 fixture에 `depositReceived`가 없음 → C1 적용 시 충당액 0이 되어 R5/R7/R8·3건 before/after가 전부 실패함. **fixture에 `depositReceived`를 명시 추가**해 게이트를 유지할 것(기대값 변경 금지 — 값이 바뀌면 설계가 틀린 것임).

**T6. 위약금 산식이 저장소에 2개 있음(이번 오더에서 통합하지 말 것, 인지만)**
`lib/contracts/settlement.ts:100-110`(만기 = start+rentalMonths, 반올림 없음, rate 기본 0) vs `lib/domain/early-termination.ts:20-29`(만기 = `endDate`, 만원 반올림, rate 기본 10). 내용증명은 후자(`lib/docs/notice-claim.ts:9`), 정산·충당은 전자(`lib/deposit.ts:7,92`). **같은 계약의 위약금이 문서와 원장에서 다를 수 있음.** 보증금 원장은 **충당된 금액(원장 기록)**만 표시하고 재계산하지 말 것. 통합은 별건 오더로 올림(§8-R4).

**T7. 실수령 미기록이 압도적 다수임**
`depositReceived`는 `cf80190`(2026-07-31)에 신설된 필드임 → 기존 계약 전부 `null`. base 전환 후 「보증금 정산」 버튼이 아무 일도 안 하는 상태가 광범위하게 발생함. **버튼을 죽이지 말고 «실수령 미확인 — 입력 필요»로 잠그고 사유를 표시**할 것(문자 잠금과 같은 doctrine: `components/NotifyDialog.tsx:75-83`).

**T8. 차량번호 조인**
보증금 원장은 계약 배열만 쓰므로 plate 조인 불필요. 차량360에서 계약을 모으는 경로는 이미 별칭 기반임 — 새로 `normPlate(x.plate)===np`를 만들지 말 것. 대외문서 조인 근거는 `components/PrintHost.tsx:73-80`.

**T9. 계약 문서는 회계마감 대상이 아님**
`firestore.rules:81`은 `bank_tx`/`card_tx`만 마감 강제함. `app/api/entities/[entity]/route.ts:101` 유입 차단도 자금거래만임. 계약 문서(`_depositRefunds`)는 마감월에도 써짐 → **환불일자 입력에 클라이언트 마감 가드를 반드시 붙일 것**: `lib/finance/period-lock.ts:183-187` `lockReason(companyId, date)` 재사용(`app/payments/page.tsx:203`, `:236` 선례). 새 자금 쓰기 경로·bank_tx 생성 금지.

---

## 3. 신설 파일

### 3-1. `D:\dev\renman\lib\contracts\deposit-ledger.ts` (신설, 핵심)
패턴 원본 = `lib/contracts/schedule-ledger.ts`(전량 정독. 헤더 주석에 «SSOT만 사용» 명시하는 방식·`build*/summarize*/count*` 3함수 구조·정렬 tiebreak를 그대로 따를 것).

```
export const DEPOSIT_DEDUCT_KINDS = ['deposit-damage','deposit-penalty','deposit-cleaning','deposit-tax','deposit-etc'] as const;
export const DEPOSIT_DEDUCT_LABEL: Record<...,string> = { 'deposit-damage':'차량손상', 'deposit-penalty':'과태료', 'deposit-cleaning':'클리닝', 'deposit-tax':'미납세금', 'deposit-etc':'기타' };

export type DepositRefundEntry = { id: string; date: string; amount: number; method?: string; txId?: string; memo?: string; by?: string; at?: string };

export function depositBaseOf(rec): number | null      // = numOrNull(rec.depositReceived) — 실수령. null=미확인
export function listDepositRefunds(rec): DepositRefundEntry[]
export function refundedDepositAmount(rec): number
export function depositUnrefunded(rec): number         // max(0, base − recordedDepositOffsetAmount − refunded)   ★T4
export function depositLockReason(rec): string | null  // '실수령 미확인' 등 — 정산/환불 잠금 사유
export function buildDepositDeduction(rec, { kind, amount, date, memo }): { charges: ChargeEntry[]; payments: Array<Record<string,unknown>> }
export function buildDepositRefund(rec, { amount, date, method, memo, by }): { _depositRefunds: DepositRefundEntry[]; depositRefundedDate: string }
export function buildDepositLedger(contracts, today): DepositLedgerRow[]
export function summarizeDepositLedger(rows): {...}
export function countDepositStatuses(rows): Record<string, number>
```

구현 규정:
- `depositBaseOf` = **`lib/notify/recipients.ts:15-17` `depositReceivedOf`와 동일 로직의 SSOT**. 중복 구현 금지 — recipients.ts 쪽을 이 파일에서 re-export하도록 바꿀 것(§4-9).
- `buildDepositDeduction`: ① `draft = { ...rec, _charges: [...listCharges(rec), 새 charge] }` ② `buildDepositSettlement(draft, today)` 호출 ③ 반환된 charges/payments를 합쳐 돌려줌. **직접 payment를 만들지 말 것** — 고정 충당순서(I6)를 엔진 한 곳에만 두기 위함. 새 차감 kind는 `DEPOSIT_OFFSET_CHARGE_ORDER` **末尾에 append**(앞 3단 순서 불변 = §5 참조).
- `buildDepositRefund`: 계약 문서 단독 write용 patch만 반환. `amount > depositUnrefunded(rec)`면 호출자가 확인대화(jpkerp5 `deposit-section.tsx:47` 선례).
- `buildDepositLedger`: 계약 1건당 이벤트 행 전개 —
  `수령`(1행, base null이면 상태 `미확인`) · `충당`(offset payments 중 `chargeKind` 없는 것 = 대여료) · `차감`(charge kind ∈ 차감 kinds + OM/ET는 `충당`으로) · `환불`(N행) · `잔액`(종료 계약 1행, `depositUnrefunded>0`일 때만)
  ★행 생성은 순수 파생만. 여기서 어떤 금액도 재계산하지 말 것(원장 기록값 그대로).

### 3-2. `D:\dev\renman\lib\deposit-cols.tsx` (신설)
- **`lib/master-ledger-cols.tsx`에 넣지 말 것** — 그 파일은 지금 커서가 잡고 있음(§7). 별도 col 파일은 이미 선례 다수: `lib/risk-cols.tsx`·`lib/work-cols.tsx`·`lib/staff-cols.tsx`(`:45 export const STAFF_COLS`)·`lib/finance/cash-cols.tsx`.
- 구조는 `lib/master-ledger-cols.tsx:450-506`(회차원장 블록) 복제: `*Tone()` 헬퍼 → `DEPOSIT_COL_CATALOG` → `DEPOSIT_SHEET_KEYS` → `buildSheetViews` → `DEPOSIT_LEDGER_COLS`/`DEPOSIT_LEDGER_ALL_COLS`.
- 셀 그릇: `align:'r'` + `xf:'money'` + `sortNum:true`, 표 금액은 `money()`(₩ 없음), 빈칸은 `LEDGER_EMPTY.dash`. `TwoLineCell` **import 금지**(`tests/row-grammar.test.ts:96-108`은 col 파일 목록 하드코딩이므로 이 신규 파일도 목록에 추가할 것).

### 3-3. `D:\dev\renman\tests\deposit-ledger.test.ts` (신설)
필수 케이스(전부 단정값으로):
1. 실수령 100만·미납 80만 → 정산 → `net 0` · `paid 0`(I3) · 잔액 20만
2. **실수령 `null`** → `buildDepositSettlement` 충당 0건 · `net` 불변 · `depositLockReason() !== null`  ★C1/T7
3. 차감(손상 30만) → `_charges` 1 + `_payments` 1 페어 · **`net` 불변**(charge+offset 상쇄) · 잔액 −30만  ★C3
4. 보증금 부족(실수령 30만, 차감 50만) → 잔액 0 · `addCharge` 20만 · 미수 원장에 20만 남음(`buildReceivableRows` 길이 1)  ★R5와 동형
5. 환불 20만 기록 → `depositUnrefunded` 0 · **재정산 시 `remain` 0**(환불한 돈으로 재충당 안 됨)  ★C2
6. 충당 순서: 미납 50만 + OM 100만 + ET 50만, 실수령 120만 → 대여료 50만 → OM 70만 → ET 0  ★I6
7. 멱등: 정산 2회 호출 → 2회차 반환 payments 0건(I8)
8. `_payments`에 환불이 섞이지 않음: 전개 후 `_payments.some(p => p.amount < 0) === false`  ★T2

### 3-4. `D:\dev\renman\tools\backfill-deposit-received.ts` (신설, 기본 dry-run)
패턴 = `tools/backfill-deposit-offset.ts:2`(«기본 dry-run(목록만)») 그대로.
역산 규칙(근거 있는 것만): `depositReceived` 미기록 **and** `recordedDepositOffsetAmount(rec) > 0` → 후보값 = `recordedDepositOffsetAmount + Σ환불`. 그 외(충당 기록도 없는 계약)는 **추정 금지 · 목록만 출력**. `--apply` 없으면 절대 write 금지.

---

## 4. 수정 파일 — 위치와 내용

**4-1. `lib/contracts/charges.ts:10-14`**
`DEPOSIT_OFFSET_CHARGE_ORDER`에 차감 5종을 **末尾 append**: `[OVER_MILEAGE, EARLY_TERM, ...DEPOSIT_DEDUCT_KINDS]`.
- 앞 3단(대여료→초과주행→위약금)은 **위치·순서 불변** — 고정 스펙(§5).
- 순환 import 주의: kind 상수는 `charges.ts`에 두고 `deposit-ledger.ts`가 import(역방향 금지). `deposit-offset.ts:1-4` 주석의 «순환 금지» 규율과 동일.

**4-2. `lib/contracts/settlement.ts:82-89`** ★C2
```
const consumed = opts?.contract ? recordedDepositOffsetAmount(opts.contract) : 0;
const avail    = Math.max(0, deposit - consumed);
```
→ `refunded = opts?.contract ? refundedDepositAmount(opts.contract) : 0` 추가 후 `avail = max(0, deposit − consumed − refunded)`.
- **`offset` 필드에는 환불을 더하지 말 것**(`:87` `offset: consumed + Math.min(avail, charge)` — offset은 «충당액» 표기이므로 환불이 섞이면 정산서가 틀림).
- `refund`(`:88`)는 «아직 돌려줄 돈»이 되어 이미 환불한 계약에서 0으로 내려감 = 의도된 변화.
- 함수 시그니처(첫 인자 `deposit`) 유지. base 전환은 **호출부에서** 함.

**4-3. `lib/deposit.ts:34-44` `depositView`**  ★C1
- `const deposit = Number(c.deposit) || 0` (`:35`) → `const base = depositBaseOf(c)`; `computeReturnSettlement(base ?? 0, ...)`.
- 반환 타입에 추가: `contractual`(=`Number(c.deposit)`), `received: number|null`, `receivedKnown: boolean`, `deducted`, `refunded`, `unrefunded`, `lockReason`. **기존 필드(`deposit`,`unpaid`,`offset`,`refund`,`addCharge`,`overMileageFee`,`ended`,`settled`,`pendingRefund`) 이름·의미는 유지** — `app/contract/page.tsx:122`, `useVehicleDetail.ts:209`, `tools/snapshot-receivables.ts:68`, 테스트 3곳이 이미 씀.
- `pendingRefund`(`:42`)는 `ended && (base ?? 0) > 0 && !settled`로 바꿀 것. 실수령 0/미확인 계약이 «미정산»으로 영구 적재되는 것을 막음. 단 **미확인 계약은 별도 신호**(`lockReason`)로 표면화 — 조용히 사라지면 안 됨.

**4-4. `lib/deposit.ts:115-157` `buildDepositSettlement`**  ★C1/C2
- `:119-120`
  ```
  const deposit = Number(rec.deposit) || 0;
  let remain = Math.max(0, deposit - recordedDepositOffsetAmount(rec));
  ```
  → `const base = depositBaseOf(rec); if (base == null) return { charges: [], payments: [] };`
  `let remain = Math.max(0, base − recordedDepositOffsetAmount(rec) − refundedDepositAmount(rec));`
  ★환불액을 빼지 않으면 환불한 돈으로 미수를 또 깎음 = 유실.
- `:128-132` `hasRentOffset` 판정은 **손대지 말 것**(손수납 문자열까지 흡수하는 넓은 판정이 이중차감 방어임).
- `:142-154` 루프는 그대로 — 차감 kind가 `DEPOSIT_OFFSET_CHARGE_ORDER`에 append되면 자동으로 고정순서 뒤에 붙음.
- 반환에 `blocked?: string` 추가해 UI가 사유를 띄울 수 있게 할 것(§4-6).

**4-5. `components/vehicle-detail/useVehicleDetail.ts`**
- `:209-210` `pendDeposit` — 유지. 4-3 변경으로 미확인 계약이 빠지므로, **미확인 계약을 잡는 `depositUnknown` 파생을 옆에 추가**하고 `:425`의 issues 배열(`if (pendDeposit) issues.push({ label:'보증금 미정산' ... })`) 옆에 `보증금 실수령 미확인` 이슈 1건 추가(tone `amber`, `go: () => goSec('v-deposit')`).
- `:288-306` `settleDeposit` — 맨 앞에 `depositLockReason` 가드 추가(`toast(reason,'error'); return;`). **서버 성공 후에만 토스트**(현재 `:296` `doTransition` → `:301` 이력 → 토스트 없음; 새 액션에도 낙관적 갱신 금지, 규격 8).
- **신규 액션 2개 추가**(같은 파일, 같은 `doTransition` 퍼널 사용):
  - `addDepositDeduction(kind, amount, memo)` → `buildDepositDeduction` 결과를 **`_charges`와 `_payments`를 한 patch에 함께** write(`:293-300` 패턴 복제). ★페어를 두 번 나눠 쓰면 그 사이 실패 시 미수가 틀어짐.
  - `refundDeposit(amount, date, method, memo)` → `lockReason(companyId, date)` 가드(T9) → `buildDepositRefund` patch write → `saveIntake('history', ...)` 이력(`:301-305` 패턴, `category: '보증금'`).
- 두 액션 모두 `requireTarget()`(`:199-203`) 선통과 필수.

**4-6. `components/vehicle-detail/panels/SettlePanels.tsx:87-103` `DepositPanel`**
- `if (!pendDeposit) return null`(`:89`) 때문에 **정산 끝난 계약의 원장을 볼 수 없음** → 종료 계약이면 항상 렌더로 변경(`pendDeposit` 없으면 요약+이력만, 액션 숨김).
- `KV rows`(`:93-100`)를 jpkerp5 5행 요약으로 확장: `계약 보증금(청구)` / `보증금 실수령` / `충당·차감 합계` / `환불 합계` / `미반환 잔액`. **`:94`의 라벨 「예치 보증금」은 삭제** — 실수령과 청구액을 한 칸에 섞는 표기임.
- 차감 내역·환불 이력 목록은 jpkerp5 `deposit-section.tsx:88-99` 레이아웃 참고(날짜·−금액·사유 1줄). **단 이건 상세 패널이지 표가 아니므로 `--ledger-row-h`·2줄셀 규격과 무관**. 표(§5)에서는 각자 컬럼으로.
- 액션 버튼은 `ended && 잔액>0 && !lockReason`일 때만(jpkerp5 `:102` 게이트와 동일). 미확인이면 버튼 대신 «보증금 실수령 미입력 — 계약 수정에서 입력» 안내.
- 위약금 원클릭 차감(jpkerp5 `:33-41`)은 **이식하지 말 것** — renman은 `buildSettlementCharges`(`lib/deposit.ts:92-101`)가 ET charge를 이미 자동 생성하므로 중복 청구가 됨(멱등 가드가 kind 단위라 수동 추가분은 막지 못함).

**4-7. `components/PrintHost.tsx` — 반납정산서 (대외문서)** ★§8 승인 필요
- `:159-160` `computeReturnSettlement(Number(c.deposit) || 0, v, ...)` → `depositBaseOf(c) ?? 0`
- `:187` `{line('예치 보증금', won(deposit))}` → **2행으로 분리**: `계약 보증금(청구)` = `Number(c.deposit)`, `보증금 실수령` = `depositBaseOf(c)`(null이면 `'미확인'`)
- `:188` `보증금 충당액` 유지(부호·색 그대로)
- **실수령 미확인이면 정산서 인쇄를 차단**하거나 문서 상단에 «보증금 실수령 미확인 — 반환액 확정 불가» 경고를 박을 것. 0원을 반환액으로 인쇄하면 `cf80190`이 막은 것과 같은 사고(모르는 값을 0으로 대외 출력).

**4-8. `lib/docs/notice-claim.ts:47-52` — 내용증명 청구액 (법적 문서)** ★§8 승인 필요
```
const offsetRecorded = hasDepositOffsetPayment(c);
const deposit = offsetRecorded ? 0 : (Number(c.deposit) || 0);
```
- `Number(c.deposit)`(청구액) → `depositBaseOf(c) ?? 0`. **받지 않은 보증금으로 상계하면 청구액이 과소 계상되어 채권이 줄어듦**(법적 문서 오류).
- `:45-48`의 이중차감 가드(`offsetRecorded → 0`)는 **그대로 유지**. 근거: 적대검증 R1 주석.
- 방향성 규율을 주석으로 박을 것: **청구문서에서 미확인은 상계 0(채권 보전) · 반환문서에서 미확인은 차단(과다 환불 방지)**.
- 영향: `lib/docs/send-notice.ts:27,56,87`이 `claim`을 계약에 기록(`noticeClaimAmount`)하고 일괄 합계를 냄 → 레거시 계약의 청구액이 **올라감**. 사장님 승인 없이 발송하지 말 것.

**4-9. `lib/notify/recipients.ts:14-17`**
`depositReceivedOf`를 `lib/contracts/deposit-ledger.ts`의 `depositBaseOf` re-export로 교체(중복 로직 제거). `:37`(`depositUnreceived`)·`:38-40`(`depositRefund`)의 `null` 취급은 **변경 금지** — `components/NotifyDialog.tsx:75-83` 잠금과 `tests/schedule-ledger.test.ts:71-77`이 걸려 있음.
`:49-51` `refund`는 이미 실수령 기준이므로 C2 반영 후 자동으로 「이미 환불한 계약은 0」이 됨(정상).

**4-10. `components/ReturnWizard.tsx:50`**
`Number(contract.deposit) || 0` → `depositBaseOf(contract) ?? 0`.
`:199` `<Row k="예치 보증금" v={won(settle.deposit)} />` → `계약 보증금(청구)` + `보증금 실수령` 2행. 미확인이면 `:202-204`의 반환액/추가청구 확정 표시 대신 «실수령 미확인» 경고. 위저드는 정산서와 **같은 숫자여야 함**(`:47` 주석 규율).

**4-11. `lib/ledger-filter-defs.ts:56-64`**
`CONTRACT_FILTER_DEFS`에 `{ key: 'depositKind', label: '보증금분류' }`, `{ key: 'depositStatus', label: '보증금상태' }` 추가. 기존 `{ key:'deposit', label:'보증금', emptyLabel:'보증금 전체' }`(`:61`)는 계약뷰 필터이므로 **건드리지 말 것**(`app/contract/page.tsx:86-90`의 `?deposit=1` 딥링크가 씀).

**4-12. `tests/row-grammar.test.ts`** — §5에서 상술

**4-13. fixture 보강** ★T5
- `tests/money-r5-r7-r8.test.ts:29` `deposit: 300_000` 바로 뒤에 `depositReceived: 300_000` 추가
- `tests/deposit-offset.test.ts:26` `deposit: 1_000_000` 뒤에 `depositReceived: 1_000_000` 추가
- **기대값(`:55-58`, `:67-74`, `:109-113` 등)은 그대로여야 함.** 하나라도 바뀌면 base 전환 구현이 틀린 것이므로 멈추고 보고할 것.

---

## 5. 표 — 「보증금 원장」

### 위치
`/contract`(계약관리)의 **4번째 뷰 탭**으로 붙임. `PillTabs`에 `보증금` 추가 = `app/contract/page.tsx:36`(`ContractSheetView` 유니온), `:302-313`(tabs), `:197-201`(frameCols 분기), `:137-155`(rows/stats 파생), `:164-182`(엑셀 title/합계줄).
**좌측 메뉴·그룹 신설 금지**(규격 9). 회차원장이 정확히 이 방식으로 들어와 있음 — 그 코드를 복제할 것.

### 열 순서 (행 문법 = 자산관리 기준)
```
1 회사명 · 2 계약번호 · 3 계약자 · 4 보증금분류 · 5 보증금상태 ·
6 계약차량 · 7 발생일 · 8 금액 · 9 보증금내용 · 10 미반환잔액
전체뷰 추가: 계약보증금(청구) · 보증금실수령 · 충당·차감합계 · 환불합계 · 수단 · 연결거래
```
- **4·5 슬롯**: `보증금분류` = `수령 / 충당 / 차감 / 환불 / 잔액` · `보증금상태` = `확정 / 미확인 / 예치중 / 미반환 / 반환완료`. 접두어 쌍 「보증금분류/보증금상태」로 `tests/row-grammar.test.ts:61-69`(같은 접두어) 통과.
- 「구분·세부·종류·이행·유형·대상」 금지 → `tests/row-grammar.test.ts:73-81` BANNED 목록에 이미 있음.
- **차감 사유·환불 메모는 신원이 아님** → `보증금내용` 칸으로 분리(규격 1). `:83-94`의 2·3번 신원 검사는 `계약번호`/`계약자`이므로 통과(금액·일자성 라벨을 2·3에 두지 말 것).
- 배지: `보증금분류`·`보증금상태`만 `<Badge tone=...>`. **행 틴트·레일 금지**(I9).

### 등록 (필수 — 안 하면 규격이 조용히 어긋남)
`tests/row-grammar.test.ts`:
- `:13-20` import 블록에 `import { DEPOSIT_LEDGER_COLS } from '@/lib/deposit-cols';`
- `:25-37` `SCREENS` 배열에 `{ name: '보증금원장', cols: DEPOSIT_LEDGER_COLS as readonly Col[] }`
- `:101-105` `files` 배열에 `'lib/deposit-cols.tsx'` (TwoLineCell 금지 검사 대상)

### 행 높이·셀 그릇
`--ledger-row-h` 30px/모바일 34px **불변**. 폰트·패딩 신규 지정 금지. 표 금액 = `money()`(₩ 없음) · 합계줄·상세 = `won()`(₩) — `components/ui/table.tsx:53,55`.

---

## 6. 게이트 (커서가 커밋 전에 반드시 통과)

```
npx tsc --noEmit                       → 0 (현재 0)
npx vitest run tests/deposit-ledger.test.ts
npx vitest run tests/deposit-offset.test.ts tests/money-r5-r7-r8.test.ts tests/row-grammar.test.ts
npx vitest run                          → 235 + 신규 (감소하면 실패로 간주)
npm run test:rules                      → 36 (변동 없어야 함 — rules 수정 없음)
```
화면 확인(dev 6006, 죽이지 말 것): `/contract` 보증금 탭 200 · 차량360 보증금 패널 · 정산서/내용증명 인쇄 미리보기.
**`npm run build` 금지.**

---

## 7. 커서가 이미 잡고 있는 파일(미커밋 39개)과의 충돌 회피

`git status`로 확인된 dirty 파일 중 이 오더가 건드리는 것:

| 파일 | 상태 | 지시 |
|---|---|---|
| `app/contract/page.tsx` | M (엑셀내보내기 오더) | **마지막에 손댈 것.** `useSheetExport`(`:164-182`)·`xl.exportItem()`(`:183-186`) 배선을 되돌리지 말 것. 보증금 탭은 회차 탭 분기 옆에 추가만 |
| `lib/master-ledger-cols.tsx` | M | **열지 말 것.** 보증금 열은 `lib/deposit-cols.tsx` 신설로 우회(§3-2) |
| `lib/contract-ops.ts` | M | **barrel re-export만 1줄 추가**(`:264-272` 블록에 `deposit-ledger` 추가). 본문 로직 무수정 |
| `lib/intake/entities.ts` | M | **수정 불필요** — `_depositRefunds`는 `_payments`/`_charges`처럼 필드 정의 없는 내부 배열임. 필드 추가 금지 |
| `lib/payments/types/contract.ts` | M | **수정 불필요** — `depositDeductions`/`depositRefunded`(`:91-95`)는 v5 잔류 타입. 쓰지도, 지우지도 말 것 |
| `components/NotifyDialog.tsx` | M | 무수정 |
| `lib/nav.ts` | M | §8-R1 (승인 필요) |
| `lib/master-ledgers.ts` | M | `numOrNull`(`:13-17`) **import만** 사용, 수정 금지 |

깨끗한(=안전한) 파일: `lib/deposit.ts` · `lib/contracts/{settlement,charges,deposit-offset}.ts` · `components/PrintHost.tsx` · `lib/docs/notice-claim.ts` · `components/ReturnWizard.tsx` · `components/vehicle-detail/**` · `lib/notify/recipients.ts` · `lib/ledger-filter-defs.ts` · `tests/**`.

---

## 8. 승인·조정 요청 목록 (커서가 임의로 하지 말 것)

- **R1. `lib/nav.ts:147` views 문구** — 계약관리 views에 `{ id:'contract-deposit', label:'보증금 원장' }` 추가 여부. 지금 커서가 같은 줄을 수정 중(`contract-schedule` 추가)이고 메뉴 IA는 사장님 승인 사항임 → **탭만 먼저 넣고 nav 문구는 대기**.
- **R2. 대외문서 문구 확정** — 반납정산서(`PrintHost.tsx:187`) 「예치 보증금」을 「계약 보증금(청구)+보증금 실수령」 2행으로 쪼개는 표기, 그리고 실수령 미확인 시 인쇄 차단 여부. 서명받는 문서라 문구 확정 필요.
- **R3. 내용증명 청구액 상향 승인** — `notice-claim.ts:48` base 전환은 레거시 계약의 청구액을 **보증금 전액만큼 올림**. 이미 발송된 건과 금액이 달라짐. 발송 재개 전 승인 필요.
- **R4. 위약금 산식 2중화 해소(별건)** — `settlement.ts:100-110` vs `domain/early-termination.ts:20-29`(만원 반올림·rate 기본값·만기 기준이 다름). 이번 오더 범위 밖. 별도 오더로 올림.
- **R5. 실수령 백필 정책** — 근거 없는 계약(충당 기록도 없음)의 `depositReceived`를 어떻게 채울지. 추정 금지 원칙상 사장님이 손으로 입력해야 함. `tools/backfill-deposit-received.ts` dry-run 목록 검토 후 결정.
- **R6. 환불 실지급과 통장 매칭** — v1은 «환불 사실»만 계약에 기록하고 `bank_tx`를 만들지 않음(규격 6). 통장 출금과의 연결(subject `보증금반환` = `lib/payments/ledger-subjects.ts:28`)은 별건. 필요하면 순서는 무조건 **bank_tx → contract**(`app/payments/page.tsx:257-262`, `:264-283` 주석 규율).

---

## 9. 금지 사항 (하나라도 어기면 롤백)

1. `depositDeductions[]`(v5 배열) 신규 사용 — T1
2. 환불·음수 금액을 `_payments`에 삽입 — T2
3. `chargeKind` 없는 충당/차감 payment 생성 — T3
4. 미반환잔액에서 차감을 별도로 또 빼기 — T4
5. `DEPOSIT_OFFSET_CHARGE_ORDER` 앞 3단(대여료→초과주행→위약금) 순서 변경·삽입
6. `legacyDepositOffsetNet` 류 **view-time 미수 차감** 부활 — `deposit-offset.ts:22-25`
7. `depositSettledDate` 같은 손편집 날짜만 보고 net 깎기 — `tests/deposit-offset.test.ts:47-60`
8. 새 자금 쓰기 경로·`bank_tx` 생성·새 API 라우트·마감 우회
9. 낙관적 갱신·무조건 성공 토스트(서버 성공 후에만 화면 갱신)
10. 표에 `TwoLineCell`·행 틴트·좌측 레일 / 행 높이·폰트 상향
11. 좌측 메뉴·그룹 추가, 리스크 4그룹 변경
12. `normPlate(x.plate) === np` 식 정확일치 조인 신규 생성 (`lib/plate.ts` 별칭 헬퍼 사용)
13. `npm run build` 실행 / dev(6006) 종료
14. `--brand: #1B2A4A` 변경

---

## 공통 규약 (전 오더 적용)

먼저 **`docs/CURSOR-SPEC-UPDATE.md`** 를 읽어라 — 규격이 여러 번 바뀌었다.

- **게이트**: `npx tsc --noEmit`=0 · `npx vitest run`(현재 **248**, 줄면 안 됨) · `npm run test:rules`=36 ·
  건드린 라우트 `curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/<경로>`=200
- 새 표를 만들면 **`tests/row-grammar.test.ts` 의 `SCREENS` 에 등록**하라.
- `npm run build` 금지(dev 6006 상시) · 메뉴·그룹 추가 금지(탭·views·필터로) · `--brand: #1B2A4A` 유지
- 열 순서 = 회사명(1)·식별자(2)·이름(3)·X분류(4)·X상태(5) · 표에서 2줄 셀 금지 · 행 높이 30/34px
- 차량번호 조인은 `lib/plate.ts` 별칭 헬퍼로(정확일치 신규 금지) · 상태 신호는 배지 색으로만
- 돈 2문서 쓰기 순서 `bank_tx → contract` · **새 자금 쓰기 경로 금지**(마감 3중 방어 우회)
- 서버 성공 후에만 화면·토스트 갱신(낙관적 갱신·무조건 성공 토스트 금지)
- **내가 잡고 있는 파일**은 손대지 말고 «요청 목록»으로 남겨라:
  `lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `lib/finance/money-status.ts` ·
  `firestore.rules` · `app/api/entities/[entity]/route.ts` · `lib/payments/duplicate-cash.ts` ·
  `lib/plate.ts` · `lib/penalty-reassign.ts` · `app/settings/page.tsx`
