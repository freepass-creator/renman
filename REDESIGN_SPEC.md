# 렌맨 리디자인 — 통일 규격 설계서 v1 (SSOT)

> 3개 병렬 설계안(원자·조립·이행)을 **PageDef 전면 아키텍처**로 통합하고, 적대검증이 잡은 blocker 6 + major 18을 코드 근거로 봉합한 단일 진실원본. 이 문서와 충돌하는 개별 설계안 서술은 **모두 무효**.

## 0. 전제 (확정)

- **방향**: 제자리 리디자인. **재빌드(도메인 로직·데이터 폐기) 금지**, 페이지 **껍데기 재작성은 허용**(사장님 «완전히 갈아엎는다» 확정으로 «전면 재작성 금지» 제약은 대체됨).
- **통일 방식**: **구조 강제** — «1 정의(PageDef), 2 렌더러(Web/Mobile)». 페이지는 def만 선언, 렌더러가 소비. drift 원천 차단.
- **토큰 SSOT**: `components/ui/tokens.tsx`의 `C / CTRL / ctrlH / ctrlFs / SPACE_M(12) / SPACE_GROUP_M(20) / R(4) / NUM / SH / TOUCH(44) / METRIC_FS(18)`만. px·hex·rgba 신규 하드코딩 금지(SCRIM 예외).
- **import**: 전 원자 `@/components/ui` 배럴 경유.
- **집행**: 데이터 형태를 규정 밖 원자로 그리면 리뷰 반려. 표현 부족 시 원자 수정이 아니라 이 문서를 먼저 개정.

---

## 1. 원자 팔레트

두 층으로 구분한다 (검증 verifier1 §"신규 원자 vs 전면 금지" 봉합):

### 1A. 데이터-표시 원자 10 (잠금 — 이 밖의 «데이터 표시» 원자 금지)

| # | 원자 | 데이터 형태 | 지위 | 파일 |
|---|------|-----------|------|------|
| 1 | **ObjRow** | 훑는 동종 목록의 1행 | 신설 | `components/ui/obj-row.tsx` |
| 2 | **Rows** (+그룹헤더) | ObjRow의 유일 컨테이너 | 신설 | `components/ui/obj-row.tsx` |
| 3 | **ObjCard** | 리치 워크아이템(행동버튼·위저드, ≤10건) | 유지·축소 | `components/ui/misc.tsx` |
| 4 | **Metric** | 단일 집계 수치 | 유지·1수정 | `components/ui/misc.tsx` |
| 5 | **KV** | 한 개체의 라벨:값(+편집) | 유지·흡수 | `components/ui/detail.tsx` |
| 6 | **ExcelSheet** | 다열 비교·전수 조회 표 | 유지·폴백교체 | `components/ui/excel-sheet.tsx` |
| 7 | **Badge**(+StatusTag·RiskTag·SevTag·CompanyBadge) | 상태·분류 태그 | 유지·정리 | `components/ui/misc.tsx` |
| 8 | **Sec** | 화면 구획·섹션 제목 | 유지·흡수 | `components/ui/layout.tsx` |
| 9 | **Stepper** | 생애주기 진행 | 유지 | `components/ui/misc.tsx` |
| 10 | **EmptyState**(+PageLoading) | 빈 상태·로딩 | 유지 | `components/ui/misc.tsx` |

### 1B. 셸/내비 원자 (데이터 표시 아님 — 잠금 대상 아님)

- 홈 대시보드: **SummaryCard · SectionGroup**(신설 `components/ui/summary-card.tsx`, jpkerp5 홈 이식) — «집계 수치»가 아니라 «큐로 가는 내비 카드»라 데이터-표시 잠금 밖.
- 큐 점프: **GroupChip**(컨트롤 계층, controls.tsx 편입) · **ActionGrid/ActionTile**(입력 타일, misc.tsx 기존) · **InlineSearch**(검색 드롭다운, controls.tsx).
- 컨트롤·오버레이·셸: controls.tsx / overlays.tsx / bottom-sheet.tsx / Page·FacetPage·WorkbenchBar·SessionBar·FacetRail / wizard.tsx / doc-upload.tsx — 전부 기존 SSOT 존치.

