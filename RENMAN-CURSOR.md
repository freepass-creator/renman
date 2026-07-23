# RENMAN-CURSOR.md — Cursor 진입점

> renman (jpkerp6) 렌터카 ERP. **Cursor가 이 파일부터 읽고 시작한다.**
> 짝 파일: `CLAUDE.md` (Claude 진입점 — Claude Code가 자동 로딩하는 규약 파일이라 이름 고정).
> 두 파일은 **진입점일 뿐, 규격 본문은 아래 공용 문서 하나**를 가리킨다. (본문을 두 벌로 복붙하지 말 것 — 그게 이 프로젝트가 고치고 있는 바로 그 문제)

---

## 1. 문서 지도 — 어디에 뭐가 있나

| 문서 | 내용 | 언제 보나 |
|---|---|---|
| **`docs/RENMAN-WORK-ORDER.md`** | **작업지시서 · 규격서 (본문 SSOT)**. 절대 규격 · A그룹(지금 틀린 것) · B그룹(구조 개편) · 공용 원자 표 · 안티패턴 | **작업 전 필독** |
| `CLAUDE.md` | 코드 규격 (UI 공용 규격 · 화면 구조 · 데이터 3층 · 기능 엔진 SSOT · 개발 제약) | 코드 쓰기 전 |
| `DEPLOY.md` | 배포 · **오픈 전 필수 게이트**(env · Firestore rules 배포 · 크로스테넌트 검증 · 마스터 계정 · API 시크릿) | 배포·오픈 전 |
| **`docs/CACHE.md`** | **백업 SSOT** — `.next` 프로젝트 안 유지, 백업 시 캐시 제외 | 백업·새 PC·용량 |
| `tools/archive/architecture-cleanup-handoff.md` | Cursor Phase 0~3 정리 이력 · Phase 4 잔여 | 이전 맥락 확인 |
| `README.md` | 로컬 실행 | 환경 세팅 |

---

## 2. 지금 할 일 (요약 — 상세는 WORK-ORDER)

**A그룹 = ✅ 완료** (2026-07-20). A-0~A-3 코드 반영됨. WORK-ORDER 본문 상태도 맞춤.

**B그룹 진행** (2026-07-22 기준):

| | 항목 | 상태 |
|---|---|---|
| B-5 | 로딩층 `useEntityLists` | ✅ 거의 완료 (특수=company/trash/settings) |
| B-2 | 쓰기 퍼널 `commit*` | ✅ UI 핫스팟 · 엔진 잔여 |
| B-3 | 상태 SSOT | ✅ 1차 · 산재 잔여 |
| **B-1** | 미수 원장 엔진 | ⚠ 완화만 · **다음 본격** |
| B-4 | 필드 스키마 | ⬜ 마지막 |

**데이터:** frozen 시드 live 사업현황 재생성(2026-07-22) — 차량 163·계약 177·carry≡net.  
**오픈:** `DEPLOY.md` 게이트(Rules·env·마스터)는 배포/설정 작업.

지금: **B-1** 또는 오픈 게이트.

---

## 3. 절대 규격 (요약 — 어길 경우 되돌림)

```bash
# 작업 단위마다 둘 다 통과해야 완료
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit   # EXIT 0
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/<route>   # 200
```
- ⚠️ **turbo dev 실행 중 `npm run build` 금지**
- 저장: `resolveWriteCompany()` (`lib/scope.ts`) 필수 — `COMPANIES[0]`·`'switchplan'` 임의 폴백 **금지**
- 목록 로딩: `useEntityLists()` (`lib/use-entity-lists.ts`) — 로딩 보일러플레이트 복붙·`jpk:saved` 손롤 구독 **금지**
- 삭제: soft-delete만 (`store.remove`). 하드삭제 금지
- 페이지에서 집계·상태판정 **손롤 금지** (화면마다 숫자 달라지는 원인)
- **새로 만들기 전 grep으로 기존 구현 확인** (중복 구현이 이 프로젝트 주된 부채)
- 커밋 로컬만, **push 금지**. author `dudguq@gmail.com`

전체 규격·근거·완료 기준 → `docs/RENMAN-WORK-ORDER.md` §0, §5

---

## 4. 협업 규칙 (Cursor ↔ Claude)

