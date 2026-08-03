> **Claude 조사 메모 (2026-07-31)** — 코드 미변경. `git status` 39개 미커밋 그대로. 아래가 커서 오더.
> 핵심 발견 3가지를 먼저 박아둔다: ①`sla` 파라미터는 **인터페이스만 있고 배선이 0곳**이다(호출자 8곳 전부 미전달). ②합본 스코프에서 3사 계약이 한 배열에 섞이므로 «회사 1개의 sla»를 넘기면 틀린다 — **행별 companyId 리졸버**여야 한다. ③`company_master`에 얹으면 안 된다(전체교체 CAS 충돌 + `'use client'` 오염 + 규칙 권한이 반대). 대안인 별도 컬렉션을 추천한다.

---

# 커서 오더 — 회사 정책값(회수 SLA) 설정 UI

브랜치 `redesign/pagedef-p0` 기준. 조사만 수행했고 코드는 손대지 않았다.

## 0. 조사 결론 요약

### 0-1. `sla` 파라미터 배선 현황 = **0곳**

`lib/domain/status.ts:82` 에 `CollectionSLA { warn?, engineLock?, notice?, debt? }` 인터페이스가 있고 `:85-86` 이 그것을 받지만, **전수 grep 결과 두 번째 인자를 넘기는 호출자가 하나도 없다.**

| 호출부 | 줄 | 현재 호출 | 성격 |
|---|---|---|---|
| `lib/receivables-ledger.ts` | `:60` | `collectionStage(v.overdueDays)` | 미수관리 행 SSOT (`st.stage`) |
| `lib/sheet-warnings.ts` | `:62` | `collectionStage(ctx.overdueDays)` | ⚠ 열 · `경고있음` 필터 |
| `lib/sheet-cols.tsx` | `:108`, `:112` | `collectionStage(r.overdueDays)` | 운영현황 「회수단계」 열 (render/text 각각) |
| `components/Customer360.tsx` | `:69` | `collectionStage(v.overdueDays)` | 손님 360 ObjCard 배지 |
| `app/dev/sample/page.tsx` | `:82` | `collectionStage(r.overdueDays)` | 개발 샘플 |

파생 소비처(위 결과를 다시 읽는 곳):
- `lib/receivables-ledger.ts:69-80` `summarizeReceivableActions` → `noticeTodo`/`lockTodo` (미수 Metric)
- `lib/receivables-ledger.ts:83-98` `countReceivableFacets` → FacetRail 칩 건수
- `lib/receivables-ledger.ts:105-107` `noticeTodoRows` → **내용증명 일괄 발송 대상** (`app/receivables/page.tsx:161`, `app/risk/page.tsx:313`)
- `app/receivables/page.tsx:194` `needLock` → 시동제어 버튼 상태
- `lib/risk-ledger.ts:220` 미납 행 `subject`(연체일 문장)

→ **결론: 함수 시그니처는 이미 준비됨. 남은 것은 «값을 어디서 읽어 누가 넘기나»뿐이다.** `collectionStage` 본문·기본값은 **건드리지 마라**(테스트·기본동작 보존).

### 0-2. 6개 정책값의 현재 하드코딩 위치

| 정책값 | 현재 위치 | 값 | 상태 |
|---|---|---|---|
| 경고 단계일 | `lib/domain/status.ts:86` `sla?.warn ?? 1` | 1 | 파라미터 존재 |
| 시동제어일 | `lib/domain/status.ts:86` `sla?.engineLock ?? 3` | 3 | 파라미터 존재 |
| 내용증명일 | `lib/domain/status.ts:86` `sla?.notice ?? 10` | 10 | 파라미터 존재 |
| 채권화일 | `lib/domain/status.ts:86` `sla?.debt ?? 30` | 30 | 파라미터 존재 |
| 내용증명 **납부기한** | `lib/docs/notice-claim.ts:41` `dueInDays = 7` | 7 | 파라미터 존재·미전달 (호출 4곳: `PrintHost.tsx:118`, `send-notice.ts:27,56,87`) |
| 임박 알림일 | `lib/agenda.ts:33` `d <= 7` + `:41` `toneFor` + `lib/risk-ledger.ts:23` `RISK_DDAY_BOUND = 7` | 7 | **파라미터 없음 — 시그니처 변경 필요** |
| 보증금 반환기한 | **존재하지 않음** | — | `lib/deposit.ts:42` `pendingRefund` 는 기한 없는 boolean |

### 0-3. 소급(retroactive) 판정 — 결론부터

**이미 그 단계에 있던 계약은 «도장은 안 바뀌고, 라벨·대상 집계는 즉시 바뀐다».** 근거:

- **불변(도장)**: `contract.noticeSentDate` / `noticeDocNo` / `noticeClaimAmount` / `noticeDueDate` 는 발송 시점에 문서에 박혀 저장된다(`lib/docs/send-notice.ts:30-35`). `noticeDueDate` 는 발송 당시 `dueInDays` 로 계산된 값(`notice-claim.ts:55`). 시동제어도 같다 — `lib/contracts/patches.ts:29-33` 이 `engineDisabled`/`engineDisabledAt`/`Reason`/`By` 를 저장한다. **정책을 바꿔도 이 값들은 안 움직인다. 움직이게 만드는 코드(백필·마이그레이션·재계산)를 작성하면 반려.** 이미 인쇄돼 등기로 나간 내용증명의 납부기한을 소급 변경하면 그 문서가 거짓이 된다.
- **즉시 변동(파생)**: `stage`/`tone`/`nextAction` 은 어디에도 저장되지 않는다 — 매 렌더 `collectionStage(overdueDays)` 로 계산된다. 따라서 저장 즉시 ⓐ「회수단계」 열 라벨(`sheet-cols.tsx:110`), ⓑ ⚠ 경고 심각도(`sheet-warnings.ts:63` med↔high), ⓒ FacetRail 칩 건수, ⓓ **「내용증명 대상 N건」 Metric**(`app/receivables/page.tsx:180`), ⓔ **일괄 발송 대상 집합**(`noticeTodoRows`) 이 전부 갈린다.
- **자동 방아쇠는 없다** — 정책을 바꿔도 시동이 저절로 꺼지거나 내용증명이 저절로 나가지 않는다. `patchEngineLock`·`sendNoticeCert` 는 전부 사용자 클릭이다(`app/receivables/page.tsx:140`, `:225`). **자동 실행을 추가하지 마라.**
- **따라서 실제 위험은 단 하나**: 사장님이 `debt` 를 30→15 로 낮춘 직후 담당자가 「내용증명 일괄」을 누르면, 한 시간 전에는 대상이 아니던 계약들에 등기가 나간다. `app/receivables/page.tsx:117` 의 confirm 은 건수만 말하고 «왜 늘었는지»를 말하지 않는다. → **저장 전 영향 미리보기가 필수인 이유가 바로 이 경로다.**

### 0-4. 권한·감사 판단

**본사(HQ) 전용 쓰기 + 전 법인 읽기.** 근거:
- `firestore.rules:64-68` `company_master` 는 **의도적으로 테넌트 쓰기 허용**이다(`:60-63` 주석: 법인 사용자가 자기 대표·주소를 못 고치면 «저장된 줄 아는데 로컬만» 상태가 재발). 그건 **신원 입력**이라 그렇다.
- 반면 `firestore.rules:71-74` `period_locks` 는 `allow write: if isHQ()`. 회계마감은 **무결성 통제**라서 그렇다. 회수정책은 「며칠에 시동을 끄나」= 통제이자 법적 기준선 → **period_locks 쪽 규율**이 맞다.
- 화면 게이트 선례도 그대로 있다: `app/settings/page.tsx:215` `{isOperator && !scopeAll && (<Panel title="회계">` — 그 위 `:213-214` 주석이 «규칙이 본사만인데 법인에 노출하면 눌렀는데 서버는 모르는 상태» 라고 이유를 명시한다. 정책 패널도 동일 게이트를 쓴다.

**감사로그 필수.** 근거: 값 자체가 법적 다툼의 기준선이고, 도장(0-3)이 남지 않는 파생 판정을 바꾸는 행위라 **로그 없으면 «누가 언제 30일을 15일로 바꿨나»를 사후에 복원할 수 없다.** `lib/audit.ts:56-74` `buildAuditLog` 를 재사용하고 `getStore().save('audit_logs', companyId, [log])` 로 append 한다(`lib/store.ts:390` — `AUDIT_COLL` 은 재귀 회피 경로로 base 에 직행). `firestore.rules:52-55` 가 `byUid == request.auth.uid` 를 요구하므로 `SessionProvider` 가 주입한 actor 가 있어야 한다.

**변경 미리보기 필수.** 0-3 의 ⓔ 경로 때문. 형식은 «저장 전 diff 3줄»로 충분하다 — 표를 만들지 마라(0-5 참조).

### 0-5. 화면 위치 — **`app/settings/page.tsx` 하나만.** `app/management/page.tsx` 는 오답.

근거(파일:줄):
1. **경영관리 자기 자신이 «편집은 설정에서»라고 못박고 있다** — `app/management/page.tsx:250` `actions={<Btn size="sm" variant="ghost" href="/settings">설정에서 편집</Btn>}`. 법인 마스터조차 이 페이지에서 편집하지 않는다. 정책 폼을 여기 넣으면 그 IA 결정을 뒤집는 것이다.
2. **경영관리는 `LedgerFrame` 원장(표)이다** — `:188-288` 이 통째로 `cols`/`rows`/`rowKey`/`sidePanel` 계약이다. 정책값 6개는 행이 아니다. 표로 만들면 `tests/row-grammar.test.ts:25-37` `SCREENS` 등록 의무가 발생하고 회사명(1)·식별자(2)·이름(3)·X분류(4)·X상태(5) 규격을 만족시킬 수 없다(회사·식별자·이름이 없는 데이터다).
3. **설정에는 형태·권한이 똑같은 선례가 이미 있다** — `app/settings/page.tsx:216-229` 「회계」 Panel: `ListRow` + `CollMain`(펼침 마크) + `ExpandPad` + 본문 컴포넌트 `ClosingBody`(`:55-101`). 서버 강제·본사 전용·사유 필수·**성공 후에만 토스트**(`:64-66` 주석, `:73`/`:76`)까지 정책 패널이 필요한 규율 전부가 그 안에 구현돼 있다. 복제 대상이 명확하다.
4. **충돌 회피** — `git status` 에 `app/management/page.tsx` 는 **M(커서 작업 중)**, `components/management/StaffTab.tsx` 는 신규 추가 중. `app/settings/page.tsx` 는 **깨끗하다**. 같은 파일에서 두 오더가 부딪치지 않는다.

