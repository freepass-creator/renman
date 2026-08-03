# 커서 구현 오더 — GPS·서류슬롯·운영비귀속·자산전이 (redesign/pagedef-p0)

작성 기준: 2026-07-31 작업트리 실측(미커밋 42개). 아래 줄번호는 **커서가 병행 수정 중이라 밀릴 수 있으므로 앵커 텍스트를 함께 적었다** — 줄번호가 안 맞으면 앵커로 찾아라.

게이트 현재값 실측: `npx tsc --noEmit` = **0** (측정 중 `lib/finance/cash-cols.tsx:97,104`에 `values:` 배열 리터럴로 인한 일시 에러 2건이 떴다가 사라졌다 — 커서 자신의 미완 편집이다. 착수 전 반드시 재확인).

---

## 0. 공통 규칙 (4건 전부 적용)

* 금지: `npm run build` · dev(6006) 종료 · 좌측 메뉴/그룹/리스크 4그룹(`lib/risk-ledger.ts:25 RiskSheetGroup`) 변경 · 행 틴트/좌측 레일 · 표 안 `TwoLineCell` · 행높이·폰트 확대
* 새 표를 만들면 `tests/row-grammar.test.ts:25` **SCREENS 배열에 추가**. 새 열 카탈로그 파일을 만들면 같은 테스트 `:98` 파일목록에도 추가(안 넣으면 TwoLineCell 금지가 강제되지 않는다)
* 셀 그릇: `thX/tdX` · `align:'r'` = 우측+tabular · 표=`money()` · 합계·상세=`won()`
* 서버 성공 후에만 화면·토스트 (`await` 후 toast)
* 게이트: `npx tsc --noEmit`(0) → `npx vitest run`(현 235 + 신규) → `npm run test:rules`(36)

---

## ① GPS 미설치 골라내기

### 조사 결과 (확정 사실)

| 사실 | 근거 |
|---|---|
| GPS 4열은 카탈로그에 이미 있고 **`all`뷰에만** 있다. `basic`엔 없다 | `lib/master-ledger-cols.tsx:90` `ax('gpsProvider'…) ax('gpsDeviceId'…) ax('gpsInstalledDate'…) ax('gpsControl','시동제어')` / `ASSET_SHEET_KEYS.basic`(앵커 `basic: [` 17키) vs `all`의 `'gpsProvider','gpsDeviceId','gpsInstalledDate','gpsControl'` |
| 행 모델은 이미 4필드를 나른다 → 행모델 변경 불필요 | `lib/master-ledgers.ts:86-87` |
| ASSET_FILTER_DEFS는 4축(pool/quick/status/maker) | `lib/ledger-filter-defs.ts:48-53` |
| 페이지 matcher는 status·maker 2개뿐, pool/quick은 특수처리 | `app/asset/page.tsx:133-136`(`assetFilterMatchers`) · `:216-238`(onChange 분기) · `:239-248`(options) |
| **차량상세는 미설치를 완전히 숨긴다** | `components/vehicle-detail/VehicleDetail.tsx:260` `{v && (v.gpsDeviceId \|\| v.gpsProvider) ? <Sec id="v-gps" …> : null}` → GPS 없는 차는 섹션이 렌더되지 않아 «없다»는 사실도, 설치 등록 입구도 없다 |
| **미수 시동제어가 GPS를 전혀 보지 않는다** | `app/receivables/page.tsx:42` `useEntityLists(['contract','history'])` — vehicle을 로드조차 안 함. `:135-143 toggleEngine`이 GPS 무확인으로 `patchEngineLock` 실행. `lib/receivables-ledger.ts:70-79 summarizeReceivableActions`의 `lockTodo`도 GPS 무관 |
| 차량상세 시동제어도 GPS 무확인 | `components/vehicle-detail/useVehicleDetail.ts:270-286 logIgnition` — `active?._key`만 확인 |
| 제어 필요 시점 = D+3 | `lib/domain/status.ts:85-93 collectionStage` (`lock = 3`) |

### 파일별 작업 지시

**신설 `lib/domain/gps.ts`** — 순수 술어 SSOT (3곳이 공유해야 하므로 페이지에 손롤 금지)
```ts
export function gpsInstalled(v): boolean   // !!(gpsDeviceId || gpsProvider || gpsInstalledDate)
export function gpsControllable(v): boolean // gpsInstalled(v) && String(v.gpsControl) !== '불가'
export type GpsState = '설치·제어가능' | '설치·제어불가' | '미설치';
export function gpsState(v): GpsState
```
* `gpsControl` 옵션은 `['가능','불가']` 2값이다(`lib/intake/entities.ts:104`) — **빈 값을 '불가'로 취급하지 말 것**. 미입력은 «설치·제어가능»으로 낙관 처리하지 말고 `'설치·제어불가'`로 보수 처리하되, 그 이유를 UI에 「제어여부 미입력」으로 구분 표기(문구는 `gpsState` 밖에서).

**수정 `lib/ledger-filter-defs.ts:53`** (ASSET_FILTER_DEFS 끝에 push)
```ts
{ key: 'gps', label: 'GPS상태' },
```
* 5축이 된다. 필터 라벨은 «X분류/X상태» 쌍 규칙 대상이 아니다(pool='자산범위', quick='빠른필터'가 이미 그렇다) — 표 컬럼 라벨만 그 규칙을 받는다.

**수정 `app/asset/page.tsx`**
1. `assetFilterMatchers`(앵커 `status: eqFilter<AssetMasterRow>`)에 추가:
   `gps: (r, value) => gpsState(r.raw) === value` — ★`r`(AssetMasterRow)이 아니라 `r.raw`를 넘겨도 되고, row가 gps 4필드를 이미 갖고 있으니 `gpsState(r)` 로도 된다. **둘 중 하나로 통일**하고 `gpsState`의 인자 타입을 `Pick<…,'gpsProvider'|'gpsDeviceId'|'gpsInstalledDate'|'gpsControl'>`로 좁혀 양쪽 다 받게 하라.
