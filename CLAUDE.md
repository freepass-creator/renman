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
| **`SECURITY.md`** | **서버 권한 경계** — 고친 것(P0-1 권한상승) · 남은 P0(Custom Claims·ID Token·원자적 커밋) · `npm run test:rules` |
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
| 페이지 헤더 | `<Page title meta left mid right tools>` / FacetRail 워크벤치=`<FacetPage … tools rail>` · 셸 툴바=`<WorkbenchBar company tabs search stat actions>` | 손롤 `<h1>`+meta·main 패딩 · 검색 자리 페이지마다 손롤 flex · **보기전환 손롤**(→ `IconSeg`) |
| 섹션 | `<Sec title n desc right>` / `<Panel title action>` | 박스(테두리)로 감싸기 |
| 지표(요약) | `<Cards min={128} fit>`+`<Metric label value tone onClick>` | `<StatBar>`(박스)·손롤 카드 |
| 필터 | `<FacetRail>`(데스크톱 좌측) · 모바일=`검색 옆 필터 버튼→Drawer`(빠른필터 칩바 금지) | 모바일 상단 칩바 상시 · 손롤 칩 |
| 기간·날짜 | `<PeriodBar latest onRange>` (당일~연간·전체·기간지정 from~to, ‹›스텝) | 손롤 select·date input |
| 로딩 | `<Page loading>`/`<LedgerFrame loading>`→본문 `PageLoading` · `<Loading>` · `<LoadingOverlay>` · 부트=`Gate` | 손롤 스피너 · 데이터로딩 풀스크린 |
| 빈 상태 | `<EmptyState>` · `page`/`sheet`(원장 칸 높이맞춤)/`sec`/`ok` | 손롤 안내 div · 시트칸에 page박스(높이 어긋남) |
| 버튼 | `<Btn variant size>` (solid/ghost/danger) · 탭/칩=`PillTabs`/`FilterChips`=`toggleStyle` SSOT | 손롤 `<button style>`·높이 38/30 |
| 목록 | `<DataTable cols rows onRow>` **또는** 카드행(flex column gap)+`<ObjCard>` | — |
| 상세(뎁스) | `<DetailShell onBack>` + `<KV>`/`<DetailGrid>` | 손롤 back·헤더 |
| 입력 | `<Input>`·`<Select>`·`<Search>`·`<FormGrid>` (폼=스키마) | 손롤 input style |
| 뎁스 화면 | 차량=`<Vehicle360>`, 손님=`<Customer360>` | 재구현 |
| 일정 | `/desk` `LedgerFrame` + `buildAgenda` (어김·임박·예정) | 홈에 달력 Agenda 재구현 |
| 입출고 | `/dispatch`(딥링크) · `/m`·`/field`=리다이렉트 | 별도「현장」·형제 탭 허브 |

## 화면 구조

**2026-07 IA** — 허브 = **홈(한눈) · 운영현황 · 일정관리 · 데이터센터** · 원장 = **자산 · 계약 · 자금 · 업무**.  
원장·일정·운영 = `LedgerFrame` 마스터 표 + **더블클릭 ↔ 우측 상세패널**.  
**2026-07 IA** — 허브 = **홈 · 운영현황 · 데이터센터** · 원장 = **자산 · 계약 · 자금 · 업무**.  
홈 = `LedgerFrame` 탭 **요약·미결·리스크·휴차·일정**(엑셀) · 일정관리 메뉴 흡수(`/desk`→`/?tab=일정`).  
원장·운영 = `LedgerFrame` 마스터 표 + **더블클릭 ↔ 우측 상세패널**.  
**버린 양식:** Facet 렌즈 홈 · 메뉴「일정관리」단독 · Metric-only 얇은 홈.

| 메뉴 | 라우트 | 비고 |
|---|---|---|
| 홈 | `/` | LedgerFrame · 요약/미결/리스크/휴차/일정 |
| 운영현황 | `/status` | 차량 1대=1행 통합 |
| 데이터센터 | `/ingest` | OCR·엑셀·직접 |
| 자산관리 | `/asset` | 차량 마스터 |
| 계약관리 | `/contract` | 계약 · 리스크 |
| 자금관리 | `/cash` | 계좌+일보 |
| 업무관리 | `/work` | 정비·과태료·상담 |
| 데이터 마이그레이션 | `/dev/data` | 본사 |