### 1C. 데이터형태 → 원자 1:1 강제 매핑표

| 데이터 형태 | 유일 원자 | 금지 대안 |
|---|---|---|
| 단일 집계 수치 | **Metric**(지표줄=Cards fit) | 손롤 숫자 div, ObjRow.right 오용 |
| 라벨:값 (속성·문서) | **KV**(읽기=key null, 편집=fieldStyle) | DetailGrid(폐기)·raw table·행별 박스 |
| 훑는 동종 목록 | **Rows+ObjRow** | ObjCard 나열·ListRow/ListBox(폐기)·손롤 행 |
| 다열 비교·전수 조회 | **ExcelSheet** | raw `<table>`·페이지 손롤 집계 |
| 검토·프리뷰 표(임시) | ExcelSheet 권장 · **DataTable 동결 허용**(후속 전환) | 신규 DataTable 사용 |
| 상태·분류 태그 | **Badge**(프리셋) | 손롤 pill·status-badge.tsx(폐기) |
| 화면 구획 | **Sec** | Panel/Section/ListBox(폐기)·손롤 h2/h3 |
| 생애주기 | **Stepper** | 손롤 진행바 |
| 빈/로딩 | **EmptyState/PageLoading** | 손롤 '없음' |
| 리치 워크아이템(행동·위저드, ≤10) | **ObjCard** | ObjRow에 버튼 끼우기 |
| 내비 타일 | ActionTile/ActionGrid | ObjCard 내비 오용 |

**유일 예외 1건**: 상세 박스 안 고정 3열 소표(수납·할부 스케줄)는 tokens `th/td` 직접 사용 허용.

---

## 2. 키스톤 — ObjRow + Rows 단일 규격 (충돌 봉합 완료)

### 2.1 명명·수치 확정 (verifier3 blocker "3문서 3정의" 봉합 — 아래 값이 유일)

| 항목 | 확정값 | 폐기된 이설 |
|------|--------|------------|
| 파일 | `components/ui/obj-row.tsx` | ~~rows.tsx~~ |
| 컨테이너명 | `Rows` | ~~ObjRowGroup / RowList~~ |
| 레일 폭 | **3px** | ~~2px(이행안 오기)~~ |
| 웹 minHeight | **44** (2줄 안전 + TOUCH 정합) | ~~40~~ |
| 모바일 minHeight | **52** (≥ TOUCH 44) | — |
| padding | 웹 `'6px 12px 6px 14px'` / 모바일 `'8px 14px'` (좌 14 = 레일 3 + 여백 11) | — |
| 레일 타입 | **기존 `RailTone` 확장(7값)** — 별도 RowRail 신설 안 함 | ~~RowRail 신규 타입~~ |

### 2.2 해부도

```
Rows ┌─ border 1px C.line · R(4) · bg C.card · overflow hidden (그림자 없음) ─┐
     │ ⣿ 운행중  12                                    [그룹헤더 tone-bg/tone-text]│
     ├──────────────────────────────────────────────────────────────────────────┤
     │▌[CO][배지] 12가3456  아반떼 CN7 · 김철수            ₩1,240,000   ›          │ 1행
     │▌   보증금 3,000,000 · 만기 08-31 · 회차 18/36                    연체 34일   │ 2행
     ├── 행간 borderTop 1px C.line2 (Rows가 부여, ObjRow는 구분선 무지) ───────────┤
     │▌ …                                                                        │
     └──────────────────────────────────────────────────────────────────────────┘
      ▲ 레일 3px (absolute left0 top0 bottom0, rail='none'이면 렌더 생략)
```
- 행마다 박스 금지(방향 6). 테두리·radius·bg는 **Rows 컨테이너 전유**, 행은 헤어라인으로만 구분.

### 2.3 ObjRow 부위 규격 (전부 토큰)

