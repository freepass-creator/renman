> **Claude 검수 메모 (2026-07-31)**
> 이 오더 안의 «발견된 결함 1건»(`depositReceived`가 빈 문자열 `''`로 저장돼 보증금 템플릿 잠금이
> 풀리는 문제)은 **내가 이미 커밋 `38f8628`에서 고쳤다**(`depositReceivedOf()`가 `''`·비숫자를
> «모름»으로 처리). 그 부분은 다시 건드리지 마라.
> 「이 원장은 읽기 전용 · 청구할인·수납 입력을 이식하지 마라」는 판정은 반드시 지켜라 —
> 새 쓰기 경로는 방금 세운 회계마감 서버 강제를 우회하는 구멍이 된다.

# 커서 오더 — 전 계약 회차별 청구 스케줄 원장 + 문자 발송 진입점 확대

**등급: 중요(오픈 후 회수 운영 필수)** · 작성 2026-07-31 · 대상 브랜치 `redesign/pagedef-p0`
조사 기준 커밋: `035fa58` (HEAD) · 원본 참조 `D:\dev\jpkerp5`

---

## 0. 결론 (먼저 읽어라)

| 질문 | 답 | 근거 |
|---|---|---|
| 어디에 넣나 | **계약관리 `/contract` 의 「보기」 PillTabs 에 `회차` 추가** (기본·전체·회차). 새 메뉴·페이지·그룹 0개 | `lib/nav.ts:97` 「상태·기간은 메뉴가 아니라 필터/views」 · `lib/nav.ts:147` `views:[{id:'contract-status'}]` 확장점 · 동일 패턴 선례 `app/asset/page.tsx:244-257` |
| 계산은 어디 | **`lib/contracts/schedule-ledger.ts` 신설** → `lib/contract-ops.ts` barrel 재수출 | 기존 barrel 규약 `lib/contract-ops.ts:262-265` |
| 중복계산 회피 | 회차 SSOT `contractSchedules()`(`lib/contract-ops.ts:216-249`)를 **계약당 정확히 1회** 호출. `computeContractView`·`contractMasterRow` 재호출 금지 | `contractMasterRow`(`lib/master-ledgers.ts:115`)이 이미 `computeContractView`를 돌린다 |
| 분류/상태 | **회차분류** = `정기 / 선납개시 / 일할정산 / 이월승계` · **회차상태** = `예정·연체·부분납·완료·면제`(기존 `ScheduleStatus`) | `lib/payments/types/banking.ts:61` · 라벨쌍 선례 `lib/master-ledger-cols.tsx:34,39`(자산상태/자산분류) |
| 문자 진입점 | `NotifyRecipient` 빌더를 **`lib/notify/recipients.ts`** 로 추출 → 미수관리·계약원장 상세패널·리스크「만기」우클릭·회차 상세패널 4곳 공용 | 현재 유일 생성부 `app/receivables/page.tsx:78-90` |
| 쓰기 | **이 원장은 P0 읽기 전용.** 청구할인·수납 입력은 이식하지 마라 | `f5996fc` 회계마감 서버강제 — 새 쓰기 경로는 마감 우회 구멍이 된다 |

**★발견된 결함 1건 (이 오더에 수정 포함)**: `depositReceived` 가 **빈 문자열 `''`** 로 저장될 수 있다(`components/ui/ledger-edit-panel.tsx:22` `value !== ''` 가드 → `''` 는 숫자 변환 안 하고 그대로 저장). `app/receivables/page.tsx:86` 의 `== null` 검사는 `''` 를 통과시키고 `Number('') === 0` → **보증금 템플릿 잠금이 풀리고 「보증금 0원 입금 확인되었습니다」가 발송된다.** `cf80190` 이 막으려던 바로 그 사고의 잔여 경로다.

---

## 1. jpkerp5 원본 분석 — `app/contract/schedule/page.tsx` (497줄)

무엇을 하는 화면인가 (파일 헤더 3-12행이 스스로 규정):
> 「계약 체결 시 정해진 회차별 청구 일정 + 결제 사실만 노출. 미수·회수 같은 파생 view 는 리스크관리. **여기는 SSOT 원천**」

계산 내역:

