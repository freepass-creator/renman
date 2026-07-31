`npx tsc --noEmit` = EXIT 0 (미커밋 39파일 상태에서 확인). 아래가 오더 본문이다.

---

# 커서 구현 오더 — ①차량회수 진행추적+채권화 원클릭 ②감사로그 기간·엑셀·딥링크

> 작성 근거: 전부 실파일 정독. 인용은 `파일:줄`. 추측 없음.
> 착수 전 `npx tsc --noEmit` EXIT 0 확인(현재 0). `npm run build` 금지, dev 6006 유지.

---

## §0. 스코핑 판정 요약 (먼저 읽어라)

| 질문 | 판정 | 근거 |
|---|---|---|
| 새 메뉴? | **금지·불필요** | `lib/nav.ts:5-14` IA 확정 주석 · 같은 파일 `ERP_MENU_TREE` `contract-ledger.views` 에 이미 `contract-schedule`(회차별 청구)이 «뷰»로 들어가 있음(`lib/nav.ts` ledger 그룹) |
| 리스크 4그룹 추가? | **금지** | `lib/risk-ledger.ts:25` `RiskSheetGroup = '미완료'\|'미납'\|'만기'\|'휴차'` · `app/risk/page.tsx:38` `RISK_GROUPS` |
| 리스크 3축 필터(구분·분류·상태)로 표현 가능? | **불가 — 하지 마라** | 회수 대상 계약은 이미 `미납`/`반환미수` 행으로 존재한다(`lib/risk-ledger.ts:208-229`). 회수 행을 새 id로 push하면 `seen` dedupe(`:142-147`)를 통과해 **같은 계약의 미수가 2행**이 되고 `xl.exportItem` 합계·`counts.미납`이 이중계상된다 |
| 정답 배치 | **계약관리 「보기」 4번째 뷰 = `회수`** (커서가 회차원장을 넣은 그 방식) | `app/contract/page.tsx:36` `ContractSheetView='기본'\|'전체'\|'회차'` → `'회수'` 추가 · `:302-313` PillTabs · `:197-201` frameCols/frameRows 분기 |
| 리스크 → 회수 진입 | 우클릭 메뉴 딥링크 `/contract?view=회수&open={contractKey}` (행 추가 아님) | `app/risk/page.tsx:178-226` `ctxItems` · `:148` `noticeTargets` 와 동일 패턴 |
| 감사로그 기간필터 | `PeriodBar` = **`components/ui/controls.tsx:306`** (`@/components/ui` 배럴 `components/ui/index.tsx:10`) | 쓰는 원장: `app/risk/page.tsx:243`, `app/contract/page.tsx:229`, `app/asset/page.tsx:195`, `app/work/page.tsx:384`, `app/cash/page.tsx:619,728`, `app/status/page.tsx:118`, `app/pnl/page.tsx:56`, `app/vat/page.tsx:41` |
| 감사로그 엑셀 | `useSheetExport`(`components/ui/use-sheet-export.ts:54-131`) + `buildSheetMatrix`(`lib/sheet-export.ts:125`) 재사용. **LedgerFrame 없이 `onView` 수동 호출** | `ExcelSheet` 는 확장행(Diff) 미지원 → 감사표 구조 유지. `onView` 규약은 `components/ui/excel-sheet.tsx:210` |

---

## §A. 오더① 차량회수 진행추적 + 채권화 원클릭

### A-1. 신설 파일

#### `lib/contracts/repossession.ts` (신설 · 순수·SSOT)

행 생성·판정 전부 여기. 페이지에서 손롤 필터 금지.

```ts
/**
 * 차량회수 원장 — 「채권화했지만 차를 아직 못 가져온 계약」 추적. 읽기 전용·순수.
 *   미수는 computeContractView(SSOT)만 쓴다. 새 미수식 신설 금지.
 *   ★returnedDate 를 회수완료로 쓰지 않는다 — contract-ops.ts:163 asOf clamp 로 미수가 멈춘다.
 */
import { computeContractView, deriveStatus } from '@/lib/contract-ops';
import { collectionStage, type CollectionStage } from '@/lib/domain/status';
import { ymd, ddayFrom } from '@/lib/contracts/dates';
import { companyShort } from '@/lib/companies';
import type { EntityRecord } from '@/lib/intake/entities';
import type { BadgeTone } from '@/components/ui/misc';

/** 회수분류 — «어떤 경로로 가져오는가». 값은 운영 중 교체 가능(형태만 확정). */
export const REPO_KINDS = ['자발반납', '방문회수', '탁송회수', '강제집행', '소재불명'] as const;
/** 회수상태 — «진행 단계». 값은 운영 중 교체 가능(형태만 확정). */
export const REPO_STATUSES = ['미착수', '연락중', '위치확인', '회수예정', '회수완료', '회수불능'] as const;

export type RepoLedgerRow = {
  id: string;               // = contractKey (계약 1건 = 1행)
  contractKey: string; rec: EntityRecord;
  companyId: string; company: string;
  plate: string; contractorName: string; contractorPhone: string;
  contractNo: string; carName: string;
  kind: string;             // repoKind (미지정 = '')
  status: string;           // repoStatus (빈값 → '미착수' 파생)
  debtStartedDate: string; repoStartedDate: string; repoDueDate: string; repoDoneDate: string;
  repoNote: string;
  elapsedDays: number;      // 회수경과일
  net: number; overdueDays: number;
  stage: CollectionStage;   // collectionStage(overdueDays).stage
  candidate: boolean;       // 채권화 후보(운행 + D+30↑) — 아직 채권화 안 한 것
  badgeTone: BadgeTone;
};
```

판정 규칙(주석으로 그대로 박아라):

```ts
const status = deriveStatus(rec);                 // contract-ops.ts:125
const v = computeContractView(rec, today);        // net·overdueDays SSOT
const held = !ymd(rec.returnedDate);              // 차가 아직 임차인 손에 있다
const inRepo = !!(rec.repoStatus || rec.repoKind || rec.repoStartedDate);
const isDebt = status === '채권';
const candidate = status === '운행' && v.net > 0
  && collectionStage(v.overdueDays).stage === '채권화';   // domain/status.ts:85-93 (기본 D+30)
if (!((isDebt && held) || (inRepo && held) || candidate)) continue;
```

