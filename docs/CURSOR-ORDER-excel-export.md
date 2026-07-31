> **Claude 검수 메모 (2026-07-31)**
> 이 오더는 조사 결과를 그대로 실행 지시로 쓴 것이다. 아래 «선결 2건»(ExcelSheet가 보이는 rows·cols를
> 내보내지 않음 · LedgerFrame이 기본보기 cols를 렌더마다 새 배열로 만들어 무한루프 함정)을
> **먼저** 처리하지 않으면 내보낸 파일이 «화면에 보이는 것»과 달라진다.
> 의존성 추가 금지 판정(`xlsx-js-style`은 취약 버전대 포크)은 그대로 따르라.

# 커서 오더 — «화면 목록 → 서식 엑셀 내보내기» (조사 결과 + 파일별 작업 지시)

작성 2026-07-31 · 대상 브랜치 `redesign/pagedef-p0` · 조사만 수행(파일 수정 0건, git 조작 0건)

---

## 0. 결론 3줄

1. **의존성 추가 불필요·금지.** 이미 있는 `xlsx` 0.20.3(CDN 핀)으로 만든다. `xlsx-js-style`는 SheetJS 0.18.5 포크 = renman이 CDN으로 도망친 그 취약 버전대라 되들이면 안 된다. 색·굵기 스타일은 포기하고 **오토필터 + 숫자서식 + 열폭**으로 «서식»을 만든다.
2. **공통 훅/함수 1개로 가능하다.** `SheetCol.text()`가 이미 CSV·검색·헤더필터 공용 평문 SSOT다. 단 **선결 2건**: ①`ExcelSheet`가 «보이는 rows·cols»를 밖으로 내보내지 않는다(`onFiltered` 호출자 0건, `LedgerFrame`이 통과시키지도 않음) ②`LedgerFrame`이 기본보기 cols를 렌더마다 새 배열로 만들어 무한루프 함정이 있다.
3. **버튼은 우클릭 컨텍스트 메뉴.** 원자(`components/ui/context-menu.tsx`)·배선(`onRowContextMenu`)·참고 구현(`app/risk/page.tsx`)이 전부 이미 있다. 헤더·필터패널 하단은 규약 위반이다.

---

## 1. jpkerp5 원본 조사 — 무엇을 가져오고 무엇을 버리나

| 원본 | 판정 | 근거 |
|---|---|---|
| `D:\dev\jpkerp5\lib\excel-export.ts` (120줄) | **골격 이식** | `ExcelColumn{key,header,width,type,getter}` + 4행 프리앰블(0=타이틀 merge, 1=메타 merge, 2=공백, 3=헤더) + `!cols`/`!merges`/`!rows` + **숫자는 `t:'n'` 명시**(주석 33-34: 안 하면 엑셀 합계·정렬 불가) + 파일명 날짜 자동(`todayStr`). 구조가 renman `SheetCol`과 1:1 대응된다 |
| `jpkerp5\lib\excel-style.ts` | **버린다** | `fill`/`font`/`border` = 셀 스타일. renman의 `xlsx` 커뮤니티 빌드는 write 시 `s`를 무시한다(타입엔 `s?: any` 있으나 기록 안 됨). 네이비 `1B2A4A` 헤더는 재현 불가 — 흉내내려 하지 마라 |
| `jpkerp5\lib\contract-export.ts` (229줄) | **개념만** | 열 16개를 하드코딩(`headers` 배열 + `set(0..15)`) = renman SSOT(카탈로그·SHEET_KEYS) 정면 위반. 그대로 이식하면 열 정의가 2곳이 된다. 가져올 개념 3개: ①2행 메타에 «건수 · 합계 ₩…· 기준일»(157행) ②파생값 계산(연체일수 168-173) ③**마스킹**(§4) |
| `jpkerp5\lib\ledger-export.ts` (192줄) | **불필요** | 자금일보 2시트 세무사용 전용. 이번 오더 범위(화면 목록)와 다름 |
| jpkerp5 호출부 `app/asset/page.tsx:604-628` | **UX 규약 참고** | 「선택 N건 있으면 선택만, 없으면 필터결과 전체」 + `title`에 그 규칙을 문장으로 노출 + `disabled={filtered.length===0}`. 이 규칙은 그대로 채택 |