| 기능 | 원본 위치 | 내용 |
|---|---|---|
| 회차 flat 펼침 | 127-153 | `for (contracts) for (c.schedules)` → `Row{contract, schedule, seq, dueDate, charge, discount, paid, bal, status, paidAt}`, `dueDate` 오름차순 정렬 |
| 기간 스코프 | 112-125 | `periodMode = month/quarter/year/all` + `periodAnchor{y,m}` 앵커 이동. **필터 대상은 `dueDate`(납부기일)** |
| 상태 버킷 | 155-163 | `counts: Record<Bucket, number>`(all/예정/연체/부분납/완료/면제) → 칩 건수 · `rows = bucket==='all' ? all : filter(status===bucket)` |
| 합계 | 165-173 | 화면에 **보이는 rows 기준** 청구·납부·잔액 3합 → BottomBar |
| 금액 도출 | 135-137,146 | `charge = s.amount` · `discount = sumDiscounts(s)` · `paid = sumPayments(s)` · `bal = balance(s)` — 전부 `lib/payment-schedule.ts` 엔진 호출(손롤 0) |
| 회차 펼침 상세 | 376-497 | `payments[]` + `discounts[]` 를 날짜 역순 통합. 구분(입금/할인)·출처칩(계좌/카드/현금/정산/할인)·메모·등록자 |
| **txId 역참조** | 58,419,446-460 | `bankTxById = new Map(bankTx.map(t=>[t.id,t]))` → `source==='계좌' && txId` 인 입금만 자금일보 거래로 역참조해 `txDate·counterparty·account` 표시. 미링크면 「계좌 입금 (자금일보 미링크)」, `source==='정산'` 이면 「이월 정산 (실입금 아님)」 |
| 쓰기 | 68-84,470-494 | 회차 인라인 「+청구할인」 → `addDiscountEntry` + `unpaidAmount/unpaidSeqCount/currentSeq` 동기 재계산 |
| 엑셀 | 175-212 | 회사·계약번호·계약자·차량번호·`seq/termMonths`·예정일·청구·할인·납부·잔액·상태·납부완료일 |

**renman 으로 가져올 것**: flat 펼침 · 기간(dueDate) 스코프 · 상태 버킷 · 3합계 · 엑셀열 구성.
**가져오지 말 것**: 인라인 청구할인 쓰기(회계마감 우회) · `MasterPageShell/CONTRACT_SUB/BottomBar`(renman 에 없는 v5 셸) · `usePersistentState` 필터 영속(renman 은 `PeriodBar`+`LedgerFilterPanel` 규격).
**조건부**: txId 역참조 → 작업 5(선택).

---

## 2. renman 회차 데이터의 실제 형태

### 2-1. 생성 경로

`lib/contract-ops.ts:45-107` `buildContract(rec, today)` — 비공개. 계약 레코드 1건 → v5 `Contract{schedules}` 로 재구성:

1. `generateSchedules({contractDate, termMonths, monthlyRent, paymentDay, paymentTiming})` (49-56행) — `paymentDay` 없으면 25일, `paymentTiming` 없으면 선불 폴백
2. **선불 1회차 고정** (66-74행) — `선불 && schedules[0].dueDate <= today` 면 1회차를 `status:'완료'` + synthetic `source:'정산'`, memo `'선불 1회차(인도 시 납부)'`
3. **미수 분배** (76-83행) — `_carryUnpaid`(씨앗) 또는 `_paidTotal` → `distributeUnpaid(distTarget, unpaid, cutoff)`. 선불이면 **2회차부터** 분배
4. `_discounts` → `addDiscountEntry` (86-89행), `_payments` → 씨앗은 `applyPayment` FIFO / 일반은 `seq` 직접 가산 (92-104행). `chargeKind` 붙은 수납은 회차표에서 **제외**(59행, `_charges` 잔액만 깐다)

`_payments` 원소: `{seq?, date, amount, source, txId?, chargeKind?, synthetic?, kind?, memo?}` (`lib/schema/payment.ts:15`, `lib/payments/types/banking.ts:12`)
`_charges` = 추가청구(과태료·수리비 등) — **회차가 아니다**. `openChargesTotal(rec)`(`lib/contracts/charges.ts`)로 미수 헤드라인에만 합산됨.

### 2-2. 소비 경로 — 이미 있는 SSOT

**`contractSchedules(rec, today)` — `lib/contract-ops.ts:216-249`. 이것이 회차표 SSOT다. 새로 만들지 마라.**

```
buildContract → (반납 && !씨앗) applyReturnedProration → recalcContract(asOf = 반납일<오늘 ? 반납일 : 오늘)
반환: { seq, dueDate, amount, discount, paid, balance, paidAt, payments:[{date,amount,source}], method, status }
```
- 씨앗(`_carryUnpaid`) 계약은 일할 재정산 **skip** (220-221행) — B-1 이중차감 방지
- `method` 는 `kind==='deposit-offset' || memo.includes('보증금충당')` → `'보증금충당'`, 아니면 마지막 입금 `source` (229-233행)
- **현재 유일 소비자** = `components/vehicle-detail/panels/SettlePanels.tsx:9-85` `SchedulePanel` — 차량 1대의 «현재 계약» 회차표 (`vd.schedule`). 열: 회차·납부기일·청구·할인·납부·미납·납부일·수단·상태 (41행)