경과일 기산(회수완료면 그 날로 고정 — 계속 늘어나면 거짓 숫자):

```ts
const basis = ymd(rec.repoStartedDate) || ymd(rec.debtStartedDate) || '';
const end = ymd(rec.repoDoneDate) || today;
const elapsedDays = basis
  ? Math.max(0, -(ddayFrom(end, basis) ?? 0))
  : v.overdueDays;                                 // 기산일 없으면 연체경과(contract-ops.ts:39)
```

배지 톤: `회수불능`/`소재불명`=red · `미착수`(=후보)=amber · `연락중`/`위치확인`/`회수예정`=blue · `회수완료`=green. **행 틴트·좌측 레일 금지**(`lib/work-rail.ts` `workRailStyle` 은 항상 undefined 유지).

집계:

```ts
export function summarizeRepoLedger(rows: RepoLedgerRow[]): {
  count: number; openCount: number; doneCount: number;
  oldestDays: number; netTotal: number; candidateCount: number;
}
```
정렬: `elapsedDays desc → net desc → plate ko` (오래 못 가져온 것·큰 돈이 위).

#### `lib/repo-cols.tsx` (신설 · 열 카탈로그)

`lib/risk-cols.tsx:21-121` 을 형판으로 복제(같은 헤더 주석 규격 유지). `TwoLineCell` **import 금지**(`tests/row-grammar.test.ts:96-109`). `money()`=표 · `won()`=합계(`lib/won-korean.ts` 규격, 규칙 10).

```ts
export const REPO_SHEET_KEYS: SheetViewKeys = {
  // 열 순서 기준 = 자산관리: 회사(1)·식별자(2)·이름(3)·분류(4)·상태(5)·나머지
  basic: ['company','plate','contractorName','kind','status',
          'contractNo','elapsedDays','net','overdueDays','debtStartedDate','repoDueDate','contractorPhone'],
  all:   ['company','plate','contractorName','kind','status',
          'contractNo','carName','elapsedDays','net','overdueDays','stage',
          'debtStartedDate','repoStartedDate','repoDueDate','repoDoneDate','contractorPhone','repoNote'],
};
export const REPO_LEDGER_COLS = _views.basic;
export const REPO_LEDGER_ALL_COLS = _views.expanded;
export const REPO_DETAIL_SECTIONS = buildDetailSections(REPO_LEDGER_ALL_COLS, REPO_DETAIL_DEFS);
```

**행 문법 설계표(확정)** — 라벨은 이 표 그대로:

| # | key | 라벨 | 성격 | xf/align |
|---|---|---|---|---|
| 1 | `company` | 회사명 | 회사 | pin, priority 2 |
| 2 | `plate` | 차량번호 | 식별자 | mono·700 |
| 3 | `contractorName` | 계약자 | 이름 | 빈값 `LEDGER_EMPTY.none` |
| 4 | `kind` | **회수분류** | 분류(Badge gray) | 빈값 `LEDGER_EMPTY.unassigned` |
| 5 | `status` | **회수상태** | 상태(Badge `badgeTone`) | 빈값→'미착수' |
| 6 | `contractNo` | 계약번호 | 보조식별 | |
| 7 | `elapsedDays` | 회수경과일 | 수치 | `align:'r'`, `xf:'int'`, `sortNum` |
| 8 | `net` | 미수금액 | 돈 | `align:'r'`, `xf:'money'`, `money()` |
| 9 | `overdueDays` | 연체일 | 수치 | `align:'r'`, `xf:'int'` |
| 10 | `debtStartedDate` | 채권화일 | 날짜 | `xf:'date'` |
| 11 | `repoDueDate` | 회수예정일 | 날짜 | `xf:'date'` |
| 12 | `contractorPhone` | 연락처 | PII | 마스킹은 export에서 자동(`lib/pii.ts:63`) |
| 전체뷰 | `carName` 차명 · `stage` 회수단계 · `repoStartedDate` 회수착수일 · `repoDoneDate` 회수완료일 · `repoNote` 회수메모 | | | |

문법 검증(직접 대조했다): `[0]='회사명'`(`row-grammar.test.ts:43`) ✓ · `[3]/[4]`가 `분류$`/`상태$` 이고 접두어 둘 다 `회수`(`:49-69`) ✓ · BANNED(`:74`)에 해당 라벨 없음 ✓ · 신원슬롯 `[1]='차량번호'`,`[2]='계약자'` 가 금지 정규식 `분류$|상태$|금액$|일자$|기한$|만기$…`(`:90`) 미매치 ✓.

> 라벨 대안: 「회수 큐」(=미수 회수, `app/risk/page.tsx:186,309`)와 말이 겹친다. 뷰 이름은 **「차량회수」**로 못박고 열은 `회수분류/회수상태` 유지. 사장님이 겹침을 싫어하면 `차량회수분류/차량회수상태`로 일괄 교체 가능(접두어 쌍만 지키면 테스트 통과).

#### `tests/repossession.test.ts` (신설)
- 채권+미반납 포함 · 정상반납(returnedDate 있음, repo필드 없음) 제외 · `운행`+D+30↑ 후보 포함 · `repoDoneDate` 이후 `elapsedDays` 고정 · `summarizeRepoLedger` 합계·`oldestDays`.

#### `tests/repo-transition.test.ts` (신설)
- `canTransition('운행','debt')===true` · `('대기','debt')===false` · `('채권','debt')===false` · `nextStatus('운행','debt')==='채권'`
- **`patchDebt(...)` 결과 객체에 `'returnedDate' in patch === false`** ← 이 단언이 이번 오더의 핵심 회귀 방어
- `planTransition({action:'debt'}).guard({status:'채권'})===false`, `guard({returnedDate:'…'})===false`, `guard({status:'운행'})===true`
- `canSetStatus('채권','운행')===false` (되돌리기 불가 명문화 — `tests/transitions.test.ts:43-47` 와 동일 사실)

