# 코덱스 교차검증 의뢰 — 48058e0 교차검수 결과 (2026-08-03)

## 0. 이 문서가 뭔가

- 커밋 `48058e0`(140파일 · 5,428줄, 코덱스 작업분)에 대해 이쪽에서 적대적 교차검수를 돌렸다. **확정 9건 · 기각 19건.**
- 확정 9건 중 **2건은 이미 고쳐 push했다**(§2). **남은 7건은 안 고쳤다** — 코덱스가 직접 확인·판단하도록 남긴다(§3).
- 기각 19건도 제목만 남긴다(§4). **다시 쫓지 마라.** 재현 불가·설계상 의도로 판정된 것들이다.
- 각 항목에 «확인 절차»를 붙였다. 명령을 그대로 돌려 관찰값이 다르면 **이쪽 판정이 틀린 것이다 — 그렇게 회신해라.**

### 판정 규칙

- **검증 기준은 이 문서가 아니라 원래 요구사항이다.** 이 문서의 «권고»는 참고다. 다른 해법이 더 맞으면 그걸로 가고, 왜 그런지 적어라.
- 심각도 표기: `출시차단` = 돈·데이터가 조용히 틀어진다 / `중요` = 운영자가 오판한다 / `일반` = 신뢰도 손상.
- **«가드가 죽어 있다»가 이 저장소의 반복 유형이다.** 세 뿌리 — ① 문자열로 상태를 판정하는데 기본값이 제외값과 같다 ② void 콜백의 성공을 반환값 null 여부로 판정한다 ③ `?? 0`이 «모름»을 «0»으로 바꾼다. 아래 항목 대부분이 이 셋 중 하나다.

---

## 1. 검증 환경

| 항목 | 값 |
|---|---|
| 브랜치 | `redesign/pagedef-p0` |
| 대조 기준 커밋 | `28db76b`(교차검수 시작점) → `48058e0`(코덱스) → `78c365b` → `058c0a0`(이쪽 수정, HEAD) |
| `npx tsc --noEmit` | 0 (HEAD `058c0a0` 기준) |
| `npx vitest run` | 374 pass (HEAD 기준) |
| `npm run test:rules` | 36 pass |
| 라우트 스모크 | 16개 중 15개 200 · `/integrity`만 500 (§5) |

> ★주의 — **작업트리가 깨끗하지 않다.** 이 문서를 쓰는 시점에 커서 작업분 30파일이 미커밋 상태로 얹혀 있다(자금계획·연체조항·매칭 backlog 범위 등). 그래서 아래 줄번호는 **HEAD + 커서 미커밋 트리** 기준이다. 코덱스가 다른 시점을 보고 있으면 줄번호가 아니라 **함수명·식별자로 찾아라.**
>
> 게이트 수치는 `058c0a0` 시점의 실측값이다. 커서 미커밋분이 얹힌 현재 트리는 이쪽에서 측정하지 않았다 — 코덱스가 재측정해라.

---

## 2. 이미 고쳤다 — 다시 하지 마라

### 2.1 `058c0a0` — [출시차단] `safeUpdate`가 «성공을 실패로» 읽었다

- **뿌리**: `safeUpdate<T>`는 성공/실패를 «반환값이 null인가»로 판정한다. 그런데 자금 경로 콜백은 전부 `async () => { await commitAll([...]); }` — 값이 없다. 성공 시 `undefined`가 반환되고 `undefined != null`은 **false**. 타입이 `void | null`이라 tsc도 못 잡았고, 규격 테스트 148건도 이 경로를 안 덮었다.
- **실제 피해**: 자금일보 일괄 적용에서 누적 방어(`appliedPayments`)가 갱신되지 않아 **같은 계약에 입금 2건을 적용하면 앞 수납이 배열째 사라졌다**(미수 과대). 토스트는 「적용 0건」. 그 외 CMS 집금정산 부분 적용 고아 · 매칭 해제 토스트 미출력 · `classifyTx` 항상 실패 보고.
- **수정**: `lib/safe-update.ts`에 `safeRun(fn): Promise<boolean>` 신설(`void`·`true`=성공, `false`=콜백이 스스로 판단한 실패, 예외=toast+false). 호출부 7곳 이관 — `app/payments/page.tsx` 5곳 · `app/cash/page.tsx` 2곳 · `lib/classify-tx.ts` 1곳. 판정식 `ok != null`→`ok`, `ok == null`→`!ok`, 콜백 내부 `return;`→`return false;`.
- **규약**: **값이 없는 쓰기에 `safeUpdate`를 쓰지 마라.** `safeUpdate`는 값을 돌려주는 작업 전용이다(주석으로 박아 뒀다).
- **확인 절차**:
  ```bash
  npx vitest run tests/safe-run.test.ts        # 10 pass — «옛 판정식이면 앞 수납이 사라진다»가 테스트로 박혀 있다
  grep -rn "safeUpdate(async" app/ lib/ components/   # 결과가 있으면 그 콜백이 값을 돌려주는지 확인해라
  ```