즉 **회차 원장 = SettlePanels 를 전 계약으로 펼친 것**. 셀 값 정의는 이미 확정돼 있으므로 새 산식 금지.

### 2-3. 순수 함수 배치 + 중복계산 회피

**둘 필 곳: `lib/contracts/schedule-ledger.ts` (신설, React 금지)** — `lib/contracts/{charges,dates,filters,patches,settlement}.ts` 와 같은 결. `lib/contract-ops.ts` 하단 barrel(262-265행)에서 재수출해 호출부는 `@/lib/contract-ops` 하나만 import.

중복 계산 차단 규칙 3개:
1. **회차 값은 전부 `contractSchedules()` 리턴을 그대로 쓴다.** `amount/discount/paid/balance/status` 재계산·재정렬 금지
2. **신원·회사는 `rec` 에서 직접 뽑는다.** `contractMasterRow`/`computeContractView` 호출 금지 — 안에서 `buildContract` 가 또 돌아 계약당 2회 재구성이 된다
3. 페이지에서 `useMemo` 의존성에 `sheetView` 를 넣어 **`view==='회차'` 일 때만** 빌드 (계약 tab 에서 헛돌지 않게)

---

## 3. 배치 결정 — 계약관리 「보기」탭 `회차` (근거 포함, 대안 기각 사유 포함)

### 채택: `app/contract/page.tsx` — `view` PillTabs `기본 · 전체 · 회차`

근거:
- `lib/nav.ts:97` — 「처리 = 예외·사건·투입 · 원장 = 확정 현재 상태 · **상태·기간은 메뉴가 아니라 필터/views**」. 회차 원장은 계약의 «기간 스코프 view» 그 자체다
- `lib/nav.ts:100-104` `MenuView{id,label,filter?}` + `lib/nav.ts:147` `contract-ledger.views:[{id:'contract-status',label:'진행·만기·리스크'}]` — views 배열이 이미 확장점으로 선언돼 있다. 여기 항목 추가는 IA 변경이 아니다
- `lib/nav.ts:59` PAGE_IA 계약관리 `layer:'ledger', assetKind:'contract'` — 회차는 계약 파생, 같은 레이어
- **UI 선례 그대로**: `app/asset/page.tsx:244-257` 이 `showColView={false}` + `view={<PillTabs 기본/전체/정비비>}` 로 **세 번째 열셋 탭**을 이미 쓴다. `app/management/page.tsx:161-177` 도 `view={<PillTabs>}`. 새 컨트롤 발명 0
- `components/ui/ledger-frame.tsx:118-132` — `view` 를 주면 기본/전체 PillTabs 는 렌더되지 않는다. 그래서 **하나의 PillTabs 에 3값**이 유일한 무충돌 배치다

### 기각한 대안

| 후보 | 기각 사유 (근거) |
|---|---|
| **자금관리 `/cash`** | 원장 축이 `CashLedgerKind = 입출금내역·계좌관리·CMS 원천내역·법인카드 원천내역`(`app/cash/page.tsx:48`) = **실제 돈이 움직인 원천내역**. 회차 청구는 아직 안 움직인 «예정»이다. `assetKind:'cash'`(`nav.ts:60`) 레이어에 계약 파생을 섞으면 원장 정의가 깨진다 |
| **자금일보 `/payments`** | `role:'work'`(`nav.ts:54`) · `FacetPage` + `Sec` 워크리스트 구조(`app/payments/page.tsx:275-453`)로 그리드 원장이 들어갈 자리가 없다. jpkerp5 헤더도 「파생 view 는 리스크관리, 여기는 SSOT 원천」이라 처리(event) 그룹과 구분함 |
| **리스크관리 `/risk`** | `RiskSheetGroup = 미완료·미납·만기·휴차`(`lib/risk-ledger.ts:25`) = 예외만. 완료·예정 회차까지 실린 전량 원장은 «챙길 예외» 정의(`app/risk/page.tsx:181`)를 위반 |
| **새 페이지 `/contract/schedule`** | 좌측 메뉴·`PAGE_IA`·`NAV_GROUPS` 3중 동기(`nav.ts:12`)가 필요 → 확정 IA 변경. `nav.ts:6,98` 「사장님 확정 — 임의 변경·추가 금지」 위반 |

기간 스코프는 **기존 `PeriodBar` 재사용**(`app/contract/page.tsx:165`). `회차` 뷰에서만 기준을 `납부기일(dueDate)` 로 바꾸고 초기값 `월간`(계약 tab 은 `전체` 유지). 월/분기/연 = `PERIODS`(`lib/finance/period.ts:4`)가 이미 전부 제공 → jpkerp5 의 periodMode/periodAnchor 손롤 이식 금지.

---