2. `options`(앵커 `maker: assetMakers,`)에 추가: `gps: ['설치·제어가능', '설치·제어불가', '미설치']`
3. `onReset`(앵커 `setDetailFilters(emptyFilterValues(ASSET_FILTER_DEFS))`)은 이미 DEFS 기준이므로 손댈 것 없음.
4. `stats`(앵커 `보유 <b>{held}</b>`)에 `· GPS미설치 <b>{n}</b>` 추가 — 집계는 페이지 `.filter` 손롤 금지 규칙에 걸리므로 `lib/ledger-stats.ts`의 `summarizeAssetLedgerStats`에 `gpsMissing` 필드를 추가해 거기서 세라.

**수정 `lib/master-ledger-cols.tsx`**
* `ASSET_COL_CATALOG`의 GPS 4열 뒤(앵커 `ax('gpsControl', '시동제어')`)에 파생 열 추가:
```tsx
{ key: 'gpsState', label: 'GPS상태', align: 'c', priority: 2, xf: 'text',
  render: (r) => <Badge tone={gpsState(r) === '미설치' ? 'red' : gpsState(r) === '설치·제어불가' ? 'amber' : 'green'}>{gpsState(r)}</Badge>,
  text: (r) => gpsState(r) },
```
* `ASSET_SHEET_KEYS.basic` **맨 뒤에** `'gpsState'` push, `all`에도 `'gpsControl'` 뒤에 push.
  ★basic 앞쪽 5칸(`company, plate, carName, lifecycle, status`)은 절대 건드리지 말 것 — `tests/row-grammar.test.ts:51-77`이 4번=`자산분류`·5번=`자산상태`를 검증한다. 뒤에 붙이면 통과한다.
* 상태 신호는 배지 색만. 행 틴트 금지(`lib/work-rail.ts workRailStyle`은 항상 undefined 유지).

**수정 `components/vehicle-detail/VehicleDetail.tsx:260-270`**
* 조건을 `{v ? (…) : null}`로 바꿔 **미설치도 섹션을 렌더**한다.
* 미설치일 때 KV 대신 `<EmptyState variant="sec">GPS 미설치 — 미수 발생 시 원격 시동제어가 불가합니다</EmptyState>` + `<Btn variant="ghost" onClick={startEdit}>GPS 설치 등록</Btn>`.
  ★단 v-info KV rows(`:284-295`)에 GPS 필드가 없어 `startEdit`로는 GPS를 입력할 수 없다 → **GPS 4필드를 v-gps 섹션의 KV에 `editing={editInfo}` + `form`/`chg`로 인라인 편집 가능하게 붙여라**(`InfoPanel`과 동일 패턴, `saveInfo`가 `{...form}`을 통째로 patch하므로 추가 저장로직 불필요 — `useVehicleDetail.ts:311-320`).
* 시동제어 버튼(`:261` `right={active ? …}`)을 `disabled={engineLocked || !gpsControllable(v)}` 로 게이팅하고, 불가 시 사유를 옆에 11.5px `C.faint`로 표기.

**수정 `components/vehicle-detail/useVehicleDetail.ts:270-286 logIgnition`**
* 함수 진입부에 추가: `if (!gpsControllable(v)) { toast('GPS 미설치·제어불가 — 설치 등록 후 가능합니다', 'error'); return; }`

**수정 `app/receivables/page.tsx`**
1. `:42` → `useEntityLists(['contract', 'history', 'vehicle'])`
2. `toggleEngine`(`:133`) 안에서 `findVehicleByPlate(vehicles, rec.plate)`(`lib/plate.ts:74`)로 차를 찾고 `gpsControllable` false면 `toast(...)` 후 `return`.
   ★**`normPlate(v.plate) === np` 같은 정확 일치 조인을 새로 쓰지 말 것** — `findVehicleByPlate`가 `vehicleMatchesPlate`(plateHistory 폴백)를 이미 태운다.
3. **함정 동시 수정(규칙 8 위반 기존 부채)**: `:137-138`·`:141-142`가 `patch(rec, …)`를 **await 없이** 호출한 뒤 즉시 성공 토스트를 띄운다. `patch`는 async이고 실패 시 catch에서 error toast만 던진다 → 「해제했다」 토스트가 뜬 뒤 실제로는 실패해 있을 수 있다. `patch`가 성공/실패를 반환하게 바꾸고 `await` 후 분기하라.
4. `Metric`(`:181`) 옆에 `GPS 미설치 <n>대`를 추가할 경우, 집계는 `lib/receivables-ledger.ts:68-79 summarizeReceivableActions`를 확장한다. **시그니처에 `vehicles`를 추가해야 하므로 호출부(`buildReceivablesWorkbench`) 전수 확인 필수.** 부담되면 이번 오더에서는 3번까지만 하고 4번은 후속으로 남겨라(버튼 게이팅이 실제 사고 방지선이다).

### 게이트
`npx tsc --noEmit` · `npx vitest run tests/row-grammar.test.ts` (basic 앞 5칸 불변 확인) · `npx vitest run`

---

## ② 차량 서류 슬롯 확장 (할부계약서·정기검사증·GPS설치증빙·매도증)

### 조사 결과 (확정 사실 + 함정)