### 0-6. 저장 위치 — **신설 `company_policy` 컬렉션.** `company_master` 확장은 반려.

| 항목 | `company_master` 에 얹기 | **신설 `company_policy`** |
|---|---|---|
| 쓰기 방식 | **전체 교체 + CAS**(`lib/company-master.ts:134-135` «배열 삭제 반영해야 하므로 merge 불가»). 정책 패널과 `/company/[id]` 편집기가 **같은 문서의 두 번째 작성자**가 된다 → 상시 CAS 충돌, 지면 `:92` 메시지대로 «차고지·공문대장 소실» 위험 | 문서 하나에 작성자 하나. 충돌 없음 |
| 클라이언트 오염 | `lib/company-master.ts:1` 이 **`'use client'`**. 정책 리더가 여기 있으면 `status.ts`→`sheet-warnings.ts`→`receivables-ledger.ts` 순수 체인이 클라이언트 전용으로 오염된다(vitest·SSR 계약 파손) | 새 파일은 `'use client'` 없이 작성 가능 |
| 규칙 권한 | `firestore.rules:66` 테넌트 쓰기 허용 = **법인 직원이 자기 시동제어일을 바꿀 수 있다.** 0-4 결론과 정반대. 한 문서에 두 권한을 걸 수 없다 | `allow write: if isHQ()` 를 깔끔히 부여 |
| 하이드레이트 | `ensureCompanyMasterHydrated(companyId)`(`:164`) 는 회사 1개 단위. 합본에서 3사 정책이 필요 | 다회사 하이드레이트를 새로 설계 가능 |
| 파일 소유 | **Claude 점유 → 커서 수정 금지** | 커서 단독 |
| 검증된 선례 | — | `period_locks` 가 정확히 같은 모양(자기 컬렉션 · HQ 쓰기 · 동기 읽기용 캐시 + 하이드레이트 · runTransaction) |

비용: 부팅 시 문서 읽기 1건 추가(회사당). `period_locks` 와 동일한 비용이며 허용 범위.

---

## 1. 신설 파일

### 1-1. `lib/policy/collection-policy.ts` (신규 · `'use client'` 붙이지 마라)

**따라야 할 패턴 = `lib/finance/period-lock.ts` 를 그대로 베껴라.** 특히:
- `:130-155` `ensurePeriodLocksHydrated` — inflight 중복 방지 · **성공했을 때만 `_hydrated.add`**(`:150` 주석: 실패를 완료로 찍으면 세션 내내 재시도 없음)
- `:222-247` `mutateRemoteMap` — **원격을 base 로 읽는 runTransaction**. 로컬 스냅샷을 원격에 밀어넣지 마라(`:213-219` 주석)
- `:241-242` **원격 성공 후에만 로컬 캐시 갱신**
- `:299-316` `useClosedPeriods` — 이벤트 구독 + reload 훅

구현 요구:

```
export type CollectionPolicy = {          // 값은 «일수»
  warn?: number; engineLock?: number; notice?: number; debt?: number;  // status.ts CollectionSLA 와 키 동일
  noticeDueDays?: number;                 // 내용증명 납부기한 (notice-claim.ts dueInDays)
  // ↓ 스테이지 2·3 에서 배선. 배선 전에는 UI 에 노출하지 마라(§5-3).
  soonDays?: number;                      // 임박 알림일
  depositRefundDays?: number;             // 보증금 반환기한
};
```

- 컬렉션 `company_policy`, 문서 id = `companyId`, 문서 형태 `{ companyId, policy, updatedAt, updatedBy }` (`company-master.ts:135` · `period-lock.ts:106-108` 과 같은 봉투 구조)
- localStorage 키 `jpk:collection-policy` (+ 스탬프 키), 변경 이벤트 `jpk:policy-change`
- **동기 리더 3종** (표·순수함수가 렌더 중 호출하므로 async 금지):
  - `loadPolicy(companyId): CollectionPolicy`
  - **`slaOf(companyId): CollectionSLA`** — `warn/engineLock/notice/debt` 만 뽑아 그대로 반환. **값이 없으면 `undefined` 키를 남겨라**(빈 객체 OK). 여기서 `?? 1` 같은 기본값을 다시 쓰지 마라 — 기본값 SSOT 는 `status.ts:86` 한 곳이다.
  - **`slaResolver(): (companyId: string) => CollectionSLA`** ★ 합본 대응 핵심. 아래 §2 전부가 이 함수를 받는다.
- `ensureCollectionPolicyHydrated(companyIds: string[]): Promise<void>` — 합본이면 `COMPANIES` 전체. 회사당 1회.
- `savePolicy(companyId, patch, actor): Promise<{ok, message?}>` — runTransaction · 원격 성공 후에만 캐시 · 실패 시 `ok:false` + 메시지(**성공 토스트 금지**)
- `usePolicy(companyId)` 훅 — 설정 패널 전용
- **유효성 검증(저장 거부)**: 전부 정수 · `0 ≤ warn < engineLock < notice < debt ≤ 3650` · `1 ≤ noticeDueDays ≤ 90`. 순서가 깨지면 `collectionStage` 의 `if` 사다리(`status.ts:88-92`)가 단계를 건너뛴다(예: `notice > debt` 면 「내용증명」 단계가 영구히 안 나옴 → 독촉 문서가 통째로 사라진다). **UI 검증만 하지 말고 이 파일에서도 막아라.**