| 부위 | 웹 | 모바일 |
|------|-----|--------|
| 1행 | flex gap7, minWidth0 | 동일 |
| co | `<CompanyBadge co>` | 동일 |
| badge | `<Badge tone={badgeTone}>` h18 fs10.5 | h22 fs11.5 |
| **plate**(앵커) | NUM 700 fs13 C.ink `-0.01em` **무잘림** | fs14 |
| name(비차량 앵커) | 700 fs13 C.ink ellipsis (plate 없을 때) | fs14 |
| meta(1행 보조) | fs12 C.mute ellipsis | fs12.5 |
| 2행 | marginTop2 fs11.5 C.faint 1줄 ellipsis. `sub`(자유문) 또는 `fields:[label,value][]`(라벨 C.mute·값 C.ink fw500 tabular, '·' 구분, **ATOM_CAP=3 초과 시 ＋n**) | fs12 |
| **right**(수치) | NUM tabular 700 fs12.5 무잘림 세로중앙, `rightTone: ink/danger/ok/warn` | fs13.5 |
| 체브론 | `ChevronRight` size14 sw2.5 C.faint — **onClick 있을 때만** | 동일 |
| hover/탭 | 웹 useHover `bg C.hover` .12s | 모바일 tap-highlight 투명 |
| 키보드 | role=button tabIndex0 Enter/Space→onClick | — |

### 2.4 행내 인터랙션 정책 (verifier3 blocker "충돌" 봉합 — 확정)

- **ObjRow = 스캔 + 드릴인 전용. 행 안 액션 버튼·input 금지.** 개별 행동은 드릴인(자산360) 또는 그자리 조치 패널(웹 우측)/시트(모바일)로.
- **bulk 선택 체크박스는 허용** — 단 «행동»이 아니라 «선택»이며 **Rows 컨테이너가 선택상태 소유**(`selectable`+`selected`+`onToggle`). /receivables 일괄 내용증명·문자가 이 경로.
- **행동 버튼이 본체인 목록**(위저드 직행 등)은 ObjRow 아님 → **ObjCard**(§3-1). 예: /dispatch 오늘큐·출고대기(DeliveryWizard 진입). → 조립안의 "dispatch 전량 ObjRow" 무효.

### 2.5 RailTone 7톤 (verifier1/3 major "타입 충돌·brand/violet 부재" 봉합)

**기존 `misc.tsx`의 `RailTone`(5값)을 7값으로 확장** = SSOT 1곳, ObjCard·ObjRow 공용. `RAIL` 맵에 brand·violet 추가:

```ts
// misc.tsx (확장)
export type RailTone = 'none'|'brand'|'danger'|'violet'|'warn'|'ok'|'mute';
const RAIL: Record<Exclude<RailTone,'none'>,string> = {
  brand: C.brand, danger: C.danger, violet: C.violet, warn: C.warn, ok: C.ok, mute: C.faint,
};
```
- 토큰 추가 1건: `tokens.tsx` C에 `violet: 'var(--purple-text)'` (globals.css에 라이트/다크 기존재 — CSS 추가 불필요).

### 2.6 Rows 컨테이너

```ts
export function Rows(props:{
  title?: React.ReactNode; tone?: BadgeTone; n?: number;
  right?: React.ReactNode;          // 헤더 우측 = TextLink '더보기' 전용
  selectable?: boolean;             // bulk 모드
  children: React.ReactNode;        // ObjRow[]
}): JSX.Element;
```
- 그룹헤더: minHeight 웹30/모바일36, fw700, borderBottom C.line2. tone 지정→`var(--{tone}-bg/text)`(jpkerp5 ops 섹션헤더), 생략→`C.head/C.mute`.
- 행간: Rows가 children 매핑해 `borderTop 1px C.line2` 래퍼 부여. Rows 자체 margin 금지(간격은 Sec 소유: 안12/밖20).
- 빈 상태: children 비면 호출부가 `<EmptyState variant='sec'>`.

### 2.7 금지사항