## 4. 행 문법 — 회차분류 / 회차상태

규약: 모든 행은 `회사 · 신원 · 분류 · 상태 · 수치/기한`, **분류 바로 뒤에 상태**, 라벨은 `X분류/X상태` 쌍 (선례 `lib/master-ledger-cols.tsx:34,39` 자산상태/자산분류 · `docs/CURSOR-ORDER-auth-console.md:59-64`).

| 자리 | 이 원장의 값 | 출처 |
|---|---|---|
| 회사 | `companyShort(rec.companyId)` — 열 key 는 반드시 `company` | `ExcelSheet` 가 단일회사 세션에서 자동 숨김(`components/ui/excel-sheet.tsx:~175`) |
| 신원(대상) | 계약자 + 계약차량(번호판) · 계약번호 | `rec.contractorName / plate / contractNo` |
| **회차분류** | `정기` · `선납개시` · `일할정산` · `이월승계` | 아래 판정식 |
| **회차상태** | `예정 · 연체 · 부분납 · 완료 · 면제` (그대로) | `lib/payments/types/banking.ts:61` `ScheduleStatus` — 새 상태어 발명 금지 |
| 수치/기한 | 청구·할인·납부·잔액 / **납부기일** + `연체 N일`·`D-N` | `contractSchedules()` 리턴 + `dueDate` |

### 회차분류 판정식 (재계산 없음, 전부 기존 신호)

```
선납개시 : seq === 1 && paymentTimingOf(rec.paymentTiming) === '선납'      ← contract-ops.ts:66-74 가 1회차를 인도시납부로 고정
일할정산 : discountReasons 에 '반납 일할' 포함                             ← lib/payments/returned-proration.ts:44,59-62
이월승계 : rec._carryUnpaid != null && payments 가 전부 source==='정산'      ← distributeUnpaid 의 synthetic 재구성분 (payment-schedule.ts:279,288)
정기     : 그 외
```

- `이월승계` 는 사장님이 「이 숫자 어디서 왔나」를 판별하는 핵심 신호다. 마이그레이션 재구성분과 실제 앱 수납분을 한 화면에서 구별 못 하면 원장을 신뢰할 수 없다
- `일할정산` 판정에 필요한 `discountReasons` 만 **`contractSchedules()` 에 가산 반환**(작업 1-a). 반납일 재판정으로 손롤 복제 금지
- 상태 신호는 **배지 색으로만**. 행 배경 틴트·좌측 레일 금지(`lib/work-rail.ts workRailStyle` 은 항상 `undefined` 반환 — 되살리지 마라)
- `_charges`(추가청구)는 **행으로 넣지 마라**. 회차가 아니다(`contract-ops.ts:59`). 원장 하단 stats 에 `추가청구 미결제 ₩N` 한 줄로만 표기

---

## 5. 파일별 작업 지시

### 작업 1 — `lib/contract-ops.ts` (수정, **가산만**)

**a. `contractSchedules()` 리턴 확장** (216-249행) — 2필드 추가, 기존 필드·값 변경 금지:

```ts
discountReasons: [...new Set((s.discounts || []).map((d) => String(d.reason || '')).filter(Boolean))],
payments: (s.payments || []).map((p) => ({
  date: p.date, amount: p.amount,
  source: /* 기존 보증금충당 분기 그대로 */,
  txId: (p as { txId?: string }).txId,      // ← 가산. 자금일보 역참조용(작업 5)
})),
```

**b. barrel 재수출** — 262-265행 블록에 1줄:
```ts
export { buildScheduleLedger, summarizeScheduleLedger, countScheduleStatuses, type ScheduleLedgerRow, type ScheduleKind } from './contracts/schedule-ledger';
```

`buildContract`·`computeContractView`·`deriveStatus` 는 **손대지 마라**(미수 SSOT, `tests/receivables.test.ts` 가 값을 못박고 있다).

### 작업 2 — `lib/contracts/schedule-ledger.ts` (신설, 순수·React 금지)

```ts
export type ScheduleKind = '정기' | '선납개시' | '일할정산' | '이월승계';

export type ScheduleLedgerRow = {
  id: string;              // `${contractKey}#${seq}` — rowKey
  contractKey: string;
  rec: EntityRecord;       // 상세패널·문자 대상으로 되돌아가는 유일한 손잡이
  companyId: string; company: string;
  contractNo: string; contractorName: string; contractorPhone: string;
  plate: string; carName: string;
  seq: number; seqTotal: number;         // seqTotal = schedules.length || rentalMonths
  dueDate: string;
  kind: ScheduleKind;                    // 회차분류
  status: ScheduleStatus;                // 회차상태
  charge: number; discount: number; paid: number; balance: number;
  paidAt: string; method: string;
  overdueDays: number;                   // 미납(연체·부분납)만 asOf−dueDate, 그 외 0
  dday: number | null;                   // 예정 회차만 D-N (lib/contracts/dates ddayFrom)
};