### A-2. 수정 파일 — 위치 지정 (미커밋 파일 아님 = 바로 편집 가능)

| 파일:줄 | 변경 |
|---|---|
| `lib/domain/status.ts:30` | `export type ContractAction = 'deliver'\|'return'\|'terminate'\|'extend'\|'debt';` |
| `lib/domain/status.ts:32-35` | `'운행': { return:'반납', terminate:'해지', extend:'운행', debt:'채권' }`. **`'대기'` 에는 넣지 마라**(인도 전 = 가져올 차가 없다). `'반납'/'해지'/'채권'` 은 계속 전이 없음 |
| `lib/contracts/patches.ts:16` 뒤 | `patchDebt` 신설 (아래 코드) |
| `lib/contracts/commit-transition.ts:19` | `TransitionAction = 'deliver'\|'return'\|'debt'` |
| `lib/contracts/commit-transition.ts:40-41` 옆 | `const DEBT_BLOCK = ['반납','해지','채권'];` |
| `lib/contracts/commit-transition.ts:49-57` | `category = action==='debt' ? '채권화' : …` · `transitionPatch = action==='debt' ? patchDebt(contract, date, extra) : …` · `title = '채권화 · 미수 ' + …` |
| `lib/contracts/commit-transition.ts:62-68` | guard 분기: `action==='debt' ? !(fresh.returnedDate \|\| DEBT_BLOCK.includes(status)) : …` |
| `lib/schema/contract.ts:17-60` | 신규 필드 선언(고스트필드 오타 방어 — `tests/schema.test.ts:24` 취지): `debtStartedDate/debtReason/repoKind/repoStatus/repoStartedDate/repoDueDate/repoDoneDate/repoNote` 전부 `z.string().optional()` |
| `lib/ledger-filter-defs.ts:56-63` | `CONTRACT_FILTER_DEFS` 에 `{key:'repoKind',label:'회수분류'}, {key:'repoStatus',label:'회수상태'}` push (`scheduleStatus` 와 동일 방식) |
| `tests/row-grammar.test.ts:13,28` | `import { REPO_LEDGER_COLS } from '@/lib/repo-cols';` + `SCREENS` 에 `{ name: '차량회수', cols: REPO_LEDGER_COLS as readonly Col[] }` 추가 |

```ts
// lib/contracts/patches.ts
/**
 * 채권화 — 상태만 바꾼다. ★returnedDate 를 절대 쓰지 않는다.
 *   근거: contract-ops.ts:163 `asOf = returnedDate<today ? returnedDate : today` +
 *        :156-161 applyReturnedProration → returnedDate 를 넣으면 그 날짜로 미수가 멈추고
 *        일할 환불까지 걸려 «차는 못 받았는데 채권이 줄어든다».
 *   차를 실제로 되찾은 사실은 repoDoneDate 로 기록한다(반납 아님 = 정산 앵커 아님).
 */
export function patchDebt(rec: EntityRecord, date: string, extra: EntityRecord = {}): EntityRecord {
  return { status: '채권', endReason: '채권보전', debtStartedDate: date, repoStatus: '미착수', ...extra };
}
```
(`endReason:'채권보전'` 은 이미 선택지에 있다 — `lib/intake/entities.ts:301`)

### A-3. `app/contract/page.tsx` 배선 (미커밋 파일 → §C 머지 주의)

앵커 6곳. 줄번호는 커서 편집으로 밀릴 수 있으니 **앵커 코드로 찾아라**.

1. `:36` `type ContractSheetView = '기본' | '전체' | '회차'` → `| '회수'` 추가
2. `:137-155` 블록 옆에 회수 파이프 추가(회차와 대칭):
```ts
const repoAll = useMemo(() => (sheetView === '회수' ? buildRepoLedger(contracts, TODAY) : []), [contracts, sheetView]);
const repoRows = useMemo(() => {
  if (sheetView !== '회수') return [] as RepoLedgerRow[];
  return repoAll.filter((r) => {
    if (detailFilters.repoKind && r.kind !== detailFilters.repoKind) return false;
    if (detailFilters.repoStatus && r.status !== detailFilters.repoStatus) return false;
    const d = r.repoStartedDate || r.debtStartedDate;            // 기간축 = 기산일
    if (range.from && (!d || d < range.from)) return false;
    if (range.to && (!d || d > range.to)) return false;
    return textMatch(q, r.company, r.contractNo, r.contractorName, r.plate, r.kind, r.status);
  });
}, [sheetView, repoAll, detailFilters.repoKind, detailFilters.repoStatus, range.from, range.to, q]);
const repoStats = useMemo(() => summarizeRepoLedger(repoRows), [repoRows]);
```
3. `:164-182` `useSheetExport` — 제네릭 union에 `| RepoLedgerRow`, `title: isRepo ? '차량회수' : …`, `sumLine: isRepo ? \`회수 ${repoStats.openCount}대 · 최장 ${repoStats.oldestDays}일 · 미수 ${won(repoStats.netTotal)}\` : …`
4. `:197-201` `frameCols/frameRows`:
```ts
const isRepo = sheetView === '회수';
const frameCols = isRepo ? REPO_LEDGER_COLS : isSchedule ? SCHEDULE_LEDGER_COLS : (sheetView==='전체' ? …);
const frameRows = isRepo ? repoRows : isSchedule ? scheduleDisplay : rows;
```
5. `:243-245` 필터 defs 분기 → 3분기: `isRepo` 면 `CONTRACT_FILTER_DEFS.filter(d => d.key==='repoKind'||d.key==='repoStatus')`, `options={{ repoKind:[...REPO_KINDS], repoStatus:[...REPO_STATUSES], … }}`. `:288-299` stats 에 회수 분기(문구 = **「회수 N대 · 최장 D일 · 미수 ₩x · 후보 K건」** ← 사장님이 «한 화면에 없다»고 한 그 숫자). `:302-313` PillTabs `tabs` 에 `{ key:'회수', label:'차량회수' }`. `:316-324` empty = `'지금 회수해야 할 차량이 없습니다'`. `:327-331` rowKey → `isRepo ? (r as RepoLedgerRow).id : …`. `:338-346` onRowDoubleClick → `isRepo ? setSelected(contractMasterRow((row as RepoLedgerRow).rec, TODAY)) : …` (회차 뷰와 동일 변환)
6. `:84-104` `?open` effect 에 `?view=` 수신 추가:
```ts
const v = searchParams.get('view');                 // 규약: 기본|전체|회차|회수
if (v === '회수' || v === '회차' || v === '전체') setSheetView(v as ContractSheetView);
```
`PeriodBar key={sheetView}`(`:229`)가 이미 있으므로 뷰 전환 시 기간이 `전체`로 리셋된다 — 유지.