### 1-2. `lib/policy/policy-impact.ts` (신규 · 순수)

「변경 시 영향 미리보기」 SSOT. 페이지에서 `.filter().length` 손롤 금지.

```
export function policyImpact(rows: ReceivableRow[], before: CollectionSLA, after: CollectionSLA, coOf: (r)=>string): {
  stageMoved: number;                     // 단계가 바뀌는 계약 수
  noticeTargetDelta: number;              // 내용증명 일괄 대상 증감 ★
  lockTargetDelta: number;                // 시동제어 필요 증감
  samples: Array<{ plate: string; customer: string; from: CollectionStage; to: CollectionStage }>;  // 최대 5건
}
```

- `noticeTargetDelta` 는 `lib/receivables-ledger.ts:105-107` `noticeTodoRows` 와 **동일 술어**를 재사용해 계산하라(별도 판정식 신설 금지 — `sheet-warnings.ts:2` 주석과 같은 규율).

### 1-3. `components/settings/CollectionPolicyBody.tsx` (신규)

`app/settings/page.tsx:55-101` `ClosingBody` 를 골격으로 복제. 요구:
- `props: { companyId: string; actor: string }`
- 입력은 `Input type="number"` (`components/ui/controls.tsx:297`) + `<label style={lab}>` 패턴 (`app/company/[id]/page.tsx:15`, `:149-153`)
- 설명 문장 스타일 = `app/settings/page.tsx:86-88` 그대로
- **저장 흐름**: 값 편집 → 「영향 확인」 → `policyImpact` 결과 3줄 표시(«단계 변동 N건 · 내용증명 대상 +N건 · 시동제어 필요 +N대» + 샘플 최대 5건) → `useConfirm()`(`components/ui/confirm.tsx:78`) 으로 확인 → `savePolicy` → **`ok` 일 때만** `toast(..., 'success')`, 아니면 `toast(..., 'error')` (`app/settings/page.tsx:73`/`:76` 와 동일)
- 「기본값으로」 버튼 — 1/3/10/30/7 을 채우되 **저장은 같은 확인 흐름을 통과**해야 한다
- `depositRefundDays`·`soonDays` 입력은 **스테이지 2·3 까지 렌더하지 마라**

### 1-4. `tests/collection-policy.test.ts` (신규)

- `slaOf` 가 미설정 회사에 대해 빈 객체를 주고, `collectionStage(d, {})` 결과가 **현재(1/3/10/30)와 동일**함 — 기본동작 회귀 잠금
- 순서 위반(`notice > debt` 등) 저장 거부
- `slaResolver` 가 회사별 다른 값을 주고, 같은 `overdueDays` 가 회사에 따라 다른 `stage` 를 내는 것
- `policyImpact` 의 `noticeTargetDelta` 가 `noticeTodoRows` before/after 차이와 일치

### 1-5. `tests/rules/firestore.rules.test.ts` 에 케이스 추가 (기존 파일 · +3건)

`:96-104` 의 period_locks 블록을 그대로 본떠라. `beforeEach`(`:36-54`)에 `company_policy/C1` 시드 1줄 추가.
- 법인(`staffA`)이 자기 회사 정책 **읽기 성공**
- 법인이 자기 회사 정책 **쓰기 실패** ★
- 다른 회사(`staffB`) 읽기 실패 / 본사(`hq`) 쓰기 성공

---

## 2. 수정 파일 (스테이지 1 — 연체 4단계일 + 내용증명 납부기한)

> **`lib/domain/status.ts` 는 수정하지 마라.** `:82` 인터페이스와 `:86` 기본값이 이미 정답이다. 손대면 235개 테스트의 기준선이 흔들린다.

### 2-1. `lib/receivables-ledger.ts` — 리졸버 주입

- `:48-52` `buildReceivableRows(contracts, history, today)` → 4번째 인자 `sla?: (companyId: string) => CollectionSLA` 추가(옵셔널 → 기존 호출 무영향)
- `:60` `st: collectionStage(v.overdueDays)` → `st: collectionStage(v.overdueDays, sla?.(String(c.companyId || '')))`
  - ★ `c.companyId` 를 **행마다** 읽어라. 페이지 `companyId` 를 쓰면 합본(`lib/session.tsx:148` `scopeAll`)에서 3사가 섞인 배열에 한 회사 정책을 적용하게 된다 — `lib/use-entity-lists.ts:27` 이 세션 스코프를 그대로 `store.list` 에 넘기고 합본은 store 가 투명 병합한다.
- `:116-131` `buildReceivablesWorkbench` 도 같은 인자를 받아 `buildReceivableRows` 로 전달
- `:69-80`·`:83-98`·`:105-107` 은 이미 `r.st.stage` 를 읽으므로 **수정 불필요**

### 2-2. `lib/sheet-rows.ts` — FleetRow 에 stage 를 미리 계산해 실어라