export function buildScheduleLedger(contracts: EntityRecord[], today: string): ScheduleLedgerRow[];
export function summarizeScheduleLedger(rows: ScheduleLedgerRow[]): {
  charge: number; discount: number; paid: number; balance: number;
  count: number; overdueCount: number; dueSoonCount: number;   // dueSoon = 예정 && D-7 이내
};
export function countScheduleStatuses(rows: ScheduleLedgerRow[]): Record<string, number>; // 전체+5상태
```

규칙:
- `contractSchedules(rec, today)` **계약당 1회**. `computeContractView`/`contractMasterRow` 호출 금지
- 정렬 = `dueDate` 오름차순, 동일자는 `company → contractorName → seq`
- 필터(기간·상태·검색)는 **페이지 몫**. 이 lib 은 전량 + 집계만 (`lib/receivables-ledger.ts` 가 build/count/summarize 를 한 파일에 두는 선례와 동일)
- `today` 는 `TODAY`(`lib/dashboard-consts`)를 페이지가 주입. 내부 `new Date()` 금지

### 작업 3 — `lib/master-ledger-cols.tsx` (수정, 세 번째 카탈로그 추가)

`CONTRACT_*` 블록(237-368행) 아래에 `SCHEDULE_COL_CATALOG` + `SCHEDULE_SHEET_KEYS` + `buildSheetViews`(`lib/ledger-ext.ts:72`) 로 `SCHEDULE_LEDGER_COLS` 내보내라. **열 순서 = 행 문법 그대로**:

```
company(회사명) · contractNo(계약번호) · contractorName(계약자) · plate(계약차량) ·
seq(회차 = `N/총`, align:'c') · kind(회차분류, Badge) · status(회차상태, Badge) ←분류 바로 뒤 상태
dueDate(납부기일) · charge(청구액,r) · discount(할인,r) · paid(납부액,r) · balance(잔액,r) ·
overdueDays(연체일,r) · paidAt(납부완료일) · method(수단)
```
- 셀 그릇·정렬·빈값은 기존 헬퍼 재사용: `dash`(11행) · `date`(12행) · `moneyCell`(13행) · `LEDGER_EMPTY`
- `charge/discount/paid/balance/overdueDays` 는 `sortNum: true` (금액 정렬 필수)
- 배지 톤: 완료=green · 연체=red · 부분납=amber · 예정=blue · 면제=gray. 분류 톤: 정기=gray · 선납개시=blue · 일할정산=amber · 이월승계=purple
- `text:` 를 전 열에 채워라 — 없으면 CSV·헤더필터가 죽는다(`components/ui/excel-sheet.tsx:37-39`)

### 작업 4 — `app/contract/page.tsx` (수정)

1. `type ContractSheetView = '기본' | '전체' | '회차'`, `const [sheetView, setSheetView] = useState<ContractSheetView>('기본')` — `AssetSheetView`(`app/asset/page.tsx:32,73`)와 동형
2. `view={<PillTabs size="sm" value={sheetView} onChange={...} tabs={[기본,전체,회차]} />}` + `showColView={false}` + `colView={sheetView === '전체' ? '전체' : '기본'}` — `app/asset/page.tsx:244-257` 복사
3. 회차 행:
   ```ts
   const scheduleRows = useMemo(
     () => (sheetView === '회차' ? buildScheduleLedger(contracts, TODAY) : []),
     [contracts, sheetView],
   );
   ```
   기간·상태·검색 필터는 기존 `rows` useMemo 와 같은 자리에서 별도 useMemo 로. `dueDate` 기준 `range.from/to` 비교는 `app/contract/page.tsx:119-122` 패턴 그대로
4. **`PeriodBar`** — 회차 뷰에서 `initial="월간"`, 계약 뷰는 `initial="전체"` 유지. `key={sheetView}` 를 줘서 뷰 전환 시 앵커가 새로 서게 하라
5. **상태 버킷** — 새 칩줄을 만들지 말고 `CONTRACT_FILTER_DEFS`(`lib/ledger-filter-defs.ts:56-62`)에 `{ key:'scheduleStatus', label:'회차상태' }` 를 추가하고 `options.scheduleStatus` 를 회차 뷰에서만 채워라. 헤더는 `[회사][검색][☰필터][기간]` 최소 구성 유지(`components/ui/ledger-frame.tsx:9-13`)
6. **stats** — `summarizeScheduleLedger(필터결과 전량)`: `회차 N · 청구 ₩ · 납부 ₩ · 잔액 ₩ · 연체 N`
7. **표시 상한** — `ROW_DISPLAY_CAP = 200` + `hint={<Message variant="warning">…</Message>}`. `app/cash/page.tsx:55,404-405,703-709` 복사.
   ★**합계는 잘라내기 전 전량(`rows`)으로 계산하라.** 표만 `displayRows`. 자금관리가 이 규칙을 지킨다(`app/cash/page.tsx:400-405`) — 어기면 합계가 거짓말한다
8. `error={loadError}` **유지**(219행). 회차 뷰도 조회실패를 «0건»으로 위장하면 안 된다 — `88bc479` 의 error prop 취지
9. `rowKey={(r) => r.id}` · 더블클릭 → 해당 계약의 기존 상세패널(`LedgerRecordPanel`)을 `contractMasterRow(row.rec, TODAY)` 로 열어라. 회차 전용 패널을 새로 만들지 마라
10. `MigrateDataButton` 은 `empty` 안에만(224행) — 회차 뷰 empty 문구는 「해당 기간에 도래하는 회차 없음」, 마이그레이션 버튼 노출 금지

### 작업 5 — 자금일보 역참조 (**선택 · 같은 PR 가능**)

회차 상세에서 「어느 입금이 이 회차를 냈나」를 보이려면 `bank_tx` 가 필요하다. 지연 로드 레시피:
```ts
const needTx = sheetView === '회차';
const { data: [cs = [], txs = []] } = useEntityLists(needTx ? ['contract','bank_tx'] : ['contract']);
```
(`lib/use-entity-lists.ts:27-28` 이 `keys.join(',')` 로 deps 를 안정화하므로 동적 keys 안전)
표시 문구는 jpkerp5 `app/contract/schedule/page.tsx:446-460` 을 따르되 미링크·정산 케이스를 반드시 구분해 표기(「계좌 입금 (자금일보 미링크)」/「이월 정산 (실입금 아님)」). 데이터 비용을 감당하지 않겠다면 이 작업만 빼고 나머지를 완료로 본다.

---

### 작업 6 — `lib/notify/recipients.ts` (신설) + `components/NotifyDialog.tsx` (수정)

**a. 타입 이전** — `NotifyRecipient`(`components/NotifyDialog.tsx:17-28`)를 `lib/notify/types.ts` 로 옮기고 `NotifyDialog.tsx` 에서 `export type { NotifyRecipient }` 재수출. `app/receivables/page.tsx:18` 등 기존 import 를 깨지 말 것.

> ★**`lib/notify/index.ts` barrel 을 만들지 마라.** `lib/notify/aligo.ts:1` 이 `import 'server-only'` 다. barrel 로 묶으면 클라이언트 번들에 server-only 가 끌려와 `7208d5b`(‘use client’ 모듈이 서버 그래프에 섞여 dev 정지)와 같은 사고가 난다.

**b. 공통 빌더** — `lib/notify/recipients.ts`:
```ts
/** 보증금 결측을 0으로 만들지 않는다 — lib/master-ledgers.ts:13 numOrNull 을 export 해서 재사용(복제 금지). */
export function notifyRecipient(
  rec: EntityRecord,
  money: { net: number; unpaidCount: number; currentSeq: number; monthlyRent: number; refund: number },
): NotifyRecipient;