### A-4. 채권화 원클릭 — 가드 명세 (그대로 구현)

배치: 회수 뷰 우클릭 메뉴 + `LedgerRecordPanel actions`(`app/contract/page.tsx:377-405` 형판). 형판 코드 = `components/vehicle-detail/useVehicleDetail.ts:270-286` `logIgnition`(confirm → patch → history → toast) + `lib/contracts/commit-transition.ts:79-97` `runTransition`.

```ts
async function debtOne(row: RepoLedgerRow) {
  const st = deriveStatus(row.rec);
  // 1) 전이 가드 — 클라이언트 1차
  if (!canTransition(st, 'debt')) { toast(`${st} 상태에선 채권화할 수 없습니다`, 'error'); return; }
  // 2) 확인 대화 — «되돌릴 수 없다»를 반드시 문장으로
  if (!(await confirm({
    danger: true,
    message: `${row.contractorName} · ${row.plate}\n미수 ${won(row.net)} · ${row.overdueDays}일 연체\n\n`
           + `채권화하면 계약이 «종료(채권)»로 바뀌고 운행 상태로 되돌릴 수 없습니다.\n`
           + `(되살리려면 새 계약을 만들어야 합니다.) 진행합니까?`,
  }))) return;
  // 3) 서버 커밋 — fresh 재확인·활동기록까지 오케스트레이터가 함
  const target = resolveWriteCompany(companyId, row.rec);
  if (!target) { toast(NEED_COMPANY, 'error'); return; }
  const res = await runTransition({ action: 'debt', contract: row.rec, date: TODAY,
    extra: { debtReason: `미수 ${won(row.net)} · ${row.overdueDays}일 연체` },
    actor: user.name, sessionCompanyId: companyId, target });
  // 4) 서버 성공 후에만 화면·토스트 (낙관적 갱신 금지)
  if (!res.ok) {
    toast(res.reason === 'ALREADY' ? '이미 종료·채권 처리된 계약입니다'
        : res.reason === 'SAVE_FAIL' ? '채권화 저장 실패 — 다시 시도' : NEED_COMPANY, 'error');
    return;
  }
  toast(`채권화 완료 · ${row.plate} · 미수 ${won(row.net)}`, 'success');
}
```

방어 4중(전부 이미 존재 — 새로 만들지 마라):
1. `canTransition`(`lib/domain/status.ts:37`) — 액션 기반 SSOT
2. `runTransition` fresh 재조회 + `guard`(`commit-transition.ts:85-86`) — 다른 기기 중복 실행 차단
3. `commitUpdate` → `assertLegalContractStatus`(`lib/commit.ts:45-58`) — 범용 편집기까지 덮는 백스톱
4. `AuditingStore.update`(`lib/store.ts:418-425`) — `audit_logs` 1건 자동(before/after = patch 키만, `lib/audit.ts:76-82`)

**되돌리기**: 제공하지 마라. `canSetStatus('채권','운행')=false`(`lib/domain/status.ts:52-57`, `tests/transitions.test.ts:43-47`)로 클라이언트·커맨드층 모두 막혀 있고 `audit_logs` 는 `update/delete: if false`(`firestore.rules:56`)라 로그 정정도 불가하다. 오조작 복구는 «새 계약 생성»뿐 — 그래서 확인 대화 문구에 그 사실을 넣는다. 대신 **회수상태 되돌리기는 허용**(`repoStatus`는 자유 편집 필드 = 실무 정정 경로).

일괄 채권화: `LedgerSelectionBar` 로 넣고 싶으면 `app/risk/page.tsx:167-176` `sendBulk` 형판을 쓰되 **건별 순차 실행 + 실패건 개별 토스트**. 1건이라도 실패하면 «N건 완료»만 띄우지 말고 실패 목록을 남길 것.

### A-5. 함정 (근거 있음)

1. **`returnedDate` 로 회수완료 기록 금지** — `lib/contract-ops.ts:163` `asOf` clamp + `:156-161` 일할 환불. 미수가 그 날짜로 얼어붙고 줄어든다. `patchTerminate`/`patchReturn`(`patches.ts:10-16`)이 `returnedDate` 를 쓰는 것과 **의도적으로 다르다**.
2. **`patchTerminate` 재사용 금지** — 해지는 `endReason:'중도해지'` + `returnedDate` 를 쓴다(1번 함정 직행).
3. **회수 행을 `risk-ledger` 에 push 금지** — `:142-147` dedupe + `:208-229` 미납 행과 같은 계약 → 미수 이중계상.
4. **차량 조인이 필요해지면 반드시 별칭** — `plateAliasesFor`/`inPlateAliases`(`lib/plate.ts:59-71`) 또는 `findVehicleByPlate`(`:74-79`). `normPlate(x.plate)===np` 정확일치 신설 금지(임판→정식번호 전환 시 사라진다). **이번 v1은 계약 필드만 쓰므로 차량 조인 없음** — 굳이 만들지 마라(차량상태·위치가 필요해지면 그때 별칭으로).
5. **`_key` 로만 update** — 차량은 «등록 당시 번호»가 문서 ID다(`components/vehicle-detail/useVehicleDetail.ts:180-182`). 계약도 `key = String(rec._key)` 고정(`commit-transition.ts:80`).
6. **자금 2문서 금지** — 채권화는 돈 문서를 쓰지 않는다. 회수비용(탁송료 등)을 같이 기록하고 싶어도 이번 오더에선 만들지 마라. 만들 때는 `bank_tx → contract` 순서(계약 먼저면 미수만 깎인 영구 고아).
7. **감사 label 은 «계약 수정»으로만 남는다**(`lib/store.ts:424` `this.label(entityKey,key,'수정')`). label 커스터마이즈를 위해 store 시그니처를 건드리지 마라. 대신 `patch` 에 `debtStartedDate`·`debtReason` 를 넣어 Diff(`app/audit/page.tsx:114-138`)로 남기고, `runTransition` 이 쓰는 `history` 활동기록(`category:'채권화'`)으로 사람이 읽는 흔적을 남긴다.
8. **행 높이·2줄 셀** — `--ledger-row-h` 30/34px 유지, `TwoLineCell` import 금지(`tests/row-grammar.test.ts:96-109,111-134`).