- `:43` `buildFleetRows(vehicles, insurance, contracts, history, today)` → 6번째 인자 `sla?: (companyId: string) => CollectionSLA`
- `:104` `warnings: rowWarnings({...})` 에 `sla: sla?.(companyId)` 를 함께 넘겨라
- `:22-39` `FleetRow` 에 `stage: CollectionStage` 필드 추가 후 `rowFrom` 에서 `overdueDays>0 ? collectionStage(od, sla?.(companyId)).stage : ''` 로 채워라
  - ★ **왜 컬럼 팩토리로 바꾸지 않는가**: `lib/sheet-cols.tsx:208` `FLEET_BASIC_COLS` 는 **const 배열**이고 `tests/row-grammar.test.ts:19,33` 이 이것을 직접 import 한다. 함수로 바꾸면 그 테스트가 깨진다. 컬럼은 «미리 계산된 값을 읽는 그릇»으로 유지하는 것이 규격이다.

### 2-3. `lib/sheet-warnings.ts`

- `:22-35` `RowWarnCtx` 에 `sla?: CollectionSLA` 추가
- `:62` `collectionStage(ctx.overdueDays)` → `collectionStage(ctx.overdueDays, ctx.sla)`
- `:63` 의 `sev` 매핑(경고=med, 나머지=high)은 **그대로**. 톤은 배지 색만이다(규격 5).

### 2-4. `lib/sheet-cols.tsx` — 계산 제거, 읽기만

- `:104-113` `stage` 컬럼: `render`/`text` 안의 `collectionStage(...)` 호출 **2개 삭제** → `r.stage` 를 읽어라. `:109` 의 색 매핑(tone→색)은 `collectionStage` 없이 만들 수 없으므로, `FleetRow` 에 `stageTone: CollectionInfo['tone']` 도 함께 실어 그것을 읽어라.
- `:12` `import { collectionStage }` 제거(미사용이 되면)
- ★ 이 파일은 `TwoLineCell` 을 import 하지 않는다 — 새로 넣지 마라(규격 2).

### 2-5. `lib/risk-ledger.ts`

- `:137` `buildFleetRows(fleet.vehicles, insurances, fleet.contracts, history, today)` → 6번째 인자로 리졸버 전달
- `:127-135` `buildRiskSheetRows` · `:333-341` `buildRiskSheet` 시그니처에 `sla?` 를 **마지막 옵셔널 인자로** 추가(기존 위치 인자 순서 절대 변경 금지 — 호출자가 `bankTx` 를 7번째로 넘긴다)
- `:23` `RISK_DDAY_BOUND = 7` 은 **스테이지 1 범위 아님. 손대지 마라.**
- `:25` `RiskSheetGroup` · `:56` `GROUP_TONE` · `:63` `GROUP_RANK` 에 키 추가 금지(규격 9)

### 2-6. 호출 지점 — 리졸버 전달 (5곳)

| 파일:줄 | 현재 | 지시 |
|---|---|---|
| `app/receivables/page.tsx:54` | `buildReceivablesWorkbench(cs, hs, TODAY)` | 4번째 인자 `slaResolver()`. `useMemo` deps 에 정책 tick 추가 |
| `lib/pagedef/defs/fleet.ts:49` | `buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY)` | 6번째 인자 리졸버 |
| `app/status/page.tsx:57` | 동일 | 동일 |
| `app/risk/page.tsx` | `buildRiskSheet(...)` 호출부 | 마지막 인자로 리졸버 |
| `components/Customer360.tsx:69` | `collectionStage(v.overdueDays)` | `collectionStage(v.overdueDays, slaOf(String(c.companyId||'')))` |

`app/dev/sample/page.tsx:13,82` 는 개발 샘플 — **그대로 둬라**(기본값 경로가 살아있는지 보는 창구).

**하이드레이트 배선**: 위 5개 페이지 중 정책을 소비하는 곳은 마운트 시 `ensureCollectionPolicyHydrated(...)` 를 태우고 완료 후 리렌더해야 한다. **`lib/finance/period-lock.ts:307-313` 의 훅 내부 패턴**(reload → hydrate.then(reload) → 이벤트 구독)을 복제해 `useCollectionPolicyTick()` 같은 훅 하나로 묶고 각 페이지는 그 tick 을 `useMemo` deps 에 넣어라. 페이지마다 손롤 리스너를 달지 마라.

### 2-7. `lib/docs/notice-claim.ts` + `lib/docs/send-notice.ts` — 납부기한

- `notice-claim.ts:41` `dueInDays = 7` 은 **기본값 그대로 유지**. 호출자가 정책값을 넘긴다.
- `send-notice.ts:27`, `:56`, `:87` 3곳: `buildNoticeClaim(rec, TODAY)` → `buildNoticeClaim(rec, TODAY, noticeDueDaysOf(String(rec.companyId || companyId)))`
- `components/PrintHost.tsx:118` `buildNoticeClaim(c, TODAY)` 도 동일하게. ★ **화면 숫자와 인쇄 숫자가 반드시 같아야 한다** (`notice-claim.ts:40` 주석 «화면·인쇄 동일 숫자»). 한쪽만 고치면 미리보기와 실제 등기의 납부기한이 달라진다.
- **`send-notice.ts:30-35` 의 `noticeDueDate` 저장 로직은 손대지 마라.** 발송 시점 정책으로 박제되는 것이 옳다.