**레거시 URL (메뉴 재노출 금지 · 리다이렉트):** `/sheet`→`/asset` · `/finance`→`/cash` · `/desk`→`/?tab=일정` · `/ops`→`/?tab=미결`.  
`/payments`·`/receivables`·`/penalty` = 딥링크. `/ingest`=데이터센터(메뉴).

**버튼 자리·hierarchy (원장 SSOT — `LedgerActions` / `LedgerPanelFooter`):**

| 종류 | zone | 형태 | variant | 내용 | 예 |
|---|---|---|---|---|---|
| **쓰기** | `Page.right` | **라벨**(필수 쓰기만) · 보조=`iconOnly`+`tip` | **solid ≤1** · 보조 ghost | 레코드 입력. **탄생(등록증·통장·계약서)=데이터센터** — 원장 solid「생성」금지 | 자금 단건 · 업무 메모 · (자산/계약=투입 아이콘만) |
| **워크플로** | `LedgerFrame tools` | **`iconOnly`+`tip`만** | **전부 ghost** | 다른 화면으로 일 넘기기 · **맨 우측** | 담기 → 매칭 → 미수 · OCR |
| **필터** | 필터줄 좌측 | 칩/Select | — | 목록 거르기 · **액션 금지** | 검색·세부필터·범위·칩·기간 |
| **보기** | 필터줄 우측 | 라벨 | PillTabs | 열 밀도 | 기본 / 전체 |
| **통계** | 보기 앞 | 텍스트 | — | 숫자 한눈 (버튼 아님) | 입금 · 출금 |
| **패널** | footer | 라벨 | solid 1 + ghost | 수정/저장 solid · 취소·회수 ghost · 2차 이동=`iconOnly`+`tip` | |

우측 클러스터 순서(고정): **`stats` → `기본/전체` → `tools`**.  
워크플로 버튼 순서 = **업무 흐름 순**(넣기 → 처리 → 확인).  
홈 tools = WorkbenchBar(탭·검색·회사) · FacetRail · 생성 버튼 없음.

원장 밀도 = 전부 `Btn sm`(웹28). `md`/`lg`는 일반 페이지·현장 CTA만.

**패널 크롬 (좌 필터 · 우 상세 · 생성/수정 공통):**
- 헤더 높이 = `--ledger-head-h`(36) · 하단바 = `--ledger-foot-h`(36) · `LedgerPanelFooter`만
- 닫기 X = 14 · 헤더 타이틀 클래스 = `ledger-record-panel__title`

**원장 필터줄 슬롯 (왼쪽→오른쪽, 전부 `sm`) — 화면마다 같은 자리:**

| 슬롯 | 원자 | 자산 | 계약 | 자금 | 업무 |
|---|---|---|---|---|---|
| 회사 | `CompanyFilter` (Frame) | ✅ | ✅ | ✅ | ✅ |
| 검색 | `Search` | ✅ | ✅ | ✅ | ✅ |
| **세부필터** | `LedgerFilterButton`+Panel | 상태·제조사 | 상태·종료사유 | 과목·매칭·계좌구분 | **상태·담당·원천** |
| 범위/구분 | Select 또는 PillTabs | 보유/처분… | 유지/종료… | 입출금/계좌… | 업무구분 탭 |
| 빠른칩 | toggle (선택) | 계약중·휴차… | **리스크** | 입금·출금·미분류… | — |
| 기간 | `PeriodBar` | ✅ | ✅ | ✅ | ✅ |
| (우측) | **stats → 기본/전체 → tools** | | | | |

세부필터 버튼은 **원장 4면 공통 필수**. 담당자·상태처럼 “가끔 쓰는 조건”은 줄에 두지 말고 패널로.  
필터줄에 쓰기·워크플로 버튼을 끼워 넣지 말 것.

**모바일 크롬 SSOT:**