- 이 항목은 교차검수 확정목록의 #1 · #6 · #7이 같은 뿌리였다.

### 2.2 `78c365b` — 말소·폐차 차량의 장부가가 손익 어디에도 없었다

- **결함**: 처분 차량은 자산 총계에서 빠지는데, 매각대금이 없으면(말소·폐차) `disposalGainLoss`가 `undefined`고 합계가 그걸 0으로 더했다 → **자기자본만 줄고 손익계산서에 흔적이 없다.**
- **수정**(`lib/payments/asset-ledger.ts`): 말소·폐차 = `-bookValue`(유형자산처분손실 전액) / 매각+매각가 = `매각가 − 장부가` / **매각인데 매각가 미입력 = 손실로 단정하지 않고 `salePriceMissing`으로 «불완전» 집계**. `app/financials/page.tsx`가 «매각가 미입력 N대는 미반영»을 힌트로 노출한다.
- **판단 포인트**: 매각가 0원은 «미입력»이 아니다(0원 매각도 사실이다). 테스트로 박혀 있다.
- **확인 절차**: `npx vitest run tests/asset-disposal-loss.test.ts` → 8 pass.

---

## 3. 남은 확정 결함 7건 — 코덱스가 판단해라

### [A] [출시차단] 임포트한 입금이 «분류 전»이라 입금매칭에서 통째로 빠진다 → 미수가 안 줄어든다

- **위치**: `lib/finance/cash-rules.ts:7 reducesReceivable` · `lib/payments/match-proposal.ts:70`(`buildMatchBacklog`) · `app/payments/page.tsx:125-130`
- **증상**: 통장·CMS 엑셀을 데이터센터로 투입하면 저장된 `bank_tx`의 `category`가 **빈 문자열**이다. 게이트가 `reducesReceivable(category)`이고 `/대여료|임대료|카드매출|미수금회수/.test('')` = **false** → 신규 입금 전량이 매칭 대기열에서 빠진다. 화면은 「미매칭 입금 0건」·「자동매칭 제안 없음」으로 정상처럼 보인다.
- **근거**:
  - `lib/intake/parse-tx.ts` 전체에 `category`·`subject` 대입이 **0건**이다(`parseBankRow`·`parseCmsRow` 모두). 세팅하는 건 `method`뿐.
  - `lib/intake/entities.ts:379` — `bank_tx.category`는 `manual: true` 셀렉트다. **임포트가 채우는 경로가 설계상 없다.**
  - `app/payments/page.tsx:117-123 dailyWorkRows`가 `nest === 'cms-item' | 'cms-pending'`을 제외한다 → **CMS 성공건은 계정과목을 지정할 UI 자체가 없다** → 영구 제외.
- **커서 미커밋분 반영 상태**: `requiresContractLink` → `reducesReceivable`로 갈렸고(보증금이 대여료 회차를 상계하지 않게 된 건 개선이다), `record.category || record.subject` 폴백과 `matchScope`(선택일/30일/전체)도 들어왔다. **그러나 빈 문자열 배제라는 뿌리는 그대로다.** 폴백이 붙은 `subject`도 임포트가 채우지 않는다.
- **확인 절차**:
  ```bash
  grep -n "category\|subject" lib/intake/parse-tx.ts          # method만 나온다 = 결함 확정
  node -e "console.log(/대여료|임대료|카드매출|미수금회수/.test(''))"   # false
  ```
  실제 데이터로: `/ingest`에 통장 엑셀 투입 → `/payments`에서 「미매칭 입금」 건수 확인.