| 사실 | 근거 |
|---|---|
| 지금 차량 서류 2종 | `VehicleDetail.tsx:302`(`docType="vehicle"` 등록증, `recordKey={plate}`) · `:326`(`docType="insurance"`, `recordKey=curIns._key`) |
| **`panels/CarPanels.tsx`는 아무도 import하지 않는 사문(死文)** | `grep -rn "CarPanels\|InfoPanel\|RegPanel"` → 정의만 있고 사용처 0. 실사용은 `VehicleDetail.tsx`(→ `components/Vehicle360.tsx:3`이 재수출). **여기에 슬롯을 추가하면 화면에 안 나온다** |
| `_docs`는 append-only 단일 배열. **버전번호가 배열 전역**이다 | `lib/docs.ts:51` `const v = base.length ? base[base.length-1].v + 1 : 1` |
| 한 레코드에 **이미 여러 type이 섞여 있다** → 위 문제는 가설이 아니라 현행 | contract._docs에 `'handover'`(`components/DeliveryWizard.tsx:83`, `ReturnWizard.tsx:99`) + `'inbox'`(`app/inbox/page.tsx:75,85`) 공존 |
| **레거시 무타입 문서가 모든 종류에 매칭된다** | `lib/docs.ts:32` `byType = (docs, type) => type ? docs.filter((d) => !d.type \|\| d.type === type) : docs` — `!d.type`이 와일드카드. 슬롯 4개를 늘리면 옛 `fileUrl` 승격문서(`:27`)가 4개 슬롯 전부에 «첨부됨»으로 표시된다 |
| **`docPath`의 2번째 세그먼트는 `docType`이 그대로 들어간다** → 슬롯키를 주면 경로가 자동 분리된다 | `components/InfoDoc.tsx:86` `docPath(companyId, docType, recordKey \|\| 'new', file.name)` · `lib/storage.ts:41-44` `docs/{companyId}/{entityKey}/{recordKey}/{ts}_{safe}` · Drive 미러 폴더도 `parts.slice(1,-1)`(`storage.ts:14`)이므로 함께 분리된다 |
| **InfoDoc는 `lib/storage.ts` 수정 없이 새 슬롯을 그대로 받는다** | `ENTITIES[docType]` 없으면: 라벨은 `docLabel` 폴백(`InfoDoc.tsx:77`) · OCR skip(`:88` `ent?.ocrType ? … : {ok:false}`) · 배지 「OCR 없음 · 수기」(`:170`). 즉 **storage.ts·InfoDoc 변경 불필요** |
| 리스크 「서류미첨부」는 **첨부 여부와 무관하다** | `lib/home-rows.ts:105-118` — `D.ghostPlates`(«계약만 있고 차량 원장 없음») 를 `kind:'서류미첨부'`, `title:'등록증 없음'`로 발행. `:324` href → `/ingest`. `lib/risk-ledger.ts:282-285` 주석이 이 kind를 나른다 |
| 정합성 페이지의 판정 진입점 2개 | `app/integrity/page.tsx:39-84 dataChecks`(자유 추가 가능) / `:86-108 complianceItems`(주석 「checkCompliance 소비 — **새 판정 금지**」) |

### 파일별 작업 지시

**신설 `lib/vehicle-docs.ts`** — 슬롯 SSOT
```ts
export type VehicleDocSlot = { key: string; label: string; required: boolean; on: 'vehicle' | 'insurance' };
export const VEHICLE_DOC_SLOTS: VehicleDocSlot[] = [
  { key: 'vehicle',             label: '자동차등록증',   required: true,  on: 'vehicle' },
  { key: 'insurance',           label: '자동차보험증권', required: true,  on: 'insurance' },
  { key: 'vehicle_installment', label: '할부계약서',     required: false, on: 'vehicle' },
  { key: 'vehicle_inspection',  label: '정기검사증',     required: false, on: 'vehicle' },
  { key: 'vehicle_gps',         label: 'GPS 설치증빙',   required: false, on: 'vehicle' },
  { key: 'vehicle_sale',        label: '매도증',         required: false, on: 'vehicle' },
];
/** 완비도 — 상태·금융조건에 따라 «필요 슬롯»이 달라진다. */
export function requiredSlots(v, curIns): VehicleDocSlot[]
export function vehicleDocStatus(v, curIns): { have: string[]; missing: string[]; rate: number };
```
* `requiredSlots` 조건부 규칙(반드시 이렇게):
  * `vehicle_installment` — 할부일 때만. 판정은 `isCashPurchase(v.loanCashOnly)`(`lib/domain/vehicle-finance.ts`, `useVehicleDetail.ts:15`에서 이미 사용) 가 false && `loanCompany` 있음
  * `vehicle_gps` — `gpsInstalled(v)`(①의 `lib/domain/gps.ts`) 일 때만
  * `vehicle_sale` — `VEHICLE_OUT.has(v.status)`(`lib/domain/status.ts:15`) 또는 `v.saleDate` 있을 때만
  * `vehicle_inspection` — 항상(정기검사는 전차 대상)
  → 조건부로 안 하면 신차 전량이 「미비 4건」으로 뜨고 지표가 죽는다.

**수정 `lib/docs.ts` (2건 — 이걸 안 하면 슬롯 확장이 오작동한다)**
1. `:32 byType` 와일드카드 제거. `asDocs`/`latestDoc`/`docHistory`에 **`legacyType?: string`** 인자를 추가한다.
```ts
function asDocs(rec, legacyType = ''): DocVersion[]   // :27 승격 시 type: legacyType
const byType = (docs, type) => (type ? docs.filter((d) => d.type === type) : docs);
export function latestDoc(rec, type?, legacyType?)
export function docHistory(rec, type?, legacyType?)
```
   호출부 갱신: `VehicleDetail.tsx:302` → `docHistory(v, 'vehicle', 'vehicle')` · `:326` → `docHistory(curIns, 'insurance', 'insurance')`. **새 슬롯 4개는 legacyType 생략**(레거시가 새 슬롯으로 새는 것을 막는 지점).
   그 외 호출부 전수: `panels/CarPanels.tsx:41,73`(사문이지만 tsc 대상이므로 함께 고칠 것) · `panels/StatusPanel.tsx:99` · `panels/HistoryPanels.tsx:51` · `desk.tsx:47,76` · `VehicleDetail.tsx:238,592`.
2. `:51 pushDocVersion` 버전번호를 **type별 단조**로:
```ts
const sameType = base.filter((d) => d.type === type);
const v = sameType.length ? Math.max(...sameType.map((d) => d.v)) + 1 : 1;
```
   근거: 지금 구조로 vehicle 레코드에 5개 슬롯을 쌓으면 「등록증 v1 → 할부계약서 v2」가 되어 `InfoDoc.tsx:137`이 «등록증 2차 재발급»처럼 보여준다. contract._docs(handover+inbox)에는 이미 그 오염이 있다.
   **호환 주의**: 기존 데이터의 v가 재시작된다 → 「과거 버전 URL·OCR은 절대 덮어쓰지 않는다」(`lib/docs.ts:6`)는 유지되므로 데이터 손실은 없지만, 표시 v가 바뀐다. 마이그레이션 없이 진행 가능함을 주석에 남길 것.