/** 화면이 ContractView 를 안 갖고 있을 때(계약원장·리스크 만기) — computeContractView 1회. */
export function notifyRecipients(recs: EntityRecord[], today: string): NotifyRecipient[];
```
매핑은 `app/receivables/page.tsx:78-90` 을 그대로 옮기되 **보증금 2필드만 교정**:
```ts
const dr = numOrNull(rec.depositReceived);                 // '' · null · undefined · 비수치 → null
depositReceived: dr,
depositUnreceived: dr == null ? null : Math.max(0, num(rec.deposit) - dr),
```
- `rec.depositReceived === ''` 가 `0` 으로 새는 구멍(§0 결함)이 이 한 줄로 닫힌다. `0`(실제 0원 수령 기록)은 **`0` 그대로 유지** — null 로 바꾸지 마라
- `depositDue: num(rec.deposit)` 는 청구액이므로 0 허용
- `NotifyDialog` 의 잠금 로직(79-81, 161-167행)·`fill()` 의 `(미확인)` 치환(57-58행)은 **손대지 마라**. 잠금은 다이얼로그가, 진실은 빌더가 책임진다

**c. 진입점 4곳** (각 화면 recipients 생성부를 빌더 호출로 교체·신설):

| 화면 | 위치 | 대상·개수 | 기본 템플릿 |
|---|---|---|---|
| 미수관리 (기존) | `app/receivables/page.tsx:78-90` → `filtered.map((r) => notifyRecipient(r.rec, {net:r.v.net, unpaidCount:r.v.count, currentSeq:r.v.count, monthlyRent:r.v.monthlyRent, refund:r.v.refund}))` | 필터 결과 전량(현행 유지) | 미납 1차 |
| 계약원장 (신설) | `app/contract/page.tsx:266-284` `LedgerRecordPanel actions` — 내용증명 옆에 「문자」 `Btn size="sm" variant="ghost"` | **선택 1건만** | 대여료 청구 |
| 만기임박 (신설) | `app/risk/page.tsx:150-175` `ctxItems` 우클릭 메뉴에 항목 추가. 대상 = `selectedRows.filter(r => r.group==='만기' && r.kind==='만기임박' && r.contractKey)` → `contractByKey`(127-130행)로 `rec` 해석 → `notifyRecipients(recs, TODAY)` | 다중(선택 건) | 반납 임박 |
| 회차 원장 (신설) | 회차 상세패널 actions | **선택 1건만** | 대여료 청구 |

- **오발송 방지**: 계약원장·회차 원장에 「필터 결과 전체 발송」 버튼을 만들지 마라. 다중 발송은 이미 담당 화면이 있다(미수관리 = 미납 / 리스크 만기 = 임박). 중복 진입점 금지
- 리스크 「만기」 그룹에는 검사임박·보험임박 행도 섞여 있다(`lib/risk-ledger.ts:204-231`) — `kind==='만기임박'` + `contractKey` 없는 행은 **반드시 제외**. 아니면 계약 없는 대상에게 계약 문자가 간다
- 버튼 자리 규약: 대량액션 = 선택 액션바/우클릭 · 개별 = 상세패널 (`components/ui/ledger-frame.tsx:11`). `right` 슬롯(생성 CTA, solid 1개)에 문자 버튼을 넣지 마라
- 발송 후 `onSent={reload}` — 연락기록(`saveIntake('history', …category:'문자')`, `NotifyDialog.tsx:104-113`)이 화면에 반영돼야 한다

### 작업 7 — 테스트 `tests/schedule-ledger.test.ts` (신설)

`tests/receivables.test.ts:13-22` fixture 스타일 재사용. 최소 6케이스:
1. 12개월 계약 1건 → 12행, `dueDate` 오름차순, `id === 'c#1'…'c#12'`
2. 선불 계약 → `seq 1` 이 `kind:'선납개시' && status:'완료'`
3. `_carryUnpaid` 씨앗 → 도래 회차 `kind:'이월승계'`, `summarizeScheduleLedger().balance === net`(=`computeContractView` 와 불일치 금지)
4. 반납 계약 → 반납월 회차 `kind:'일할정산' && discount > 0`
5. `_charges` 만 있는 계약 → 회차 행이 늘지 않음
6. `notifyRecipient`: `depositReceived` 가 `undefined`/`null`/`''`/`'abc'` → `null` · `0` → `0` · `500000` → `500000`

3번이 이 원장의 존재 이유다 — 회차 합계가 미수 헤드라인과 어긋나면 원장이 아니다.

---

## 6. 검증 대상 6커밋과의 상호작용 (반드시 지킬 것)

| 커밋 | 이 오더에 대한 제약 |
|---|---|
| `f5996fc` 회계마감 서버강제 | **회차 원장에 쓰기(청구할인·수납)를 만들지 마라.** jpkerp5 의 인라인 할인(원본 470-494행)은 이식 금지. 쓰기는 기존 `SettlePanels`·자금일보 경로만 — 새 경로는 `moneyUpdatable`/`ensurePeriodLocksHydrated` 를 우회하는 구멍이 된다 |
| `cf80190` 보증금 null | 작업 6-b 로 잔여 구멍(`''`) 까지 닫는다. `depositReceived` 를 어떤 경로에서도 `0` 으로 채우지 마라 |
| `88bc479` error prop / Migrate 봉인 | 회차 뷰도 `error` 를 표면화(작업 4-8). `MigrateDataButton` 은 `empty` 슬롯 밖으로 나가지 않는다 |
| `247d69a` 차번 이력 승계 | 회차 행 key 는 `contractKey#seq` — **plate 를 key 로 쓰지 마라**. 임판→정식번호 계약이 두 행으로 갈라진다. 표시용 `plate` 는 현재값 |
| `ed93180` 중복 현금수납 | 회차 원장은 `_payments` 를 읽기만 한다. `findDuplicateCashPayment` 는 자금일보 소관 — 여기서 호출하지 마라 |
| `1c05cb7`/`7208d5b` 법인마스터 | 회사 표시는 `companyShort()`(`lib/companies`)만. `loadMaster()`(클라이언트 하이드레이트 대상)를 순수 lib 에서 부르지 마라 |