- **권고 방향**: 게이트를 «분류가 끝난 것만 통과»에서 **«명시적으로 매칭 대상이 아닌 계정과목만 배제»로 뒤집어라**(미분류·CMS는 기본 포함 / 이체·기타수입 등만 제외). 판정을 자유 문자열 정규식이 아니라 `LEDGER_SUBJECTS`의 kind·그룹으로 해라. CMS 성공건은 `category` 무관하게 항상 후보에 넣어라.
- **회귀 테스트 요구**: «`category`가 빈 `bank_tx`와 CMS item이 매칭 대기열에 들어온다»를 `tests/`에 박아라. 지금은 이 경로를 덮는 테스트가 없다.

### [B] [중요] 중복차감 가드가 진입 경로에 따라 켜지고 꺼진다

- **위치**: `app/payments/page.tsx:156-158`(가드) vs `:207-262 apply()`(가드 없음)
- **증상**: `findDuplicateCashPayment`는 **`run()` 안에서만** 계산된다(기본 선택에서 제외하는 용도). `apply()`는 쓰기 직전에 중복을 재평가하지 않는다. `displayResults`가 `matchBacklog`에서 **항상** 파생되므로(`:144-147`) 「자동매칭 실행」을 누르지 않고도 제안 행이 보이고, 체크박스로 개별 선택 → 「선택 N건 적용」이면 가드를 한 번도 타지 않는다.
- **재현**: ① 차량360에서 현금 30만 수납(`_payments`에 `txId` 없음) → ② 통장 엑셀 임포트로 같은 30만 입금이 들어옴 → ③ 자금일보 「매칭 제안」에서 그 행만 체크 → 「선택 1건 적용」 → **같은 30만이 두 번 차감**되고 경고 문구는 안 뜬다.
- **근거**: `:233`의 `existing.some((p) => p.txId === r.tx.id)`는 **같은 tx 재적용 방지**일 뿐 현장수납 중복과는 무관하다. `lib/payments/match-proposal.ts`에 `duplicate-cash` import가 없다. 역방향 가드(`components/vehicle-detail/useVehicleDetail.ts` `findDuplicateBankPayment`)와 `manualMatch`의 확인대화는 살아 있다 — **일괄 경로만 구멍이다.**
- **확인 절차**:
  ```bash
  grep -n "findDuplicateCashPayment" app/payments/page.tsx    # run() 안 1곳만 나오면 확정
  ```
- **권고 방향**: `apply()` 루프에서 `crec` 확보 직후 `findDuplicateCashPayment(crec, r.tx)`를 재평가해 히트 시 건너뛰거나 개별 확인대화를 띄워라(**쓰기 시점 판정이면 진입 경로와 무관해진다**). 「매칭 제안」 행에 중복의심 배지도 같이 노출.

### [C] [중요] 미수관리 표가 행 문법 밖에 산다 + 규격 테스트가 검사조차 안 한다

- **위치**: `lib/receivables-cols.tsx:137`(`basic`) · `tests/row-grammar.test.ts:25-37`(`SCREENS`)
- **확정 규격**(사장님 승인분): `회사명(1) · 식별자(2) · 이름(3) · X분류(4) · X상태(5) · 나머지`. 라벨은 **같은 접두어 쌍**이어야 한다. 「구분」·「세부」·「종류」·「이행」·「유형」·「표시명」 금지. 신원 칸(2·3번)에 상태 라벨 금지.
- **현재**: `basic: ['company','contractState','stage','customer','plate', …]` → 2번이 「계약상태」(신원 칸에 상태) · 4번이 「고객명」(분류 아님) · 5번이 「차량번호」(상태 아님). **분류·상태 쌍이 아예 없다.**
- **더 나쁜 것**: `/receivables`는 `48058e0`에서 카드 리스트 → `LedgerFrame` 표로 전환됐는데(`app/receivables/page.tsx` `cols={RECEIVABLE_BASIC_COLS}`) `SCREENS` 11개(자산·계약·회차원장·리스크·업무·과태료·운영현황·자금관리·계좌·일정·직원)에 **미수관리가 없다** → 규격 테스트가 이 표를 아예 안 본다.
- **확인 절차**:
  ```bash
  grep -n "basic:" lib/receivables-cols.tsx
  grep -n "미수관리" tests/row-grammar.test.ts     # 0건 = 미등록 확정
  ```