**신설 `tests/vehicle-docs.test.ts`** — 아래 4건 최소:
1. `byType` 엄격화: type='' 레거시 문서가 `vehicle_installment` 슬롯에 안 잡힌다
2. `pushDocVersion` type별 v 단조: vehicle v1 → installment v1 → vehicle v2
3. `requiredSlots` 조건부: 현금구매 차량은 할부계약서를 요구하지 않는다 / GPS 미설치 차량은 GPS증빙을 요구하지 않는다
4. `vehicleDocStatus.rate` 경계(필요 0건이면 1.0, NaN 금지)

**수정 `components/vehicle-detail/VehicleDetail.tsx`** (등록증 InfoDoc `:299-320` 직후)
* 새 슬롯 4개를 `InfoDoc`으로 렌더. **`fields={[]}`(편집칸 없음) + `docType={slot.key}` + `docLabel={slot.label}` + `recordKey={plate}` + `companyId={target}`**.
* `onReplaceDoc`는 `useVehicleDetail.ts:341-349 onReplaceReg` 를 **슬롯키 인자를 받는 일반형으로 일반화**해서 재사용:
```ts
const onReplaceVehicleDoc = (slotKey: string) => async ({ url, ocr, reason, fields }: DocReplacePayload) => { … pushDocVersion(base, { type: slotKey, url, ocr, reason }) … }
```
  ★`onReplaceReg`의 주석 규약을 지켜라 — `commitUpdate`에 `patch`만 넘기고 **plate를 라우트 파라미터로 덮어쓰지 말 것**(`useVehicleDetail.ts:313-315`: 옛 번호 URL로 열린 화면에서 저장하면 번호가 조용히 되돌아간다).
* 등록증 섹션 헤더 옆에 완비도 배지: `<Badge tone={rate===1?'green':rate>=0.5?'amber':'red'}>서류 {have}/{need}</Badge>`.

**수정 `lib/master-ledger-cols.tsx` (자산원장 노출)**
* 카탈로그에 파생 열 추가:
```tsx
{ key: 'docComplete', label: '서류완비', align: 'c', priority: 2, xf: 'text',
  render: (r) => { const s = vehicleDocStatus(r.raw, null); … <Badge …>{s.have.length}/{…}</Badge> },
  text: (r) => `${…}` },
```
* `ASSET_SHEET_KEYS.basic` **맨 뒤**·`all` 뒤에 push (앞 5칸 불변).
* **경계 명시**: `AssetMasterRow`는 보험증권 레코드를 모른다(`lib/master-ledgers.ts:59-97`은 raw vehicle만) → **자산원장 컬럼은 «차량 레코드에 붙는 슬롯»만 센다**. 보험증권은 기존 `insuranceExpiryDate` 컬럼이 담당. `vehicleDocStatus(raw, null)` 호출 시 insurance 슬롯을 need에서 제외하도록 `curIns===null` 분기를 함수에 넣어라 — 안 하면 전차가 영구 미비로 뜬다.

**수정 `app/integrity/page.tsx`** (정합성 반영)
* `dataChecks` 안, 검사만기 루프(`:69-73` 앵커 `for (const v of vehicles) { const d = dday(v.inspectionTo)`) 직후에:
```ts
for (const v of vehicles) {
  const s = vehicleDocStatus(v, null);
  if (s.missing.length) push('mid', '서류미비', 'vehicle', v, `미비: ${s.missing.join(', ')}`);
}
```
* kind는 **반드시 「서류미비」** — 「서류미첨부」를 재사용하면 `lib/home-rows.ts:110`의 «등록증 없음(계약 고아)»와 한 kind로 뭉개진다.
* `RISK_TONE['서류미비']`가 없으면 `:181`이 `'gray'`로 폴백하므로 동작은 한다. 톤을 주고 싶으면 `components/ui`의 RISK_TONE에 추가.
* Facet 카운트(`:163 kinds` 배열)·`riskKindMatch`(`lib/lens-filters.ts`) 연결은 **요청 목록**으로 넘겨라(칩 어휘 = 규격 결정).

### 게이트
`npx tsc --noEmit` · `npx vitest run tests/vehicle-docs.test.ts` · `npx vitest run tests/document-consistency.test.ts tests/file-security.test.ts`(경로 규칙 회귀) · `npx vitest run`

---

## ③ 차량별 누적 운영비 자동 귀속

### 조사 결과 (전수 확인)

| 사실 | 근거 |
|---|---|
| 지금 비용 4항목 | `lib/asset-econ.ts:64` `cost = depreciation + insuranceCost + maintCost + loanInterest` |
| **`lib/finance/*` 전체에서 plate 사용은 딱 1곳** | `grep -rn "plate" lib/finance/` → `lib/finance/loan-schedule.ts:50` `cars.add(String(v.plate \|\| ''))` 뿐 |
| **bank_tx·card_tx에는 plate 필드가 없다** | `lib/intake/entities.ts:334-346`(bank_tx: account/txDate/amount/withdraw/balance/counterparty/memo/method) · `:347-357`(card_tx: txDate/amount/merchant/approvalNo/cardLast4/category). `CashRow`(`lib/finance/cash-ledger.ts:15-32`)에도 없음 |
| 마감월 자금 수정 차단이 **4중** | ①`lib/store.ts:421`(update) ②`:430`(remove) ③`firestore.rules:92-99 moneyUpdatable`(원래 월·옮겨갈 월 둘 다 열려야) ④`app/api/entities/[entity]/route.ts:37,102-141`(마감월 섞이면 **전량 409 거부**) |
| **자금분류 저장 경로도 원본 수정이다** | `lib/classify-tx.ts:8 classifyTx` → 마감월이면 막힌다 |
| 이중계상 축이 **2개** | ⓐ 자금 ↔ 차량이력: `components/WorkForm.tsx:169-175`가 history에 `cost: amount` 저장 → `lib/asset-econ.ts:78 maintCostOf`가 합산 ⓑ 자금 ↔ 보험/할부: `:55`(insurance.totalPremium)·`:61`(loanTotalsInRange) 이 이미 세고 있다 |
| **asset-econ의 조인이 규칙 4 위반(기존 부채)** | `lib/asset-econ.ts:31` `sameplate = String(rec.plate\|\|'') === plate` — normPlate조차 안 쓴다. `:76 maintCostOf`·`:96 fleetMaintRanking` 동일. 임판→정식번호 전환 시 손익이 0으로 리셋된다 |
| 신규 컬렉션은 rules 배포 없이 테넌트 격리를 받는다 | `firestore.rules:27-33 businessColl()`은 **denylist**(users/company_master/period_locks/audit_logs/_api_rate_limits 제외) → 새 컬렉션은 `:101-113` 범용 match에 자동 포함. **rules 변경 불필요** |