### 2-8. `app/settings/page.tsx` — Panel 추가

- `:22` `type OpenKey` 에 `'policy'` 추가
- `:230` 「회계」 Panel **직후**에 새 Panel 삽입:
  ```
  {isOperator && !scopeAll && (
    <Panel title="회수 정책">
      <ListBox>
        <ListRow main={<CollMain open={open==='policy'}>연체 단계 기준일</CollMain>}
                 sub="경고·시동제어·내용증명·채권화 전환일 · 내용증명 납부기한"
                 onClick={() => toggle('policy')} />
        {open === 'policy' && <ExpandPad><CollectionPolicyBody companyId={companyId} actor={user.email || user.name || 'operator'} /></ExpandPad>}
      </ListBox>
    </Panel>
  )}
  ```
- 게이트·actor 문자열은 `:215`/`:225` 를 그대로 복사. **`HUB`(`:31-39`)에 항목을 추가하지 마라** — 그건 다른 페이지로 가는 링크 목록이고 좌측 메뉴 IA 와 짝이다(규격 9).
- `EXPORTS`(`:24-27`) 에 `company_policy` 추가 금지 — 정책은 내보낼 엔티티가 아니다.

---

## 3. 스테이지 2·3 (같은 오더 안에서, 순서대로)

### 스테이지 2 — 임박 알림일 (`soonDays`)

★ 스테이지 1 이 게이트 통과·커밋된 **후에** 착수. `lib/agenda.ts` 는 **현재 미커밋 수정 중**(`git status: M lib/agenda.ts`)이므로 줄번호가 이동했을 수 있다 — **줄번호가 아니라 심볼로 찾아라.**

- `lib/agenda.ts:32-36` `agendaStatusOf(d)` → `agendaStatusOf(d, soonDays = 7)`
- `lib/agenda.ts:38-43` `toneFor(d)` → `toneFor(d, soonDays = 7)`. **`d <= 30` 밴드(green)는 표시용이므로 정책화하지 마라** — 정책은 「임박」 경계 하나뿐이다.
- `lib/agenda.ts:46-51` `buildAgenda(...)` → 5번째 옵셔널 인자 `soon?: (companyId: string) => number`. `:53-70` `push` 안에서 `companyId` 를 이미 알고 있으니 그 자리에서 해결하라.
- `lib/risk-ledger.ts:23` `RISK_DDAY_BOUND = 7` → **export 는 유지**(다른 곳이 import 하면 깨진다)하되 `:233`·`:251` 의 비교를 회사별 값으로 바꿔라. `:22` 주석(«buildAgenda 임박과 동일»)이 계약이므로 **두 곳이 같은 값을 쓰는지 테스트로 잠가라.**
- `lib/risk-ops.ts:39` 의 `days >= 7`(반납지남 sev) 은 **범위 밖 — 손대지 마라.** 그건 심각도 구분이고 정책 기준선이 아니다.
- `lib/lens-filters.ts:48-50` 의 `1~29일 / 30~89일 / 90일+` 는 **aging 분석 축이다. 절대 정책과 연결하지 마라** — 회계 aging 이 회사 설정으로 흔들리면 재무 비교가 불가능해진다.

### 스테이지 3 — 보증금 반환기한 (`depositRefundDays`) ★ 신규 판정 신설

**현재 이 판정은 존재하지 않는다.** `lib/deposit.ts:42` `pendingRefund: ended && deposit > 0 && !settled` 는 기한 개념이 없는 boolean 이고, 소비처는 단 2곳이다: `app/contract/page.tsx:122`(「보증금미반환」 필터), `components/vehicle-detail/useVehicleDetail.ts:209`(`pendDeposit`).

지시:
- `lib/deposit.ts:22-32` `DepositView` 에 `refundDueDate: string` · `refundOverdueDays: number` 추가. 기산일 = `returnedDate` + `depositRefundDays`.
- 노출은 **두 곳만**:
  - `components/vehicle-detail/useVehicleDetail.ts:425` `detail: '반환/충당 필요'` → 기한 경과 시 `'반환기한 D+N 경과'`
  - `app/contract/page.tsx:88`·`:122`·`:269` 의 기존 「보증금미반환」 필터 라벨에 D+N 표기
- **금지**: `lib/agenda.ts:12` `AgendaKind` 에 항목 추가 · `lib/risk-ledger.ts:25` `RiskSheetGroup` 에 그룹 추가 · `lib/sheet-warnings.ts` 에 새 경고 코드 추가. 새 리스크 축 신설은 사장님 승인 사항(규격 9)이고, `sheet-warnings.ts` 의 `RowWarnCtx` 는 `active`(운행) 게이트라 반납 완료 계약을 애초에 못 본다(`:67` `if (ctx.active && ctx.contractRec)`) — 거기 넣으면 영구히 안 뜬다.

---

## 4. 「내가(Claude) 잡고 있는 파일」 — 요청 목록 (커서는 수정 금지)

### 요청 A — `firestore.rules`

`:74`(`period_locks` 블록) 바로 아래에 삽입 요청:

```
// 회수 정책(company_policy) — 연체 단계일·시동제어일·내용증명일·채권화일.
//   ★쓰기 = 본사만. 「며칠에 시동을 끄나」는 회수정책이자 법적 다툼의 기준선이므로
//     법인 직원이 자기 기준을 낮춰 독촉·시동제어를 회피할 수 없어야 한다(period_locks 와 같은 규율).
//     company_master(테넌트 쓰기 허용)는 «신원 입력»이라 다르다 — 같은 문서에 얹지 않은 이유.
//   읽기 = 소속 법인. 각 화면이 회수단계를 계산하므로 읽기를 막으면 단계가 전부 기본값으로 보인다.
match /company_policy/{companyId} {
  allow read: if isSignedIn() && tenantOK(companyId);
  allow write: if isHQ() && request.resource.data.companyId == companyId;
}
```

추가 요청: `:27-33` `businessColl()` 의 제외 목록에 **`&& coll != 'company_policy'`** 를 넣어주기. 없으면 `:101-116` 범용 규칙이 OR 로 걸려 **테넌트가 `company_policy` 를 create 할 수 있게 된다** (`docIdOwnedBy` 만 통과시키면 되므로 `switchplan__x` 같은 문서로 우회 가능). `:17-19` 주석의 민감 컬렉션 목록에도 한 줄 추가.

### 요청 B — `lib/company-master.ts`

**변경 요청 없음.** 정책은 별도 컬렉션이므로 이 파일을 건드릴 필요가 없다(그것이 §0-6 추천의 부수 이득이다). 커서는 `import` 조차 추가하지 마라.

### 요청 C — 확인만 (수정 아님)

- `lib/domain/status.ts:82` `CollectionSLA` 키 이름(`warn`/`engineLock`/`notice`/`debt`)을 `CollectionPolicy` 가 그대로 재사용한다는 합의. 이름을 바꾸려면 지금 말해야 한다(바꾸면 §2 전체가 흔들린다).
- `lib/domain/layers.ts:45-62` `ENTITY_LAYER` 에 `company_policy: 'system'` 추가 여부 — 감사 화면·개발도구 분류에만 쓰이므로 없어도 동작하나, 있으면 일관된다. **커서가 직접 넣지 말고 판단을 받아라.** (`lib/intake/entities.ts` `ENTITIES` 에는 **절대 추가 금지** — 그러면 인테이크·엑셀 내보내기 대상이 된다.)

---

## 5. 함정 (근거 포함)

**5-1. 회사 하나의 sla 를 넘기면 합본에서 전부 틀린다.**
`lib/use-entity-lists.ts:27` 이 세션 `companyId` 를 그대로 넘기고, `ALL_COMPANIES` 면 store 가 3사를 투명 병합한다. `app/receivables/page.tsx:21` 이 그 병합 배열을 그대로 `buildReceivablesWorkbench` 에 준다. 따라서 **`sla: CollectionSLA` 가 아니라 `(companyId) => CollectionSLA` 여야 한다.** 리졸버를 만들지 않고 단일 객체를 넘기는 구현은 반려.

**5-2. `collectionStage` 안에서 정책을 «자동으로 읽게» 만들지 마라.**
`lib/domain/status.ts` 는 순수 모듈이고 `tests/receivables.test.ts` 등이 직접 호출한다. 내부에서 localStorage/Firestore 를 보게 만들면 순수성이 깨지고 테스트가 환경에 의존한다. `lib/company-master.ts:1` 이 `'use client'` 인 것도 같은 이유로 import 금지.

**5-3. 배선 안 된 정책 입력칸을 UI 에 띄우지 마라.**
`app/settings/page.tsx:64-66` 주석이 이 죄목을 정확히 기술한다 — «로컬 저장만 하고 무조건 성공 토스트 → 서버가 모르는데 사용자는 됐다고 믿는 상태». 값을 넣었는데 아무 판정도 안 바뀌는 입력칸은 같은 종류의 거짓이다. `soonDays`·`depositRefundDays` 는 각 스테이지가 끝난 뒤에 렌더하라.

**5-4. 단계 순서 역전 = 단계 실종.**
`status.ts:88-92` 는 `d < warn → d < lock → d < notice → d < debt` 사다리다. `notice > debt` 로 저장되면 「내용증명」 분기에 도달할 수 없고 `noticeTodoRows`(`receivables-ledger.ts:105`)가 영구히 0을 반환한다 — **독촉 대상이 조용히 사라진다.** 검증을 UI 와 `savePolicy` 양쪽에 걸어라.

**5-5. 발행된 문서·집행된 조치를 소급 재계산하지 마라.**
§0-3 참조. `noticeDueDate`(`send-notice.ts:34`)·`noticeClaimAmount`·`engineDisabledAt`(`patches.ts:31`) 를 다시 계산하는 코드, 정책 저장 시 계약을 순회하는 백필, 「기존 계약에 새 정책 적용」 버튼 — **전부 금지.**

**5-6. 정책 변경으로 조치를 자동 실행하지 마라.**
현재 시동제어·내용증명은 100% 수동 클릭(`app/receivables/page.tsx:140`, `:225`)이다. 정책 저장 훅에서 발송·시동을 트리거하면 사장님이 숫자 하나 고친 것으로 등기 수십 통이 나간다.