- **권고 방향**: 카탈로그에 분류·상태 축을 만들어 4·5번에 놓아라 — 4번=`미수분류`(계약유지/계약종료 또는 rentalType 기반), 5번=`미수상태`(현재 「연체단계」를 개칭). 2번은 실제 식별자(계약번호), 3번은 이름(고객명). 예: `['company','contractNo','customer','미수분류','미수상태','plate','unpaid','overdueDays','unpaidCount','nextAction']`. **그리고 `SCREENS`에 '미수관리'를 등록해라** — 등록 없이 열만 고치면 다음 회귀를 또 못 잡는다.
- **참고**: 기각목록 #10·#11도 같은 «SCREENS 밖 표» 문제를 지적했지만 그건 재현 불가로 기각됐다. 이 건은 파일을 직접 읽어 확정한 것이다.

### [D] [중요] «무엇이든 올리기» 다중 업로드가 예외를 통째로 삼킨다

- **위치**: `app/ingest/page.tsx:121-147 uploadOriginals`
- **증상**: 파일 5개 드롭 중 3번째에서 `uploadToInbox` 내부 `commitSave`가 throw하면 for 루프에서 예외가 그대로 밖으로 나간다. `try`에 **`catch`가 없고** `finally`는 `setUniversalBusy(false)`만 한다 → 성공 토스트(`원본 N건 접수`)도 실패 토스트(`N건은 저장하지 못했습니다`)도 **둘 다 실행되지 않는다.** 호출부가 `void uploadOriginals(files)`라 unhandled rejection으로 끝나고 화면엔 아무 메시지도 없다. **1·2번 파일은 저장된 채 «아무 일도 없었던» 화면.**
- **근거**: 같은 파일의 `saveRecords`·`runOcr`·`onExcelFile`에는 `catch`가 있다 — **이 함수만 빠졌다.**
- **확인 절차**: `sed -n '121,147p' app/ingest/page.tsx` → `catch` 없음.
- **권고 방향**: 루프를 파일 단위 `try/catch`로 감싸 실패 건을 세고, 함수 전체에 `catch`를 달아 `원본 N건 접수 · M건 실패(사유)`를 **반드시 한 번** 토스트해라. **부분 성공은 반드시 «부분»으로 보고한다.**

### [E] [일반] 감사 Diff에 PII 마스킹이 걸려 «무엇이 바뀌었는지»가 사라진다

- **위치**: `app/audit/page.tsx:151-160`(`show`) · `:165`(`changed`) · `:171`
- **증상**: 계좌번호 `110-123-456789` → `110-987-456789` 변경이 감사 트레일에서 **«•••• 6789 → •••• 6789»**로 보인다. `changed` 판정은 원문 비교라 취소선+화살표는 그려지는데 양쪽 텍스트가 같아 감사자는 무엇이 어떻게 바뀐지 알 수 없다. 전화 `010-1234-5678`→`010-8888-5678`도 «010-●●●●-5678 → 010-●●●●-5678», 주소도 마찬가지.
- **규격 충돌**: `lib/pii.ts:3`은 «상세/편집 화면(운영자가 신원을 실제로 확인해야 하는 자리)은 원문»이라고 규정한다. **감사 Diff는 대량 스캔 지점이 아니라 단건 대조 자리다.**
- **확인 절차**: `sed -n '145,175p' app/audit/page.tsx` — `show(key, v)`가 `PII_MASKERS[key]`를 통과시키는지.
- **권고 방향**(택1): ① 감사 Diff는 원문 유지 ② 마스킹 후 두 값이 같아지면 마스킹을 풀거나 «원문 대조 필요» 배지 ③ 변경 구간을 보존하는 diff 전용 마스커를 `lib/pii.ts`에 신설해 엑셀용 마스커와 분리. **어느 쪽이든 «X→X»는 안 된다.**
- 같은 함수의 배열 접힘(`배열 N개`) 지적은 기각목록 #12에 있다 — 그건 안 쫓아도 된다.

### [F] [일반] 계약관리 «회차» 엑셀이 상위 200행만 담는데 메타줄엔 전체 합계를 적는다

