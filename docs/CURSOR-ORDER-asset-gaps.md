> **Claude 검수 메모 (2026-07-31)**
> 자동차세·매각 입력·계약번호 발번 3건. 계약번호 발번은 **원자 카운터(runTransaction)**로만 만들어라 —
> 중복 번호가 나오면 그 번호로 인쇄된 내용증명·정산서가 서로 다른 계약을 가리키게 된다.
> 매각 상태 전이 시 `saleDate` 자동 스탬프를 빼먹지 마라(감가가 매각 후에도 계속 굴러 장부가가 왜곡된다).

조사 완료. 아래가 커서 오더 초안(파일별 지시)이다.

---

# 커서 오더 — 자산·계약 입력 공백 3건

브랜치 `redesign/pagedef-p0` 기준. 조사만 수행했고 코드는 손대지 않았다.

## 0. 공통 제약 (3건 전부에 적용 — 위반 시 반려)

**0-1. 라벨 쌍 규약 — 분류(파생) vs 상태(입력)를 섞지 말 것**

| 축 | 라벨 | 값 | 저장 여부 | SSOT |
|---|---|---|---|---|
| 자산 | **자산분류** | 구매예정·보유중·처분예정·**처분완료** (4값) | ❌ 파생 전용 | `lib/domain/asset-lifecycle.ts:16` `assetLifecycle(status, disposed)` |
| 자산 | **자산상태** | 구매대기…**매각**·말소 (13값) | ✅ 입력 | `lib/intake/entities.ts:76-77` |
| 계약 | **계약분류(대여형태)** | 셀프·보험·월렌트·장기·업무용·기타 | ✅ 입력 | `lib/schema/contract.ts:13` `RENTAL_TYPES` |
| 계약 | **계약상태** | 대기·운행·반납·해지·채권 | ✅ 입력 | `lib/intake/entities.ts:292` |

→ **오더 지시문의 "상태를 '처분완료'로"는 잘못된 표현이다.** `'처분완료'`는 자산**분류**의 파생값이고, 사용자가 고르는 자산**상태**는 `'매각'`(또는 `'말소'`)이다. 자동 스탬프의 방아쇠는 `status === '매각'`이며, `'처분완료'`를 레코드에 쓰는 코드를 만들면 안 된다.

**0-2. 셀 그릇 SSOT** — 새 컬럼은 반드시 `master-ledger-cols.tsx`의 `ax()`/`cx()` 팩토리로만 정의. `align:'r'`을 주면 `excel-sheet.tsx:266,353`이 `thXR`/`tdXR`(tabular-nums·NUM 폰트)를 자동 적용한다. 손롤 `<td style>`·인라인 우측정렬·자체 숫자 포맷 금지. 금액은 `{ money:true, align:'r' }`, 개월·건수는 `{ num:'개월', align:'r' }`, 날짜는 `{ date:true }`.

**0-3. 리스크 4그룹 확정 스펙 불변** — `lib/risk-ledger.ts:25` `RiskSheetGroup = 미완료|미납|만기|휴차`. `GROUP_TONE`(:53)·`GROUP_RANK`(:60)·`RiskGroupCounts`(:289)에 키 추가 금지.

**0-4. 자산 필드 1개 추가 = 6곳 동시 수정** (하나 빠지면 화면에서 사라짐)
1. `lib/intake/entities.ts` `ENTITIES.vehicle.fields` — 필드 정의
2. `lib/master-ledgers.ts` `AssetMasterRow` 타입 + `assetMasterRow()` 매핑
3. `lib/master-ledger-cols.tsx` `ASSET_COL_CATALOG`에 `ax()`
4. `lib/master-ledger-cols.tsx` `ASSET_SHEET_KEYS.all`에 key
5. `lib/master-ledger-cols.tsx` `ASSET_DETAIL_DEFS` 해당 섹션 keys (표시)
6. `app/asset/page.tsx` `ASSET_CREATE_SECTIONS` (입력)

---

## 오더 ① 자동차세 납기 추적

### 조사 결론

- **`lib/intake/entities.ts` vehicle 필드 90개 전수 확인 — 세금 관련 필드 없음.** 있는 것은 취득세 계열(`consumerPrice`/`optionPrice`/`optionDiscount`/`taxExempt` → `lib/domain/vehicle-tax.ts` **개별소비세·취득세 계산용**)뿐이다. `vehicle-tax.ts`는 취득 1회성 세금이라 **연 2회 보유세(자동차세 정기분)와 무관** — 재사용 대상 아니다.
- 유일한 흔적: `lib/payments/types/contract.ts:134` `vehicleTaxDueDate?: string; // 자동차세 납부일`. **v5 이식 타입에 이름만 예약돼 있고 엔티티·화면·엔진 어디에도 연결 안 됨.** 게다가 자동차세는 차의 속성인데 Contract에 붙어 있다(잘못된 소속). 키 이름만 승계하고 vehicle로 옮긴다.
- `/desk`는 `app/desk/page.tsx`에서 `/risk`로 redirect다. `lib/agenda-cols.tsx`(AGENDA_BASIC_COLS 등)는 **아무도 import하지 않는 죽은 코드** → 일정 원장 쪽 작업 불필요.
- `buildAgenda`의 소비자는 `lib/risk-ledger.ts:101,131` **단 한 곳**뿐이다.