### 마감월 지출 처리 — 결론 (필수 답)

> **bank_tx/card_tx에 `plate`를 쓰는 설계는 채택 불가.** 마감월 지출은 위 4중 가드 중 어느 것도 못 통과하므로, 마감된 과거 지출은 **영구히 귀속 불가**가 된다. 게다가 그것은 규칙 6이 금지한 «새 자금 쓰기 경로»다.
>
> → **원본 무수정 + 별도 매핑 레코드(신규 엔티티 `vehicle_cost`)** 로 귀속한다. 마감월 지출도 «매핑 create»이므로 가능하다. 매핑은 `isMoneyColl`(`firestore.rules:81`) 밖이라 마감 가드에 걸리지 않고, **동시에 결산 숫자를 바꾸지 않는다**(CashRow를 만들지 않으므로 자금일보 잔액·계정과목 합계·부가세 구분에 참여하지 않는다). 결산은 여전히 bank_tx/card_tx가 정본, `vehicle_cost`는 «자산 손익 렌즈»에만 쓴다 — 이 경계를 파일 헤더 주석에 못박아라.

### 파일별 작업 지시

**수정 `lib/domain/layers.ts`** — `ENTITY_LAYER`에 `vehicle_cost: 'event'` 추가 (자산 가동 중 발생한 사건의 귀속 — 원장 아님). `entities.ts:11-12` 주석 「새 엔티티는 층 먼저」 규약.

**수정 `lib/intake/entities.ts`** — `vehicle_cost` 엔티티 정의
```ts
vehicle_cost: {
  key: 'vehicle_cost', label: '차량 운영비 귀속', layer: ENTITY_LAYER.vehicle_cost,
  source: '자금거래 귀속(수기 지정)', idFrom: 'allocKey',
  keyFields: ['txEntity', 'txKey', 'plate'],
  fields: [
    { key: 'allocKey', label: '귀속키', type: 'text', required: true },   // `${txEntity}:${txKey}:${normPlate(plate)}`
    { key: 'plate', label: '차량번호', type: 'text', required: true },
    { key: 'txEntity', label: '원천', type: 'select', options: ['bank_tx','card_tx'], required: true },
    { key: 'txKey', label: '원천 거래키', type: 'text', required: true },
    { key: 'txDate', label: '거래일', type: 'date', required: true },
    { key: 'amount', label: '귀속금액(원)', type: 'number', required: true },
    { key: 'category', label: '자금분류', type: 'text', required: true },
    { key: 'memo', label: '내용', type: 'text' },
  ],
},
```
* `allocKey` 자연키가 **같은 거래를 같은 차에 두 번 귀속하는 것을 구조적으로 막는다**(dedup 1차선).
* `plate`는 정규화 전 원문을 보관하되 `allocKey`에는 `normPlate` 적용.

**신설 `lib/asset-cost-alloc.ts`** — 귀속 순수 로직
```ts
/** 차량 귀속 가능한 자금분류 화이트리스트.
 *  ★보험료·할부·리스료·차량매입은 제외 — asset-econ이 insurance.totalPremium(:55)·
 *    loanTotalsInRange(:61)·acquisitionPrice(:44)로 이미 세고 있어 넣으면 즉시 이중계상. */
export const ALLOCATABLE_SUBJECTS = ['정비·수리비', '과태료·범칙금', '세금·공과', '지급수수료', '기타지출'];
export function isAllocatable(category: string): boolean
export function allocKeyOf(txEntity, txKey, plate): string
/** 별칭 조인으로 그 차의 귀속 합계. */
export function allocatedCostOf(aliases: ReadonlySet<string>, allocs: EntityRecord[]): number
/** 이력 손입력 ↔ 자금 귀속 중복 후보. duplicate-cash 패턴 재사용. */
export function duplicateAllocSuspects(history: EntityRecord[], allocs: EntityRecord[]): Array<{ historyKey: string; allocKey: string; reason: string }>
```
* `ALLOCATABLE_SUBJECTS` 라벨은 `lib/payments/ledger-subjects.ts:16-25`의 지출 10종에서 **문자열을 그대로 가져와야 한다**(하드코딩 오타 시 조용히 0원 귀속). 가능하면 그 배열에서 code로 필터해 파생하라.
* `duplicateAllocSuspects` 판정 규격: 같은 차 + `|date 차 ≤ 3일|` + 금액 동일 → 후보. 기존 패턴 `lib/payments/duplicate-cash.ts findDuplicateBankPayment`(이미 `useVehicleDetail.ts:369`에서 사용 중)와 같은 모양으로 만들 것 — **새 판정 방식을 손롤하지 말 것**.

**수정 `lib/asset-econ.ts`** (2건, 순서 중요)
1. **먼저 조인을 별칭으로 교체** — 새 항목을 붙이기 전에 해야 한다:
   * `:31 sameplate` 삭제 → `plateAliasesOf(vehicle)`(`lib/plate.ts:45`) 로 별칭집합을 만들고 `inPlateAliases(aliases, rec.plate)`(`:68`) 로 판정.
   * `assetEconomics`(`:35`)·`maintCostOf`(`:76`)·`fleetMaintRanking`(`:91`) 3곳 전부.
   * `maintCostOf(plate, history)` 시그니처가 `plate: string`이라 별칭을 못 받는다 → `maintCostOf(aliases: ReadonlySet<string>, history)` 로 바꾸고 호출부 전수(`app/asset/page.tsx:100 fleetMaintRanking`, `master-ledger-cols` maint 열)를 확인.
   * `fleetMaintRanking`은 vehicles를 받으니 차량별로 `plateAliasesOf(v)`를 만들면 된다.