- **위치**: `app/contract/page.tsx:38`(`ROW_DISPLAY_CAP = 200`) · `:154-158`(`scheduleDisplay`) · `:182-184`(`sumLine`) · `:205`(`frameRows`)
- **증상**: 회차 3,000건(청구 12억) 상태에서 「목록 엑셀로 (200건)」 저장 → 파일 2행 메타에 **«200건»과 «3,000건 기준 청구·납부·잔액 합계»가 한 줄에 같이 인쇄**된다. 받은 사람이 행을 SUM하면 메타와 전혀 안 맞는다(200/3000 ≈ 6.7%). 화면엔 «상위 200건만 표시» 경고가 있으나 **파일엔 없다.**
- **근거**: `frameRows = isSchedule ? scheduleDisplay : rows` → `LedgerFrame` → `ExcelSheet` → `onView({rows: view})`로 **잘린 200행만** export 스냅샷에 오른다. 반면 `sumLine`의 `scheduleStats`는 **잘리지 않은** `scheduleRows`로 계산된다.
- **확인 절차**: `grep -n "ROW_DISPLAY_CAP\|scheduleStats\|frameRows" app/contract/page.tsx`
- **권고 방향**: 내보내기는 잘리지 않은 `scheduleRows`를 쓰거나(표시 캡은 화면 전용), 캡 상태면 `sumLine`을 **표시분 합계**로 바꾸고 메타에 «상위 200건만 · 전체 N건»을 명시. 결정 전까지는 회차 탭 `exportItem` 비활성이 안전하다.

### [G] [이쪽 미완료] 정합성 교차검증 7종이 필터 칩으로 등록되지 않았다

- **위치**: `lib/lens-filters.ts:81-86`(`LENS_FILTERS['정합성']`) · `:149-163`(`riskKindMatch`)
- **상태**: **이쪽 작업의 미완료분이다.** `lib/integrity/doc-crosscheck.ts`의 7규칙(번호오기입·정체불명·무보험·서류미비·차종불일치·대여료불일치·연령구간상승)을 `/integrity`의 `counts`에는 넣었는데 **`LENS_FILTERS['정합성'].종류`에 칩을 등록하지 않았다** → 칩이 화면에 안 뜨고 `riskKindMatch`의 map에도 없어 매칭되지 않는다.
- **확인 절차**: `sed -n '81,86p;149,163p' lib/lens-filters.ts` — 현재 종류 칩은 7개(필수누락·만기·고아·날짜역전·미납·보험불일치·반납지남)뿐.
- **권고**: 칩 7개 추가 + `riskKindMatch`의 map에 kind 문자열 매핑 추가. **커서가 이 파일을 미커밋 상태로 만지고 있다**(연체단계 칩 추가) — 충돌 주의.

---

## 4. 기각 19건 — 다시 쫓지 마라

반박 검증(각 건 독립 검증자)에서 **재현 불가 또는 설계상 의도**로 판정된 주장들이다. 제목만 남긴다.