1. 행 border/radius/shadow 금지(Rows 전유). 2. RailTone 7종 밖 금지(유니언). 3. 행 안 버튼·input 금지(§2.4). 4. 2행 초과·fields 3 초과 금지(＋n·드릴인). 5. Rows 밖 ObjRow 단독·중첩·grid 배치 금지(세로 스택 전용). 6. 그룹헤더 필터·토글 임베드 금지.

---

## 3. 상태 레일·정렬 SSOT (verifier2 blocker·major 전부 봉합)

**착지 위치 = `lib/sheet-rows.ts` 하나** (verifier3 blocker "3곳 분산" 봉합; FleetRow가 여기 살아 rank가 그 필드를 씀. 이행안의 "sheet-rows 불변"은 이 순수 이동에 한해 해제). `lib/pagedef/rank.ts`는 재수출만.

**정확값 = `app/sheet/page.tsx:28~37` 원문 그대로 이동 (verifier2 오기 3건 정정)**:

| rank | 술어 (코드 원문) | RailTone | 시안 명칭 |
|------|-----------------|----------|----------|
| 0 | `ownership==='구매예정'\|\|'등록예정'` (차량축) | brand | 인도(입고)예정 |
| 1 | `dday < 0` | danger | 만기지남 |
| 2 | `util==='휴차'` | violet | 휴차 |
| 3 | **`0<=dday<=30`** (≤7 아님) | warn | 마감임박 |
| 4 | `util==='운행'` | ok | 운행중 |
| 5 | `util==='정비'` | warn | 정비 |
| 7 | `ownership==='처분예정'` | mute | 처분예정 |
| 8 | `ownership==='처분완료'` | mute→none | 매각 |

- 정렬 = rank 오름차 후 `plate.localeCompare(ko)`. `fleetRail(row): RailTone` 신설(같은 술어).
- **미수는 레일 아님** — `net>0`은 `right.tone='danger'`(우측 금액색). 상태축(레일)과 채권축(금액)은 **직교 2축**. '운행중·연체'=레일 ok + right danger.
- '인도예정'은 **차량 ownership 기준**(정렬 SSOT). 계약축 `classifyContract '인도대기'`는 계약목록용 별도 키(verifier2 봉합).

---

## 4. PageDef 아키텍처

### 4.1 파일 구조 (신규)
```
lib/pagedef/types.ts · registry.ts(href→def, PAGE_IA와 1:1 dev-assert) · rank.ts(sheet-rows 재수출)
lib/pagedef/defs/{fleet,asset,contract,finance,home,mydesk,search,work,dispatch,
                  receivables,payments,repair,penalty,ingest,inbox,pnl,vat,financials,manage,integrity,settings}.ts
components/pagedef/WebPage.tsx · MobilePage.tsx
components/ui/obj-row.tsx · summary-card.tsx
components/m/{MShell,MTabBar,MBackBar,MHead,MSaveFooter}.tsx
```

### 4.2 타입 (verifier1 major "source 시그니처 불일치" 봉합 — source는 훅)

```ts
export type Archetype = 'A-dash'|'B-worklist'|'C-metrics'|'D-input'|'E-grid'|'F-system';
export type MTab = 'home'|'ops'|'risk'|'entry'|'me';

export interface PageCtx { companyId: string|'all'; range?: {from?:string; to?:string}; tier: Tier; mobile: boolean; }

export interface PageDef<R=unknown> {
  href: string; archetype: Archetype; title: string;
  useRows: (ctx: PageCtx) => R[];              // ★ 순수함수 아님 — 각 def가 export하는 훅(렌더러가 무조건 1회 호출).
                                               //   기존 useEntityLists/useDashboardData/buildContractRows 위임. 도메인 불변.
  useSummary?: (ctx: PageCtx) => SummaryItem[]; //   selectReceivables 등 스냅샷은 여기서(행배열과 분리 — verifier1 봉합)
  summary?: SummaryItem<R>[];                   //   rows 기반 단순 집계는 이쪽
  colSets?: ColSet<R>[];                        // E 필수
  facets?: { lensKey: string; radio?: string[] };
  queues?: QueueDef<R>[];                       // A·B
  sections: SectionDef<R>[]; mobileSections?: string[];
  period?: 'month'|'period'|false;
  actions?: PageAction[];
  row?: RowSpec<R>;                             // E/B 모바일 ObjRow 투영 (미지정 시 자동유도)
  drill?: (r: R) => string;                     // 렌더러가 웹/모바일 경로 변환
  mobile?: { tab: MTab; subKey?: string };
}
```
- `RowSpec.status`는 **model.ts tone 필드에서 위임**(STATUS_TONE 폴백 gray 방지 — verifier1 봉합). 병행: STATUS_TONE에 classify 라벨(인도대기·운행중·연체·구매예정·등록예정·처분예정·만기임박·만기지남·매각) 추가.
- QueueDef.filter는 도메인 셀렉터 위임(페이지 손롤 filter 금지). 세부 필드는 조립안 §1 유지.