### ①-A `lib/intake/entities.ts` — vehicle fields

`saleDate`/`salePrice` 블록(105-107행) **바로 위**에 새 블록 추가:

```
// ── 자동차세(보유세 정기분 6월·12월 / 연납 1월) — 등록증에 없음 → 수기 ──
{ key: 'vehicleTaxDueDate',  label: '자동차세 납기', type: 'date',   manual: true, note: '다음 납부기한. 체납 2회↑면 번호판 영치 위험' },
{ key: 'vehicleTaxPaidDate', label: '자동차세 납부일', type: 'date',   manual: true, note: '납기 이후 날짜가 들어오면 일정에서 사라짐' },
{ key: 'vehicleTaxAmount',   label: '자동차세(원)',   type: 'number', manual: true },
```

- `ocrFrom` **금지** — `app/api/ocr/extract/schemas.ts` VEHICLE_REG 스키마에 대응 키가 없다. `manual: true` 고정.
- 필드명은 `vehicleTaxDueDate`로 확정(위 예약 이름 승계). 새 이름 발명 금지.

### ①-B `lib/agenda.ts` — 여기가 유일한 진짜 작업 지점

1. **12-13행** — 종류 어휘 확장:
```ts
export type AgendaKind = '반납·만기' | '검사만기' | '보험만기' | '과태료 기한' | '세금 만기';
export const AGENDA_KINDS: AgendaKind[] = ['반납·만기', '검사만기', '보험만기', '과태료 기한', '세금 만기'];
```
2. **86-96행 검사만기 루프 바로 아래**에 세금 루프 추가. `buildAgenda` **시그니처는 바꾸지 말 것**(vehicles를 이미 받는다):
```ts
for (const v of vehicles) {
  const due = String(v.vehicleTaxDueDate || '');
  if (!due) continue;
  // 납기 이후에 납부 기록이 있으면 종결 — penalty 루프(115행)의 '변경부과완료 continue'와 동일 패턴
  const paid = String(v.vehicleTaxPaidDate || '');
  if (paid && paid >= due) continue;
  push(due, '세금 만기', String(v.plate || ''), String(v.carName || '자동차세'),
       String(v.companyId || ''), `tax:${v._key || v.plate}:${due}`);
}
```
3. **키 접두어 `tax:`는 신설이다.** `cx:`/`insp:`/`ins:`/`pen:`와 같은 자리에 있고, **①-D의 `agendaKey`와 문자 단위로 동일해야 한다**(딥링크가 깨진다).

### ①-C `lib/risk-ledger.ts` — **수정 없음. 파일 열지 말 것**

리스크 그룹을 늘리지 않고 편입하는 방법 = **이 파일을 건드리지 않는 것**이 답이다. 이미 kind-무관 구조다:

- **165-181행** `agenda.filter(x => x.status === '어김')` → `rowOf('미완료', { kind: a.kind, … })` — `'세금 만기'`가 자동으로 **미완료** 그룹에 들어간다.
- **225-241행** `status === '임박'` → `rowOf('만기', { kind: a.kind, … })` — 자동으로 **만기** 그룹.
- 두 루프의 `if (a.kind === '반납·만기' && …) continue` 중복제거 가드는 kind 특정이라 세금에 걸리지 않는다.
- `GROUP_TONE`/`GROUP_RANK`/`countRiskSheetGroups`는 `RiskSheetGroup` 키라서 무변경 → **4그룹·칩 개수·톤 그대로**.
- 행 id는 `미완료:일정:tax:…` / `만기:일정:tax:…`로 기존 규칙(`lib/ledger-open-ids.ts` `riskAgendaOverOpenId`)에 자동 정합.

검증: `buildRiskSheetRows`가 세금 행을 뱉는데 `countRiskSheetGroups` 반환 키가 5개가 되면 잘못 건드린 것이다.

### ①-D `lib/operating-snapshot.ts` — 홈 «오늘 할 일»의 실제 원천

**중요: 홈은 `buildAgenda`를 쓰지 않는다.** `lib/home-rows.ts`는 `Dashboard.expiring`을 읽고, 그 `expiring`은 `operating-snapshot.ts:53-75`에서 **따로 손롤**된다(계약·보험·검사 3종). 즉 agenda만 고치면 리스크 표에는 뜨고 홈에는 안 뜬다.

**53-75행 `expiring` 배열에 네 번째 spread 추가:**
```ts
...vehicles.filter((v) => {
  const due = String(v.vehicleTaxDueDate || '');
  const paid = String(v.vehicleTaxPaidDate || '');
  if (!due || (paid && paid >= due)) return false;
  const d = dday(due); return d != null && d <= 30;
}).map((v) => ({
  plate: v.plate,
  dday: dday(String(v.vehicleTaxDueDate))!,
  main: `${v.plate} · ${v.carName || ''}`,
  sub: `자동차세 ${(() => { const d = dday(String(v.vehicleTaxDueDate))!; return d < 0 ? `${-d}일 경과` : `D-${d}`; })()}`,
  agendaKey: `tax:${v._key || v.plate}:${String(v.vehicleTaxDueDate)}`,   // ①-B와 동일 문자열
})),
```
- 30일 창(`d <= 30`)은 기존 보험·검사와 동일하게 맞춘다.
- `agendaKey`가 ①-B의 key와 어긋나면 홈에서 클릭했을 때 리스크 표가 그 행을 못 찾는다.