1. **동시 작업 안 함.** 한 번에 한 쪽만 편집한다
2. **넘길 때는 반드시 `tsc EXIT 0` 상태로.** 깨진 채 넘기지 않는다
3. **바꾼 것 한 줄 남기기** → 아래 §5 핸드오프 로그에 追記
4. **공용 원자를 새로 만들었으면** WORK-ORDER §3(공용 원자 표)에 등록 — 다음 사람이 또 만들지 않게
5. 상대가 만든 원자와 **역할이 겹치면 승격/통합**, 병렬 신설 금지
   (예: 자금 전용 `useCashLedgerLists` → 범용 `useEntityLists`로 승격한 것)

---

## 5. 핸드오프 로그 (최신이 위)

> **⚠ 다른 PC로 옮길 때 (git으로 안 따라오는 것 2가지):**
> 1. **스위치플랜 실데이터** = `C:\dev\jpkerp6-마이그레이션\switchplan_스위치플랜\` (리포 밖·PII라 gitignore). 없으면 `MIGRATE_MODE=auto`가 frozen/demo로 폴백. 파일 2개(`[스위치플랜] 사업현황.xlsx`·`26년_스위치플랜_자금일보.xlsx`)를 그 경로에 복사해야 실데이터 반영됨. 경로 바꾸려면 `MIGRATE_ROOT` env.
> 2. **`.env.local`** = gitignore. 이번에 `NEXT_PUBLIC_MIGRATE_MODE=frozen`→**`auto`**로 바꿈. 새 PC에선 `.env.local.example` 참고해 다시 만들 것(Firebase 키·`auto` 모드).
> 얼린 시드 재생성 도구: `npx tsx tools/rebuild-switchplan-frozen.ts <사업현황.xlsx>` (드라이런 기본, `--write`로 반영).

| 날짜 | 작업자 | 내용 | 상태 |
|---|---|---|---|
| 2026-07-24 | Cursor | UIUX 잔여 3건: WizPanel(Delivery/Return 인라인) · `/penalty/docs` 전용 · payments `useSecOrder` | tsc0 · UIUX 체크리스트 완료 |
| 2026-07-23 | Cursor | UIUX-SPEC 위반 1차 이행: ExcelSheet/IconSeg(a·f) · DetailShell(contract) · ObjCard큐(penalty) · FacetRail 데이터필터(payments/repair) · useSecOrder(recv/dispatch/repair/penalty) · 지난계약 FacetPage · confirm/prompt는 기반영 | tsc0 · 잔여=Wizard/Docs 인라인 |
| 2026-07-23 | Cursor | frozen 시드 `--write` 재생성(스냅 H1~H3 반영): 163/177 · carry ₩142,315,000 · C→GLC 0 · 제네시스→현대 0 · 그랜저 IG=엑셀유지 | tsc0 · 가명화 기록 |
| 2026-07-23 | Cursor | 차종스냅 H2→H3→H1: `has`/catalogSubModel 짧은코드⊂긴루트 차단(C→GLC) · 브랜드헤드(제네시스≠현대DH) · `vehicleRecord`는 confidence=`high`만 덮어씀(review=엑셀유지) | tsc0 · 프로브 OK · frozen 미재생성(명시 요청 시 `--write`) |
| 2026-07-23 | Claude | **UI/UX 통일 규격**(전수검사 24p): `docs/UIUX-SPEC.md` — 유형6종(현황조회·통합시트·업무·상세·입력큐·지표) 보기·필터·정렬·섹션·팝업·모바일 SSOT + 위반 15p 체크리스트. 공통: window.confirm/prompt 금지·DataTable→ExcelSheet·Sec에 id·FacetRail=데이터필터·팝업 최소화 | 규격 확정(수정 대기) |
| 2026-07-23 | Claude | **운영시트=차량1대=1행 통합 마스터**(엑셀전용): `buildFleetRows` SSOT(자산+계약/손님+미수+보험조인+현위치) · 기본/전체 열토글(전체=기본+부가 우측) · FacetRail 운영시트렌즈(기본'보유') · 헤더필터/정렬 · 행클릭360 · 고아계약 노출(미수 안숨김) · 상태뱃지=상태톤·현위치 한칸하나 · 메뉴 최상단 승격 | 165행·보유113·미수1.42억·tsc0·/sheet200 |
| 2026-07-23 | Claude | **'오늘' KST 통일**(`todayKST`): UTC toISOString 이 KST 00~09시 하루 이르던 것 — 미수도래·D-day·기록일 14곳 경유. 타임스탬프는 UTC 유지 | tsc0·test35 |
| 2026-07-23 | Claude | **SM-1(P1) 불법전이 백스톱**: 범용 편집기 `/list/[entity]/[id]` 가 `canTransition` 없이 계약 status 를 그대로 저장 → 종료계약 부활(해지→운행) 가능하던 것. `canSetStatus`(status SSOT) 신설 + `commitUpdate` 커맨드층에서 강제(rec.status 우선·없으면 조회). 종료→운행/대기 부활만 차단, 전진·채권화·no-op 허용 | tsc 0 / test 35 |
| 2026-07-23 | Claude | **얼린 시드 가명화**(PII): `tools/mask-switchplan-pii.ts` 신설 — 실명→고객NNN·전화·번호판·VIN·임차인 counterparty 결정적 치환(참조무결성·carry 보존). `rebuild-switchplan-frozen`이 기록 직전 자동 마스킹 → 재생성해도 실PII 안 들어감. 시드는 정적 import(번들)라 gitignore 불가 → 가명화가 정답 | 실PII 0·carry 142,315,000·163/177·tsc 0·test 32/32 |
| 2026-07-22 | Cursor | frozen 시드 live 재생성(`rebuild-switchplan-frozen --write`): 차량 118→163 · 계약 147→177 · asOf 07-22 · carry≡net ₩1.42억·미수율34% · DocIssueDialog 미리보기 `C.head` · §2 B진행표 갱신 | tsc 0 / audit OK |
| 2026-07-22 | Cursor | UI 통일 패스: `TextLink` 원자 · Vehicle360/mobile-tabs 배럴 흡수 · payments `Modal`+`TOUCH` · 링크 손롤(계약/과태료/자금/목록/이력) · globals.css 죽은 셸 ~24KB 제거(Phase4 일부). ※WorkbenchBar는 순환 때문에 ui 하위경로 유지 | tsc 0 / :6007 200 |
| 2026-07-21 | Claude | **운영현황 = 함대 흐름**: 요약현황 섹션 삭제(지표 10개가 섹션 헤더와 중복·미수는 리스크탭) → KPI(보유·가동률)는 툴바 stat 한 줄 · 섹션 순서=인도대기→반납지남→휴차→만기임박→운행중→멈춘차(`useSecOrder ops-v2`) · 「곧비는차」를 지남/임박 2섹션으로 분리 | tsc 0 / 홈 200 |
| 2026-07-21 | Claude | **분류 SSOT 버그**: 운영현황 운행102·유휴 목록이 요약과 안 맞던 것 — `buildAssetDerived`가 `v.status`로 다시 갈랐는데 지표는 계약기준(`D.running`). 이제 `D.running/idleCars/soldRows` 재사용, 그밖=차집합 · `a-running` 40대 조용한 절단 제거 | tsc 0 |
| 2026-07-21 | Claude | **보기전환(카드↔엑셀)**: `IconSeg` 원자 신설 · `WorkbenchBar view` 슬롯(검색창 우측 고정) · `ExcelSheet mode` — 같은 cols로 표/카드 · CLAUDE.md 금지항목 "보기전환 손롤"로 정정(원자는 허용) · 헤더필터(ERP4 오토필터)·행호버 pin 수정·틀고정 제거 | tsc 0 / sheet 200 |
| 2026-07-21 | Claude | **레일 레이아웃 흔들림**: FacetPage가 `rail={null}`(로딩중)일 때 자리를 안 잡아 완료 시 본문이 쪼그라들던 것 — 200px 자리 예약 · `rail` undefined(안씀)/null(로딩중) 구분 계약화 | tsc 0 / 8p 200 |
| 2026-07-21 | Claude | **탭 뱃지**: `PillTabs badge` — 미결·리스크 탭에 쌓인 건수(0이면 숨김) · `WorkbenchTab.badge` | tsc 0 |
| 2026-07-21 | Claude | **업로드 UI 통일**: `FileDrop` 다중(`onFiles`)·진행표시 지원 · `DocUpload` 조립 원자 신설 · PenaltyUpload·InfoDoc 손롤 드롭존→`FileDrop`(과태료 고지서 창이 데이터센터와 같은 모양). 인라인버튼·카메라(WorkForm·수집함 등)는 어포던스 달라 유지 | tsc 0 |
| 2026-07-21 | Claude | **메뉴 재구성**: 업무=고유업무만(배차·차량수선·미수·자금일보·과태료·증빙수집) · `자료등록`→**데이터센터**(최상단, 선택기를 데이터3층 optgroup으로 — 이벤트도 투입 가능함을 노출) · `정비관리`→`차량수선` · `/work`는 메뉴 제외(페이지는 모바일탭·WorkHubBack 때문에 유지) | tsc 0 / 6p 200 |
| 2026-07-21 | Claude | **활동↔계약 매칭 버그**: `lib/activity-match` 신설(contractNo→번호판+기간→이름 3단) · Customer360이 번호판으로만 걸러 손바뀜 차에서 앞 임차인 통화가 다음 임차인에게 노출되던 것 수정 · Vehicle360 QuickLog가 contractNo 안 넘기던 것(원인) 수정 + 이력에 「상대」 표기 | tsc 0 / 5p 200 |
| 2026-07-21 | Claude | **섹션 IA 기준 확립**: 「오늘 끝낼 수 있는가」로 탭 배치 — 미수 `s-unpaid`→`r-unpaid` 통합(미결에 두면 큐가 안 비워짐) · 정비사고 `s-repair`→자산 그룹 · `리스크현황`→`리스크관리` · 미결 9→8섹션 · `cockpit-v3` 키 승격 · CLAUDE.md 기준표 | tsc 0 / 5p 200 |
| 2026-07-21 | Claude | 운영시트 탭 4종(자산·계약·채권·반납) = 사업현황 시트 구성 · `buildContractRows` 신설(계약 1행) | tsc 0 / 1p 200 |
| 2026-07-21 | Claude | 스위치플랜 원클릭 마이그레이션 배선: `MIGRATE_ROOT` 폴더 생성+사업현황·자금일보 배치 · `MIGRATE_MODE=auto` · `tools/rebuild-switchplan-frozen.ts`(얼린시드 재생성, 드라이런 기본) | 차량 118→163 · 계약 147→177 |
| 2026-07-21 | Claude | **원자 테마화 완결**: `components/ui/**` hex 0(`SCRIM_FG` 예외 1) — 표면`#fff`→`C.card` · 브랜드위 글자→`C.inverse` · `Message`/`Badge` 팔레트 통째로 `--{tone}-bg/text/border`로 · globals.css `--teal-*` 삼종 신설(라이트+다크) | tsc 0 / 10p 200 |
| 2026-07-21 | Claude | 스크림 SSOT: `SCRIM`/`SCRIM_FG`(tokens) — 5가지 값으로 흩어져 있던 7곳(Drawer·Modal·SessionBar·payments·CommandPalette·UploadSection·LoadingOverlay) 통일 | tsc 0 / 11p 200 |
| 2026-07-21 | Claude | `.cursor/rules/renman.mdc` 신설(Cursor 자동로딩) · **PenaltyDocs 문서면 되돌림**: A4 종이는 토큰 금지(`PAPER/INK/INK_SUB/RULE…` 고정) — 다크테마에서 종이가 검어지고 인쇄 시 흰종이+흰글자로 판독불가가 됨. 화면 크롬만 토큰 | tsc 0 / 9p 200 |
| 2026-07-21 | Cursor | tokenize-2: 잔여 `#fff`→`C.card`(Agenda/SearchBox/InfoDoc 등) · dev/data th/td 재사용 · 예외 주석 · CommandPalette `C` import 누락 자체수정 | tsc 0 |
| 2026-07-21 | Claude | 3단계: WorkForm 타이틀밑줄·manage 박스래퍼 제거 · PenaltyDocs→`EmptyState` · Vehicle360 잔여 hex 5 | tsc 0 / 6p 200 |
| 2026-07-21 | Claude | 2단계: 현장 위저드 공용원자 `components/ui/wizard.tsx`(`WizCard`/`WizField`/`WizPhotos`/`wizInput`) — Delivery·Return 중복 40줄 소멸. ※Row는 정렬·필드폭이 달라 의도적으로 미통합 | tsc 0 / 6p 200 |
| 2026-07-21 | Cursor | 하드코딩 색 토큰화(CURSOR-TASK-tokenize): PenaltyDocs·manage·ingest·list·audit·360 fInp | tsc 0 |
| 2026-07-21 | Claude | 1단계 근원: `tokens.tsx` 하드코딩 제거(`C.lineStrong`/`inverse`/`card` 추가) — `toggleStyle` 활성칩이 다크에서 안 보이던 버그 동반 수정 · PenaltyUpload 복붙 th→`...th` | tsc 0 |
| 2026-07-21 | Cursor | B-2 잔여: contract/receivables/inbox/penalty/list상세/IngestDialog/DocIssueDialog/inbox-upload → `commit*` | tsc 0 |
| 2026-07-21 | Cursor | B-2 확장: `commitSave/Remove/All` · Vehicle360 전 쓰기 · payments 매칭/CMS/해제 | tsc 0 |
| 2026-07-21 | Cursor | B-3: 죽은 lifecycle/risk-issues 삭제 · `domain/status` SSOT · B-2: `commitUpdate`+Delivery/ReturnWizard | tsc 0 / audit OK |
| 2026-07-21 | Cursor | 파이프 순서: 미수 audit OK(본격 B-1 보류) · B-5 360/Ingest/ingest→`useEntityLists`(+opts.companyId) · API/Rules는 login·Vercel link 필요(운영) | tsc 0 / audit OK |
| 2026-07-21 | Cursor | 파이프라인 재검증(canvas) · `/sheet` 운영시트(프리패스 엑셀뷰 이식 · `ExcelSheet`+`buildSheetRows`) · 현황 메뉴 | tsc 0 |
| 2026-07-21 | Cursor | 모바일 감사 수정: KV/QuickLog/WorkForm/Ingest 입력 `ctrlH`·16 · DataTable→ObjCard · company `WorkbenchBar.actions`+Sec · error btn40/16 · SessionBar pad=54 | tsc 0 |
| 2026-07-21 | Cursor | 오픈게이트: B-1완화(carry분배→FIFO수납)·API Bearer(`api-headers`+NEXT_PUBLIC_API_SHARED_SECRET)·합본쓰기 scope(payments·360·receivables·contract·inbox) · Rules배포는 firebase login 필요 | tsc 0 / audit OK |
| 2026-07-21 | Cursor | `main` 푸시 `89682ff` → GitHub `freepass-creator/renman` (Vercel 연동 배포용) | pushed |
| 2026-07-21 | Cursor | B-5 2차: integrity·inbox·penalty·manage·pnl·PenaltyDocs → `useEntityLists` · 잔여=ingest/IngestDialog/360 | tsc 0 / 5p 200 |
| 2026-07-21 | Cursor | B-5 착수: `useEntityLists` 이행 — receivables·dispatch·asset·contract·contract-history·financials·payments·docs·audit·list/[entity] · §2 A완료·B-5다음으로 정리 | tsc 0 / 11p 200 |
| 2026-07-21 | Cursor | `C:\dev\jpkerp6-app` 작업 배치·`npm run dev` · 외부 distDir/정션은 Turbopack 모듈해석 실패 → `.next` 프로젝트 안 유지·백업 시 제외(`docs/CACHE.md`) | :6006 Ready |
| 2026-07-20 | Cursor | A그룹 완료: A-1 `patchEngineLock`+Vehicle360 `engineDisabled` SSOT · A-3 `isCashPurchase` · A-2 `selectReceivables` 5화면 · A-0 ingest/IngestDialog/PenaltyUpload/DocIssueDialog 합본 저장 회사 명시 선택 | tsc 0 / 10p 200 |
| 2026-07-18 | Claude | A-0 회사스코프 오배치 수정(`lib/scope.ts` 신설 + finance·Wizard 2종·QuickLog·WorkForm 적용). `lib/use-entity-lists.ts` 범용 로딩 훅 신설. 8축 아키텍처 감사 → WORK-ORDER 작성 | tsc 0 / 전 페이지 200 |
| 2026-07-18 | Cursor | `listsCached` + `useCashLedgerLists`(자금 3페이지) · `CashHubTabs` · `dashboard-consts`(TODAY 추출) · `isStaffSuspended` | tsc 0 |
| 2026-07-18 | Claude | 오픈 감사 → 블로커 5 + 하드닝 15 수정 (미수 동결 · 마스터 탈취 · 빈 자연키 · 날짜 크래시 · API 인증 · rules 하드닝 등) | tsc 0 / 17p 200 |

---

## 6. 하지 말 것 (실제로 겪은 것들)

- ❌ 기존 구현 확인 없이 새로 만들기 → 같은 기능 2벌
- ❌ 페이지에서 집계 손롤 → 화면마다 숫자 다름
- ❌ 저장 대상 회사 임의 폴백 → 타 법인 오배치(회사격리 위반)
- ❌ 죽은 코드 "혹시 몰라" 남기기 → 경쟁 SSOT가 되어 다음 사람을 속임
- ❌ 타입 선언이 실제 저장값과 다른 채 방치 → 컴파일러가 거짓 안전감만 줌
- ❌ 큰 구조 변경을 검증(숫자 대사·tsc·렌더) 없이 반영
