# renman (jpkerp6) — 작업 규칙 · Claude 진입점

렌터카 ERP (Next.js 15 + TS + Firestore). **철칙: 새 화면·기능은 공용 원자/엔진으로만 만든다. 손롤 금지.**
없으면 → 페이지에 박지 말고 **공용 원자/엔진을 먼저 만들고** 갖다 쓴다. (반복 공통은 전부 SSOT 1곳)

> 짝 파일: **`RENMAN-CURSOR.md`** (Cursor 진입점). 이 파일은 Claude Code가 자동 로딩하는 규약 파일이라 이름 고정.
> 두 파일은 진입점일 뿐 — **규격 본문은 공용 문서 하나**를 본다. 본문 복붙 금지.

## 문서 지도 (작업 전 필독)

| 문서 | 내용 |
|---|---|
| **`docs/RENMAN-WORK-ORDER.md`** | **작업지시서·규격서 본문(SSOT)** — 절대 규격 · A그룹(지금 틀린 것) · B그룹(구조 개편) · 공용 원자 표 · 안티패턴 · 완료 기준 |
| `RENMAN-CURSOR.md` | Cursor 진입점 + **협업 규칙 · 핸드오프 로그**(작업 넘길 때 한 줄 追記) |
| `DEPLOY.md` | 배포 · **오픈 전 필수 게이트** |
| **`docs/CACHE.md`** | **백업 SSOT** — `.next`는 프로젝트 안 유지, 백업 시 `.next`·`node_modules` 제외 |
| `tools/archive/architecture-cleanup-handoff.md` | Cursor Phase 0~3 이력 · Phase 4 잔여 |
| 이 파일(아래) | 코드 규격 — UI 공용 규격 · 화면 구조 · 데이터 3층 · 기능 엔진 SSOT · 개발 제약 |

**협업 3원칙**: ①동시 작업 안 함 ②넘길 땐 반드시 `tsc EXIT 0` ③바꾼 것 `RENMAN-CURSOR.md` §5 핸드오프 로그에 한 줄.

## 아키텍처 정리 (Cursor Phase 0~3 완료 — Claude 필독)

누더기 **접기**(리라이트 금지). 상세·파일맵·다음할일:
→ **`tools/archive/architecture-cleanup-handoff.md`**

| Phase | 상태 | SSOT |
|------|------|------|
| 0~1 | ✅ | TODAY=`dashboard-consts` · plate=`lib/plate` · 죽은 Nav/Sidebar/tenant 삭제 · scripts→`tools/archive` |
| 2 | ✅ | 시드=`lib/migrate/pack.ts` (`MIGRATE_MODE`) · 정합성=`lib/integrity/doc-audit.ts` |
| 3 | ✅ | 자금 탭=`components/CashHubTabs.tsx` (`useCashHubNav`) · 7면 URL 유지 |
| 4 | ⬜ | `globals.css` 레거시 정리 |
| 5 | ⬜ | packages 물리 이동(선택) |

**금지 추가:** `seed`/페이지에서 `buildSwitchplanPack*` 직접 호출 · `section-registry`가 `contract-doc-audit.json` 직import · Vehicle360/contract-ops/domain/model 재작성.

### v5 백업 비교
- 경로: `C:\dev\_backup\jpkerp5`
- 요약: `tools/archive/v5-v6-compare-handoff.md` (+ canvas `v5-v6-compare`)
- **이식 플레이북:** `tools/archive/v5-to-v6-port-playbook.md` — v5 학습 → v6 구조, SKIP 거르기, Wave W1~W5

---

## UI 공용 규격 (전부 `@/components/ui`에서 import — 손롤 금지)

**페이지 뼈대:** `<Page title meta right>` → `<Sec title desc>`(또는 `<Panel>`) → 원자. 페이지는 **배열만**.