---

## 7. 게이트 (전부 통과해야 완료)

```
npx tsc --noEmit                                                          # 0
npx vitest run                                                            # 현재 153 통과 — 줄면 안 됨 (+ 신규 6케이스)
npx vitest run tests/receivables.test.ts tests/schedule-ledger.test.ts    # 미수 회귀 0
npm run test:rules                                                        # 36 통과 (rules 무변경이어야 정상)
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/contract     # 200
```
육안 확인 3개: ① 「회차」탭에서 기간 이동 시 합계 3값이 표에 보이는 건수와 정합 ② 상한 200 hint 가 뜨는 상태에서도 합계는 전량 기준 ③ `depositReceived` 를 지운 계약을 대상에 넣으면 보증금 템플릿 3종이 🔒 잠긴다

## 8. 금지사항

- `npm run build` 금지 (dev 6006 상시 사용). dev 서버 죽이지 말 것
- **좌측 메뉴·그룹·페이지 신설 금지.** `lib/nav.ts` 는 `ERP_MENU_TREE[contract-ledger].views` 에 `{ id:'contract-schedule', label:'회차별 청구' }` **1줄만** 추가 가능(라벨 문서화 목적). `PAGE_IA`·`NAV_GROUPS` 는 손대지 마라
- 새 상태어·새 배지 색 발명 금지. `ScheduleStatus` 5값 고정
- 행 배경 틴트·좌측 레일 부활 금지 (`lib/work-rail.ts`)
- `--brand: #1B2A4A` 남색 유지
- `lib/contract-ops.ts` 는 **작업 1의 가산 2건 + barrel 1줄**만. `buildContract`/`computeContractView` 로직 변경 금지
- `lib/notify/index.ts` barrel 생성 금지 (server-only 오염)
- 다음 파일은 잡혀 있다: `lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `firestore.rules` · `app/api/entities/[entity]/route.ts` · `lib/payments/duplicate-cash.ts`

## 9. 참고 원본

- `D:\dev\jpkerp5\app\contract\schedule\page.tsx` — flat 펼침(127-153) · 버킷(155-163) · 합계(165-173) · 엑셀열(191-210) · txId 역참조(58,419,446-460)
- `D:\dev\jpkerp5\lib\payment-schedule.ts` — 엔진. renman 은 `lib/payments/payment-schedule.ts` 로 이미 이식 완료이므로 **다시 가져오지 마라**
- renman 내부 선례: `app/asset/page.tsx:244-257`(3값 view 탭) · `app/management/page.tsx:161-177`(탭형 LedgerFrame) · `app/cash/page.tsx:400-405,703-709`(행 상한+hint) · `lib/receivables-ledger.ts`(build/count/summarize 한 파일)

---

## 공통 규약 (모든 오더에 적용 — 어기면 되돌린다)

- **게이트**: `npx tsc --noEmit`=0 · `npx vitest run`(현재 **156** 통과, 줄면 안 됨) · `npm run test:rules`(현재 **36**) · 건드린 라우트 `curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/<경로>`=200
- **`npm run build` 금지** — dev 6006 상시 구동 중.
- **메뉴 IA 변경 금지**: 좌측 메뉴·그룹 추가, 리스크 4그룹 변경은 사장님 승인 사항. 탭·뷰·필터로 해결하라.
- **`--brand: #1B2A4A`(남색) 유지** — 파랑으로 바꾸지 마라.
- **셀 그릇 SSOT**: `thX/tdX`(패딩 8/5 · 행높이 `--ledger-row-h`) · `align:'r'`=우측+tabular · 표는 `money()`(₩ 없음) · 합계·상세는 `won()`(₩).
- **상태 신호는 배지 색으로만** — `lib/work-rail.ts workRailStyle`은 항상 `undefined`를 반환한다. 좌측 레일·점·행 배경 틴트를 되살리지 마라.
- **행 문법**: 모든 행은 `회사 · 신원(대상) · 분류 · 상태 · 수치/기한`. **분류 바로 뒤에 상태**, 라벨은 «X분류/X상태» 쌍.
- **선택·액션**: 체크박스 없이 클릭·Shift·Ctrl 다중선택 + 우클릭 컨텍스트 메뉴(`components/ui/context-menu.tsx`, 참고 구현 `app/risk/page.tsx`). 우측상단 ⋯도구 메뉴는 폐기됐다.
- **서버 성공 후에만 화면·토스트를 갱신하라.** 낙관적 갱신·무조건 성공 토스트 금지(이번 주 확정 결함 다수가 이것이었다).
- **내가 잡고 있는 파일 — 손대지 마라**: `lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `firestore.rules` · `app/api/entities/[entity]/route.ts` · `lib/payments/duplicate-cash.ts` · `components/vehicle-detail/useVehicleDetail.ts` · `app/settings/page.tsx`
