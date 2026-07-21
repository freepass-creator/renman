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

**다음 = B그룹** (권장 순서):

| | 항목 | 한 줄 |
|---|---|---|
| **B-5** | 로딩층 이행 | 목록 페이지 대부분 이행됨 · 잔여=ingest/360/IngestDialog 등 특수 |
| B-1 | 미수 원장 엔진 | 가장 중요·위험 — A-2 셀렉터 이후 숫자 대사 필수 |
| B-3 | 상태 SSOT + 죽은코드 | B-2 선행 |
| B-2 | 쓰기 단일 퍼널 `commit` | |
| B-4 | 필드 스키마 SSOT | 마지막 |

지금: **B-5 잔여** 또는 **B-1** 선택.

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

| 날짜 | 작업자 | 내용 | 상태 |
|---|---|---|---|
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