2. `AssetPnL`에 `allocatedCost: number`·`duplicateSuspects: number` 추가, `cost` 합에 `allocatedCost` 포함. `assetEconomics` 인자에 `allocs: EntityRecord[] = []` 추가(기본값 → 기존 호출부 무영향).

**수정 `components/vehicle-detail/useVehicleDetail.ts`**
* `useEntityLists`(`:79-80`)에 `'vehicle_cost'` 추가 → `assetEconomics(v, contracts, insurances, history, TODAY, undefined, allocs)`(`:207`).
* 귀속 목록은 `matchesPlate`(`:109-112`) 재사용 — 이미 별칭 기반이다.

**수정 `components/vehicle-detail/VehicleDetail.tsx:430-441` (v-econ)**
* KV rows에 `['귀속 운영비','',won(econ.allocatedCost)]` 추가. `duplicateSuspects > 0`이면 그 아래 `<Message variant="warning">중복계상 의심 {n}건 — 차량이력과 자금 귀속에 같은 지출이 있습니다</Message>`.

**수정 `lib/finance/cash-cols.tsx`** ⚠️ **커서가 지금 이 파일을 편집 중이다(측정 중 `:97,104` tsc 에러 관측)** — 착수 전 `git diff lib/finance/cash-cols.tsx` 확인.
* 카탈로그에 추가:
```tsx
{ key: 'allocPlate', label: '귀속차량', priority: 3,
  render: (r) => allocPlatesOf(r) || LEDGER_EMPTY.dash, text: (r) => allocPlatesOf(r) },
```
* `CASH_SHEET_KEYS.all`에만 push(basic은 이미 14열 — 열 억제). `basic` 앞 5칸(`company, acctName, party, cat, match`) 불변 — `tests/row-grammar.test.ts`가 4번=`자금분류`·5번=`자금상태`를 검증한다.
* ★`CashRow`에 귀속 정보를 얹으려면 `buildCashLedger`(`lib/finance/cash-ledger.ts:210`)가 allocs를 알아야 한다. **`CashRow` 타입을 오염시키지 말고**, 페이지에서 `Map<recKey, plates[]>`를 만들어 컬럼 render에 주입하는 형태(클로저 팩토리 `cashColsWithAlloc(allocMap)`)를 쓰라. 이유: `buildCashLedger`는 자금일보·집금 중첩 계산의 SSOT라 인자를 늘리면 파급이 크다.

**수정 `app/cash/page.tsx`** — 귀속 UI
* 컨텍스트 메뉴(`ContextMenu` 패턴은 `app/asset/page.tsx:339-345` 참조)에 「차량 귀속」 추가 → 선택 행의 `category`가 `isAllocatable` 이 아니면 `toast('이 자금분류는 차량 귀속 대상이 아닙니다', 'info')` 후 중단.
* 저장은 `saveIntake('vehicle_cost', target, [{ allocKey, plate, txEntity, txKey, txDate, amount, category, memo, companyId }])`.
  ★**원본 bank_tx/card_tx는 절대 patch하지 말 것.** 「귀속했다」 표시를 원본에 쓰고 싶어도 금지 — 그 순간 마감월 지출 귀속이 막히고 규칙 6을 깬다. 표시는 매핑 레코드에서 파생한다.
* 차량 선택은 `FieldType 'vehicle-picker'`(`lib/intake/entities.ts:15`)가 이미 있으니 그 컴포넌트를 재사용.
* `await` 성공 후에만 toast·목록 갱신.

**신설 `tests/asset-cost-alloc.test.ts`**
1. `allocKeyOf` 멱등: 같은 거래·같은 차 두 번 귀속 → 같은 키(중복 저장 불가)
2. `isAllocatable('보험료') === false` · `isAllocatable('할부·리스료') === false`(이중계상 방지)
3. `allocatedCostOf` **별칭 조인**: 임판 `01가1234` 로 귀속된 지출이 정식번호 `123가4567`(plateHistory에 임판 보유) 차량 손익에 계속 잡힌다
4. `duplicateAllocSuspects`: 같은 금액·2일 차 → 후보 1건 / 8일 차 → 후보 0건
5. `assetEconomics`가 `allocs` 미지정 시 기존 값과 동일(회귀 없음)

### 게이트
`npx tsc --noEmit` · `npx vitest run tests/asset-cost-alloc.test.ts tests/plate-history.test.ts` · `npm run test:rules`(신규 컬렉션이 테넌트 격리를 받는지 — rules 파일 무변경이지만 회귀 확인) · `npx vitest run`

---

## ④ 자산 상태전이 게이팅

### 조사 결과

| 사실 | 근거 |
|---|---|
| status 자유 변경 실경로 | `app/asset/page.tsx` `ASSET_CREATE_SECTIONS`의 `'등록·상태'` fields에 `'status'`(앵커 `fields: ['plate', 'status', 'carName'`) → `LedgerCreatePanel`(`:305`)·`LedgerEditPanel`(`:315`). 옵션 13종은 `lib/intake/entities.ts:76-77` |
| 차량상세 v-info KV엔 status가 없다 → 실질 경로는 위 하나 | `VehicleDetail.tsx:284-295` |
| **`LedgerEditPanel`은 `commitUpdate`를 타지 않는다** | `components/ui/ledger-edit-panel.tsx:95` `await getStore().update(entityKey, targetCompany, docKey, next)` → `lib/commit.ts:48-60 assertLegalContractStatus`(계약 부활 차단)조차 이 패널을 통과한다. **가드를 commitUpdate에만 넣으면 즉시 우회된다** |
| 유일한 공통 초크포인트 = `AuditingStore.update` | `lib/store.ts:418-425` — `before`를 이미 fetch(`:420`), `assertMoneyMutable`(`:421`)이 여기 있고, 보정 패치 머지 패턴(`carryPlateHistory`, `:422-423`)도 여기 있다 |
| **생성 경로에는 before가 없다** | `lib/store.ts:403-417 save` — from=''이면 `canSetStatus` 계열은 「최초 설정 허용」(`lib/domain/status.ts:55`)으로 통과한다 → 생성 시 바로 `status:'운행'` 우회 가능 |
| 계약측 패턴(그대로 복제할 대상) | `lib/domain/status.ts:32-43`(TRANSITIONS/canTransition/nextStatus) · `:45-57`(canSetStatus 백스톱 + 「왜 백스톱이 필요한가」 주석) · `lib/commit.ts:48-60`(커맨드층 assert) · `tests/transitions.test.ts:8-60`(canTransition 6케이스 + canSetStatus 3케이스) |
| **saleDate 없으면 감가가 계속 흐른다** | `lib/payments/asset-ledger.ts:103-104` `disposed = !!v.saleDate \|\| VEHICLE_OUT.has(status)` / `cutoffDate = disposed && v.saleDate ? v.saleDate : asOfDate` — status만 '매각'이고 saleDate가 없으면 disposed=true인데 cutoff=today → 매각 후에도 감가 누적. 그리고 `disposalGainLoss`는 `salePrice !== undefined` 일 때만(`:136`) → `lib/master-ledgers.ts:95-96`이 그 값을 원장 「장부가/처분손익」 컬럼으로 내보낸다 |
| 보험 판정에 쓸 값은 vehicle denorm에 있다 | `lib/intake/entities.ts:99 insuranceExpiryDate` · 판정 선례 `lib/compliance.ts:38-43` |