| 용도 | 원자 (이것만 씀) | 금지(손롤) |
|---|---|---|
| 페이지 헤더 | `<Page title meta left mid right tools>` / FacetRail 워크벤치=`<FacetPage … tools rail>` · 셸 툴바=`<WorkbenchBar company tabs search stat actions>` | 손롤 `<h1>`+meta·main 패딩 · 검색 자리 페이지마다 손롤 flex · **보기방식(카드/리스트) 전환 UI** |
| 섹션 | `<Sec title n desc right>` / `<Panel title action>` | 박스(테두리)로 감싸기 |
| 지표(요약) | `<Cards min={128} fit>`+`<Metric label value tone onClick>` | `<StatBar>`(박스)·손롤 카드 |
| 필터 | `<FacetRail>`(데스크톱 좌측) · 모바일=`검색 옆 필터 버튼→Drawer`(빠른필터 칩바 금지) | 모바일 상단 칩바 상시 · 손롤 칩 |
| 기간·날짜 | `<PeriodBar latest onRange>` (당일~연간·전체·기간지정 from~to, ‹›스텝) | 손롤 select·date input |
| 로딩 | `<PageLoading/>` | 손롤 `.spin` 스피너 |
| 빈 상태 | `<EmptyState>` · `variant`: **page**(기본·박스+CTA) / **sec**(Sec 안 한줄) / **ok**(미결 큐 비움=정상·초록체크) | 손롤 안내 div · 홈만 `Ok` 따로 |
| 버튼 | `<Btn variant size>` (solid/ghost/danger) · 탭/칩=`PillTabs`/`FilterChips`=`toggleStyle` SSOT | 손롤 `<button style>`·높이 38/30 |
| 목록 | `<DataTable cols rows onRow>` **또는** 카드행(flex column gap)+`<ObjCard>` | — |
| 상세(뎁스) | `<DetailShell onBack>` + `<KV>`/`<DetailGrid>` | 손롤 back·헤더 |
| 입력 | `<Input>`·`<Select>`·`<Search>`·`<FormGrid>` (폼=스키마) | 손롤 input style |
| 뎁스 화면 | 차량=`<Vehicle360>`, 손님=`<Customer360>` | 재구현 |
| 일정·내업무 | `<Agenda ctx facets>` · `<MyDesk ctx>` | 페이지 재구현 |
| 입출고 | `/work`→`/dispatch`(Sec: 오늘·출고·반납·재고) · `/m`·`/field`=리다이렉트 | 별도「현장」·형제 탭 허브 |

## 화면 구조
홈 = 회사(전 법인 또는 선택 법인) 전체(탭: 일정·미결·**운영현황**·리스크). 운영현황=지표 한눈(함대·계약·자금·현장) · FacetRail 동일. **마이페이지(/ops)** = 개인(탭: 일정·업무). 일정=**회사 일정(Agenda)+내 일정(MySchedule) Sec 한 화면**(서브탭 금지) · FacetRail 상시.
**티어:** 라이트=홈·마이·현황(+설정·검색)·그자리 처리. 스탠다드+=메뉴「비즈니스」(배차·미수·자금일보…). 경영 티어=손익 등. `BUILD_TIER`=`lib/tier`.
계정: **본사**=전 법인 합본·전환, **법인 소속 직원**=배정된 법인만. (옛 수탁/위탁 개념 없음.)
설정에서 초기화면(홈/마이페이지) 선택 → `jpk:landing`=`mydesk`면 /ops (세션당 1회). 일정·내업무는 홈·마이페이지가 **같은 공용 컴포넌트** 공유. **현장·이벤트 업무** = `/work` 허브 → 업무 페이지. 옛 `/m`·`/field`·landing=`field`는 `/dispatch`로 흡수.

**버튼 자리(placement) 표준:** 페이지 액션=`<Page right>` · 섹션 액션=`<Sec right>` · 인라인 처리(반납·입금 등)=그 자리 인라인 확장(팝업 X).

**모바일 크롬 SSOT (이전 상·하단 중복 금지 — iOS/Android push 수순):**

| 화면 | 상단 | 하단 | 비고 |
|---|---|---|---|
| **허브** (홈·메뉴·탭 진입 목록) | 메뉴 · 제목 · 이름 | 탭바 · (Facet면) 1행 `[전체][검색][필터]` | 홈과 동일. `back` 붙이지 말 것 |
| **뎁스** (`DetailShell` depth) | ← · 제목 · 액션 | 없음(탭 숨김) | 차량360·손님360·엔티티상세만 |
| **오버레이** (`DetailShell fixed`) | 제목만 | 이전 + 액션 | SessionBar 밖, 하단 1곳 |

새 화면은 위 표만 따른다. 메뉴로 가는 허브에 `back={router.back}` 금지. 페이지에 이전/홈/탭을 손롤하지 말 것.