### 라이브러리 판정 (확인 완료)

- jpkerp5 `package.json`: `exceljs ^4.4.0` + `xlsx ^0.18.5` + `xlsx-js-style ^1.2.0` (셋 다 있음, export는 xlsx-js-style 경로)
- renman `package.json`: **`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` 단 1개.** `xlsx-js-style`·`exceljs` 없음
- `node_modules/xlsx/package.json` = 0.20.3 확인. `types/index.d.ts` 확인: `'!cols'`(638) · `'!rows'`(641) · `'!merges'`(644) · `'!autofilter'`(650) · 셀 `z?: NumberFormat`(741) **지원**. `'!views'`/freeze **없음**(그래서 jpkerp5의 `ws['!views']` 틀고정 코드는 이식 불가 — 오토필터로 대체)
- renman의 xlsx 사용 실적: `lib/intake/xlsx.ts`(`aoa_to_sheet`+`!cols`+`writeFile`로 템플릿 다운로드 = **이번 작업과 동일 패턴 선례**), `lib/intake/parse-tx.ts`, `lib/migrate/*`, `app/ingest/page.tsx:146,330,414`(**동적 import 규약**)
- **추가 금지 사유(오더에 박아라)**: `xlsx-js-style@1.2.0`은 SheetJS **0.18.5** 포크 → CVE-2023-30533(prototype pollution)·ReDoS 계열이 남은 버전대. renman이 npm이 아니라 CDN 0.20.3을 핀한 이유가 정확히 그것이다. 스타일 하나 때문에 취약 버전대 코드베이스를 다시 들이지 마라. `exceljs`도 금지(≈1MB, dev 6006 turbo 상시 구동 중)

### 스타일 손실 보상안 (이걸로 «서식»을 만든다)

1행 타이틀(merge) · 2행 메타(merge, «회사 · 필터문구 · N건 · 합계 ₩… · 기준일 YYYY-MM-DD») · 3행 공백 · **4행 헤더 + `!autofilter`**(엑셀 오토필터 = 화면 헤더필터와 같은 체험) · `!cols` 폭(라벨 길이·타입 기반) · `!rows` 높이 · 금액 `z:'#,##0'`.

---

## 2. 표 SSOT 구조 판정 + 시그니처 제안

### 확인한 구조