---

## §B. 오더② 감사로그 — 기간필터 · 엑셀 · 딥링크

대상: `app/audit/page.tsx` (**미커밋 아님 = 자유 편집**). 현 구조: `FacetPage` + `FacetRail`(행위×대상 멀티셀렉트 `:36-57`) + 손롤 표(`:70-107`) + 확장행 Diff(`:93-100,114-138`).

### B-1. 기간 범위 — `PeriodBar` 재사용

- 지목: **`components/ui/controls.tsx:306`** `PeriodBar({latest, initial, onRange, size})` → `@/components/ui` 에서 import.
- 배치: `WorkbenchBar` 의 `mid` 슬롯(`components/WorkbenchBar.tsx:80,95`). `app/pnl/page.tsx:56` 형판:
```tsx
tools={<WorkbenchBar mid={<PeriodBar latest={latest} initial="전체" size="sm" onRange={setRange} />}
  search={{ value:q, onChange:setQ, placeholder:'요약·행위자·대상' }} actions={…} />}
```
- `initial="전체"` 로 시작하라. `"월간"` 을 기본으로 두면 **기존 로그가 기본 화면에서 사라져 «기록 없음»으로 오인**된다(현재는 전량 표시 `:54-57`).
- `latest` = `latestDateOf(rows, r => kstDate(r.at), TODAY)` (`lib/ledger-stats.ts:138-149`).

★**KST 함정(반드시 처리)**: `AuditLog.at` 은 `new Date().toISOString()` = **UTC**(`lib/audit.ts:36`). `PeriodBar` 범위는 `todayKST()` 기반 KST 날짜(`lib/contracts/dates.ts:3-7` 주석이 이 함정을 명시). `at.slice(0,10)` 으로 비교하면 KST 00:00~09:00 에 생긴 로그가 **하루 앞 날짜로 걸려 기간 조회에서 빠진다**(세무조사 때 «그 날 기록 없음»). 해결:

```ts
// lib/contracts/dates.ts — todayKST 바로 아래에 추가 (SSOT 1곳)
/** ISO(UTC) 타임스탬프 → KST 날짜 'YYYY-MM-DD'. audit_logs.at 처럼 UTC ISO 를 날짜축에 쓸 때 필수. */
export function kstDate(iso: unknown): string {
  const t = new Date(String(iso || ''));
  if (Number.isNaN(t.getTime())) return '';
  return new Date(t.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
```
테스트(`tests/audit-export.test.ts`): `kstDate('2026-07-31T15:30:00.000Z') === '2026-08-01'`, `kstDate('2026-07-31T00:00:00.000Z') === '2026-07-31'`, `kstDate('') === ''`.

표의 `시각` 열 표시(`app/audit/page.tsx:18` `fmtAt`)도 지금 UTC를 그대로 보여준다 → `fmtAt` 을 KST 표시로 고치고 한 번만 고쳐라(`kstDate` + 시:분).

필터 결합(`:54-57` 교체) — **`filtered` 를 `useMemo` 로 감싸라**(§B-2에서 `onView` effect deps로 쓴다. 배열이 매 렌더 새로 만들어지면 `components/ui/ledger-frame.tsx:138-141` 이 경고한 `onView→setState` 루프 계열 문제가 된다):

```ts
const actionKey = actionSel.join(','), entityKey = entitySel.join(',');   // deps 안정화
const filtered = useMemo(() => rows.filter((r) => {
  const d = kstDate(r.at);
  if (range.from && (!d || d < range.from)) return false;
  if (range.to && (!d || d > range.to)) return false;
  return (actionSel.length === 0 || actionSel.includes(r.action))
    && (entitySel.length === 0 || entitySel.includes(r.entityType))
    && textMatch(q, r.label, r.by, r.byEmail, entLabel(r.entityType), AUDIT_ACTION_LABEL[r.action], r.entityId);
}), [rows, actionKey, entityKey, q, range.from, range.to]);
```

### B-2. 엑셀 — 공용 훅 재사용 (시그니처 그대로)

읽은 시그니처(`components/ui/use-sheet-export.ts:54-131`):
```ts
useSheetExport<T>({ title, filterSummary?, sumLine?, fileName?, mask? })
  → { onView(v:{rows:T[];cols:SheetCol<T>[]}), exportItem(opt?:{selected?:T[];unmasked?:boolean}): ContextMenuItem, count }
```
- `mask` 기본 true(`lib/sheet-export.ts:138`) — **끄지 마라**.
- `exportItem({unmasked:true})` 는 `isOperator` 아니면 자동 비활성(`:105-107`)이고 확인 대화 내장(`:116-119`).
- 파일명·프리앰블(타이틀/메타/공백/헤더 4행)·오토필터는 `buildSheetMatrix`(`lib/sheet-export.ts:125-179`)가 처리.

감사로그는 `LedgerFrame`이 아니므로 **`onView` 를 수동 호출**한다:

```tsx
// 회사열 규칙을 손으로 지켜라 — ExcelSheet 는 단일회사 세션에서 company 열을 뺀다(excel-sheet.tsx:22,177-180,210)
const cols = useMemo(() => (scopeAll ? AUDIT_SHEET_COLS : AUDIT_SHEET_COLS.filter((c) => c.key !== 'company')), [scopeAll]);
const xl = useSheetExport<AuditLog>({
  title: '감사로그',
  filterSummary: () => {
    const parts = [...actionSel.map((k)=>AUDIT_ACTION_LABEL[k]||k), ...entitySel.map(entLabel)];
    if (range.from || range.to) parts.push(`${range.from || '…'}~${range.to || '…'}`);
    if (q.trim()) parts.push('검색');
    return parts.join(' · ') || '전체';
  },
});
useEffect(() => { xl.onView({ rows: filtered, cols }); }, [filtered, cols, xl.onView]);   // ★xl 전체가 아니라 xl.onView
const xlItem = xl.exportItem();
const xlRaw = xl.exportItem({ unmasked: true });
// WorkbenchBar actions:
//   <Btn variant="ghost" disabled={xlItem.disabled} onClick={xlItem.onClick}>{xlItem.label}</Btn>
//   {isOperator && <Btn variant="ghost" disabled={xlRaw.disabled} onClick={xlRaw.onClick}>{xlRaw.label}</Btn>}
//   <Btn variant="ghost" onClick={reload}>새로고침</Btn>   ← 기존 유지(:63)
```

#### `lib/audit-cols.tsx` (신설)

```ts
export const AUDIT_SHEET_COLS: SheetCol<AuditLog>[] = [
  company(회사명) · at(시각, xf:'text' — 날짜+시각이라 date로 자르면 시각이 사라진다) ·
  action(행위, Badge ACTION_TONE) · entityType(대상) · label(요약) ·
  entityId(대상키, mono) · by(행위자) · byEmail(이메일) · changes(변경내용)
];
```
- 이 파일은 **`tests/row-grammar.test.ts` SCREENS 에 넣지 않는다.** 근거: SCREENS(`:25-37`)는 «엔티티 1건=1행» 원장 표만 담고, 감사로그는 append-only 이벤트 트레일이라 «회사(1)·식별자(2)·이름(3)·X분류(4)·X상태(5)» 문법이 성립하지 않는다(`행위`는 상태가 아니고 `시각`이 1차 축이다). **`SCREENS` 배열 위에 이 예외 근거를 주석 2줄로 남겨라** — 안 남기면 다음 사람이 «규격 위반»으로 오독한다. (사장님이 등록을 원하면 `감사분류=대상 / 감사상태=행위` 로 라벨을 갈아야 하며, 화면 배지 의미가 훼손된다 → 승인 사항.)

### B-3. PII 마스킹 요구 (★필수 — 지금 배선 0건)

현 상태: `lib/pii.ts` 의 `PII_MASKERS`(`:62-74`)는 **열 key 기준**으로만 동작한다(`lib/sheet-export.ts:46-78,91`). 감사로그의 개인정보는 열이 아니라 **`before/after` 객체 안**에 `contractorPhone`·`contractorAddress`·`contractorLicenseNo`·`contractorBirth`·`ownerBizNo`·`account` 등으로 들어 있다(`lib/audit.ts:25-26`, 실제 표시 `app/audit/page.tsx:114-138`). 따라서:

- **`changes` 열의 `text()` 안에서 키별로 직접 마스킹해야 한다.** `sheet-export` 의 자동 방어는 `key='changes'` 라 `PII_MASKERS` 미적용 + `looksLikePhone`(`lib/pii.ts:77-80`)은 «문자열 전체가 전화번호»일 때만 참이라 `"contractorPhone: 010-…→010-…"` 같은 합성 문자열은 **그대로 새어나간다**. 이게 이번 오더의 최대 유출 구멍이다.
- `mask:false`(원문 엑셀)에서도 **`changes` 는 계속 마스킹**한다. 감사 Diff 원문은 파일로 내보내지 않는다(필요하면 화면에서 본다). 이 규칙을 `lib/audit-cols.tsx` 헤더 주석에 박아라.
- `before/after` 는 `beforeSubset`(`lib/audit.ts:76-82`)으로 patch 키만 담기지만 `create/delete` 는 **레코드 전체 스냅샷**(`lib/store.ts:410,432`)이다 → 계약 등록 1건에 임차인 주소·면허·생년월일이 전부 들어있다. 반드시 마스킹.
- 20키 상한·600자 상한(화면 Diff `:117` `.slice(0,20)` 과 동일 규격), 초과 시 `… 외 N키`.
- `Diff` 가 제외하는 메타키(`:116` `createdBy/updatedAt/_key/companyId` …)와 **같은 목록**을 쓰라. 목록을 두 벌로 복붙하지 말고 `lib/audit-cols.tsx` 에 `AUDIT_DIFF_SKIP_KEYS` 를 두고 `app/audit/page.tsx:116` 이 그걸 import 하게 바꿔라(SSOT 1곳).

필요 헬퍼(→ §C 요청): `lib/pii.ts` 에 `maskValueByKey(key, v)` 를 신설해 `lib/sheet-export.ts:46-78` 의 `applyMask` 와 `audit-cols` 가 **같은 함수**를 쓰게 한다. 미등록 키 추가도 함께: `contractorName`(→`maskName`), `landlord`, `accountHolder`, `driverName`, `additionalDrivers`, `accountNumber`(→`maskAccount`), `licenseNo`.

테스트(`tests/audit-export.test.ts`):
- `changes` text 에 `010-1234-5678` 원문이 **포함되지 않는다**(`●` 포함)
- 13자리 숫자(주민/사업자)가 원문 노출되지 않는다
- `unmasked:true` 경로에서도 `changes` 는 마스킹 상태
- 20키/600자 상한, 스냅샷(before 없음/after 없음) 케이스

### B-4. entityId 클릭 → 원장 딥링크 (전수조사 결과)

`?open=` 을 실제로 처리하는 페이지는 **4개뿐**이고, 키 형식이 서로 다르다. `audit_logs.entityId` 는 `naturalKey()`(`lib/store.ts:63-76`) = `ENTITIES[k].idFrom` 값이다(create) / `commitUpdate` 의 `key`=`_key`(update·delete).