### 4.3 렌더러 · 라우트 축소
```tsx
export function WebPage<R>({def}:{def:PageDef<R>}): JSX.Element;   // FacetPage+WorkbenchBar+PageHead+FacetRail+본문
export function MobilePage<R>({def,sub}:{def:PageDef<R>;sub?:string}): JSX.Element;  // MHead+지표+큐/리스트+FilterSheet
// app/sheet/page.tsx: export default ()=> <WebPage def={FLEET_DEF}/>;
```

---

## 5. 6원형 조립 레시피 (요약 — 상세는 조립안 §2 준용, 아래 봉합 반영)

- **A 대시보드**(홈·마이): SummaryCard/SectionGroup 그룹 → 큐 상위 capHome(5) Rows+ObjRow. 홈=전체·마이=내 스코프.
- **B 워크리스트**(미수·배차·자금일보·수선·과태료·증빙·검색): 큐 탭(GroupChip)+요약 Metric+FacetRail/FilterSheet → 큐별 Rows+ObjRow. 행동은 **드릴인 or 그자리 패널(웹 우측)/시트(모바일)**, bulk=Rows 체크박스. **위저드 직행 큐만 ObjCard 잔존**(dispatch 오늘큐·출고대기·홈 운영렌즈 3종·inbox 대기).
- **C 경영지표**(손익·부가세·재무상태·경영): PeriodBar+Metric → ExcelSheet 소표 + KV 정의서식(erp4식). 모바일 = /m/biz/[view] 스택(요약+상위컷만).
- **D 입력투입**(데이터센터·증빙수집): 방식탭+DocUpload → 검토 ExcelSheet 소표 → 담기. 모바일 = /m/entry 타일 + 폼 스택(MSaveFooter).
- **E 현황그리드**(자산·계약·재무·운영시트) = 웹 표준: AppBar+PageHead(요약·월구간·보기)+FacetRail+ExcelSheet(고정헤더·좌핀·세로격자·rank정렬·REVEAL). 모바일 = 상태그룹 Rows+ObjRow. 카드뷰 IconSeg 제거·인페이지 DetailShell 회수.
- **F 시스템**(리스크·설정): 리스크=B 렌더(위험목록 ObjRow, RiskTag). 설정=Sec plain 아코디언(Sec+Rows).

---

## 6. 페이지 커버리지 (verifier0/3 "커버리지 공백" 봉합 — 43 라우트 전수)

### 6A. PAGE_IA 21페이지 정의표 — 조립안 §3 표 그대로 채택(위 봉합 반영). drill 전부 자산360 유지.

### 6B. 보조 라우트 처리표 (def·원형 밖 — 원자 위생만, 기회시 이관)
| 라우트 | 처리 |
|--------|------|
| /field, /audit, /company(+[id]) | 원자 위생만(손롤→Rows/KV), def 미도입 |
| /trash | ListBox/ListRow → Rows+ObjRow (T4에 포함) |
| /admin, /insurance/[id] | DetailGrid/Section → Sec+KV (T4에 포함) |
| /penalty/upload·docs | /penalty def의 보조 화면 — DocUpload |
| **/docs, /ingest/bulk·classify·freepass, /list/[entity]** | **DataTable 동결 유지**(검토·프리뷰 표) — 후속 티켓서 ExcelSheet 이관, table.tsx 삭제는 그때 |
| /dev/data, /dev/preview | 개발도구(hqOnly) — 관할 밖 |