**안티패턴 메모(이번 오더 범위 밖 — 손대지 말 것):** `expiring`이 `buildAgenda`와 같은 판정을 두 벌 갖고 있다. 통합하면 홈 숫자가 움직이므로 별건 오더로 분리한다.

### ①-E `lib/home-rows.ts` — **수정 없음**

①-D를 하면 자동으로 흐른다. 확인만:
- **160-174행** `D.expiring` 중 `dday<0` → `kind:'만기경과'`, id `riskAgendaOverOpenId(e.agendaKey)` = `미완료:일정:tax:…` → 리스크 표 id와 일치.
- **208-221행** `dday>=0` → `kind:'만기임박'`.
- **295-324행** `hrefForTodayRow`: `'만기경과'` → `/risk?open=…`(default), `'만기임박'` → `/risk?group=만기`. **둘 다 이미 존재 → case 추가 금지.**
- `selectTodayFocus`(282행)·`selectTodayPanel`(242행)이 `buildHomeRiskRows`+`buildHomeUpcomingRows`를 합치므로 «오늘 할 일»에 자동 포함. `todayUrgency`(270행)도 `dday<0 → 2` 규칙으로 자동 처리 → **수정 금지**.

### ①-F `lib/compliance.ts` — **이번 오더에서는 추가하지 말 것 (판단 필요 · 사용자 결정 사항)**

`checkCompliance()`에 `tax_overdue` 플래그를 넣는 것은 법리상 타당하다(지방세징수법 번호판 영치 → 무단운행 위험, `inspection_expired` 패턴과 동형). **그런데 넣으면 같은 사건이 두 번 뜬다:**

- compliance 플래그는 `home-rows.ts:134-146`에서 `kind:'컴플라이언스'`, id `riskComplianceOpenId` 로 나가고 `hrefForTodayRow`는 이를 **`/integrity`**로 보낸다(310행 주석: "컴플라이언스는 리스크 표에 없음(4그룹 원복)").
- agenda 경로는 `/risk`로 보낸다. id가 달라 `selectTodayPanel`의 `map.has(r.id)` 중복제거를 통과 → **홈에 세금 1건이 2행**.

→ 지시: **①은 agenda 경로만 구현.** compliance 편입은 (a) 어느 화면이 주인인지 결정 + (b) 중복제거 규칙을 먼저 정한 뒤 별건. `compliance.ts`는 이번에 열지 않는다.

### ①-G 표시 배선 (0-4 체크리스트)

- `lib/master-ledgers.ts` — `AssetMasterRow`에 `vehicleTaxDueDate: string; vehicleTaxPaidDate: string; vehicleTaxAmount: number;` 추가 + `assetMasterRow()`에 `str()`/`num()` 매핑(81행 saleDate 줄 옆).
- `lib/master-ledger-cols.tsx` `ASSET_COL_CATALOG` — 89행 `saleDate` 줄 근처에:
  `ax('vehicleTaxDueDate','자동차세 납기',{date:true, priority:2}), ax('vehicleTaxPaidDate','자동차세 납부일',{date:true}), ax('vehicleTaxAmount','자동차세',{money:true, align:'r'}),`
- `ASSET_SHEET_KEYS.all`에 3키 추가. `basic`은 **건드리지 말 것**(17열 고정, 이미 포화).
- `ASSET_DETAIL_DEFS`(177행) — `'보험'` 섹션(222행) 아래에 신설:
  `{ title: '세금', keys: ['vehicleTaxDueDate','vehicleTaxPaidDate','vehicleTaxAmount'] },`
- `app/asset/page.tsx` `ASSET_CREATE_SECTIONS`(54-60행) — `'보험·GPS'` 섹션에 `vehicleTaxDueDate`,`vehicleTaxPaidDate`,`vehicleTaxAmount`를 붙이거나 `{ title:'세금', fields:[…3키] }` 신설. **여기 안 넣으면 입력창이 없다**(②의 근본 원인과 동일).

---

## 오더 ② 매각(처분) 입력 경로 + 처분손익 표시

### 조사 결론 — 왜 지금 입력이 불가능한가

1. `lib/intake/entities.ts:105-107`에 `saleDate`(매각일)·`salePrice`(매각가)가 **정의돼 있다**.
2. `lib/master-ledger-cols.tsx:89`에 컬럼도 있고 `:207-210`에 `{ title:'처분·매각', keys:['saleDate','salePrice'] }` 상세 섹션도 있다 → **읽기는 된다**.
3. **그런데 `app/asset/page.tsx:54-60` `ASSET_CREATE_SECTIONS`에 `'처분·매각'` 섹션이 없다.**
4. `components/ui/ledger-edit-panel.tsx:49-52`:
```ts
const wanted = new Set(sections.flatMap((section) => section.fields));
return entity?.fields.filter((field) => wanted.has(field.key)) || [];
```
   **«sections에 나열된 필드만 렌더» 규약 확정.** 게다가 `app/asset/page.tsx:292`가 편집 패널에 **생성용과 같은 `ASSET_CREATE_SECTIONS`를 넘긴다** → 생성·수정 **양쪽 모두** `saleDate`/`salePrice` 입력칸이 존재하지 않는다.