| entityType | entityId 실체 | 목적지 | 파라미터 | 매칭 근거 |
|---|---|---|---|---|
| `contract` | `contractNo`(=`_key`) 또는 `ctr_…` | `/contract?open={id}` | 쿼리 | `app/contract/page.tsx:93-96` (`_key` \| `id` \| `contractNo`) |
| `vehicle` | `plate`(등록 당시 번호) | `/vehicle/{plate}` | **경로** | `components/vehicle-detail/useVehicleDetail.ts:85` `vehicleMatchesPlate(x,plate) \|\| _key===plate` → 번호변경 차량도 열림 |
| `work_item` | `workId` | `/work?open={id}` | 쿼리 | `app/work/page.tsx:251-253` (`_key`\|`id`\|`work:{id}`\|`endsWith(':{id}')`) |
| `penalty` | `noticeNo` | `/work?group=과태료&open={id}` | 쿼리 | 업무 행 id=`penalty:{_key}`(`lib/ledger-open-ids.ts:27-30`) → `endsWith(':{id}')` 로 잡힌다 · 형판 `lib/home-rows.ts:321` |
| `insurance` | `policyNo` | `/insurance/{id}` | 경로 | `app/insurance/[id]/page.tsx:24` `store.get('insurance', companyId, id)` |
| `customer` | `licenseNo` | `/list/customer/{id}` | 경로 | ★`/customer/{key}` 아님 — `Customer360` 은 `customerKey(name,phone)` 를 받는다(`app/search/page.tsx:21-25`) |
| `history` | `histKey` | 링크 없음(차량 이력) | — | `/asset`·`/status` 모두 `?open=` 미지원(searchParams 사용 0건) |
| `bank_tx`,`card_tx` | 복합키 `account\|txDate\|…` | `/payments` (딥링크 아님) | — | `app/search/page.tsx:31` 도 `/payments` 로만 보낸다 |
| `bank_account`,`lease`,`company_master` | `accountNumber`/`leaseNo`/id | `/management` (딥링크 아님) | — | `app/management/page.tsx` searchParams 미사용 |
| `audit_logs`,`users` | — | 없음 | — | |

★**`/risk?open=` 을 쓰지 마라**: 리스크는 파생 id(`미납:{key}`·`미완료:일정:{key}`·`휴차:{plate}` — `lib/ledger-open-ids.ts:5-25`, `app/risk/page.tsx:118-123`)만 받는다. 감사로그의 `entityId` 는 절대 그 형식이 아니라 «열렸다가 아무것도 선택 안 됨»으로 조용히 실패한다.

구현 — `lib/ledger-open-ids.ts`(clean)에 추가. 새 접두어 발명 금지, 기존 규약만 조립:

```ts
/** 감사로그 entityId → 원장 딥링크. null = 그 엔티티는 딥링크 미지원(링크 비활성). */
export function entityLedgerHref(entityType: string, entityId: string): string | null {
  const id = encodeURIComponent(String(entityId || ''));
  if (!id) return null;
  switch (entityType) {
    case 'contract':  return `/contract?open=${id}`;
    case 'vehicle':   return `/vehicle/${id}`;
    case 'work_item': return `/work?open=${id}`;
    case 'penalty':   return `/work?group=과태료&open=${id}`;
    case 'insurance': return `/insurance/${id}`;
    case 'customer':  return `/list/customer/${id}`;   // Customer360(customerKey) 아님
    default: return null;                              // bank_tx·card_tx·lease·bank_account·history·users
  }
}
```
`tests/entity-deeplink.test.ts`(신설): 위 표 전건 + `default→null` + `entityId 빈값→null` + **`/risk?open=` 를 만들지 않는다**는 단언.

화면 배선(`app/audit/page.tsx`):
- 확장 상세행(`:97`) `id {r.entityId || '—'}` → `TextLink`(`components/ui/controls.tsx:349`)로 감싸 `router.push(href)`. `href===null` 이면 링크 아님(회색 텍스트 유지).
- 확장행 우측에 `<Btn size="sm" variant="ghost">원장에서 열기</Btn>` 추가(같은 href, 없으면 렌더 안 함).
- `useRouter` 는 `next/navigation`(형판 `app/integrity/page.tsx:113`). `openCar` 등 ui-bus 이벤트는 쓰지 마라 — 이 화면은 라우터 push 로 충분하고 `/vehicle/{plate}` 경로가 이미 SPA 라우트다.
- **행 클릭은 지금 확장 토글이다**(`:85`). `TextLink` 에 `stop` 을 줘서 행 토글과 겹치지 않게 하라(`controls.tsx:355` `stop` prop 용도 그대로).

### B-5. 함정
1. UTC/KST 하루 밀림(§B-1) — 최우선.
2. `changes` 열 PII 우회(§B-3) — 두 번째.
3. `filtered` 미메모 + `useEffect(…, [xl])` → 렌더 루프. `xl.onView` 만 deps 에.
4. 단일회사 세션 `company` 열 제거를 잊으면 엑셀 첫 열이 전부 같은 값으로 나간다(`excel-sheet.tsx:22,177-180`).
5. `audit_logs` 는 **전량 클라이언트 로드**(`app/audit/page.tsx:24` `useEntityList('audit_logs')` → `lib/store.ts` list, 서버 페이징 없음). 기간필터는 «표시 필터»이고 조회량을 줄이지 않는다 — 로그가 커지면 느려진다. 이번 오더에서 서버 쿼리를 새로 만들지 말고, `Sec desc` 에 한 줄만 남겨라(후속 과제). `firestore.rules:50-58` 로 읽기는 자기 법인만이다.
6. `at` 이 비었거나 깨진 로그(수기·마이그레이션)는 `kstDate` 가 `''` → 기간 지정 시 제외된다. **`range.from`/`to` 가 모두 빈 «전체 기간»에서는 반드시 포함**되게 조건을 위 코드 그대로 써라(빈 날짜를 무조건 탈락시키면 로그가 조용히 사라진다).

---

## §C. 요청 목록 — 지금 미커밋 상태인 파일 (진행 중 편집과 머지 필요)