---

## 7. /m 트리 (verifier2/3 봉합)

```
app/m/ layout.tsx(MShell: 탭5 외 스택취급, 탭=MTabBar/스택=MBackBar)
  page(홈 A) · ops(운영 E, ?set=fleet|asset|contract|finance) · risk(B, ?kind=미수|만기|보험|정합성)
  entry(D 타일) · entry/{memo,deliver,return,penalty,doc}(폼, MSaveFooter) · me(설정 F)
  q/[key](큐 전체) · vehicle/[plate](자산360 1단) · customer/[key] · biz/[view](경영, 비즈니스티어)
```
- 탭색(MHead borderTop 3px·MTabBar 활성): 홈 `C.ok` · 운영 `C.brand` · 리스크 `C.danger` · 입력 `var(--indigo-text)` · 설정 `C.mute`.
- **설정 경로 = `/m/me`**. **자산360 = `/m/vehicle/[plate]`**(Vehicle360 Sec 원자 재사용, 1단 재배열 — 복제 아님).
- **회사 스코프·세션 (verifier3 major 봉합)**: SessionBar는 /m서 null이므로 **MHead에 회사 스코프 칩**(전체회사 ▾ → BottomSheet), 계정·티어·로그아웃은 /m/me.
- 셸: SessionBar 무변경(/m 크롬 숨김 기존재). MTabBar/MBackBar/MHead/MSaveFooter 신설(jpkerp5 해부, 그림자 SH 토큰). 기존 MobileTabBar/MobileActionBar/MobileToolbar는 P3 제거.
- 자산360 1단 재배열: Hero(plate fs28)→액션4 그리드→v-status→v-contract→…(웹 Sec 순서 1단 스택). 드래그 재정렬은 웹 전용.
- z-index: MHead 50 · MBackBar 55 · MTabBar 56 · MSaveFooter 101(--fp-tabbar-h 조율).

---

## 8. 웹 ↔ 모바일 변환 규칙 — 조립안 §5 표 채택 (투영 소유권 확정)

- **투영 API 1개 (verifier3 major "3안 병립" 봉합)**: **기본 자동유도 + `def.row`(RowSpec) 오버라이드**. ExcelSheet도 `rowMap` 아닌 `def.row` 경유(페이지가 소유하되 def에 선언). 자동유도: pin/0열→plate, status열→rail+StatusTag, cols[2..4].text→meta(≤3), 첫 align'r' 금액열→right.
- 나머지 14항(요약 2×2, FacetRail↔FilterSheet, 렌즈탭↔GroupChip, 2단↔1단, drill 경로변환, actions 독/시트, period, cap60+더보기, KV편집, bulk, Sec접기, Drawer↔시트, 간격 2단계) = 조립안 §5 그대로.

---

## 9. 폐기·병합 (verifier0 blocker "DataTable 삭제 빌드깨짐" 봉합)

| 대상 | 판정 |
|------|------|
| ListRow·ListBox·DetailRow·DetailGrid·DetailEmpty(detail.tsx) | **폐기** → ObjRow/Rows/KV(key null)/EmptyState. 사용처 전수: /search·/payments·/inbox·/settings·**/trash·/admin·/insurance/[id]·/contract 상세**(verifier0 봉합) |
| Panel·Section(layout.tsx) | **폐기** → `Sec plain`/`Sec+KV·Rows` |
| CardGroupContext + Cards grouped 모드(misc.tsx) | **폐기 — 단 grouped 사용처 전량 이관 후에**(verifier0 봉합: 홈 운영렌즈·Vehicle360·Customer360·DocAuditSec·/manage·/contract-history 포함). 이관 전 삭제 금지 |
| status-badge.tsx | 폐기 → misc Badge |
| **DataTable(table.tsx)** | **이번 라운드 동결(삭제 보류)** — 7 사용처(/contract·/vat·/docs·/ingest×3·/list) 전부 이관 완료 후 후속 티켓서 삭제. 모바일 ObjCard 폴백만 ObjRow로 교체 |