**컨트롤 크기·폰트 규격 (= freepass ERP4 `CTRL` — 페이지에서 height 숫자 금지):**
- 웹: **md=32** · **sm=28**. 모바일: **md=40** · **sm=36**. 칩=웹28 / 모바일40 (`ctrlChipH`).
- 헬퍼: `ctrlH` · `ctrlFs` · `ctrlInputFs` · `ctrlChipH` (`components/ui/tokens`). 모바일 입력·버튼 폰트 **16**(iOS 줌 방지).
- 현장 CTA만 `Btn lg`/`toggleStyle lg`=48 유지.
- 셸 툴바는 **`WorkbenchBar` 하나**. 모바일 1행 = `[회사][검색][필터]`.
- **목록 보기 = 카드 하나.** `ObjCard` 웹=56 · 모바일=min 72.

**금지 데코:** 타이틀 밑줄(`borderBottom`) · 박스 그룹(Panel/StatBar 테두리) · 가로/세로 데코선. 카드 1px 테두리·테이블 행선은 **원자라 유지**. 색·치수는 토큰(`C.*`, `var(--radius)`)만, 하드코딩 금지.

## 데이터 3층 (원장·지표·이벤트) — SSOT `lib/domain/layers`

| 층 | 의미 | 예 |
|---|---|---|
| **① 원장** | 유·무형 **자산이 생겼다**는 불변 존재. 성립=생성. | 현물=차량 · 계약=계약서 · 자금=계좌 |
| **② 지표** | **저장 없음.** ①(+③) 집계. 홈·경영. | 가동률·미수율·KPI |
| **③ 이벤트** | 자산 가동 중 쌓이는 사건. 업무 메뉴. | 정비·사고·과태료·수집·입출고 처리 |

계약 성립 ≠ 이벤트. 차량구매·계약성립·계좌개설 = 각각 현물/계약/자금 **자산 생성**. 현황(자산·계약·재무)=① 생애만. 엔티티=`ENTITY_LAYER` · 페이지=`PAGE_IA.layer`.
**비즈니스(메뉴)** = 배차관리·미수관리·자금일보·정비관리·과태료관리·자료등록·증빙수집 + `/work` 업무현황. SSOT=`lib/work-hub`.

## 기능(엔진) 공용 규격 — SSOT, 새 기능은 여기 붙인다

- **도메인 연결:** `lib/domain/model.ts` — `linkFleet`(차↔계약↔손님↔채권), `classifyContract`(진행×채권), `classifyVehicle`(소유×가동), `handoverHistory`(손바뀜), `recommendNextRent`(재렌트가). 상태·연결은 페이지서 손롤 X, 여기서 따다 씀.
- **섹션/대시보드:** `lib/section-registry` `buildSectionCtx`→`SECTION_MAP`. 홈 렌즈·마이페이지·일정이 같은 ctx 공유. 일정=`ctx.agenda`(`lib/agenda`).
- **섹션 순서·이동:** `lib/use-sec-order` `useSecOrder(key, defaults)` — `<Sec>`은 **접힌 상태에서만** 드래그앤드롭으로 이동(↑↓ 금지). 어느 페이지든 같은 엔진으로(페이지 손롤 금지).
- **콘텐츠 폭:** 본문 `maxWidth: 1680`(Page·홈 통일).
- **저장/집계:** `lib/store`(`getStore()`, id=`lib/domain/ids` `newId`) · `lib/operating-snapshot`(`computeDashboard` = 반영 숫자 SSOT) · `lib/use-dashboard-data`(로딩 훅).
- **식별코드:** opaque PK = `newId('vehicle')`→`veh_…`(Stripe식). 자연키(번호판 등)는 속성.

## 개발 제약
- **자동 push 금지** — 로컬 커밋만, 명시 요청 시에만. commit author = `dudguq@gmail.com`.
- Windows + turbo dev(`:6006`) 중 `npm run build` 금지. 검증 = `tsc --noEmit` + `curl :6006/route`.
- 확정 작동 기능·정책·UI는 명시 요청 전 변경 금지.

## 로컬 실행 (빠른 체크)
상세: `tools/archive/architecture-cleanup-handoff.md` → **실행 체크리스트**.
- 기본: `npm run dev` → http://localhost:6006
- Firebase 키 있으면 **로그인 필요** / 없으면 DEV_USERS+localStorage
- 시드: `.env.local`에 `NEXT_PUBLIC_MIGRATE_MODE=frozen` 권장 → `/dev/data`에서 스위치플랜 반영
- OCR: `GEMINI_API_KEY` (없으면 수기 폴백)
- **빌드 캐시:** `.next`는 프로젝트 안 (`docs/CACHE.md`). 백업 시 `.next`·`node_modules` 제외.