**5-7. 차량번호 조인을 새로 만들지 마라.**
정책 미리보기에서 계약↔차량을 붙일 일이 생기면 `lib/plate.ts` 의 `plateAliasesOf`/`inPlateAliases` 를 써라. `normPlate(x.plate) === np` 를 새로 쓰면 임판→정식번호 전환 후 데이터가 사라진다. 자녀 레코드의 `plate` 소급 변경 금지.

**5-8. 자금 쓰기 경로를 열지 마라.**
`company_policy` 는 `bank_tx`/`card_tx` 와 무관하고 `/api/entities` 를 타지 않는다(클라이언트 SDK 직행 = `company_master`·`period_locks` 와 동일). 정책 저장을 `/api/entities` 에 얹지 마라 — 그 라우트는 마감 강제 경로다.

**5-9. 표를 만들지 마라.**
정책 UI 는 폼이다. `SheetCol`/`LedgerFrame`/`excel-sheet` 를 쓰면 `tests/row-grammar.test.ts:25-37` `SCREENS` 등록 의무가 발생하고 회사명(1)·식별자(2)·이름(3)·X분류(4)·X상태(5) 를 만족시킬 수 없다. 미리보기 샘플 5건도 표가 아니라 텍스트 줄로 표시하라.

**5-10. 행 틴트·좌측 레일 금지.**
정책 변경으로 단계가 바뀌는 행을 강조하고 싶어도 `lib/work-rail.ts` `workRailStyle` 은 항상 `undefined` 여야 한다(규격 5). 배지 색만 쓴다.

**5-11. 행 높이·폰트 유지.**
`--ledger-row-h` 데스크톱 30px / 모바일 34px. 정책 패널은 표가 아니지만 `ExpandPad` 안의 `Input` 은 `size="sm"` 을 쓰고 폰트를 키우지 마라(규격 3·B2B 조밀 원칙).

**5-12. 감사로그 actor 없으면 조용히 실패한다.**
`firestore.rules:55` 가 `byUid == request.auth.uid` 를 요구하고 `lib/audit.ts:34` 는 actor 미주입 시 `'system'` 을 쓴다 → 규칙 거부. `getAuditActor()` 가 null 이면 저장을 진행하되 **로그 실패를 삼키지 말고 콘솔·토스트에 드러내라**(`lib/store.ts:392` 는 감사 실패를 삼키는데, 그건 본 동작을 막지 않기 위한 것이다. 정책 변경은 감사가 본질이므로 최소한 사용자에게 알려야 한다).

**5-13. 커밋 순서 — 미커밋 39개와 부딪히지 마라.**
`app/management/page.tsx`·`lib/agenda.ts`·`lib/master-ledger-cols.tsx`·`lib/contract-ops.ts` 는 현재 다른 오더로 수정 중이다. 스테이지 1 은 그 중 어느 파일도 필요 없다(§2 목록 확인). 스테이지 2 만 `lib/agenda.ts` 를 건드리므로 **반드시 그 오더들이 커밋된 뒤에** 착수하라.

---

## 6. 게이트

각 스테이지 종료 시 전부 통과해야 한다.

```
npx tsc --noEmit                        # 기준 0 → 0 유지
npx vitest run                          # 기준 235 → 스테이지1 후 240+ (신규 4~6건)
npx vitest run tests/collection-policy.test.ts
npx vitest run tests/row-grammar.test.ts      # 58건 유지 — FleetRow 필드 추가가 컬럼 순서를 흔들지 않았는지
npx vitest run tests/receivables.test.ts tests/sheet-warnings.test.ts
npm run test:rules                      # 기준 36 → 39 (요청 A 반영 후)
```

`npm run build` **금지**(dev 6006 상시 가동). dev 서버를 죽이지 마라.

---

## 7. 금지사항 (위반 시 반려)

1. `lib/company-master.ts` · `firestore.rules` **직접 수정** — §4 요청 목록으로만
2. `lib/domain/status.ts:86` 기본값(1/3/10/30) 변경 · `collectionStage` 본문 로직 변경
3. `collectionStage` 내부에서 저장소·전역 상태를 읽게 만들기
4. 단일 `CollectionSLA` 객체 주입(리졸버 아님)
5. 발행된 내용증명·집행된 시동제어의 소급 재계산·백필·마이그레이션
6. 정책 저장 시 조치 자동 실행(발송·시동)
7. `app/management/page.tsx` 에 정책 UI 추가 · `HUB`(`settings:31-39`) 항목 추가 · 좌측 메뉴(`lib/nav.ts`)·리스크 4그룹(`risk-ledger.ts:25`)·`AgendaKind`(`agenda.ts:12`) 변경
8. `lib/lens-filters.ts:48-50` aging 버킷을 정책과 연결
9. 정책 UI 를 표(`SheetCol`/`LedgerFrame`)로 구현
10. `TwoLineCell` import · 행 틴트/좌측 레일 · 행 높이·폰트 확대 · `--brand` 변경
11. `ENTITIES`(`lib/intake/entities.ts`) 또는 `EXPORTS`(`settings:24-27`) 에 `company_policy` 추가
12. `/api/entities` 를 정책 저장 경로로 사용
13. 낙관적 갱신 · 무조건 성공 토스트 (서버 `ok` 확인 후에만)
14. 배선되지 않은 정책값을 UI 에 노출
15. `normPlate` 정확일치 조인 신설 · 자녀 레코드 `plate` 소급 변경

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