5. 결과: **UI 어디에서도 매각일·매각가를 입력할 수 없다.** 상세 패널에 "처분·매각" 섹션이 항상 `—`로 떠 있는 것이 증상이다. `disposalGainLoss`(`asset-ledger.ts:112`)는 `v.salePrice !== undefined`를 요구하므로 **영구히 `undefined`** — 계산기는 완성돼 있는데 입력이 없어 죽은 코드다.

### ②-A `app/asset/page.tsx` — 입력 자리 (지목)

`ASSET_CREATE_SECTIONS`(54-60행) **배열 마지막**에 추가:
```ts
{ title: '처분·매각', fields: ['saleDate', 'salePrice'] },
```
- **위치는 반드시 마지막**: `ledger-edit-panel.tsx:128` `initiallyOpen={section.open ?? sectionIndex === 0}` → `open` 미지정 + index≠0 이면 **접힌 상태**로 렌더된다. 신차 생성 폼에 매각칸이 펼쳐져 있으면 안 되므로 `open: true`를 주지 말 것.
- 상세 섹션(`ASSET_DETAIL_DEFS:207-210`) 제목과 **문자열을 일치**시켜라(`'처분·매각'`) — 보기/입력 섹션명이 갈리면 사용자가 다른 기능으로 오해한다.
- 생성·수정 섹션을 분리(`ASSET_EDIT_SECTIONS` 신설)하지 말 것 — 두 벌이 되면 필드 누락이 재발한다. 접힘 규약으로 해결한다.

### ②-B `lib/store.ts` — saleDate 자동 스탬프 (감가 컷오프)

**필요한가: 예.** `asset-ledger.ts:80` `const cutoffDate = disposed && v.saleDate ? v.saleDate : asOfDate;` — `status='매각'`인데 `saleDate`가 비면 `disposed=true`인 채로 컷오프가 **오늘**이 되어 팔린 차의 감가가 계속 쌓이고(`monthsHeld` 증가) 장부가가 계속 내려간다 → 처분손익이 시간이 갈수록 커진다. 수기 입력에 의존하면 반드시 빈다.

**전이 로직이 어디 있나 — 조사 결과:**

- `lib/domain/status.ts:52` `canSetStatus(from,to)`는 **계약 전용**이다(`CONTRACT_ENDED`만 참조). `TRANSITIONS`(32행)도 계약 상태만.
- `lib/commit.ts:48-49` `assertLegalContractStatus`는 `if (args.entity !== 'contract') return;` → **차량 상태 전이 가드는 존재하지 않는다.**
- **결정적: `ledger-edit-panel.tsx:95`는 `getStore().update(...)`를 직접 호출해 `commitUpdate`를 우회한다.** 자산 원장 수정 패널이 유일한 매각 입력 경로가 될 것이므로, `lib/commit.ts`에 스탬프를 넣으면 **발동하지 않는다.**

**→ 지시: `lib/store.ts`의 감사 데코레이터 update 경로(407행 `carryPlateHistory` 호출 바로 옆)에 넣어라.** 이 계층은 `getStore().update` 전 경로가 통과하는 유일한 지점이며, `carryPlateHistory`(47-61행)가 정확히 같은 형태의 선례다(vehicle 한정 · before+patch에서 파생값 계산 · dedup 후 병합).

```ts
/** 매각 스탬프 — status가 처분(VEHICLE_OUT)으로 넘어가는데 saleDate가 없으면 그날로 봉인.
 *  왜: asset-ledger.ts cutoffDate가 saleDate 없으면 asOf(오늘)이 되어 «팔린 차가 계속 감가»된다. */
function stampSaleDate(entityKey, before, patch) {
  if (entityKey !== 'vehicle' || !('status' in patch)) return {};
  const to = String(patch.status ?? '');
  const from = String(before?.status ?? '');
  if (!VEHICLE_OUT.has(to) || VEHICLE_OUT.has(from)) return {};   // 진입 시 1회만
  if (before?.saleDate || patch.saleDate) return {};             // 사람이 준 값 우선
  return { saleDate: todayKST() };
}
```
- 판정 집합은 **`lib/domain/status.ts:15` `VEHICLE_OUT`(매각·말소·폐차)를 import**해서 쓸 것. 문자열 리터럴 손롤 금지.
- 오늘 날짜는 `lib/contracts/dates.ts` `todayKST()`. `new Date().toISOString().slice(0,10)`(UTC) 금지 — 한국 자정~09시에 하루 어긋난다.
- 407행 호출부: `const carried = { ...carryPlateHistory(...), ...stampSaleDate(entityKey, before, patch) };`
- **차량 상태 전이 가드(부활 금지 등)는 이번 오더 범위 아님.** 스탬프만.