- **컬럼 원자**: `components/ui/excel-sheet.tsx:24-45` `SheetCol<T> = {key,label,align?,priority?,pin?,render,text?,sortNum?,values?}`. 주석이 이미 `text()`를 "CSV·검색·헤더필터 공용 평문"으로 규정 → **내보내기 추출자는 새로 만들 게 아니라 `text()`다**
- **카탈로그 → 뷰**: `lib/ledger-ext.ts` `pickCols`/`buildSheetViews(catalog, SHEET_KEYS{basic,all})` → `*_BASIC_COLS`/`*_EXPANDED_COLS`. 7개 카탈로그(`master-ledger-cols` 자산·계약, `sheet-cols` 운영, `risk-cols`, `work-cols` 업무·과태료, `finance/cash-cols`, `finance/account-cols`, `agenda-cols`)
- **행 파이프라인**: 각 페이지가 `allRows → searchedRows → rows`(세부필터+기간)까지 완성해 `LedgerFrame rows={rows}` 로 넘긴다 — `app/asset/page.tsx:116` · `app/contract/page.tsx:114` · `app/status/page.tsx:58` · `app/work/page.tsx:261` · `app/cash/page.tsx:362` · `app/risk` 동일
- **그 뒤 한 겹 더**: `ExcelSheet` 내부 `view`(`excel-sheet.tsx:193-208) = 헤더필터(열 AND / 열내 OR) + 정렬. **페이지는 이 결과를 모른다.** `onFiltered` prop은 선언돼 있으나 **호출자 0건**이고 `LedgerFrame`은 애초에 `ExcelSheet`에 넘기지 않는다(`ledger-frame.tsx:179-195`)
- **열도 한 겹 더**: `excel-sheet.tsx:174-177` — 단일회사 세션(`scopeAll=false`)은 `company` 열을 ExcelSheet가 스스로 숨긴다. 페이지는 모른다
- **fit(기본보기) CSS 숨김**: `app/globals.css:2452-2469` — 컨테이너 폭에 따라 `--p4/p3/p2` 열을 CSS로 숨긴다(DOM엔 존재)

### 판정: 공통 훅 1개 **가능**. 단 선결 2건

**선결 A — 무한루프 함정.** `ledger-frame.tsx:180`이 기본보기에서 `sheetCols.map((col) => ({ ...col, pin: false }))`를 **렌더마다 새 배열**로 만든다. 이 상태에서 `onFiltered`류 콜백이 페이지 state를 갱신하면 → 새 cols → 새 `byKey` → 새 `view` → setState → 재렌더 → 무한루프. **먼저 `useMemo`로 고정하라.**

**선결 B — «보이는 그대로»의 SSOT는 ExcelSheet 안에만 있다.** 회사열 규칙과 헤더필터를 페이지에서 재현(손롤)하면 SSOT가 2개가 된다. 그러므로 ExcelSheet가 view를 내보내야 한다. `onFiltered`는 호출자 0건이니 **rows만 주는 그 시그니처를 폐기하고 cols까지 주는 것으로 교체**하라.

### 제안 시그니처

```ts
/* ── components/ui/excel-sheet.tsx ── onFiltered(호출자 0건) 제거하고 교체 */
onView?: (v: { rows: T[]; cols: SheetCol<T>[] }) => void;
// rows = 헤더필터+정렬 적용 결과(=view), cols = 회사열 규칙 적용 결과(=visibleCols).
// 호출은 기존 자리 그대로: React.useEffect(() => { onView?.({ rows: view, cols: visibleCols }); }, [view, visibleCols, onView]);

/* ── components/ui/ledger-frame.tsx ── 통과만(로직 금지) */
onView?: (v: { rows: R[]; cols: SheetCol<R>[] }) => void;

/* ── lib/sheet-export.ts (신설 · 순수 · vitest environment:'node' 통과해야 함) ── */
export type XCell = { v: string | number; t: 's' | 'n'; z?: string };
export type SheetExportMeta = {
  title: string;        // '자산관리'
  company: string;      // companyLabel(companyId) 또는 '전 법인'
  filterLine: string;   // '보유 · 상태=운행 · 2026-07'
  today: string;        // todayKST()
  sumLine?: string;     // won() 규약 합계 문구(있으면 메타행에)
};
export function buildSheetMatrix<T>(
  cols: SheetCol<T>[], rows: T[], meta: SheetExportMeta,
  opt?: { mask?: boolean },
): { aoa: XCell[][]; widths: number[]; headerRow: 3; ncols: number; sheetName: string; fileName: string };

/* ── components/ui/use-sheet-export.ts (신설 · 'use client' · 페이지가 쓰는 유일한 API) ── */
export function useSheetExport<T>(o: {
  title: string;
  filterSummary?: () => string;
  sumLine?: () => string;
  fileName?: string;
  mask?: boolean;                      // 기본 true
}): {
  onView: (v: { rows: T[]; cols: SheetCol<T>[] }) => void;   // LedgerFrame onView 에 그대로 꽂는다
  exportItem: (o?: { selected?: T[] }) => ContextMenuItem;   // 우클릭 메뉴 항목(라벨에 건수)
  count: number;                                             // 필요시 stats 표기용
};
```

- 페이지 변경량 = **2줄**(`onView={x.onView}` + `ctxItems`에 `x.exportItem(...)` push). 열 정의·행 필터를 페이지에서 다시 쓰는 코드는 0줄
- `useSheetExport` 내부는 `useRef`로 view를 보관하고 `useState`는 건수(count)만 — 루프 위험 최소화. `onView` 콜백은 `useCallback`으로 고정
- 쓰기는 `exportItem.onClick` 안에서 **동적 import**: `const XLSX = await import('xlsx')` (`app/ingest/page.tsx:146,330` 규약과 동일 — 번들에 상시 포함 금지)

### 열 서식 판정자 (금액 열을 어떻게 아는가)

`align:'r'`만으로는 부족하다(km·회차·%도 `r`). `SheetCol`에 선택 필드 1개를 추가하라:

```ts
/** 엑셀 셀 서식. 없으면 text() 반환 타입으로 추론(number→'#,##0', string→text). */
xf?: 'money' | 'int' | 'rate' | 'date' | 'text';
```

배선은 **각 카탈로그의 헬퍼 팩토리에서 자동**으로 된다 — 이미 의미를 알고 있다: `lib/master-ledger-cols.tsx:57 ax()`·`:274 cx()`의 `opts.money`→`xf:'money'`, `opts.num`→`'int'`(단, `'%'`는 `'rate'`), `opts.date`→`'date'`. 손으로 쓴 열(`net`,`maintCost`,`overMileageFee`,`amount` 등)만 개별 지정.

---

## 3. 어디에 버튼을 두나 — 우클릭 컨텍스트 메뉴 (근거 있음)

**근거 3개**
- `components/ui/ledger-frame.tsx:9-13` 주석 = 확정 규약: "버튼 자리 … 필터줄 = 회사·검색·☰필터·기간 ····· 지표·보기·[+생성] / **※ ⋯도구 메뉴 없음. 대량액션=선택 액션바 · 투입=[+생성]패널 · 이동=좌측메뉴 · 개별=상세패널**"
- `ledger-frame.tsx:43` — `tools` prop이 이미 `@deprecated`("새 코드에서 쓰지 말 것")
- `docs/CURSOR-ORDER-auth-console.md`(직전 오더) — "액션은 컨텍스트 메뉴에 둔다(우측상단 ⋯도구 메뉴는 폐기됨). 헤더는 `[회사][검색][☰필터][기간] + [+생성]` 최소 구성을 깨지 마라"

**실제 구현 파일 (새로 만들지 마라)**
- 원자: `components/ui/context-menu.tsx` — `ContextMenu{open,x,y,onClose,items}` + `ContextMenuItem{label,icon?,onClick,danger?,disabled?}|{type:'separator'}`. 외부클릭/Esc/다른 우클릭 닫힘 완비
- 선택·우클릭 hook: `lib/use-row-selection.ts` — `onRowContextMenu(e,id,idx,showCtxMenu)`가 «미선택 행 우클릭 시 그 행을 선택 후 메뉴» 처리
- 배선: `LedgerFrame onRowContextMenu`(`ledger-frame.tsx:77`) → `ExcelSheet`(`excel-sheet.tsx:307 onContextMenu`)
- **참고 구현 = `app/risk/page.tsx`** — `ctxItems` 조립 150-175 · `onRowContextMenu` 243-247 · `<ContextMenu …/>` 287-293. renman에서 우클릭 메뉴가 실제로 붙어 있는 유일한 화면
- 발견성은 이미 확보됨: `excel-sheet.tsx:305` 행 `title`="클릭=선택 · 더블클릭=상세 · **우클릭=메뉴**"

**필터 패널 하단은 금지.** `components/ui/ledger-filter-panel.tsx:147-149`의 `LedgerPanelFooter`는 「필터 초기화」 전용이고, CLAUDE.md 버튼자리표가 필터 zone에 "**액션 금지**"를 명시한다. 게다가 필터패널은 `filterOpen`일 때만 존재해서 접근 경로가 조건부가 된다.

**메뉴 항목 (라벨 확정)**
- `목록 엑셀로 (N건)` — N = `onView`가 준 rows.length (헤더필터·정렬 반영된 «지금 보이는» 건수)
- `선택 N건만 엑셀로` — 다중선택이 있는 화면에서 선택 ≥1일 때만 push (현재 `selectedKeys` 사용 화면 = `app/risk/page.tsx` 뿐)
- 0건이면 `disabled: true`

**적용 순서**: 1차 = `/asset` · `/contract` · `/status` · `/cash` · `/work` · `/risk`. 2차(별도) = `/management`(탭별 cols) · `/`(홈 탭) · `/ingest`(body 커스텀이라 onView 경로 없음 → 범위 밖).

---

## 4. PII — 배선 0건 확인, 오더에 요구할 것

**현황**: `lib/pii.ts`에 `maskLicense`/`maskResident`/`maskName`/`maskPhone`/`maskAddress` 5개가 있으나 **호출자 0건**(grep 결과 자기 정의 3줄만). 파일 주석은 이미 "목록·검색·대시보드 등 대량 스캔 지점에서 사용 / 상세·편집은 원문"을 규정하고 있다 — 규약은 있고 배선만 없다.

**jpkerp5 규약(확인)**: 파일로 나가는 순간 **항상 마스킹**.
- `contract-export.ts:82,120` / `:177,210` → `fmtMaskedPhone()` (`lib/format/korean.ts:164` = `010-****-5678`)
- `contract-export.ts:83,119` → `contractIdentMasked()` (`lib/ident.ts:72-76` = 주민/사업자 마스킹본)
- `downloadOverdueExcel`은 원문 스위치가 **아예 없다**(마스킹 강제)

**renman에서 마스킹해야 하는 열 (열 key 화이트리스트로 박아라)**

| 종류 | 열 key · 위치 | masker |
|---|---|---|
| 연락처 | `phone`(`lib/sheet-cols.tsx:70`), `phone`(`lib/risk-cols.tsx:45`), `contractorPhone`(`master-ledger-cols.tsx:243`), `dealerPhone`(`:88`) | `maskPhone` |
| 면허번호 | `contractorLicenseNo`(`:285`) | `maskLicense` |
| 생년월일·법인번호 | `contractorBirth`(`:285`), `ownerBizNo`(`:69` 「법인번호/생년월일」) | `maskResident` |
| 주소 | `contractorAddress`(`:287`), `useAddress`(`:69`) | `maskAddress` |
| 계좌·카드 | `account`(`finance/account-cols.tsx:22`), `acct`(`finance/cash-cols.tsx:47`), `cardLast4` | 전용 마스커(뒤 4자리만) — `lib/pii.ts`에 `maskAccount` 신설 |

**요구사항**
1. `lib/pii.ts`에 **`PII_MASKERS: Record<string, (v: unknown) => string>`**(열 key → masker) 신설. 열 정의(카탈로그)에 마스킹 로직을 박지 마라 — 화면은 원문 유지가 정책이다(pii.ts 주석)
2. **내보내기 기본값 = 마스킹 ON.** `useSheetExport({ mask: true })`가 기본. `false`는 코드에서 못 켜게 하고, 런타임에 «원문 포함» 2차 확인으로만
3. **원문 내보내기는 본사 전용**: `useSession().isOperator`(`lib/session.tsx:146`, `role==='본사'`) 아니면 메뉴 항목 자체를 노출하지 마라. 원문 항목은 `danger: true` + `useConfirm`(「전화·면허·주소 원문이 파일로 나갑니다」)
4. **파일명·시트명에 개인 이름 금지.** 파일명은 `{화면}-{회사}-{YYYYMMDD}.xlsx`
5. **미배선 열 방어**: `PII_MASKERS`에 없는 새 열이 생겨도 새는 걸 막기 위해, 값이 `/^01\d[- ]?\d{3,4}[- ]?\d{4}$/`(휴대폰) 또는 주민번호 13자리 패턴이면 열 key와 무관하게 마스킹하는 **최종 방어선 1줄**을 `buildSheetMatrix`에 두고, dev에서 `console.warn('[sheet-export] 미등록 PII 열: key')`
6. **감사 기록은 이번 범위에서 제외**(사유 명시): `AuditAction`(`lib/audit.ts:11`)에 `'export'`가 없고 `audit_logs` 실제 쓰기는 `lib/store.ts`(내가 잡고 있는 파일, 수정 금지)의 `AuditingStore` 안에만 있다. **`lib/store.ts`를 건드려 감사 경로를 만들지 마라** — 대신 마스킹 기본 ON + 원문은 본사+2차확인으로 막고, `export` 감사는 store.ts 잠금 해제 후 별도 오더로 붙인다

---

## 5. 금액·날짜·정렬 표기 규약 (반드시 이대로)

**화면 규약 SSOT** = `components/ui/table.tsx:53-58` — `won()` = `₩` + 콤마(합계·지표·상세패널) · `money()` = **₩ 없이** 콤마(표 셀) · `align:'r'` = 우측 + `tabular-nums`.

**엑셀 셀 규약**

| 대상 | 셀 | 서식(`z`) | 금지 |
|---|---|---|---|
| 금액 (`xf:'money'`) | `t:'n'`, 값 = `text()`의 **원시 숫자** | `'#,##0'` (₩ 없음 = `money()`와 동일) | `money()`/`won()` **문자열**을 값으로 넣기(엑셀 합계·정렬 죽음), 셀 안 `₩` 접두 |
| 정수·수량 (`'int'`) | `t:'n'` | `'#,##0'` | 화면 render의 단위 접미(`'123km'`,`'12개월'`)를 값에 넣기 → **단위는 헤더 라벨로**(`주행거리(km)`) |
| 비율 (`'rate'`) | `t:'n'` | `'0.0'` | `%` 문자를 값에 붙이기. 라벨은 `연이율(%)` |
| 날짜 (`'date'`) | **`t:'s'`**, 값 = `YYYY-MM-DD` 문자열 그대로 | 없음 | `new Date()` 변환·엑셀 시리얼 변환(renman은 KST **문자열** 도메인 — `lib/contracts/dates.ts todayKST`. UTC 하루 밀림 사고 방지) |
| 텍스트·상태·배지 | `t:'s'`, 값 = `text()` | 없음 | `render()`의 JSX를 문자열화하기 |
| 2행 메타 합계 | `t:'s'` 문장 | — | 시트 맨 아래 SUM 합계행 추가(오토필터·정렬과 충돌) → **합계는 2행 메타에 `won()` 규약(₩ 포함) 문장으로** |

**추가 확정 규칙**
- **`align:'r'` 열은 반드시 숫자 셀로 내보내라.** 커뮤니티 빌드는 정렬 스타일을 못 준다 → `t:'n'`이면 엑셀이 자동 우측정렬(= tabular 규약 유지). 문자로 내보내면 좌측정렬돼서 규약이 깨진다
- **빈값/0**: `null`/`undefined`/`''` → 빈 셀. **숫자 0은 0으로 기록**(화면이 `LEDGER_EMPTY.dash`='—'여도) — 합계·정렬 목적. `'—'`·`'미배정'`·`'없음'` 같은 **화면 카피는 파일에 쓰지 마라**(`lib/ledger-empty.ts` 는 표시 계층 전용). 단 상태·분류 열의 실제 값(`운행`,`후납` 등)은 그대로
- **내보낼 열 = `colView`(기본/전체) 열 정의 그대로.** `fit` 모드에서 CSS가 폭 때문에 숨긴 `--p2/p3/p4` 열(`app/globals.css:2463-2469`)은 **포함한다** — 엑셀엔 폭 제약이 없고, 좁은 창에서 내보냈다고 파일이 달라지면 안 된다. 회사열 숨김(`scopeAll=false`)은 **반영한다**(세션 권한 규칙이므로)

---

## 파일별 작업 지시

### 신설

**`lib/sheet-export.ts`** (순수 · 'use client' 붙이지 마라 · XLSX import 금지)
- `buildSheetMatrix<T>(cols, rows, meta, opt)` — §2 시그니처. 4행 프리앰블 + 헤더 + 데이터, `widths`, `sheetName`(31자 절단), `fileName`
- 셀 변환기 `toCell(col, row, mask)`: `col.text()` 호출 → `col.xf`(없으면 타입 추론) → §5 표대로 `{v,t,z}`. 마스킹은 `PII_MASKERS[col.key]` 적용
- `xlsx` 의존 0 — vitest(`environment:'node'`)에서 그대로 단위 테스트 되게

**`components/ui/use-sheet-export.ts`** (`'use client'`)
- §2 시그니처. `onView`는 `useCallback`+`useRef`(rows/cols 보관), `count`만 state
- 다운로드: `const XLSX = await import('xlsx')` → `aoa_to_sheet(aoa)` → `!cols`(widths) → `!merges`(0행·1행 전폭) → `!rows`([{hpt:26},{hpt:16},{hpt:8},{hpt:22}]) → **`!autofilter = { ref: A4:{끝열}{끝행} }`** → `book_append_sheet` → `writeFile(wb, fileName, { bookType:'xlsx', compression:true })`
- `exportItem()`이 `ContextMenuItem` 반환(라벨에 건수, 0건이면 `disabled`). 원문 항목은 `isOperator`일 때만 + `danger` + `useConfirm`
- `components/ui/index.tsx` 배럴에 `export * from './use-sheet-export';` 추가

**`tests/sheet-export.test.ts`**
- 금액 열 → `{t:'n', z:'#,##0'}`이고 값이 숫자 · 날짜 열 → `t:'s'` `YYYY-MM-DD` · 0은 0으로 기록 · `null`은 빈 셀 · `phone`/`contractorLicenseNo`가 마스킹됨 · `mask:false`에도 휴대폰 패턴 최종방어선 동작 · `text()` 없는 열은 빈 셀이며 dev warn

### 수정

**`components/ui/excel-sheet.tsx`**
- `onFiltered`(호출자 0건) → `onView?: (v:{rows:T[];cols:SheetCol<T>[]}) => void`로 교체. 호출은 208행 effect 자리에서 `{ rows: view, cols: visibleCols }`
- `SheetCol`에 `xf?: 'money'|'int'|'rate'|'date'|'text'` 추가(주석: 엑셀 서식 전용, 화면 렌더에 영향 없음)
- 20행 헤더 주석의 "onFiltered 로 결과만 받아 건수·CSV에 쓴다"를 `onView`로 갱신

**`components/ui/ledger-frame.tsx`**
- **먼저 180행을 `useMemo`로 고정**: `const viewCols = React.useMemo(() => colView==='기본' ? sheetCols.map(c=>({...c,pin:false})) : sheetCols, [colView, sheetCols]);` — 안 하면 `onView`+state가 무한루프
- `onView` prop 신설 후 `ExcelSheet`에 통과(로직 금지)
- 9-13행 버튼자리 주석에 「내보내기 = 우클릭 메뉴」 한 줄 추가

**카탈로그 7개 — `xf` 배선만**
- `lib/master-ledger-cols.tsx` — `ax()`(57행)·`cx()`(274행)에서 `opts.money→'money'`, `opts.num==='%'→'rate'` 그 외 `opts.num→'int'`, `opts.date→'date'`. 손으로 쓴 `net`·`maintCost`·`maintVsAvg`·`overMileageFee`·`overMileageRate`·`mileageOut`·`returnMileage`·`drivenKm`·`allowedKm`·`excessKm`은 개별 지정
- `lib/sheet-cols.tsx`(FL 42열) · `lib/risk-cols.tsx`(`amount`) · `lib/work-cols.tsx` · `lib/finance/cash-cols.tsx`(`in`/`out`/`balance`/`cardAmount`) · `lib/finance/account-cols.tsx` · `lib/agenda-cols.tsx`
- **`lib/finance/cash-cols.tsx` 결손 5건 보강**: `cardName`·`cardLast4`·`merchant`·`approvalNo`·`cardAmount`에 `text()`가 **없다**(25 render / 20 text). 지금은 헤더필터도 안 되고 내보내면 빈칸 → `text()` 추가. `cardLast4`는 PII 마스킹 대상

**`lib/pii.ts`**
- `PII_MASKERS: Record<string, (v:unknown)=>string>`(§4 표) + `maskAccount` 신설. 기존 5함수 시그니처 변경 금지

**페이지 6개 — 각 2~4줄. 열 정의·행 필터를 다시 쓰지 마라**
`app/asset/page.tsx` · `app/contract/page.tsx` · `app/status/page.tsx` · `app/cash/page.tsx` · `app/work/page.tsx` · `app/risk/page.tsx`
- `const xl = useSheetExport<Row>({ title:'자산관리', filterSummary: () => …, sumLine: () => … })`
- `<LedgerFrame … onView={xl.onView} />`
- `ctxItems`에 `xl.exportItem({ selected })` push. **우클릭 메뉴가 없는 5개 화면은 `app/risk/page.tsx:150-175, 243-247, 287-293` 패턴을 그대로 복제**(`useRowSelection` 없이 «우클릭한 그 행 기준»만 필요하면 selection 없이 `ContextMenu`만)
- `filterSummary`는 페이지가 아는 필터 상태를 사람 문장으로(예: `'보유 · 상태=운행 · 2026-07'`). 없으면 `'전체'`
- `right`(생성 CTA)·`filters`(회사·검색·☰필터·기간)·`stats` **손대지 마라**

---

## 게이트

```
npx tsc --noEmit                                                   # EXIT 0
npx vitest run                                                     # 현재 통과 수 이상 + tests/sheet-export.test.ts 신규 통과
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/asset  # 200 (contract·status·cash·work·risk도 동일)
```
수동 확인 3건: ①헤더필터로 열 2개 좁힌 뒤 우클릭 내보내기 → 파일 행수 = 화면 행수 ②단일회사 세션 → 파일에 「회사명」 열 없음 ③계약 전체보기 내보내기 → 연락처·면허번호·주소가 마스킹, 월대여료는 콤마 숫자(셀 클릭 시 수식바에 숫자, `SUM` 가능).

## 금지

- `npm run build` 금지 · dev 6006 프로세스 죽이지 말 것 · `git commit/push` 금지(내가 한다)
- **의존성 추가 금지**: `xlsx-js-style`·`exceljs`·`file-saver` 전부. `package.json`의 `xlsx` CDN 핀을 npm 버전으로 바꾸지 마라
- 내가 잡고 있는 파일 손대지 마라: `lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `firestore.rules` · `lib/payments/duplicate-cash.ts` · `app/payments/page.tsx` · `app/receivables/page.tsx` · `components/NotifyDialog.tsx` · `lib/intake/entities.ts` · `components/MigrateDataButton.tsx` · `app/api/entities/[entity]/route.ts`
- 헤더 필터줄에 내보내기 버튼·아이콘 추가 금지(`tools`는 deprecated) · `LedgerFilterPanel` footer에 액션 추가 금지 · `⋯` 메뉴 부활 금지
- `lib/export-csv.ts`(`downloadCsv`) 삭제·개조 금지 — `app/settings/page.tsx:139`(엔티티 일회성 export)가 쓰는 별개 경로다. 이번 오더는 CSV를 대체하지 않는다
- 카탈로그에 `render`용 포맷 문자열을 엑셀용으로 바꾸지 마라(화면 규약 `money()`/단위 접미 유지) — 엑셀 분기는 `xf` + `text()`로만

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