1. `applyCms`도 같은 오판으로 «집금 patch만 쓰고 중단» — CMS 정산이 영구 미완성으로 굳는다 *(→ §2.1에서 해소)*
2. 이 커밋이 새로 만든 3개 쓰기 경로도 «성공했는데 실패 취급» *(→ §2.1에서 해소)*
3. 자금일보 매칭 대상이 «기준일 당일 + 이미 분류된» 입금으로 좁혀져 임포트 백로그가 화면에서 사라진다 *(범위 축소 주장은 기각 — 단, «분류 전» 배제는 §3[A]로 확정)*
4. `unmatch`가 `category`를 지우기 때문에 해제한 입금이 어디에도 안 뜬다
5. 미매칭·매칭제안·매칭됨이 «기준일 하루»로 축소 — `/cash`·`/inbox` 「입금 매칭」이 항상 오늘로 열려 과거 backlog가 0건
6. 일마감이 법인카드 승인액(`card_tx`)을 계좌 출금으로 합산 — `card-item` nest 미부여로 제외 필터가 죽어 있다
7. 「일마감」이 아무것도 잠그지 않고 `cash_daily`를 읽는 화면이 없다
8. `ENTITIES` 미등록 엔티티(`cash_daily`·`atomic_event`)는 `/api/entities` 404 → 폴백 금지 목록에 404 없음
9. `attachDailyEvidence`만 `lockReason` 사전검사가 빠졌다 *(실제 차단은 store 계층이 유지)*
10. `TwoLineCell` 금지 가드가 새 열 카탈로그를 안 본다 — 하드코딩 목록에 `lib/receivables-cols.tsx` 누락
11. 경영관리 법인·임대차 표가 `SCREENS` 밖에 있고 이 커밋이 열 순서를 바꿨다
12. `buildFleetRows` 고아판정 키에 `companyId`를 넣어 `linkFleet`과 어긋난다 → 미수 이중계상 + 유령 「차량없음」 행
13. 감사 Diff의 배열 필드가 «배열 N개»로 접혀 내용 변경이 사라진다
14. «원문 엑셀» 메뉴가 확인문구와 달리 전화·주민번호는 항상 마스킹한다
15. `PII_MASKERS` 오매핑 — 엑셀에서 사업자번호가 `1234●●`, 카드 끝4자리가 `●●●●`로 파괴된다
16. «마스킹» 엑셀에 계약자명·예금주가 원문으로 나간다
17. 일마감 «계약 미연결 입금» 게이트에 보증금·카드정산 탈출구가 없다
18. 권한 변경·계정 삭제 후 `audit_logs` 쓰기 실패가 400 «실패»로 보고된다 — 화면은 옛 권한, 실제로는 hq 승격이 살아 있다
19. 계약관리 «문자» 기본 템플릿이 미납회차수를 «이번회차»로, 미기록 월대여료를 «0원»으로 인쇄한다

> 기각은 «문제가 없다»가 아니라 «이 주장의 재현 경로가 성립하지 않는다»는 뜻이다. 코덱스가 **다른 재현 경로**를 갖고 있으면 그 경로를 적어 회신해라 — 재판정한다.

---

## 5. 미해결 운영 문제 — `/integrity` 500

- 라우트 16개 중 **`/integrity`만 500**이다. 응답 본문이 21바이트 평문 = 프리렌더 실패.
- **이미 배제한 원인**:
  - 페이지 파일을 코덱스 커밋 이전으로 되돌려도 여전히 500 → **이 커밋의 코드 문제가 아니다.**
  - 모듈 단독 import는 성공 → 임포트 사이클·문법 아님.
  - 미들웨어 없음.
  - `next.config.mjs`의 `distDir` 변경은 라우팅과 무관.
- **현재 가설**: `distDir` 추가 **이전에** 돌린 QA 빌드가 dev 서버의 `.next`를 오염시켰다(`.next-qa`가 그 뒤에 생겼다). **dev 서버 재시작으로만 확정된다.**
- **주의**: `npm run build` 금지(dev 6006 상시 구동 중). 확인은 dev 재시작 후 `curl -w "%{http_code}" localhost:6006/integrity`.

---

## 6. 회신 양식

각 항목에 이 셋만 채워 주면 된다.

| 항목 | 판정 | 근거(파일:줄 또는 관찰값) | 처리 |
|---|---|---|---|
| A 임포트 입금 배제 | 확정/기각 | | 수정/보류/이견 |
| B 중복차감 경로 우회 | | | |
| C 미수관리 행 문법 | | | |
| D 다중 업로드 예외 삼킴 | | | |
| E 감사 Diff 마스킹 | | | |
| F 회차 엑셀 200행 | | | |
| G 정합성 칩 미등록 | | | |
| `/integrity` 500 | | | |

### 작업 규칙

- **커서가 30파일을 미커밋으로 만지고 있다.** 겹치는 파일(`app/payments/page.tsx` · `lib/receivables-cols.tsx` · `lib/lens-filters.ts` · `lib/finance/cash-*` · `lib/payments/match-proposal.ts`)은 손대기 전에 `git status`로 확인해라.
- 확정 스펙(메뉴 IA · 리스크 4그룹 · 행 문법 슬롯 · `--brand: #1B2A4A`)은 **사장님 승인 없이 변경 금지.**
- 게이트: `npx tsc --noEmit` 0 · `npx vitest run` 전량 pass · `npm run test:rules` 36 · 돈 화면 라우트 200.
- 실데이터(xlsx·PDF)는 **리포에 복사·커밋 금지.**