### ②-C `lib/payments/asset-ledger.ts` — 판정 집합 불일치 (실제 결함)

`:69` `const DISPOSED_STATUSES = new Set(['매각', '폐차']);`
- `lib/domain/status.ts:15` `VEHICLE_OUT = {'매각','말소','폐차'}` — **`'말소'` 누락.**
- `lib/master-ledgers.ts:54` `disposed: OUT.has(status)` — 여기는 `'말소'` 포함.
- 결과: **말소 차량은 자산 원장에서 "처분"으로 집계되는데 감가엔진은 "보유중"으로 보고 감가를 계속 쌓고 처분손익을 산출하지 않는다.** `'폐차'`는 자산상태 13개 옵션에 아예 없는 값이다(`entities.ts:77`).

지시: 69행을 삭제하고 `import { VEHICLE_OUT } from '@/lib/domain/status'`로 교체, `DISPOSED_STATUSES.has(...)` → `VEHICLE_OUT.has(...)`. **판정 집합 SSOT 1곳.**

### ②-D 처분손익 노출 위치 — `app/financials/page.tsx` (권장)

**후보 비교:**

| 화면 | 판정 |
|---|---|
| `app/list/[entity]/page.tsx` | ❌ 제네릭 디버그 화면(`entity.fields.slice(0,8)` + 장부가 1열). `:16-24 bookValue()`가 `status:'운행'` 하드코딩·`firstReg`만 참조 → 처분 판정 자체가 불가능. 여기 붙이면 오답을 새 화면에 박는다. |
| `app/financials/page.tsx` | ✅ 재무상태표. `computeAssetLedgerEntry`를 이미 쓰고(`:43`) `summarizeLedger`가 `totalDisposalGainLoss`를 이미 계산한다(`:161`) — 소비자만 없다. |

**②-D-1 먼저 고칠 결함 — `app/financials/page.tsx:41-44`:**
```ts
for (const v of vs) {
  const acq = Number(v.acquisitionPrice) || 0; acquisition += acq;
  if (acq) carBook += computeAssetLedgerEntry({ …, status: '운행', purchasePrice: acq,
    firstRegisteredDate: String(v.firstReg || v.acquisitionDate || '') } as unknown as Vehicle, TODAY).bookValue;
}
```
- `status:'운행'` **하드코딩** + `saleDate`/`salePrice` **미전달** → **매각한 차가 자산 총계의 차량 장부가에 계속 남는다.** 매각 입력이 생기면 이 버그가 즉시 금액 오류로 드러난다. ②-A와 **같은 PR에서** 고쳐야 한다.
- `as unknown as Vehicle` 손롤 어댑터가 이 파일과 `app/list/[entity]/page.tsx:19-22`에 두 벌 있다. **`lib/payments/asset-ledger.ts`에 `vehicleRecordToAsset(rec: EntityRecord): Vehicle` 어댑터를 1개 export**하고 두 곳이 그걸 쓰게 할 것. 필드 매핑: `acquisitionPrice→purchasePrice`, `firstReg→firstRegisteredDate`, `status`·`saleDate`·`salePrice`·`purchasedDate`·`acquisitionDate` 실제 값 전달.

**②-D-2 노출 형태:**
- `entries = vs.map(v => computeAssetLedgerEntry(vehicleRecordToAsset(v), TODAY))` 1패스 → `summarizeLedger(entries)` 사용. **페이지에서 재집계·손롤 합산 금지**(`docs/RENMAN-WORK-ORDER.md:217`).
- 자산 섹션(`Sec id="f-asset"`, 79행): `<Row label="차량 (장부가)" value={S.totalBookValue}>`로 교체하고 hint를 `취득 … − 감가 …`로 유지. **매각분은 여기서 빠진다**(summarizeLedger가 `disposed`를 `totalAcquisition/BookValue`에서 제외 — `:158-167`).
- **신설 `Sec id="f-disposal" title="처분손익" desc="매각한 차 — 매각가 − 장부가"`** (자본 섹션 앞):
  - `<Row label="매각대금" value={S.totalSalePrice} />`
  - `<Row label="처분손익" value={S.totalDisposalGainLoss} strong tone={S.totalDisposalGainLoss >= 0 ? 'var(--green-text)' : C.danger} hint={`처분 ${S.disposedCount}대`} />`
  - `S.incompleteCount > 0`이면 `취득가·취득일 미입력 {n}대 제외` 주석 1줄. **«미입력»을 0원으로 표시하지 말 것**(cf80190 보증금 실수령 판단과 동일 원칙).
- `Row`는 기존 로컬 컴포넌트 재사용, `won()` 사용. 새 숫자 포맷 금지.

**②-D-3 자산 원장 컬럼(선택, 권장):** 자산별 처분손익을 보려면 `lib/master-ledgers.ts` `assetMasterRow`에 `bookValue`/`disposalGainLoss`를 파생 추가 + `ASSET_COL_CATALOG`에 `{ align:'r' }` 컬럼 2개 + `ASSET_SHEET_KEYS.all` + `ASSET_DETAIL_DEFS`의 `'처분·매각'` keys에 편입. `app/asset/page.tsx`의 «처분자산» 범위 필터(`:40-42 matchesOwnership`)와 «처분일 기준» 기간(`:121`)이 이미 있으므로 화면 골격 추가 불필요.