**ObjCard 잔존 확정** (조립안의 "전량 되돌림" 무효): /dispatch 위저드큐 3종·/receivables 없음(→ObjRow+체크박스+패널)·홈 운영렌즈 3종·inbox 대기·Cards fit 지표줄. 잔존 카드 레일은 확장된 RailTone 7종 사용.

---

## 10. 이행 (조립안 P0~P3 채택 — PageDef 포함, verifier3 blocker "고아 설계" 봉합)

- **P0 기반**: tokens `C.violet`·`METRIC_FS_M` + obj-row.tsx + summary-card.tsx + lib/pagedef/{types,registry,rank} + WebPage.tsx + sheet-rows.ts statusRank/fleetRail 승격 → **`/sheet`를 FLEET_DEF로 재작성, 픽셀 동치 확인**.
- **P1 /m 골격**: app/m/layout.tsx + MShell/MTabBar/MBackBar/MHead + **5탭 전부 플레이스홀더 포함**(verifier2 봉합: 단독배포 404 방지) + /m(홈)·/m/ops + 프리뷰→/dev/preview + prefer-m 배너.
- **P2 확산**: /m/risk·entry(폼5+MSaveFooter)·me·vehicle 1단·biz + 웹 E4·B7 def 전환(**grouped 사용처 이관 먼저**, 그다음 카드→행).
- **P3 정리**: 반응형 크램 제거(ExcelSheet 카드폴백·MobileToolbar·MobileTabBar·MobileActionBar), UA 리다이렉트, C·F 잔여 def, CardGroupContext·table.tsx·status-badge 삭제.
- **게이트/P**: ① registry↔PAGE_IA 1:1 assert ② px·rgba 신규 하드코딩 0(grep) ③ 도메인 셀렉터 diff 0(껍데기만 증명) ④ `npx tsc --noEmit` → `npm run test`(vitest) → dev 6006 curl 200 → 375/1440 육안. `next build`는 dev 종료 후 머지 직전만(동시 금지). 착수 전 `pre-redesign` 태그.

---

## 11. 검증 이슈 해소 원장 (blocker 6 · major 18 → 판정)

| # | 이슈 | 판정 |
|---|------|------|
| B1 | ObjRow 3문서 3정의 | §2.1 단일값(obj-row.tsx·Rows·3px·44/52) |
| B2 | 행내 인터랙션 충돌 | §2.4 ObjRow 버튼금지·선택체크만·행동은 ObjCard/패널 |
| B3 | rank SSOT 3곳 | §3 `lib/sheet-rows.ts` 단일 |
| B4 | PageDef 고아(이행 부재) | §10 P0~P3에 pagedef 트리 편입 |
| B5 | DataTable 삭제→빌드깨짐 | §9 동결(삭제 보류)·7사용처 이관 후 |
| B6 | 마감임박 경계 ≤7 vs ≤30 | §3 `dday≤30`(코드 원문) |
| M | source 시그니처·톤 폴백·RailTone 충돌·문서간 모순(ObjCard/DetailGrid/Panel)·신규원자 금지 충돌·rank 티어(처분 7/8)·인도예정 축·투영 API·/m 경로·탭색·회사스코프·grouped 삭제순서·43라우트·설정경로·자산360경로 | §1B·§2.4·§2.5·§3·§4.2·§6·§7·§8·§9에서 각각 봉합(위 본문 인용) |
| minor 21 | (px 정합·라벨폭·간격 등) | P별 grep 게이트로 흡수 |

---

## 12. 후속(이번 범위 밖)
- table.tsx 최종 삭제(7사용처 이관 후) · 오버레이 rgba 그림자 5곳 · CARET svg 색 · Sec scrollMarginTop 하드코딩 · /field·/audit·/company def화 · 경영 모바일 상세.