아래 파일들은 작업트리에 미커밋 변경이 있다. **덮어쓰지 말고 현재 편집분 위에 머지**하라. 각 항목은 «어디에 무엇을» 만 지정한다.

| 파일 (미커밋) | 요청 |
|---|---|
| `lib/intake/entities.ts` | `contract.fields` 의 라이프사이클 블록 **`status` 선택지 다음**(현재 `:296`, 오더에 적힌 288은 그동안 밀렸다 — 288은 `additionalDrivers`)에 8필드 추가: `debtStartedDate`(채권화일, date), `debtReason`(채권화사유, text), `repoKind`(회수분류, **select** `REPO_KINDS`), `repoStatus`(회수상태, **select** `REPO_STATUSES`), `repoStartedDate`(회수착수일, date), `repoDueDate`(회수예정일, date), `repoDoneDate`(회수완료일, date), `repoNote`(회수메모, text). 전부 `manual: true`. `repoDoneDate` note 에 «반납이 아니다 — returnedDate 를 쓰지 않는다» 명시. `status` 선택지(`대기·운행·반납·해지·채권`)는 **변경 금지** |
| `lib/master-ledger-cols.tsx` | ① `CONTRACT_COL_CATALOG`(`:258-361`)에 위 8필드 `cx()` 추가 ② `CONTRACT_DETAIL_DEFS` 「미수·종료」 섹션(`:438-444`)의 `keys` 에 `debtStartedDate, debtReason, repoKind, repoStatus, repoStartedDate, repoDueDate, repoDoneDate, repoNote` push. `CONTRACT_SHEET_KEYS.basic`(`:366-371`)은 **건드리지 마라**(행 문법 테스트 통과 중) |
| `lib/pii.ts` | `maskValueByKey(key, v)` 신설(§B-3) + `PII_MASKERS`(`:62-74`)에 `contractorName/driverName/accountHolder/landlord/additionalDrivers/accountNumber/licenseNo` 추가 |
| `lib/sheet-export.ts` (untracked) | `applyMask`(`:46-78`)가 새 `maskValueByKey` 를 호출하도록 위임(로직 2벌 금지). 동작·기본값 `mask=true` 불변 |
| `app/contract/page.tsx` | §A-3 앵커 6곳 |
| `app/risk/page.tsx` | `ctxItems`(`:178-226`)에 `{ label:'차량회수 열기', onClick: () => router.push(\`/contract?view=회수&open=${enc(row.contractKey)}\`) }` — `noticeTargets` 처럼 `group==='미납' && contractKey` 인 행만. 리스크 **행·그룹·필터축은 그대로** |
| `lib/nav.ts` | `ERP_MENU_TREE` `contract-ledger.views` 배열에 `{ id:'contract-repo', label:'차량 회수' }` 1줄. **`NAV_GROUPS`·그룹·항목은 손대지 마라**(메뉴 추가 아님, 기존 노드의 views 목록) |
| `RENMAN-CURSOR.md` | §5 핸드오프 로그에 «차량회수 뷰 신설 / 감사로그 기간·엑셀·딥링크» 각 1줄 + 새 공용 원자(`lib/contracts/repossession.ts`, `kstDate`, `maskValueByKey`, `entityLedgerHref`) 등록 |

---

## §D. 게이트 (전부 통과해야 완료)

```bash
npx tsc --noEmit                                   # EXIT 0 (현재 0 — 착수 전에도 확인)
npx vitest run tests/row-grammar.test.ts tests/transitions.test.ts \
  tests/repo-transition.test.ts tests/repossession.test.ts \
  tests/audit-export.test.ts tests/entity-deeplink.test.ts tests/sheet-export.test.ts
npx vitest run                                     # 현재 235 → 신규 테스트만큼 증가, 실패 0
npm run test:rules                                 # 36 유지 (rules 무변경)
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/contract   # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/audit      # 200
```
수동 확인 4개: ① `/contract` 「차량회수」 탭에서 stats 가 «회수 N대 · 최장 D일 · 미수 ₩x» 로 뜬다 ② 채권화 원클릭 후 `/audit` 최신 행 Diff 에 `status: 운행→채권`·`debtStartedDate` 가 보인다 ③ 그 계약의 미수(`/contract` 미수금액)가 **줄지 않는다** ④ `/audit` 엑셀 파일의 `변경내용` 열에 전화·주민 원문이 없다.

## §E. 금지사항
- 새 메뉴·좌측 그룹 추가 · 리스크 4그룹 변경 · `NAV_GROUPS` 수정
- `risk-ledger` 에 회수 행 push · 미수 계산식 신설 · `contractMasterRow`/`computeContractView` 우회 집계
- `returnedDate` 를 회수완료·채권화에 쓰기
- 새 «자금 쓰기 경로»(`bank_tx`/`card_tx`) · `/api/entities` 우회
- 낙관적 갱신·무조건 성공 토스트 · `mask:false` 를 코드에서 기본으로
- `TwoLineCell` · 행 틴트/좌측 레일 · `--ledger-row-h` 변경 · `--brand` 변경
- `npm run build` · dev(6006) 종료 · `push`
- `firestore.rules` 수정(이번 오더 범위 아님)

## §F. 사장님 확인이 필요한 미결 3건
1. 열 라벨 `회수분류/회수상태` vs `차량회수분류/차량회수상태` — 「회수 큐」(미수)와의 말 겹침.
2. 감사로그를 `tests/row-grammar.test.ts` SCREENS 에 넣을지 — 넣으면 `감사분류/감사상태` 로 라벨을 갈아야 하고 화면의 `행위` 배지 의미가 훼손된다(기본안: 예외 주석으로 제외).
3. `app/audit/page.tsx:114-138` 화면 Diff 가 모든 로그인 사용자에게 임차인 주소·면허·생년월일 **원문**을 보여준다(`lib/pii.ts:1-4` 의 «대량 스캔은 마스킹» 원칙과 충돌). 이번 오더는 «파일로 나가는 것»만 막았다 — 화면 마스킹 여부는 판단 사항.

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