---

## 오더 ③ 계약번호 자동 발번

### ③-A 왜 미구현인가 — `lib/domain/ids.ts`

`:7` 주석이 명시적으로 유보한다:
> `· 사람이 부르는 순번 업무코드(계약번호 C-YYMM-#### 등)는 별도 발번기(원자 카운터)로. 여긴 시스템 ID만.`

`ids.ts`는 `token()`(`:21` crypto 랜덤 base33 12자)로 **충돌 확률 무시 가능한 opaque ID**를 만든다 → 카운터가 원리적으로 불필요. 반면 `C-YYMM-####`는 **연속·최소·중복불가**를 요구하므로 랜덤으로 만들 수 없고 «누가 마지막 번호인가»를 원자적으로 읽고 쓸 상태가 필요하다. 그 상태 저장소가 없어 미구현이다.

**베끼면 안 되는 선례 — `lib/doc-templates.ts:94-99`:**
```ts
export function computeNextSeq(items: { docNo?: string }[], prefix: string, when = new Date()): number {
  const monthPrefix = `JPK-${prefix}-${yy}${mm}`;
  return items.filter((d) => String(d.docNo || '').startsWith(monthPrefix)).length + 1;
}
```
**클라이언트가 보이는 목록을 세서 +1** 한다. (a) 두 사람이 동시에 누르면 같은 번호, (b) `lib/store.ts`의 `_listCache`(474행)가 스테일이면 이미 쓴 번호 재발급, (c) 소프트삭제분이 목록에서 빠져 번호가 되돌아간다. **계약번호에 이 함수를 재사용하지 말 것.**

### ③-B 형식 확정 — `C-YYMM-####`가 맞나

| 출처 | 형식 |
|---|---|
| `lib/domain/ids.ts:7` | `C-YYMM-####` |
| `lib/payments/types/contract.ts:22` | `// ICR-YYMM-XXXX` ← **모순** |
| `lib/migrate/switchplan-parse.ts:692` | `SP-YYMM-NNNN` (스위치플랜 이관 실데이터) |
| `lib/doc-templates.ts:88` | `JPK-{prefix}-{YYMM}-{seq3}` (직원·거래처 증명서 — 별 체계) |
| `lib/docs/notice-claim.ts:33` | `NCM-YYYYMMDD-xxxx` |

**인쇄물 조사 — `components/PrintHost.tsx`:** `:127`·`:165`·`:212`는 `String(c.contractNo || '—')`를 **그대로 출력**할 뿐 파싱·검증·자릿수 가정이 전혀 없다. `:208`만 `No. {contractNo || plate}-{YYYYMM}`으로 합성한다. → **인쇄물이 형식에 의존하지 않으므로 형식은 자유 선택이며, 기존 발행문서를 깨지 않는다.**

**지시:**
1. `C-YYMM-####` 채택(`ids.ts` 주석이 SSOT).
2. **`lib/payments/types/contract.ts:22`의 `// ICR-YYMM-XXXX` 주석을 `// C-YYMM-#### (lib/domain/contract-no.ts 발번)`으로 수정.** 유령 규격을 남기지 말 것.
3. **`SP-` 접두어는 보존.** 이관 계약은 실데이터가 이미 `SP-`로 저장돼 있고 `contractNo`가 자연키(=`_key`)다. 재발번하면 전 이력이 끊긴다. **발번기는 «비어 있는 계약»에만 개입**한다.
4. 카운터는 **회사별**이어야 하므로(문서 경로에 companyId 필요) 두 법인이 같은 `C-2607-0001`을 갖는다. 문서ID는 `{companyId}__{contractNo}`라 Firestore 충돌은 없지만 전사 엑셀에서 중복으로 보인다. 사용자 확인 필요: 그대로 둘지 / `C-{회사코드}-YYMM-####`로 할지. **결정 전 구현 착수 금지.**

### ③-C 신규 `lib/domain/contract-no.ts` — 원자 카운터

```
counters/{companyId}__contractNo__{YYMM}   { companyId, scope:'contractNo', ym:'2607', seq:number, updatedAt }
```

**docId 형태가 `{companyId}__…` 인 것은 필수다** — `firestore.rules:108` `docIdOwnedBy(docId, companyId)`가 create 시 이 접두어를 강제한다(`lib/store.ts:120 firestoreDocId`와 동일 규약).