### 파일별 작업 지시

**신설 `lib/domain/asset-transitions.ts`** — `lib/domain/status.ts:29-57`과 **같은 모양**으로 (별도 스타일 금지)
```ts
/** 자산(차량) 상태 머신 — status.ts 계약 머신과 동일 규약. 옵션 13종 = entities.ts:76-77. */
export const ASSET_ADVANCEABLE: Record<string, string[]> = { … };
/** 처분완료(VEHICLE_OUT) → 보유·운행 부활 금지. no-op·최초설정·미설정은 허용. */
export function canSetAssetStatus(from: unknown, to: unknown): boolean

export type AssetGateResult = { ok: true; patch?: EntityRecord } | { ok: false; reason: string };
/** «운행»·«상품대기»로 올릴 요건: 보험 유효 + 등록증 입력.  «매각/말소/폐차»: saleDate 자동 스탬프. */
export function gateAssetStatus(before: EntityRecord | null, patch: EntityRecord, today: string): AssetGateResult
```
* 요건 판정은 **vehicle 레코드 자체 필드만** 본다: `insuranceExpiryDate`(≥ today) · `vin` && `firstReg`(등록증 입력). **store 안에서 insurance 엔티티를 크로스 조회하지 말 것**(순환 import·성능·`ALL_COMPANIES` 분기 지옥).
* 매각 스탬프: `to ∈ VEHICLE_OUT`(`lib/domain/status.ts:15`) 이고 `patch.saleDate`·`before.saleDate` 모두 없으면 `{ ok: true, patch: { saleDate: today } }` 를 반환(**throw 아님** — 감가 컷오프가 목적이다).
* `salePrice` 미입력은 차단하지 말 것 — `asset-ledger.ts:136`이 undefined면 처분손익을 «미산출»로 두는 것이 정상이다.

**수정 `lib/store.ts:418-425 AuditingStore.update`** — `assertMoneyMutable`(`:421`) **바로 아래**에:
```ts
const gate = gateAssetStatus(entityKey === 'vehicle' ? (before as EntityRecord) : null, patch, todayKST());
if (!gate.ok) throw new Error(gate.reason);
const carried = carryPlateHistory(entityKey, before, patch);
await this.base.update(entityKey, companyId, key, { ...patch, ...(gate.patch || {}), ...carried, ...stampUpdateFields() });
```
* 오늘 날짜는 `lib/contracts/dates.ts todayKST()`(`lib/compliance.ts:4`가 쓰는 것) 사용 — `TODAY`(`lib/dashboard-consts`)는 클라 상수라 store에서 import하지 말 것.
* **`save`(`:403-417`)에도 요건 게이트만** 적용: `before`가 없으니 부활금지는 무의미하고, 「생성 즉시 운행」 우회만 막으면 된다. `gateAssetStatus(null, rec, today)`가 그 케이스를 처리하도록 설계.
* 실패 메시지가 그대로 사용자에게 보인다 — `components/ui/ledger-edit-panel.tsx:100`이 `error.message`를 toast한다. 그러므로 reason은 **행동 지시형**으로: `보험만기가 지났거나 미입력입니다(2026-06-30) — 보험 갱신 후 «운행»으로 전환하세요`.

**수정 `lib/commit.ts:62-69 commitUpdate`** — 계약과 대칭으로 `assertLegalAssetStatus`도 추가(store가 이미 막지만, 계약이 `assertLegalContractStatus`를 커맨드층에 둔 것과 같은 이중 방어). 새 판정 로직을 만들지 말고 `gateAssetStatus`를 호출만 할 것.

**신설 `tests/asset-transitions.test.ts`** — `tests/transitions.test.ts`의 describe 구조를 그대로 복제
1. `canSetAssetStatus('매각','운행') === false` · `('말소','휴차') === false` · `('폐차','운행') === false`
2. `canSetAssetStatus('휴차','운행') === true` · `('', '등록대기') === true` · `('매각','매각') === true`(동일=허용)
3. `gateAssetStatus` — 보험만기 경과 차량을 '운행'으로 → `ok:false` / 유효 보험 + vin·firstReg 있음 → `ok:true`
4. `gateAssetStatus` — `vin` 없음(등록증 미입력)을 '운행'으로 → `ok:false`
5. `gateAssetStatus` — '매각'으로 전환 시 `patch.saleDate === today` 자동 스탬프 / 이미 saleDate 있으면 덮어쓰지 않음
6. **감가 컷오프 연계**: 스탬프된 saleDate로 `computeAssetLedgerEntry`(`lib/payments/asset-ledger.ts:95`)를 태우면 `monthsHeld`가 매각일에서 멈춘다(saleDate 없을 때보다 작다)
7. 생성 경로: `gateAssetStatus(null, { status: '운행', … 보험만기 없음 })` → `ok:false`