| 화면 | 상단 | 하단 | 비고 |
|---|---|---|---|
| **허브** (원장·업무 목록) | TopBar(제목·메뉴) · PageToolBar | 탭바 | ERP4 골격 |
| **뎁스** (`DetailShell` depth) | TopBar | 이전+액션(탭 숨김) | 차량상세 등 |
| **오버레이** (`DetailShell fixed`) | 제목만 | 이전+액션 | SessionBar 밖 |

새 화면은 위 표만 따른다. 허브에 `back={router.back}` 금지.

**컨트롤 크기·폰트 규격 (= freepass ERP4 `CTRL` — 페이지에서 height 숫자 금지):**
- 웹: **md=32** · **sm=28**. 모바일: **md=40** · **sm=36**. 칩=웹28 / 모바일40 (`ctrlChipH`).
- 헬퍼: `ctrlH` · `ctrlFs` · `ctrlInputFs` · `ctrlChipH` (`components/ui/tokens`). 모바일 입력·버튼 폰트 **16**(iOS 줌 방지).
- 현장 CTA만 `Btn lg`/`toggleStyle lg`=48 유지.
- 셸 툴바는 **`WorkbenchBar` 하나**. 모바일 = **TopBar**(제목·메뉴) + **PageToolBar**(검색·필터·보기·회사 균등 행→시트).
- **목록 보기 = 카드 하나.** `ObjCard` 웹·모바일=**56**(= freepass ERP4).

**금지 데코:** 타이틀 밑줄(`borderBottom`) · 박스 그룹(Panel/StatBar 테두리) · 가로/세로 데코선. 카드 1px 테두리·테이블 행선은 **원자라 유지**. 색·치수는 토큰(`C.*`, `var(--radius)`)만, 하드코딩 금지.

## 데이터 3층 (원장·지표·이벤트) — SSOT `lib/domain/layers`

| 층 | 의미 | 예 |
|---|---|---|
| **① 원장** | 유·무형 **자산이 생겼다**는 불변 존재. 성립=생성. | 현물=차량 · 계약=계약서 · 자금=계좌 |
| **② 지표** | **저장 없음.** ①(+③) 집계. 홈·경영. | 가동률·미수율·KPI |
| **③ 이벤트** | 자산 가동 중 쌓이는 사건. 업무 메뉴. | 정비·사고·과태료·수집·입출고 처리 |

계약 성립 ≠ 이벤트. 차량구매·계약성립·계좌개설 = 각각 현물/계약/자금 **자산 생성**. 현황(자산·계약·재무)=① 생애만. 엔티티=`ENTITY_LAYER` · 페이지=`PAGE_IA.layer`.
**메뉴 SSOT** = `lib/nav` `NAV_GROUPS` / `ERP_MENU_TREE` (역할표 = `PAGE_IA`). 업무 딥링크 = `lib/work-hub` `WORK_PAGES`.

| 그룹 | 항목 | 기준 |
|---|---|---|
| 원장 | 자산 · 계약 · 자금 | ① 마스터 표 + 우측 패널 |
| 업무 | 업무관리 | ③ 사건·처리 통합 |
| 시스템 | 마이그레이션 · 설정 | 본사 반영 / 계정 |

- **데이터센터(`/ingest`)** = 원장형 틀(필터줄·시트·우측 투입패널). OCR·엑셀·직접 · `right`=저장 · 대기/저장본.
- **자금 하루 루프** = `/cash`: 대량/담기 → 매칭(`/payments`) → 미수(`/receivables`). 메뉴 재노출 금지.
- **고객관리는 페이지가 아니다** — 통화·이슈는 계약에 붙는다(`lib/activity-match`).

## 기능(엔진) 공용 규격 — SSOT, 새 기능은 여기 붙인다

- **도메인 연결:** `lib/domain/model.ts` — `linkFleet`(차↔계약↔손님↔채권), `classifyContract`(진행×채권), `classifyVehicle`(소유×가동), `handoverHistory`(손바뀜), `recommendNextRent`(재렌트가). 상태·연결은 페이지서 손롤 X, 여기서 따다 씀.
- **섹션/대시보드:** 홈=`LedgerFrame`+탭(요약·미결·리스크·휴차·일정) · `/status`=운영 원장.  
  `section-registry` = repair 등 딥링크 Sec SSOT.
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