```ts
export async function issueContractNo(companyId: string): Promise<string> {
  const { getFirestore, doc, runTransaction } = await import('firebase/firestore');
  const ym = ymKST();                       // 'YYMM' — KST 기준, UTC 금지
  const ref = doc(getFirestore(getFirebaseApp()!), 'counters', `${companyId}__contractNo__${ym}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const next = (snap.exists() ? Number(snap.data().seq) || 0 : 0) + 1;
    tx.set(ref, { companyId, scope: 'contractNo', ym, seq: next, updatedAt: … }, { merge: true });
    return next;
  });
  return `C-${ym}-${String(seq).padStart(4, '0')}`;
}
```

**중복이 안 나는 이유 / 오프라인 설계:**
- Firestore 클라이언트 `runTransaction`은 **서버 왕복이 강제**된다. 오프라인·권한거부·타임아웃이면 `setDoc`처럼 큐잉되지 않고 **즉시 throw** 한다 → **오프라인에서 번호가 나오는 일 자체가 없다.** 이 성질이 방어의 핵심이다.
- `tx.get` → `tx.set` 사이 다른 쓰기가 끼면 Firestore가 트랜잭션을 **자동 재시도**한다(같은 seq 두 번 반환 불가).
- **«구멍(gap)은 허용, 중복은 절대 불가»를 규칙으로 못박아라.** 발번 후 계약 저장이 실패하면 그 번호는 버린다. 되돌리려고 `seq`를 감소시키는 코드를 만들면 즉시 중복이 생긴다.
- 실패 시 UX: **번호 없이 저장하고 «미발번»으로 남긴다.** `lib/store.ts:80-85 persistKeyOf`가 이미 이 케이스를 안전하게 처리한다 — 자연키가 비면 `newId('contract')`(`ctr_…`)를 `_key`로 승격한다. 로컬 계산 폴백 번호를 만들지 말 것.
- 재시도는 «발번 버튼» 명시 조작으로만. 자동 무한재시도 금지(카운터를 태운다).

### ③-D 발번 시점 — **저장 전이어야 한다 (강한 제약)**

`ENTITIES.contract.idFrom = 'contractNo'`(`entities.ts:244`)이고 `lib/store.ts:120` `firestoreDocId(companyId, key)`가 **`_key`에서 문서ID를 만든다.** 그리고 `update()`는 기존 docId에 `merge:true`로 쓴다 → **이미 저장된 계약에 `contractNo`를 나중에 patch하면 `_key`/docId는 옛 `ctr_…`로 남아 자연키와 표시번호가 영구히 갈린다**(dedup·재투입 매칭이 어긋난다).

**지시:**
- 발번은 `components/ui/ledger-create-panel.tsx` 저장 직전, `contract` 엔티티이고 `form.contractNo`가 빈 경우에만 `issueContractNo(targetCompany)`를 호출해 레코드에 넣고 저장한다. → `_key = 'C-2607-0001'`로 처음부터 확정.
- 기존 «미발번» 계약 소급 부여는 **별건 마이그레이션**. `contractNo`만 표시용으로 채우고 `_key`는 손대지 않는다(문서 이동 = 삭제+재생성이므로 감사·참조가 끊긴다). 이번 오더에 넣지 말 것.
- `entities.ts:246` `contractNo` 필드에 `note: '비우면 저장 시 자동 발번(C-YYMM-####)'` 추가. `required: true` 금지 — 발번 실패 시 저장 자체가 막힌다.

### ③-E `firestore.rules` — counters 명시 match (필수)

범용 규칙(`:101-116`)만으로도 create/update가 통과하지만, **테넌트가 `seq`를 임의 값으로 낮춰 쓸 수 있다** → 중복 발번. `company_master`·`period_locks`가 확립한 «민감 컬렉션은 범용에서 빼고 명시 match만 지배» 패턴(`:17-19` ★주석, `:27-33 businessColl`)을 따른다.

1. `businessColl()`(27-33행)에 `&& coll != 'counters'` 추가 — **범용 OR 우회 차단.**
2. 명시 블록 신설:
```
// 발번 카운터 — 단조증가만. 되돌리면 계약번호가 중복된다.
match /counters/{docId} {
  allow read:   if isSignedIn() && tenantOK(resource.data.companyId);
  allow create: if isSignedIn() && tenantOK(request.resource.data.companyId)
                && docIdOwnedBy(docId, request.resource.data.companyId)
                && request.resource.data.seq == 1;
  allow update: if isSignedIn() && tenantOK(resource.data.companyId)
                && request.resource.data.companyId == resource.data.companyId
                && request.resource.data.seq == resource.data.seq + 1;
  allow delete: if false;                      // 본사도 금지 — 삭제 = 번호 재사용
}
```
3. `tests/rules/firestore.rules.test.ts`에 describe 1개 추가 — 기존 `describe('법인 마스터(company_master) …')`(184행) 형식을 따라: ①seq 되돌리기 거부 ②+2 점프 거부 ③남의 회사 카운터 읽기 거부 ④delete 거부.

### ③-F 발번이 없을 때 rowKey 폴백이 만드는 실제 충돌

`app/contract/page.tsx:229-230`:
```ts
rowKey={(r) => r.contractNo || `${r.plate}:${r.startDate}`}
selectedRowKey={selected ? (selected.contractNo || `${selected.plate}:${selected.startDate}`) : null}
```
`components/ui/excel-sheet.tsx`가 이 값을 `:293 const rowId`, `:296 selected = rowId === selectedRowKey || selectedKeys?.has(rowId)`, `:304 <tr key={rowId}>`로 쓴다. **`plate:startDate`는 유일하지 않다.**

**실제로 터지는 4가지:**

1. **같은 차·같은 시작일 재계약 (가장 흔함)** — 손님이 바뀌어 같은 날짜로 신규 계약을 쓰는 경우, 또는 중도해지 당일 새 임차인에게 인도하는 경우. 두 행 모두 `12가3456:2026-07-01` → **더블클릭하면 두 행이 동시에 파랗게 선택**되고(`:296`), 우측 상세는 `rows` 배열 순서상 먼저 걸린 계약만 뜬다 → **A 손님 화면인 줄 알고 B 손님 계약을 수정**한다. 그리고 `LedgerEditPanel`은 `record._key`로 저장하므로(`:54 docKey`) 화면 표시와 저장 대상이 다른 계약이 될 수 있다.
2. **차량 미배정 계약** — `plate`이 빈 대기 계약 2건 이상이면 rowKey가 `:2026-07-01` 또는 `:`(둘 다 빈 경우) → **전 미배정 계약이 한 덩어리**. `LEDGER_EMPTY.unassigned`로 «미배정» 표시되는 행들이 전부 같은 키다.
3. **React 중복 key** — `<tr key={rowId}>`가 같은 값 2개 → 재조정 시 행 내용이 뒤바뀌어 렌더된다. 열 필터·정렬(`:206 view`)을 바꾸면 선택 상태가 다른 행으로 옮겨 붙는다.
4. **다중선택 오폭** — `selectedKeys?.has(rowId)`가 키 기준이므로 체크박스 1개를 켜면 동일 키 행이 모두 켜진다. 이 상태로 일괄 작업을 하면 의도하지 않은 계약이 함께 처리된다.

**근본 원인은 폴백 문자열이 아니라 «자연키가 없는데 화면 키로 자연키를 쓴 것»이다.** 발번(③)이 근본 처방이고, **그와 별개로 rowKey를 `r.raw._key`(항상 유일 — `persistKeyOf`가 `ctr_…`를 승격) 기준으로 즉시 교체**해야 한다. 오늘 데이터에 이미 미발번 계약이 있으면 지금 오작동하고 있다.

**지시:** `app/contract/page.tsx:229-230`을 `String(r.raw._key || r.contractNo || '')` / `selected ? String(selected.raw._key || selected.contractNo || '') : null` 로 교체. **③-C~E와 독립적으로 먼저 반영 가능하며, 오픈 전에 반영해야 한다.**

---

## 검증 게이트 (전 오더 공통)

1. `npx tsc --noEmit` — 0 에러.
2. `npx vitest run tests/receivables.test.ts tests/transitions.test.ts tests/plate-history.test.ts tests/schema.test.ts` — 그린 유지.
3. **리스크 4그룹 불변 증명:** `countRiskSheetGroups()` 반환 키가 `전체·미완료·미납·만기·휴차` 5개 그대로. 세금 데이터 1건 넣고 «만기» 그룹 건수가 +1 되는지 확인(새 그룹 생성 아님).
4. **딥링크 정합:** 홈 «오늘 할 일»의 세금 행 클릭 → `/risk?open=미완료:일정:tax:…` → **그 행이 실제로 열려야** 한다(`agenda.ts` key와 `operating-snapshot.ts` agendaKey 문자열 일치 증명).
5. **금액 대사(②):** 매각 입력 전/후 `/financials` 자산 총계 비교. 처분 차량 1대의 장부가가 자산에서 **빠지고** 처분손익 섹션에 나타나야 한다. `docs/RENMAN-WORK-ORDER.md:131` — 장부 숫자가 바뀌는 작업은 반영 전 대사 필수.
6. **발번 중복 시험(③):** 계약 생성을 2탭에서 동시 저장 → 서로 다른 번호. 오프라인(devtools Network offline)에서 저장 → 번호 없이 저장되고 «미발번» 표시, **절대 `C-…-0001`이 나오지 않아야 함.**
7. `npm run build` 금지 · dev 6006 유지 · 커밋/푸시는 사용자 지시 후.

## 오더에 포함하지 않은 별건 (사용자 판단 필요)

- `lib/agenda-cols.tsx` 전체가 죽은 코드(`/desk` → `/risk` redirect 이후 import 0). 삭제 or `/risk` 일정 뷰 복원 결정.
- `operating-snapshot.ts:53-75 expiring`이 `buildAgenda`와 판정 이중화. 통합 시 홈 숫자 변동 → 대사 동반 별건.
- `components/ui/ledger-edit-panel.tsx:95`가 `commitUpdate`를 우회 → **계약 상태 부활 금지 가드(`commit.ts:48` SM-1 백스톱)가 범용 수정 패널에서는 작동하지 않는다.** ②-B와 원인이 같은 구조 결함이며 계약 쪽은 보안·무결성 사안이다. 오픈 전 별건 오더 권장.
- `lib/ledger-filter-defs.ts:51`이 자산 status 필터를 `'차량상태'`로 라벨링 — 0-1 규약상 `'자산상태'`. 1줄이지만 라벨 쌍 SSOT 위반이므로 UI 일괄 정합 오더에 합류.

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