**선택(권장) `app/asset/page.tsx`** — 미리 막기
* `ASSET_CREATE_SECTIONS`의 status는 `entities.ts`의 select 옵션 13종을 그대로 쓴다 → 옵션 필터링은 `FormGrid`가 엔티티 필드를 직접 읽으므로 페이지에서 못 좁힌다. **UI 선제 차단은 이번 오더 범위 밖**으로 두고, store 게이트 + 행동 지시형 메시지로 충분하다고 판단하라. (억지로 옵션을 좁히려 `entities.ts` options를 동적화하면 OCR·엑셀 템플릿 파생까지 흔들린다 — `lib/intake/entities.ts:1-8`)

### 게이트
`npx tsc --noEmit` · `npx vitest run tests/asset-transitions.test.ts tests/transitions.test.ts tests/plate-history.test.ts tests/core-workflow.e2e.test.ts` (store 초크포인트를 건드리므로 e2e 필수) · `npx vitest run` · `npm run test:rules`

---

## 함정 요약 (근거 있는 것만)

1. **`panels/CarPanels.tsx`는 사문** — import 0. 화면은 `VehicleDetail.tsx`(→`components/Vehicle360.tsx:3`). 여기 고치면 아무 일도 안 일어난다.
2. **`LedgerEditPanel`은 `commitUpdate`를 우회**(`ledger-edit-panel.tsx:95`) — 가드는 `lib/store.ts` 초크포인트에.
3. **`lib/docs.ts:32`의 `!d.type` 와일드카드** — 슬롯을 늘리는 순간 옛 문서가 새 슬롯 4개에 전부 «첨부됨»으로 뜬다.
4. **`lib/docs.ts:51`의 전역 버전번호** — contract._docs(handover+inbox)에 이미 오염이 있다. type별 단조로 바꿔야 한다.
5. **bank_tx/card_tx에 plate 추가 = 마감월 지출 영구 귀속불가** (`firestore.rules:92-99` + `api/entities/[entity]/route.ts:122-141` 전량 409). 매핑 엔티티로 우회하고 원본은 read-only.
6. **`lib/asset-econ.ts:31`은 normPlate조차 안 쓴다** — 새 비용을 붙이기 전에 별칭 조인으로 교체. 안 하면 임판→정식번호 차량 손익이 0으로 리셋된다.
7. **`app/receivables/page.tsx:137,141`은 await 없이 성공 토스트** — 규칙 8 위반 기존 부채. ①에서 함께 고칠 것.
8. **`saleDate` 없는 '매각'은 감가가 계속 흐른다**(`asset-ledger.ts:104`) — 자동 스탬프의 실제 이유.
9. **자금 이중계상 축은 2개** — 이력(WorkForm `cost`)만 막고 보험료·할부료를 화이트리스트에서 안 빼면 여전히 이중.
10. **커서가 동시에 만지는 파일**: `lib/master-ledger-cols.tsx` · `app/asset/page.tsx` · `app/receivables/page.tsx` · `lib/master-ledgers.ts` · `lib/finance/cash-cols.tsx` · `components/ui/excel-sheet.tsx`(`values?:` 신규 프로퍼티 추가 중). 착수 직전 `git diff <파일>` 확인.
11. `lib/receivables-ledger.ts:6`이 `@/lib/collection`을 import하는데 `collectionStage`는 `lib/domain/status.ts:85`에도 있다 — **어느 쪽이 SSOT인지 확인 전엔 둘 다 건드리지 말 것**.

---

## 요청 목록 (규격·SSOT·테스트 = 내 소관 — 커서가 직접 고치지 말고 승인 요청할 것)

| # | 대상 | 요청 내용 | 왜 |
|---|---|---|---|
| R1 | `tests/row-grammar.test.ts:25 SCREENS` / `:98 파일목록` | 신설 열 카탈로그가 생기면 등록 | 규격 강제 장치. 등록 안 하면 조용히 어긋난다 |
| R2 | `app/integrity/page.tsx:176` | 컬럼 라벨 `'대상'` — 행 문법 금지어인데 SCREENS 밖이라 테스트가 안 잡는다. 「차량번호/계약자」로 쪼개고 SCREENS에 편입할지 결정 | ②에서 이 파일을 열게 되므로 그때 드러난다 |
| R3 | 리스크 kind 어휘 | 「서류미비」를 `lib/lens-filters.ts riskKindMatch` · `app/integrity/page.tsx:163 kinds` · `RISK_TONE`에 넣을지. 리스크 4그룹(`risk-ledger.ts:25`)은 불변 전제 | 칩 어휘는 사장님 승인 사항(규칙 9 인접) |
| R4 | **④ 빈 값 정책** | 「보험만기 미입력」·「vin 미입력」 차량을 '운행'으로 못 올리게 하면 **기존 데이터가 광범위하게 막힐 수 있다**. (a) 값 없음도 차단 (b) 만료된 경우만 차단 — 어느 쪽? | 마이그레이션 리스크. 실데이터 카운트 후 결정해야 함 |
| R5 | **③ 마감월 귀속 정책** | 매핑 레코드는 마감을 안 받는다는 설계가 맞는가 = 「마감월 지출도 사후 차량 귀속 허용」. 결산 숫자를 안 바꾸므로 무해하다는 판단인데, 감사 관점 승인 필요 | 회계마감의 의미 경계 |
| R6 | `lib/docs.ts` v 재번호 | type별 단조로 바꾸면 기존 데이터의 표시 v가 바뀐다(데이터 손실은 없음). 마이그레이션 없이 진행 승인 | 감사 추적 표시 변경 |
| R7 | `firestore.rules` | 자산 상태전이 서버 강제는 이번 범위 밖(클라 초크포인트 + 테스트만). rules 배포 시점에 함께 넣을지 | rules 배포는 별도 게이트(`renman-open-gate` 잔여 항목) |
| R8 | `lib/asset-econ.ts` 조인 교체 | `sameplate` → 별칭 조인은 **손익 숫자가 바뀔 수 있는 변경**이다(번호 바꾼 차의 비용이 이제 잡힌다). 사전 영향 카운트 필요 | 지표가 조용히 움직인다 |
| R9 | `lib/receivables-ledger.ts` vs `lib/collection.ts` | `collectionStage` SSOT 중복 정리 | 함정 11 |

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
