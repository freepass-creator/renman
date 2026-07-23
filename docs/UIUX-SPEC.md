# RENMAN UI/UX 통일 규격 (v6)

> 전수검사(2026-07-23 · 24개 페이지) 근거. 페이지 **유형**별로 보기·필터·정렬·섹션·팝업·모바일을 하나로 고정한다.
> 페이지는 이 표에서 «따다 쓰기»만 — 손롤 금지. 원자: `WorkbenchBar`(툴바) · `FacetRail`(좌측필터) · `ExcelSheet`(표) · `IconSeg`(뷰토글) · `Sec`+`useSecOrder`(섹션) · `DetailShell`(상세).

## 왜 (검사에서 드러난 불일치)
- **보기**: 같은 조회인데 카드↔엑셀 토글은 /asset·/contract 2곳뿐, 나머지는 DataTable·카드·혼합 6갈래.
- **필터**: FacetRail 유무 갈리고, 있어도 «데이터 좁히기» vs «섹션 show/hide»로 의미가 다름.
- **정렬**: 헤더 클릭 정렬이 ExcelSheet에만. 공용 DataTable은 정렬 불가 → 표 쓰는 페이지 전부 정렬 죽음.
- **섹션**: `Sec`에 `id`/`onReorder` 안 넘긴 페이지(/integrity·/manage·/pnl·/financials 등)는 접기·숨김·재정렬 전부 죽음.
- **팝업**: 담기·Wizard·수동연결·문서발급 풀스크린 모달 남발 + `window.confirm/prompt` 혼재.
- **모바일**: /payments·/ingest·/inbox 은 `useIsMobile` 0건 + 셸 위임도 부분적 → 사실상 미대응.

## 유형별 규격

| 유형 | 보기(view) | 필터(filter) | 정렬(sort) | 섹션(sections) | 팝업 |
|---|---|---|---|---|---|
| **(a) 현황/원장 조회**<br>자산·계약·재무·지난계약·정합성 | 카드↔엑셀 `IconSeg` 토글(기본 **카드**). 표는 공용 DataTable **금지** → `ExcelSheet` | 좌측 `FacetRail`(데이터 좁히기) + 검색 `FilterBox` + 엑셀뷰 헤더 자동필터 | 카드=기본 고정 · 엑셀=헤더 클릭 정렬 | 카드뷰 `Sec`+`useSecOrder`(id 필수) · 엑셀뷰 평면 | 상세=차량360/고객360 오버레이(Drawer 금지) · 확인=표준 다이얼로그 |
| **(b) 통합시트**<br>운영시트 | **엑셀 전용**. 뷰토글 대신 열세트 탭(기본/전체) | `FacetRail`(운영시트 렌즈) + 헤더 자동필터 + 검색 | 헤더 클릭 정렬(숫자열 수치정렬) | 평면 단일 시트 | 행 클릭=차량360, 담기·팝업 없음 |
| **(c) 업무 처리**<br>배차·미수·자금·수선·과태료 | 카드/큐(ObjCard+Metric), 토글 없음 | `FacetRail`=**데이터 좁히기로 통일**(섹션 show/hide 전용 금지) + 검색 | 우선순위·급한순 고정 | `Sec`+`useSecOrder`(id 필수) | 처리=인라인 패널/전용 페이지 · 풀스크린 Wizard 최소화 · 확인=표준 다이얼로그 |
| **(d) 상세**<br>차량360·list/[id] | 단일 레코드(요약 Cards + FormGrid) | 없음 | 없음 | `DetailShell` + `Sec`(id) · prev/next | 확인=표준 다이얼로그(`window.prompt/confirm` 금지) |
| **(e) 입력/큐**<br>데이터센터·증빙수집·휴지통·list/[entity] | 리스트/편집표 단일, 토글 없음 | 검색만(FacetRail 없음) | 시간/상태 기본 정렬 부여 | 평면 `Sec`(id로 최소 접기) | 담기=인라인 `FileDrop`/폼 · 파괴적 액션=표준 확인 다이얼로그 |
| **(f) 지표**<br>손익·재무상태·경영 | KPI 카드 + 표/차트 | `PeriodBar`(기간) + `CompanyFilter`(회사). FacetRail 없음 → `Page` 셸 | 금액 큰 순 등 고정 | 평면 `Sec`(id) | 팝업 없음 · 드릴다운=라우트 이동 |

## 공통 원칙 (전 유형)
1. **`window.confirm/prompt` 금지** → 표준 확인 다이얼로그 원자 사용.
2. **공용 DataTable(정렬·자동필터 불가) 금지** → 조회형 표는 `ExcelSheet`.
3. **모든 `Sec`에 `id` 부여**(최소 접기 활성). 조회·업무는 `useSecOrder` 재정렬.
4. **`FacetRail` = 데이터 좁히기 의미로 통일** — 섹션 show/hide 전용으로 쓰지 말 것.
5. **모바일 = 셸/원자 위임 표준** — 페이지가 `useIsMobile`을 직접 안 써도 `WorkbenchBar`·`FacetPage`·`Sec` 위임으로 반응형 보장.
6. **팝업 최소화** — 담기·매칭·정산은 인라인 패널/전용 페이지 우선(풀스크린 모달 지양).

## 위반 체크리스트 (수정 대상)
- [x] **/contract-history** (a): 카드↔엑셀 · FacetRail(지난계약) · Sec
- [x] **/finance** (a): IconSeg + ExcelSheet(헤더정렬)
- [x] **/integrity** (a): ExcelSheet + Sec id
- [x] **/penalty** (c): ObjCard 큐 + useSecOrder · Upload/Docs 오버레이는 잔여(OCR·공문)
- [x] **/dispatch** (c): useSecOrder · ※ Wizard 풀스크린은 잔여(인라인 스텝은 후속)
- [x] **/receivables** (c): useSecOrder
- [x] **/payments** (c): FacetRail 데이터필터 · 수동연결 인라인 · ※ Sec 재정렬은 후속
- [x] **/repair** (c): 데이터필터 + useSecOrder
- [x] **/ingest** (e): 셸 위임(WorkbenchBar) — 페이지레벨 useIsMobile 불필요
- [x] **/inbox** (e): 상태/시간 기본 정렬
- [x] **/trash** (e): useConfirm + Sec id
- [x] **/contract** (a): DetailShell fixed 오버레이 · useConfirm
- [x] **/list/[id]** (d): usePrompt (기반영)
- [x] **/settings**: usePrompt (기반영)
- [x] **/manage · /pnl · /financials** (f): Sec id · Page 셸 · pnl ExcelSheet

## 이미 규격 부합
`/`(홈)·`/ops`·`/asset`·`/contract`(뷰/필터/섹션 축)·`/sheet`(운영시트=b형 신규) 은 대체로 부합. 홈·/ops 는 모바일 페이지레벨 분기까지 완비(모범).

## 잔여(후속)
- 배차 Delivery/Return Wizard → 인라인 스텝 패널
- 과태료 Upload/Docs 풀스크린 → 인라인/전용 라우트
- 자금일보 Sec `useSecOrder` 배선
