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

**IA (2026-07):** 허브=홈(대시보드)·운영현황(통합시트)·일정관리(기한엑셀)·데이터센터.  
원장=자산·계약·자금·업무. 일정=`buildAgenda` 어김/임박/예정 · LedgerFrame.  
홈=지표 한눈(함대·일정어김·미수) — 엑셀 표는 각 메뉴.

**Claude 검증 포인트:** `PAGE_IA`/`NAV_GROUPS` · 리다이렉트 · 패널 수정 · `/cash` tools CTA · 버튼 zone · `tsc --noEmit`.

**B그룹 잔여:** B-1 미수 원장 엔진 · B-4 필드 스키마 · globals 레거시.

**🔴 버그 (2026-08-06 dev 로그 실측 · 오픈 전 수정):**
- **감사로그·이벤트가 서버에서 거부된다.**
  `POST /api/entities/audit_logs 404` · `POST /api/entities/atomic_event 404`
  원인 = `app/api/entities/[entity]/route.ts` 가 `ENTITIES` 에 없는 키를 404 로 막는데
  `audit_logs`(store.ts AUDIT_COLL)·`atomic_event` 는 ENTITIES 에 없다.
  **데이터는 저장되는데 «누가 언제 무엇을 바꿨는지»가 안 남는다.**
  ▸ 방향: 이 둘은 Admin 라우트를 태우면 안 된다 — 라우트의 문서ID 규약(`{companyId}__자연키`)이
    감사로그 id 와 안 맞고, rules 에 이미 전용 match 가 있다(audit_logs = append-only · byUid 강제).
    `store.save` 에서 이 둘만 **클라 SDK 직행**으로 보내면 된다.

**UI 요청 (사장님, 2026-08-06 · ✅ Cursor 반영):**
- ✅ **「무엇이든 올리기」[업로드]·[업로드 취소]** — 선택 스테이징 후 footer 확정/취소.
- ✅ **우측 투입패널 = `LedgerRecordPanel`** (원장 상세와 같은 크롬·footer).
- ✅ **OCR 중 업로드 박스 유지** — FileDrop `note`로 진행, 시트 PageLoading 제거.
- ✅ **대기/저장본 = ExcelSheet 요약 열** (`lib/ingest-summary`) —
  파일형태 · 문서종류 · 카테고리 · 분석결과 · 신뢰도 · 상태.
  빈 상태에도 **열 헤더 상시**. 상세 필드는 더블클릭 → 우측 패널.

**미착수 지시 (사장님, 2026-08-06):**
- ~~**차량360(`/vehicle/[plate]`) 규격 이식**~~ **✅ 완료 2026-08-07 · 이행표 = `docs/VEHICLE360-SPEC.md` 상단**
  이력 6종은 **이미 표였고**, 실제로 빠져 있던 둘을 넣었다: **계약이력**(수납 스케줄 안에 카드로 묻혀
  있던 것을 별도 섹션·표로 — 열은 규격 §3 그대로, 행 클릭 = 계약 딥링크) · **문서**(§3-1 종류 무관 목록
  + 종류 선택/직접 입력 업로드). `panels/` 6파일 삭제(죽은 카드 레이아웃).
  ⚠ 업로드(등록증·보험증권) 경로는 손대지 않았다 — 오픈 조건 ①의 유일한 상시 화면이다.
  **§3-2 데이터센터 「문서 종류로 올리기」도 완료(2026-08-07)** — `/ingest` 상단 Select 가 **종이** 축이 됐고
  원장·OCR 스키마는 `decodeIntakePick` 이 정한다. ⚠ OCR 은 **종이가 정한다**(엔티티 폴백 금지 —
  견적서에 자동차등록증 OCR 이 돌면 엉뚱한 값이 조용히 들어온다) · 종이 없는 원장(이력·계좌·임대차·카드거래)은
  「원장 직접」 그룹으로 남겨 도달 가능 · `?type=` 딥링크 유지.
- ~~**업무 자동 생성 — 조건이 업무를 낳아야 한다.**~~ **✅ 2026-08-07 Claude · 규격=`docs/PLAN-work-autogen.md`**
  어젠다(반납·검사·보험·세금)가 **제안 업무**로 원장에 뜨고, 사람이 «업무로 맡기 / 7일 뒤에»를 누르는
  순간에만 저장된다(**지연 실체화**). 손 안 댄 제안은 계산값이라 조건이 해소되면 같이 사라진다
  → **좀비 없음 · 화면 열 때 쓰기 0**.
  근거키 `auto:{종류}:{대상}:{기한}` 을 `work_item.workId`(자연키)로 쓴다 → 문서ID가 같아 **중복이 구조적으로 불가**.
  기한이 바뀌면 새로 만들지 않고 「기한변경」 배지 → 반영 시 **같은 문서**의 기한만 옮긴다(이력 유지).
  근거가 사라지면 「근거소멸」 배지 + **사람이** 종결(자동 종결 안 함 — 감사 흔적).
  ⚠ **과태료는 자동 제안에서 제외** — `penalty` 가 이미 업무원장 원천(`source:'penalty'`)이라 두 줄이 된다.
- **업무 세부 채우기 — 계약 축이 비어 있다.** 대분류 6축은 확정(자산·계약·자금·일정·과태료·기타)이고
  자산에 `입출고`·`매각·처분`까지 넣었다. 남은 것은 **계약 축의 실행 업무**다.
  후보(도메인에 이미 엔진 있음): `인도`(planTransition deliver) · `반납·정산`(returned-proration·초과주행) ·
  `중도해지`(early-term-rate 위약금) · `연장·재계약`(extend) · `계약변경`.
  **✅ 확정 (사장님, 2026-08-07): 「업무 = 예정·준비, 실제 상태 전이는 계약화면」.**
  인도·반납·해지는 계약화면에 상태를 바꾸는 버튼이 이미 있다. 업무에서도 전이시키면 경로가 둘이 되어
  «어느 쪽이 진실인가»를 알 수 없게 된다. 업무는 «언제·누가·어디서»(회수 준비)까지만 담는다.
  → 세부 `반납·정산` 이 이 규격으로 들어갔다(`lib/work-form-sections.ts` 「반납 준비」 = 기한·장소·탁송사·주행거리·담당).
  나머지 4종(`인도`·`중도해지`·`연장·재계약`·`계약변경`)은 **아직 세부가 없다** — 추가할 때 같은 규격을 따른다:
  **폼에 상태전이 버튼을 두지 말 것.** 상세에서 계약으로 딥링크만 건다.
- **업무 세부 사용자정의(하부메뉴 추가).** 지금은 `WORK_CATEGORIES_ACTIVE` 코드 상수.
  회사별 마스터(세부 목록 + 소속 대분류)로 빼고 설정 화면에서 추가·이름변경·순서·사용중지.
  사용중지한 값의 과거 업무가 사라지지 않아야 한다(현재 구조가 이미 그 방식 — 목록에서만 빠짐).
- **`/status` 운영현황 = 실제 보유 차량만.** ✅ Cursor 2026-08-06 — 열·통계·리스크칩에서 계약종료 미수 제거(유지미수만). 종료는 계약·리스크.
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

## 4-9. 데이터센터 — **1건 = 파일 N장** (+축4·목록열) (사장님 확정 2026-08-06)

✅ Cursor 2026-08-06:
- pages[] · 상세 장목록 · 장 행 스피너 · 장별 OCR 병합
- lib/doc-kinds.ts (성격·귀속·종류 · VEHICLE360 §3-2 공유 · WORK_DIVISIONS)
- 대기 열 = 형태·성격·귀속·대상(미배정=빨강)·행선지·장·분석(증빙=해당없음)·종류
- 업로드 툴바 토글(업로드↔취소) 1개
- 필터패널 = **후속**

| 축 | SSOT |
|---|---|
| ① 파일형태 | ileForm / detectFileForm |
| ② 성격 | DocNature in doc-kinds |
| ③ 귀속 | WORK_DIVISIONS |
| ④ 종류 | DOC_KINDS |
| ⑤ 분석 | 파생 (nalysisLabel, 증빙→해당없음) |

---

## 4-10. 오픈 실행 절차 — **코드는 다 있다. 남은 건 조작이다** (확인 2026-08-06)

「회사 생성 화면이 없다」·「비우는 도구가 없다」는 **둘 다 틀린 백로그였다.** 실물 확인:

| 할 일 | 화면 | 경로 | 상태 |
|---|---|---|---|
| 회사 등록·수정·보관 | `components/CompanyRegistry.tsx` | 설정 → **일반관리**(`/admin`) | `/admin` 200 · `/api/companies` 401(인증 정상) |
| 임의 데이터 비우기 | `app/dev/data/page.tsx` (`wipeCompany`·`wipeAllData`) | 설정 → **개발도구**(`/dev/data`, 본사 전용) | 200 |

**순서 (반드시 이대로):**
1. `/admin` 에서 **실제 회사**를 등록한다(상호=사업자등록증 그대로). 임의 회사명은 여기서 수정/보관.
2. `/dev/data` → **회사별 `wipeCompany`** 로 임의 데이터를 지운다.
   ⚠ `wipeAllData` 는 전 회사다. `audit_logs` 는 append-only라 **양쪽 다 안 지운다**(`lib/reset.ts:12-13`) — 의도된 것.
3. `/ingest` 에서 실자료를 올린다. → 4. `/status` 로 운영현황 확인.

**2번을 1번보다 먼저 하면** 임의 회사에 실데이터가 섞인다. 회사부터 세우고 지운다.

---

## 4-11. 경영관리 = **법인 원장 하나**. 자산과 똑같이 (사장님 확정 2026-08-06)

> 「경영관리에서 회사목록 누르면 상세패널 나오고 거기서 법인계좌·카드등록 다 하면 되잖아」
> 「**자산처럼 관리하면 되잖아**」 「거기에 계좌·임대차·직원·관리회사설정 이런 탭을 두니…」

**계좌·임대차·직원은 법인에 «딸린» 것이지 형제가 아니다.** 차량 원장 옆에 「계약」·「정비」·「과태료」
탭을 나란히 두지 않는다 — 차 1대를 누르면 그 안에 다 있다. 법인도 똑같다.

### 지금 (틀림)

```
경영관리 ─ [법인][계좌][임대차][직원] 4탭 형제
           법인 패널 = 읽기 전용 + 「관리 회사 설정」 → /admin 으로 내보냄
/admin   ─ CompanyRegistry (추가·수정·제외·사업자등록증 OCR) ← 여기 따로 있다
```

등록하러 화면을 나가야 한다. 자산은 안 그런다.

### 이렇게 (자산 규격)

```
경영관리 = 법인 원장 1개 (탭 없음)
  └ 법인 행 클릭 → 상세패널 = 접히는 섹션 + 그 안에 표   ← docs/VEHICLE360-SPEC.md 와 같은 규격
```

| 섹션 | 종류 | 그 안에서 되는 일 | 데이터 |
|---|---|---|---|
| 사업자 | KV | **사업자등록증 업로드+OCR** · 상호·사업자번호 수정 | `CompanyRegistry` 에서 **이식**(신설 아님) |
| 소재지 | KV | 본점·사업장·차고지 수정 | `company-master` |
| **법인계좌** | 표 | **+계좌 등록** · 약칭 수정 | `bank_account` SSOT — 지금 「계좌」탭 |
| **법인카드** | 표 | **+카드 등록** | 마스터 엔티티 없으면 **신설**(`card_tx` 는 거래라 별개) |
| **임대차** | 표 | +계약 등록 · 만기 경고 | 지금 「임대차」탭 |
| **직원** | 표 | 초대·권한 (본사만) | 지금 「직원」탭 |
| **문서** | 표 | 종류 무관 N장 — `lib/doc-kinds.ts` **재사용** | §4-9 pages[] 와 같은 목록 |
| 보유 자산 | KV | 등록대수·운영중·유휴 → `/status` 딥링크 | 집계 |

**생성 = 원장 쓰기 버튼.** 「+ 법인 등록」을 원장 헤더 **쓰기 zone**에 둔다(자산등록과 같은 자리).
누르면 `createManagedCompany` 로 **바로 만들고 그 법인의 상세패널이 열린다** — 빈 껍데기에서
사업자등록증 올리면 OCR이 상호·사업자번호·대표·주소를 채운다. 별도 등록 화면·모달 만들지 말 것.
(지금은 `/admin` 으로 나갔다 와야 한다 — 그게 문제다.)

- 하단 고정 액션바: **상호 수정** · **관리목록에서 제외**(`archiveManagedCompany`)
- **`/admin` 은 없앤다.** `CompanyRegistry` 는 「사업자」 섹션으로 흡수, `AccountAliases` 는
  「법인계좌」 섹션으로 흡수. 설정 메뉴의 `/admin` 링크 3곳도 정리(`app/settings/page.tsx:32`,
  `app/management/page.tsx:194,261`).
- 섹션 원자는 **이미 있다**: `LedgerRecordSection.body` / `.count`. 새로 만들지 말 것.
- 이건 **차량360과 같은 작업**이다. `docs/VEHICLE360-SPEC.md` §1·§4 를 그대로 따른다
  (카드·지표 금지 · 표만 · 완료기준 `Cards`/`Metric`/`ObjCard` 0개).

⚠ **조각으로 손대면 또 섞인다.** 탭 폐지 + 섹션 이식을 **한 번에** 한다.

---

## 5. 핸드오프 로그 (최신이 위)

> **⚠ 다른 PC로 옮길 때 (git으로 안 따라오는 것 2가지):**
> 1. **스위치플랜 실데이터** = `C:\dev\jpkerp6-마이그레이션\switchplan_스위치플랜\` (리포 밖·PII라 gitignore). 없으면 `MIGRATE_MODE=auto`가 frozen/demo로 폴백. 파일 2개(`[스위치플랜] 사업현황.xlsx`·`26년_스위치플랜_자금일보.xlsx`)를 그 경로에 복사해야 실데이터 반영됨. 경로 바꾸려면 `MIGRATE_ROOT` env.
> 2. **`.env.local`** = gitignore. 이번에 `NEXT_PUBLIC_MIGRATE_MODE=frozen`→**`auto`**로 바꿈. 새 PC에선 `.env.local.example` 참고해 다시 만들 것(Firebase 키·`auto` 모드).
> 얼린 시드 재생성 도구: `npx tsx tools/rebuild-switchplan-frozen.ts <사업현황.xlsx>` (드라이런 기본, `--write`로 반영).
>
> **2026-08-06 윈도우 재설치 후 현재 상태:** 위 2개 **둘 다 없음**(C:·D: 모두 초기화). 실데이터 xlsx 2개·`.env.local` 재확보 전까지는 frozen 시드 + localStorage 미리보기로만 돈다.

| 날짜 | 작업자 | 내용 | 상태 |
|---|---|---|---|
| 2026-08-07 | Cursor | **운영현황 기간 제거**: 현재 보유 스냅샷이라 PeriodBar·range 필터 불필요 — `/status`에서 삭제 | tsc0 · curl200 |
| 2026-08-07 | Cursor | **모바일 하단 4탭**: 운영현황·리스크·업무관리·업로드. 설정=햄버거. `/m`·`MobileTabBar` 기본 동기 · 탭저장 v2 · `/m`→`/m/ops` | tsc0 · curl200 |
| 2026-08-07 | Cursor | **모바일 검색폭**: 필터줄 검색이 회사~필터 사이 가로 꽉 채움(`data-ui=search`+flex) · `Search type=search` · 인라인 width:160 제거 | tsc0 · curl200 |
| 2026-08-07 | Cursor | **모바일 기간→필터 안**: `LedgerFrame period` prop · 데스크톱=필터줄 · 모바일=필터패널(닫아도 마운트 유지) · 원장·자금일보 dateStep 이전 · filters 안 PeriodBar 제거 | tsc0 · curl200 |
| 2026-08-07 | Cursor | **UI 크롬 일관성**: 빈/의도없는 WorkbenchBar 기본차량검색 제거(`search={false}` 또는 tools 삭제) · meta·stats 회사스코프 중복 제거(CompanyFilter와 겹침) · 정합성 EmptyState `ok` · 문서발급 오류=`Message` · 법인상세 제목「법인관리」 | tsc0 · curl200 |
| 2026-08-07 | → **다음 세션 시작점** | ① **실데이터 올려보기**(`/admin` 회사등록 → `/dev/data` 비우기 → `/ingest` 자금일보 = 1,794건 들어와야 함). ⚠ **`C:\dev\jpkerp6-마이그레이션\` 이 지금 비어 있다** — G드라이브 카톡 백업에서 xlsx를 다시 복사해야 한다 ② 자금일보 화면이 계정과목·차량번호·임차인 3열을 쓰는지 확인 ③ 아래 «판단 3건» ④ 자동업무 실화면 확인(§ 아래) | 대기 |
| 2026-08-07 | Claude | **증차·감차 신청 = 업무**(AUDIT §6-3 사장님 확정 — 「증차신청은 업무, 공문·근태·공지는 별개」). 세부 `증차·감차` 신설(자산 축) · ⚠**차량번호 면제**(대상이 법인·아직 없는 차) · 상태 준비=대기/접수=진행/**승인·반려=완료**(반려도 끝난 것 — 보류면 영원히 열림) · 법인 패널 「등록대수·증차신청」 읽기표+그자리 등록 · 옛 `master.regApplications` **1회 이관 버튼**(`workId=regapp:{id}` 이라 재실행 안전) · SSOT `lib/company-reg-apps.ts`. **공문 대장은 법인 속성 그대로** | tsc0 · vitest 76p/679 · /management·/work·/company 200 |
| 2026-08-07 | Claude | **표 틀고정 = 가로스크롤 + 첫 열 고정**(AUDIT §4-3 결정·반영, 전 원장 공통). `excel-sheet--fit` 열 숨김(p4→p3→p2 컨테이너 쿼리) **폐기** — 열이 조용히 사라지던 것. 표 최소폭 = 열수×`EXCEL_COL_MIN`(92). **틀고정은 첫 `pin` 하나만**(회사명·구분·차량번호 셋 다 `left:0`이라 겹쳐 있었다) · `pin` 없으면 고정 안 함 · `SheetCol.priority` **deprecated**(동작 없음, 열 구성은 `pickCols` 명시목록). **⚠ 육안 확인 필요 — 커서 오더** | tsc0 · vitest 75p/669 · 6원장 200 |
| 2026-08-07 | Claude | **데이터센터 「종이」로 올리기(규격 §3-2)** — `/ingest` 상단 Select = 엔티티 → **문서 종류**. 원장·OCR 스키마는 `decodeIntakePick` SSOT 가 정하고 결과를 옆에 표시. ⚠ **OCR은 종이가 정한다**(엔티티 폴백 금지) · 목록에 없는 종류는 직접 입력→`inbox` 원본보관 · **종이 없는 원장(이력·계좌·임대차·카드거래)은 「원장 직접」 그룹**으로 남겨 도달 가능(안 그러면 화면에서 사라진다) · `?type=` 딥링크 유지 · `_docs.type` 은 `docVersionType` 로 통일 | tsc0 · vitest 75p/669 · /ingest·/ingest?type=lease 200 |
| 2026-08-07 | Claude | **차량360 규격 마감** — 이행표 `docs/VEHICLE360-SPEC.md` 상단. 이력 6종은 이미 표였고 빠져 있던 둘을 넣음: **계약이력**(별도 섹션·표·행클릭=계약딥링크·종료사유는 `classifyContract` SSOT) · **문서**(종류 무관 목록 + 종류선택/직접입력 업로드, 종류는 `lib/doc-kinds` SSOT). `panels/` 6파일 삭제(죽은 카드 레이아웃 — 규격이 다시 섞일 씨앗). ⚠ 슬롯 종류는 `docVersionType` 로 저장해야 서류미비 판정에 잡힌다. 남은 것 = §3-2 `/ingest` 종류 기반 업로드 | tsc0 · vitest 74p/658 · /vehicle·/asset·/contract 200 |
| 2026-08-07 | Claude | **미수 회수 지시(지시층 Phase 2)** — `PLAN-work-autogen.md` §11. 회수 4단계(경고·시동제어·차량회수·내용증명·채권화)가 업무로 뜬다. 엔진을 **씨앗(seed)** 구조로 일반화 — 어젠다는 «대상+기한», 미수는 «계약+**단계**»가 정체성이라 **단계가 오르면 기한변경이 아니라 새 지시**(옛 단계는 근거소멸). ⚠ 「계약조건 확인」·「회수대기」는 지시로 안 만든다(조치 아님·홍수) · **연체조항 미등록이면 0건이 정상** · 만기/휴차/인도예정은 승격 안 함(사유 §11-3). 테스트가 근거소멸 판정 버그 1건 잡음 | tsc0 · vitest 74p/658 · /work·/m/work·/risk·/ 200 |
| 2026-08-07 | Claude | **업무 자동 생성(지시층 배선)** — 규격·설계근거 `docs/PLAN-work-autogen.md`. 어젠다 4종(반납·검사·보험·세금)이 업무원장에 **제안행**(`source:'agenda'`·배지 「자동」)으로 뜨고, «업무로 맡기 / 7일 뒤에» 를 누를 때만 저장(**지연 실체화** → 좀비 0·쓰기 0). 근거키 = `workId`(자연키)라 **중복 구조적 불가**. 기한변경·근거소멸 배지 + 사람이 반영/종결. 모바일은 행 탭 = 맡기. 신규 세부 `반납·정산`. 부수 수정: `workGroup` 이 신규 세부를 「기타」로 흘리던 구멍 | tsc0 · vitest 74p/650 · /work·/·/m/work 200 |
| 2026-08-07 | Claude | **실파일 검증 — 🔴전멸 2건 발견·수정**: 자금일보 0→1,794(날짜열을 이름순으로 집던 버그) · 법인카드 0→1,975(`card-tx` 파싱 분기 자체가 없었음) · **손으로 채운 3열 보존**(계정과목1,793·차량847·임차인523) · 실무↔정규 과목 별칭표(`SUBJECT_ALIAS`) · CSV CP949(`TextDecoder`, 번들 무증가) · 실파일 17개 중 16개 통과 · **프로덕션 빌드 통과** | tsc0 · vitest 73p/628 · build ok |
| 2026-08-06 | → **판단 3건 (착수 전 결정 필요)** | ① `docs/AUDIT-2026-08-06.md` §6-3 — 증차신청·공문을 **업무로 볼 것인가** ② §6-4 — 근태·공지를 담을 «전 법인 행정» 자리를 만들 것인가 ③ §4-3 — 표 틀고정(열 숨김 vs 가로스크롤+첫열고정). **셋 다 사장님 결정 후 착수** | 대기 |
| 2026-08-06 | Claude | **자금 파이프라인 기초**(실파일 학습): `docs/UPLOAD-FORMATS.md` 신설 — 은행 2형태·CMS·법인카드·PG정산·CMS상세·**자금일보(정답지)** 헤더 확인 · 🔴채널 매칭키 정정(`cardLast4`→`cardMask`+`cardMaskMatches`, `terminalId`→`settleMethod`) · **계정과목 SSOT 45종**(실무 1,793건 추출, 자금이동=비손익) · **추천기**(high만 자동, 입금≠대여료) | tsc0 · vitest 72p/618 |
| 2026-08-06 | Claude | **경영관리 = 법인 원장 하나 완료**(§4-11·AUDIT §6-2): 4탭 폐지 · 섹션=모듈(`MODULE_CATALOG` 5종 추가·`+항목 추가`) · 그자리 수정(계좌 신원잠금=거래건수 기준) · 자금채널 3종 · 회사현황(computeKPI) · 문서+**사업자등록증 OCR 이식**(`lib/business-reg-extract`) · 차고지·등록대수 이식 · 계좌를 패널에서 생성 · 상세패널 `panelWide` | tsc0 · vitest 618 · curl200 |
| 2026-08-06 | Claude | **문서 서식 3종**: 계약사실확인서(CTC) · 과태료 변경부과 요청(PNR) · 내용증명(CTM). 발급 엔진은 이미 있었고 서식만 없었음. ⚠미수 독촉 내용증명은 `lib/docs/notice-claim.ts`가 계산까지 함 — 두 벌 금지 | tsc0 |
| 2026-08-06 | Claude | ~~**§4-11 경영관리=법인 원장 하나.**~~ **← 위에서 완료** 4탭 폐지 · 상세패널 섹션(사업자·소재지·계좌·카드·임대차·직원·문서·보유자산) · `+법인 등록`=쓰기 zone(누르면 생성+패널) · `/admin` 폐지 흡수 · 규격=`docs/VEHICLE360-SPEC.md`. **한 번에** 할 것 | 인계 |
| 2026-08-06 | Claude | **오픈 조작 확인**: 회사등록(`/admin`)·비우기(`/dev/data`) **이미 있음**(백로그 2건 오류 정정) · `/admin` 정리(회사등록 최상단·빈 거래처 제거) · 업로드 버튼 토글화(부분성공 보존) · 🔴`audit_logs`/`atomic_event` 404 수정 · §4-9~4-11 규격 | tsc0 · vitest 69p/595 · curl200 |
| 2026-08-06 | Cursor | **§4-9 1건=N장**: `pages[]`·장목록/장스피너·OCR병합 · `doc-kinds`(성격·귀속) · 대기열 형태/성격/귀속/대상/행선지/장/분석 · 업로드토글 | tsc0 · vitest4 · curl200 |
| 2026-08-06 | Cursor | **데이터센터 UI 5건**: 업로드/취소 · LedgerRecordPanel · OCR중 FileDrop유지 · 요약열+빈표헤더·파일형태(`ingest-summary`) · 상세=더블클릭 | tsc0 · curl200 |
| 2026-08-06 | Claude | **환경 완주**(Firebase 6종·Storage·Gemini·Admin키·hq권한 — 전부 실동작 확인) · **오픈 블로커 3건**(서류동선·등록차 실종·OCR 원본 미첨부) · **차량360 규격이식 8단계**(카드 전멸→표·상세패널 껍데기·KV 통일·전부펼치기) · OCR 모델 404 복구(`gemini-flash-latest`) · 미수=계약 기준 정정 · 업무분류 5축 · 자금일보/대시보드/운영현황 규격 | tsc0 · vitest 68파일 591건 · curl200 |
| 2026-08-06 | → Cursor | **다음 작업 = 🔴버그(audit/atomic_event).** 데이터센터 UI 5건은 Cursor 반영됨. 차량360 잔여=`docs/VEHICLE360-SPEC.md` | 인계 |
| 2026-08-06 | Cursor | **설정**: 빈 WorkbenchBar(기본 차량점프검색) 제거 · 계정에 로그아웃 행(+confirm) | tsc0 · curl200 |
| 2026-08-06 | Cursor | **스텝 화살표 통일**: 자금일보 일자 `‹›`문자 → lucide ChevronL/R · PeriodBar·MonthCalendar stroke 2.2 · VehicleDetail `›`도 lucide | tsc0 · curl200 |
| 2026-08-06 | Cursor | **열필터 전수**: FilterPop 금액·날짜·이율·빈값(—) · `pickCols` money/int/rate→sortNum 자동 · 계좌/업무/운영/일정/손익/홈outlook·cash xf·sortNum 보강 | tsc0 · curl200 |
| 2026-08-06 | Cursor | **엑셀 열필터 다듬기**: 금액·숫자 콤마 표기·숫자순 정렬·검색(콤마무시) · 운영 money열 `xf`/`sortNum` | tsc0 · curl200 |
| 2026-08-06 | Cursor | **모바일·용어 정리**: m/work·vehicle 빈제목 `LEDGER_EMPTY` · ObjRow danger 행틴트 제거(배지만) · 계약/미수/모바일 Metric `계약유지·계약종료 미수` 통일 | tsc0 · curl200 |
| 2026-08-06 | Cursor | **보이는 카피·열 정리**: `/status` 계약종료 미수 열·통계·리스크칩 제거(유지미수만) · 홈 KPI meta 종료분 제거 · `/work` meta 대분류6축 · meta/모바일제목 `운영현황` · 설정 `정합성` | tsc0 · vitest97 · curl200 |
| 2026-08-06 | Claude | **홈 «화면 한 판»**: 데스크톱 대시보드=페이지 스크롤 0·프레임 높이 꽉 채움(넘침은 각 패널 안에서만). body `flex:1 1 auto`+KPI `flexShrink:0`+2분할 `flex:1 1 auto` · `Panel` 본문 `overflow:auto` · `MonthCalendar` `fill` prop 신설(주 행 `1fr` 균등분배) · 모바일은 종전대로 세로 스택 | tsc0 · 브라우저측정 pageScroll 0·패널 404/404·바닥 710꽉참 |
| 2026-08-06 | Claude | **업무분류 2단 확정**(사장님): 대분류 6축=대상 축 `차량·계약·일정·자금·과태료·기타` · 세부 17종 유지(파생, 저장 안 함) · 탭=대분류·세부는 필터 2단 · 대상별 필수(차량=차번·계약=계약·자금=금액·일정=기한·과태료=차번) · 옛 `?group=세부` 딥링크는 대분류로 승격 | tsc0 · vitest 68파일 586건 · /work 200 |
| 2026-08-06 | Claude | **자금일보 원장 규격 재작성**: FacetPage/Sec/ListBox 폐기 → LedgerFrame 거래1건=1행 · 열=cash-cols SSOT · 처리=우측패널 · 대량=선택액션바(후보 상시계산) · 보기=일보/미매칭 | tsc0 · vitest 67파일 569건 · curl200 |
| 2026-08-06 | Claude | **P0-1 로컬/원격 혼합 승인 차단**: `lib/migrate/acceptance`(순수판정) · `migration-baseline`(runId 서버발급)·`migration-acceptance`(서버가 Firestore 실물 재계수 후 대조, create-only) · rules `migration` 전면차단+businessColl 제외 · reflect=대조 통과 후에만 승인, 로컬백엔드면 미발송 | tsc0 · vitest 65파일 549건 · 로컬 403 확인 · rules테스트는 CI(Java 없음) |
| 2026-08-06 | Claude | **P0-3 수납이력 정합성**: `acceptance-normalization`(txKey 부여+기준일 이전 계약성 입금 `matchedKind:'history'`) · `receipt-integrity`(유실/이력/매칭대기 3분 + fail-closed) · pack 단일지점 정규화 · reflect 반영 후 대조 · money-status history=해당없음 → **할 일 1,948→0 · 유실 1→0** | tsc0 · vitest 64파일 526건 · curl200 |
| 2026-08-06 | Claude | **P0-2 자금 원자 create-only**: `lib/finance/immutable-money`(SSOT·순수판정) · 엔티티 POST=자금만 `getAll` 선검사 409(`conflictIds`)+`batch.create` · 마감월 기존문서 재검사 제거(덮어쓰기 불가로 흡수) · ALREADY_EXISTS→409 | tsc0 · vitest 63파일 510건 |
| 2026-07-31 | Cursor | 오더4 자산공백: 자동차세필드·agenda/홈 · 매각입력·VEHICLE_OUT·재무처분손익 · rowKey=_key (②B store스탬프·③발번은 Claude점유 skip) | tsc0 · vitest48게이트 · curl200 |
| 2026-07-31 | Cursor | 오더3 회차원장: schedule-ledger·계약「회차」탭·notify recipients·리스크만기문자 · tests+6 | tsc0 · vitest170 · rules36 · curl200 |
| 2026-07-31 | Cursor | 오더2 엑셀내보내기: onView·useMemo cols · sheet-export·useSheetExport · PII_MASKERS · 6원장 우클릭메뉴 | tsc0 · vitest+8 · curl200 |
| 2026-07-31 | Cursor | 오더1 직원콘솔: API list/role/reset/delete + suspend uid·마지막hq·audit · 경영관리「직원」탭 · /admin StaffConsole 제거 | tsc0 · vitest156 · rules36 · curl200 |
| 2026-07-31 | Cursor | 오픈게이트: `open:scan`·`open:gate`(curl.exe)·`open:snapshot` · companyId flat경로 수정 · 스냅샷 switchplan 미수1.27억/과오납0/레거시0 | scan0 · vitest27 · tsc0 · curl200 |
| 2026-07-31 | Cursor | QA돈잔여 R5·R7·R8·R6: _charges초주행·synthetic입금제외·과오납·reconcile보존 + 백필dry-run0건 | tsc0 · vitest135 · curl200 · 커밋분리 |
| 2026-07-31 | Cursor | QA돈3: 보증금충당→_payments·레거시net · CMS집금과목유지·복구 · bank_tx txKey(잔액·#n) | tsc0 · curl200 · vitest7 · 커밋3 |
| 2026-07-31 | Cursor | 행틴트잔재제거: 6원장 rowStyle·xxxRail·work-rail삭제 · ExcelSheet/LedgerFrame prop제거 · redesign=배지색만 | tsc0 |
| 2026-07-31 | Cursor | 상세/생성: 사용자가 섹션 펼칠 때만 패널본문 안 reveal(창 scrollIntoView X) | tsc 대기 |
| 2026-07-31 | Cursor | 과태료 업로드: 상단 회사선택 재사용(아래 중복 Select 제거) · scrollIntoView 제거 유지 | tsc0 |
| 2026-07-31 | Cursor | 생성/상세 패널 scrollIntoView 제거 · 열면 본문 맨 위 고정(아래로 끌려가던 것) | tsc0 |
| 2026-07-31 | Cursor | 업무생성 과태료 선택 시 setGroupAndUrl이 패널을 닫던 버그(keepCreating) · DEV claims미배정 폴백 · 본문 display:block 스크롤 | tsc0 · 브라우저확인 |
| 2026-07-31 | Cursor | 상세/생성 패널: 세부섹션 펼침 높이 복구(__fields flex제거·section overflow visible·본문만 스크롤) | tsc0 |
| 2026-07-31 | Cursor | 최종정리v2: IA상단·처리·원장·하단 · 미수메뉴제거 · risk4그룹원복 · 컴플→정합성·보증금→계약 · 체크X+rowSel우클릭 · /management3탭 · deeplink 배차/자금/ingest open=은 페이지이동만(후속) | tsc0 · 커밋분리 · push |
| 2026-07-31 | Cursor | 지시층마감: 딥링크id SSOT·risk 컴플/보증금그룹·?group=·면허만기필드/판정·검색손님키 | tsc0 · curl200 · 데모id왕복0실패 · 브라우저로그인차단으로 육안클릭미완 · 커밋분리 |
| 2026-07-30 | Cursor | 지시층1: work-orders·InstructionStrip→/risk · 홈오늘할일5 · section 23삭제(유지 s-repair·a-other) · ack TODO | tsc0 · /·/risk·/repair 200 |
| 2026-07-30 | Cursor | ⋯도구폐기: redesign박제·미수/자금일보메뉴·fileIngest·SelectionBar·risk일괄·LedgerToolsMenu삭제 | tsc0 · 10면200 · 커밋분리 |
| 2026-07-30 | Cursor | 마감5: OCR미완수기·계약bucket세분·내용증명danger·assetRail←lifecycle·보유중배지gray (4=+생성 후속·문서박제X) | tsc0 · 5면200 · 커밋분리 |
| 2026-07-30 | Cursor | 패널과태료·헤더최소화·자산분류: penalty-intake·패널업로드·⋯메뉴·칩→☰필터·lifecycle·분류→상태 | tsc0 · 7면200 · push |
| 2026-07-30 | Cursor | 원장 헤더 통일(자산·계약·리스크·업무·자금): 필터줄=회사·검색·`LedgerFilterButton`·기간 · 칩→패널 · ghost→`LedgerToolsMenu` | (상위 한 줄로 통합) |
| 2026-07-30 | Cursor | 업무생성→과태료=고지서업로드 분기(kindGateway·탭전환·복귀 /work?group=과태료) | tsc0 · /work·/penalty/upload 200 |
| 2026-07-30 | Cursor | 전원자수용: 계약주행·자산섹션·자금method·업무25·수선스키마조사·pickCols경고 | tsc0 · 4면200 · cd45888…2af4fff |
| 2026-07-29 | Cursor | 초과주행 과금(반납정산 라인아이템) | tsc0 · 7면200 |
| 2026-07-29 | Cursor | 파생3: 할부이자(B)·정비비랭킹(C)·연체이력(D) | tsc0 · 0c20d99…92ff726 · push |
| 2026-07-29 | Cursor | 기본뷰2차: status18·asset16·contract19·cash14·work+due · fit priority | tsc0 · 6면200 |
| 2026-07-29 | Cursor | ExcelSheet 카드뷰 danger 틴트(rowStyle→ObjCard.style) · RailDot 없이 | tsc0 · /risk·/status·/work 200 |
| 2026-07-29 | Cursor | 규격통일2차 A잔여+P2(B1~B7): IconCount·TwoLineCell·status필터·기본뷰승격·danger틴트 | tsc0 · 7면200 · a738994…9bc8f4e |
| 2026-07-29 | Cursor | P1 그릇: money/TwoLineCell/INDENT/ROW_H44/bg-selected + redesign박제 | tsc0 · 7면200 |
| 2026-07-29 | Cursor | rail 시각=RailDot(6px)·틴트/세로선 폐기 | tsc0 · /risk·/work·/status 200 |
| 2026-07-29 | Cursor | `/status` 보유=`isVehicleHeld`(매각·처분예정·구매예정 제외) SSOT | tsc0 · /status·/sheet 200 |
| 2026-07-29 | Cursor | ERP질감: rail세로선제거·danger틴트·팔레트대비·badge5px·행고40 | tsc0 |
| 2026-07-29 | Cursor | 행 상태표시 3px레일→RailDot(6px점) ExcelSheet/ObjRow/ObjCard | tsc0 |
| 2026-07-29 | Cursor | 리스크 rail 전행 빨강벽 해소(급함만 danger·그외 warn) | tsc0 |
| 2026-07-29 | Cursor | 손익·부가세 과목표 집계 SSOT(`subject-summary`) | 3b77b1a |
| 2026-07-29 | Cursor | 미수관리 집계 SSOT(`receivables-ledger`) · 내용증명 일괄 ghost | 83ed867 |
| 2026-07-29 | Cursor | 단일회사 회사열 숨김(ExcelSheet) · 계약·운영·업무·자금 필터 상단 흡수 | 79c09c5 · 9fdcb21 |
| 2026-07-29 | Cursor | 자산 세부필터 상단 흡수(`LedgerFilterSelects`) · 좌측 3분할 제거 | 5e32cde |
| 2026-07-29 | Cursor | 자산 rail 생애주기 4분류(차종 violet 제거) · 과태료 상세/버킷행 소프트삭제 | 4a73d14 · 03342fe |
| 2026-07-29 | Cursor | rail 정상=무색·4면 rowStyle · 리스크일괄 ghost · 자금 identity=계좌 · 패널 타이포 위계 | b775106 · 65cdc49 |
| 2026-07-29 | Cursor | 죽은 레거시 COLS·SheetRow/ContractRow·MyDesk·archive 스크랩 삭제 | df9a880 |
| 2026-07-29 | Cursor | PeriodBar latestDateOf SSOT (원장·손익·부가세) | aa99dda |
| 2026-07-29 | Cursor | 리스크·업무 칩/배지 집계 SSOT (countRiskSheetGroups·work/penalty) | a6a1699 |
| 2026-07-29 | Cursor | 고아 WebPage 삭제 · 자금·운영 배지 ledger-stats 위임 | 9e8e58d · caa5121 |
| 2026-07-29 | Cursor | 회사 열 key co→company 통일(운영·자금) | 7914bb1 |
| 2026-07-29 | Cursor | 원장 빈값 카피 LEDGER_EMPTY 스윕(운영·자산·계약·리스크·일정·자금) | 6bbab6f |
| 2026-07-29 | Cursor | 계약 상세 수납스케줄 임베드 잔유 제거 · ContractScheduleEmbed 삭제 | f491fad |
| 2026-07-29 | Cursor | 리스크 상세 Vehicle360 임베드 잔유 제거 · VehicleSideEmbed 삭제 | 45555d7 |
| 2026-07-29 | Cursor | 자산·운영 상세 Vehicle360 임베드 잔유 제거 | 938b31c |
| 2026-07-29 | Cursor | 자금 거래 상세 DETAIL_DEFS 승격 | 6ff5890 |
| 2026-07-29 | Cursor | 원장 열통일 9: work-ledger/cols lib 승격 · company 키 | a722fd8 |
| 2026-07-29 | Cursor | 원장 열통일 10: co=회사명 · 레거시 COLS deprecated | 53c568c |
| 2026-07-29 | Cursor | 원장 열통일 5: 자산·계약 생성=상세 섹션명 | 95c8071 |
| 2026-07-29 | Cursor | 원장 열통일 6: risk 상세 섹션 | a12b2f0 |
| 2026-07-29 | Cursor | 원장 열통일 7: 운영 basic 11열 | c9c3a6f |
| 2026-07-29 | Cursor | 원장 열통일 8: 계좌 account-cols 승격 | bda460c |
| 2026-07-29 | Cursor | 원장 열통일 0: 슬롯문서 + ledger-empty | b240b45 |
| 2026-07-29 | Cursor | 원장 열통일 1: work 엑셀기본 순서 | 5e94cd8 |
| 2026-07-29 | Cursor | 원장 열통일 2: risk Badge+순서 | 65ae7ed |
| 2026-07-29 | Cursor | 원장 열통일 3: asset·contract·status 순서 | 8b91a0f |
| 2026-07-29 | Cursor | 원장 열통일 4: cash buildSheetViews+순서 | d7f9686 |
| 2026-07-29 | Cursor | FormGrid note 기본표시 회귀 · Create/Edit만 숨김 | 5bc2f65 |
| 2026-07-29 | Cursor | FormGrid·패널 세로 리듬(갭14·라벨6·패딩) | 74dbe8d |
| 2026-07-29 | Cursor | 상세패널 정합 1: FormGrid cols=1(Create/Edit) | 7f8e961 |
| 2026-07-29 | Cursor | 상세패널 정합 2: 업무 CLASSIFY title 중복 제거 | 6dd0120 |
| 2026-07-29 | Cursor | 상세패널 정합 3–4: note 기본숨김 + Select backgroundColor | a940dde |
| 2026-07-29 | Cursor | 상세패널 정합 5: RecordPanel 헤더=신원+상태배지(전원장) | 78db019 |
| 2026-07-29 | Cursor | 상세패널 정합 6: 빈값 — · 필수* danger 통일 | 0432c33 |
| 2026-07-29 | Cursor | P0-0 redesign.mdc 행문법+분류→상태 SSOT | a94e320 |
| 2026-07-29 | Cursor | P0-1 TARGET 차량·계약 피커 상시(텍스트금지) | bfabc37 |
| 2026-07-29 | Cursor | P0-2 차량번호·계약자 2컬·클릭=패널·상태/시간 | 10263da |
| 2026-07-29 | Cursor | P0-3 검색 work_item·TopSearch·/work?open= (기충족) | 139fa13 |

| 2026-07-29 | Cursor | 업무 2d: 컬럼순서·상태5종·생성/최종처리·방치정렬 | tsc0 |

| 2026-07-29 | Cursor | 행신원 0: redesign.mdc 6칸 문법 박제 | 480a00d |
| 2026-07-29 | Cursor | 행신원 1: work contractKey+vehicle/contract picker | 63de933 |
| 2026-07-29 | Cursor | 행신원 2: 대상셀 분해·workRail·/contract?open= | 9ea11de |
| 2026-07-29 | Cursor | 행신원 3: SEARCH work_item·TopSearch 3그룹·/work?open= | 139fa13 |
| 2026-07-29 | Cursor | 행신원 4+5: risk company·assetRail·과태료 소프트삭제 | 293c059 |

| 2026-07-29 | Cursor | ①영업손익 operatingProfit/ByCompany/Trend SSOT · 대시보드·pnl 소비 |
| 2026-07-29 | Cursor | ②열라벨 선후납→납부시기(값 선납/후납 유지) |
| 2026-07-29 | Cursor | ③업무관리 과태료 CMS집금식(버킷1줄·전용뷰·/penalty redirect) |
| 2026-07-29 | Cursor | ②대시보드 / 백지재작성(KPI5·법인요약·6개월손익막대·Sec접기0)·①③기충족스킵 |
| 2026-07-29 | Cursor | ④납부시기(선납/후납) 라벨통일·반납까지=dday숫자+remainSpan tooltip |
| 2026-07-29 | Cursor | ⑤허브·원장 meta 한줄 통일(비자명·중점구분) |
| 2026-07-29 | Cursor | ⑥리스크 미완료=대시보드pending+agenda어김 흡수(bankTx)·/desk정합 |
| 2026-07-29 | Cursor | ⑦원장상세 VehicleDetail/SchedulePanel 패널embed·리스크조치·업무점프 |
| 2026-07-29 | Cursor | ⑧미납내용증명 일괄→리스크(sendNoticeCert)·계약단건 내용증명 |
| 2026-07-28 | Cursor | 대시보드=/dev/erp-design HomeView 이식(KPI4+오늘업무+교차검증) · aging/법인별표 제거 | tsc0 |
| 2026-07-28 | Cursor | Sec collapsible={false} 추가 · 대시보드 3구획 접기/셰브론 제거 | tsc0 |
| 2026-07-28 | Cursor | 홈 삭제·대시보드 신규(LedgerFrame·KPI+aging+법인별) · home-kpi 폐기 · computeKPI/kpiByCompany SSOT | tsc0 |
| 2026-07-28 | Cursor | 홈→대시보드(관제콕핏): nav LayoutDashboard · KPI타일+법인별 ExcelSheet · home-kpi/kpi SSOT · 추이생략 | tsc0 |
| 2026-07-28 | Cursor | /risk filters 순서=검색→칩→PeriodBar(규격) · asset·contract·cash·work·status는 이미 동일 | tsc0 |
| 2026-07-28 | Cursor | 홈 관제 재배치: 제목=관제 · 한눈(Metric스트립) · 일정본체 · Message경고 · 옛3Sec폐기 | tsc0 |
| 2026-07-28 | Cursor | 홈 삭제·관제 대시보드 재작성(함대·오늘끝낼일·계속관리) · lib/home-kpi · soft-fill · 엑셀금지 | tsc0 |
| 2026-07-28 | Cursor | Gate hydration(inset→top/right/…) 제거 · 탈출=setPhase(signed-out) · loadProfile ID토큰/프로필 6s timeout | tsc0·브라우저 Issue배지소멸 |
| 2026-07-28 | Cursor | 홈=스피너금지 soft-fill(…) · Gate 4초후 탈출버튼 · Auth boot 6s | tsc0 |
| 2026-07-28 | Cursor | 스피너고착: session boot 죽은콜백 clearTimeout금지 · store.list/useEntityLists 15s timeout · Auth구독실패→signed-out | tsc0 |
| 2026-07-28 | Cursor | 홈 삭제후 재작성: KPI허브(함대·오늘끝낼일·계속관리) · useEntityLists soft-load · 헤더상시 | tsc0 |
| 2026-07-28 | Cursor | 홈=KPI허브(함대·오늘끝낼일·계속관리) · selectPendingWork · agenda미리보기5 · 데이터센터 tools강등 | tsc0 |
| 2026-07-28 | Cursor | 홈·/m홈=LedgerFrame크롬 랜딩(검색·ObjRow바로가기) · 예외그리드없음 · tools=ingest icon | tsc0 |
| 2026-07-28 | Cursor | 홈·/m홈=검색+바로가기만(지표·예외그리드제거) · home-briefing폐기 · SSOT=risk-ledger | tsc0 |
| 2026-07-28 | Cursor | 홈A안 랜딩(검색·리스크요약·바로가기) · home-briefing/cols폐기 · 예외SSOT=risk-ledger만 | tsc0 |
| 2026-07-28 | Cursor | /risk 리스크관리 LedgerFrame · risk-ledger SSOT · nav·/m/risk칩 정합 · home-briefing 래퍼 | tsc0 |
| 2026-07-28 | Cursor | 홈 필터칩 [전체·미결·리스크·휴차] · 전체 기본 · LedgerFrame 엑셀 유지 | tsc0 |
| 2026-07-28 | Cursor | 홈=LedgerFrame엑셀(미결·리스크·휴차) · home-briefing 시트SSOT · /m리스트동일 · 바로가기하단 | tsc0 |
| 2026-07-28 | Cursor | lucide 잔여: OcrCrosscheck⚠·Drawer↑↓ → AlertTriangle/ChevronUp/Down | tsc0 |
| 2026-07-28 | Cursor | 홈=오늘브리핑(Page+트리아지) · home-briefing SSOT · /m공용 · desk일정복원 · 렌즈탭폐기 | tsc0 |
| 2026-07-28 | Cursor | lucide 아이콘 통일: 유니코드→lucide · Page/LedgerFrame 타이틀=nav icon · mobile-tabs=nav | tsc0 |
| 2026-07-28 | Cursor | UIUX-SPEC 헤더 컨트롤 존 규격표 갱신(CompanyFilter·solid sm·Select) | tsc0 |
| 2026-07-28 | Cursor | work 구분 PillTabs→Select · asset/contract/work 주액션 solid sm · receivables actions→WB · penalty sm | tsc0 |
| 2026-07-28 | Cursor | 회사스코프 통일: ingest companySlot→CompanyFilter · 홈 meta 법인명 중복 제거 | tsc0 |
| 2026-07-28 | Cursor | ledger-create-panel COMPANIES[0] 프리필 예외 주석(저장=resolveWriteCompany) | tsc0 |
| 2026-07-28 | Cursor | cash 계좌 파생·집계 → buildBankAccountLedger(cash-ledger.ts) · 페이지는 결과만 | tsc0 |
| 2026-07-28 | Cursor | asset/contract 통계 배지 → ledger-stats SSOT · riskDebtSum=selectReceivables | tsc0 |
| 2026-07-28 | Cursor | asset 가동상태=linkFleet ownership·utilization(status와 동일 축) | tsc0 |
| 2026-07-28 | Cursor | 홈=LedgerFrame엑셀(요약·미결·리스크·휴차·일정) · 메뉴일정제거 · /desk→홈탭 | tsc0 |
| 2026-07-28 | Cursor | 홈=기존양식 복원(FacetPage+일정/미결/운영/리스크+Rail+Sec) · LedgerFrame홈 폐기 | tsc0 |
| 2026-07-28 | Cursor | 홈 갈아엎기: LedgerFrame+칩(미결/리스크/함대)+SECTION_MAP 큐 · Facet/얇은KPI 폐기 | tsc0 |
| 2026-07-28 | Cursor | 계약·운영: 납부조건 분리 → 결제일 + 선불/후불(+납부방법) 열 | tsc0 |
| 2026-07-28 | Cursor | 홈=원장동일셸(Page+WB+투입아이콘)+Sec한눈 · 옛Facet렌즈 폐기 | tsc0 |
| 2026-07-28 | Cursor | 홈 복원: Facet+일정/미결/운영/리스크+Sec · Agenda·FacetPage rail · KPI-only 폐기 | tsc0 |
| 2026-07-28 | Cursor | 버튼 SSOT(tools=iconOnly) · 자산/계약 생성↓담기 · work/status/desk/list 맞춤 · 홈 유지 | tsc0 |
| 2026-07-28 | Cursor | Btn iconOnly+tip · 자금/ingest tools 파일럿 · 홈=함대/오늘끝낼일/계속관리 · 투입아이콘 | tsc0 |
| 2026-07-28 | Cursor | 원장 확장 규격: `ledger-ext` · SHEET/DETAIL/FILTER keys · 요청=`시트·축·+/-key` (엑셀열 포함) | tsc0 |
| 2026-07-28 | Cursor | 세부필터 SSOT: `*_FILTER_DEFS`+`LedgerFilterFields` · 요청=`시트·필터·key` · 전 원장 배선 | tsc0 |
| 2026-07-28 | Cursor | 상세 필드 추가 SSOT: `*_DETAIL_DEFS`+`buildDetailSections` · 요청=`시트·섹션·key` | tsc0 |
| 2026-07-28 | Cursor | 원장 상세패널 전부 섹션접기: work/desk/status/cash(+ASSET/CONTRACT) · FLEET/AGENDA_DETAIL_SECTIONS | tsc0 |
| 2026-07-28 | Cursor | 상세패널 접기: open+onToggle 토글 · cols 선택 · 계약「미수·종료」 · WORK-ORDER 표기 | tsc0 |
| 2026-07-28 | Cursor | P0: FilterChips 원장 빠른필터(asset/contract/cash/desk/status) · ingest→LedgerFrame(body/view/companySlot) · 로딩=표자리만 | tsc0 |
| 2026-07-28 | Cursor | UI 크롬 검수 캔버스: 원장/Facet/ingest 공통·고유·손롤·P0(FilterChips·ingest Frame) | 분석 |
| 2026-07-28 | Cursor | EmptyState `sheet` variant · LedgerFrame/ingest 빈칸=패널과 높이맞춤(상단 작은박스 제거) | tsc0 |
| 2026-07-28 | Cursor | 데이터센터 전면재구성: Page frame+필터줄+시트/투입패널(원장형) · Sec/Metric 폐기 · OCR·엑셀·저장 엔진 유지 | tsc0 |
| 2026-07-28 | Cursor | 브라우저 직접검증(/work): 스피너1·필터유지·작업영역중앙(dx0) · Playwright 로그인 후 측정 | 확인 |
| 2026-07-28 | Cursor | PageLoading=작업영역 정중앙(absolute) · LedgerFrame은 필터줄 유지+표자리 스피너 | tsc0 |
| 2026-07-28 | Cursor | ERP 로딩 환경: Page/FacetPage/LedgerFrame `loading` · 셸유지+본문 PageLoading · soft-load유지 · WORK-ORDER §0.4 | tsc0 |
| 2026-07-28 | Cursor | PageLoading=본문 자리 복귀(풀스크린 덮기 철회) · Gate만 셸 전 부트 | tsc0 |
| 2026-07-28 | Cursor | 로딩 스피너 2중 분산 수정 시도(PageLoading 풀스크린) → 페이지바깥만이라 철회 | 철회 |
| 2026-07-28 | Cursor | 옛 양식 폐기: Agenda/MySchedule/MyDesk/home-lenses → archive · 설정 mydesk 제거 · tsconfig archive 제외 | tsc0 |
| 2026-07-28 | Cursor | 일정관리=LedgerFrame(어김/임박/예정) · 홈=운영 대시보드(함대·일정·리스크 KPI) · 메뉴명 일정관리 | tsc0 |
| 2026-07-28 | Cursor | 홈·데이터센터 전면재작성: 홈=오늘/허브/원장 ListBox · ingest=필터줄+right저장·설명/back제거 | tsc0 |
| 2026-07-28 | Cursor | 운영현황 교체: 옛 OpsLens/Facet 폐기 → LedgerFrame+FleetRow(차량1행) · desk도 Page규격 | tsc0 |
| 2026-07-28 | Cursor | 원장 버튼 규격 고정: 우측=stats→보기→tools · 쓰기/워크플로/필터/보기 분류 · Frame 순서 맞춤 | tsc0 |
| 2026-07-28 | Cursor | 허브 복귀: 홈·`/status`운영·`/desk`일정미결·ingest메뉴 · nav/mobile · TopSearch=찾기 · `/ops`→desk | tsc0 |
| 2026-07-28 | Cursor | `/cash` 하루루프 안내 Message 제거(설명배너 불필요) | 완료 |
| 2026-07-28 | Cursor | 계약 미수→리스크: 필터/통계/컬럼 · risk-ops(미수·보험·반납) · 통합관리=라이트+빠른입력 후속 메모 | tsc0 |
| 2026-07-28 | Cursor | 스피너 영구: hung :6006(node 1.6GB) 재기동 · store.list fetch/getIdToken에 withTimeout | tsc0 |
| 2026-07-28 | Cursor | 원장 패널 크롬 통일: 헤더/하단바 `--ledger-head-h`/`--ledger-foot-h` 36 · FilterPanel도 동일 footer | tsc0 |
| 2026-07-28 | Cursor | 원장 상세패널 섹션접기: ASSET/CONTRACT_DETAIL_SECTIONS · LedgerRecordPanel details | tsc0 |
| 2026-07-28 | Cursor | 원장 필터줄 SSOT(회사·검색·세부필터필수·범위·기간) · `/work` FilterBtn+상태/담당/원천 패널 | tsc0 |
| 2026-07-28 | Cursor | `/vehicle/[plate]`=VehicleDetail 고정스크롤4장 배럴복귀 · Sample360 동기 · VehiclePage(탭시안) 제거(경쟁SSOT) | tsc0 |
| 2026-07-28 | Cursor | 회사선택: quick(업무)=Pill칩 · 정식생성(자산·계약)=드롭다운 유지(성격별) | tsc0 |
| 2026-07-28 | Cursor | 원장 필터줄 높이 통일: CompanyFilter/PeriodBar/FilterBtn 전부 sm(28) · 옆 Search·Select와 맞춤 | tsc0 |
| 2026-07-28 | Cursor | 원장 버튼 규격: LedgerActions/PanelFooter · Frame.tools · right=쓰기·tools=루프/OCR · zone당 solid1 | tsc0 |
| 2026-07-28 | Cursor | IA단순화 고정: PAGE_IA/NAV·리다이렉트(/sheet,/finance,/ops)·LedgerEditPanel·/cash 하루루프CTA · Claude검증용 | tsc0 |
| 2026-07-27 | Cursor | 스위치플랜 마이그레이션 버튼(`MigrateDataButton`) · `/dev/data`·빈 원장 CTA · 메뉴명 변경 | tsc0 |
| 2026-07-27 | Cursor | 원장 더블클릭 토글닫기(페이지 setSelected) · 클릭/더블클릭 타이머·user-select 보정 · thead/패널헤더 12px·36h 통일 | tsc0 |
| 2026-07-27 | Cursor | 원장: 같은행 재더블클릭=패널닫기 · thead/패널헤더/Page타이틀 `--ledger-head-h:36` 통일 | tsc0 |
| 2026-07-27 | Cursor | 원장: 클릭=행선택 · 더블클릭만 상세패널 진입(재더블/헤더더블=폭전환) · Page/패널 헤더 `--ledger-head-h` 정렬 | tsc0 |
| 2026-07-25 | Cursor | 메뉴에 과태료·변경부과(`/penalty`) 복구 · 티어 라이트 | — |
| 2026-07-25 | Cursor | 오늘마무리: 메뉴에 자금일보·미수 · 재무원장 CTA=계좌CMS→자금일보→미수 · CMS item도 대여료매칭(정산후 제외버그 제거) | tsc0 |
| 2026-07-25 | Cursor | 계약·수납=자산과 동일 6×3 · 미수=`schUnpaid`(회차잔액) · 회차=좌열1×3 | tsc OK |
| 2026-07-25 | Cursor | 계약·수납=시안규격(조건인라인수정·진행필드·한눈4칸·회차요약바·보증시동·손익회수율) · DeskPane 패널내조치 | tsc OK |
| 2026-07-25 | Cursor | 수정=Glance 인라인(행구조 유지·패널만 편집) · EditKV 제거 · 레이아웃 고정 | tsc OK |
| 2026-07-25 | Cursor | 수정→헤더에 저장·취소(닫기 제거) · 운영·GPS도 편집세션 | — |
| 2026-07-25 | Cursor | 차량상세 CTA 라벨=「수정」통일(정정·갱신 제거) · 시안도 동일 | — |
| 2026-07-25 | Cursor | 보험패널: 보험료=총/N회차 · 이전증권 · 차량폴백 · CTA=수정 | tsc OK |
| 2026-07-25 | Cursor | `/vehicle` 패널 하단 첨부(AttFoot)=시안 이식 · `_docs` 슬롯(등록증·견적·할부·증권·GPS·과태료·정비·계약·영수증) | tsc OK |
| 2026-07-25 | Cursor | 보험 대리점=대리점\|담당자 분리(제조사제원과 동일) · agencyContact 필드 | (셸불가) |
| 2026-07-25 | Cursor | 차량상세 등록증 필드=시안 전항목(문서확인~출고가) · 엔티티 OCR 매핑 보강 · 취득원가·월상환·분납 | (셸불가) |
| 2026-07-25 | Cursor | `/vehicle` 전폭 frame 셸 · 우측열 col5로 밀착(가운데 구멍 제거) · 크롬=번호판+탭 | (셸불가) |
| 2026-07-25 | Cursor | `/vehicle/[plate]` 셸=Page frame+전폭(contentMax 10000) · DetailShell 1680캡 해제 · 본문 height 100% | (셸불가) |
| 2026-07-25 | Cursor | `/vehicle/[plate]`=car-desk 시안 IA 이식(자산\|계약\|수납 탭·패널그리드) · `vehicle-detail/desk.tsx` · 엔티티+취급대리점·보험대리점 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 제조사제원+취급대리점·담당자 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 보험 계약자·피보험자 복구(렌터카 중복 vs 구독 필요 — 표시여부 보류) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 보험 계약자·피보험자 제거(렌터카 업무용에 불필요) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 보험 자동이체→대리점(상호·연락) 교체 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 보험 자동이체 행 제거 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 보험: 대인Ⅰ·Ⅱ 한줄 · 보험료=총/납부N회차 한줄 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` #1등록=좌열1×3(행전체) · #8수선 col2–3로 한칸 우측 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` Glance·이력·회차 행 hover=`C.hover` | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널필드보강: 등록=등록증①~검사·제원 · 제원=5단+옵션·구동 · 취득·보험·운영도 누락채움 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 수선·사고표=일자\|구분\|내용\|금액 칸 분리(금액 본문 합침 해제) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk`=한 차량 조회전용 · `?new=1`·빈칸등록면 제거 · /asset「신규등록→시안」링크 회수 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` #6 GPS=1×1 · #7 과태료=1×2(GPS아래) · #8 수선=5×1(하단) — 반반 억지분배 해제 | (셸불가) |
| 2026-07-25 | Cursor | 신규등록=/asset 툴바(시안→/dev/car-desk?new=1) · 상세에는 없음 · 취소→목록 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` Page 타이틀줄 제거 · 크롬=번호판+탭만 · 신규등록 버튼 자리 보류 · Page 빈헤더 미렌더 | (셸불가) |
| 2026-07-25 | Cursor | 웹 TopBar=fixed+body paddingTop · Page frame=html/body overflow 잠금 · 상단바 고정·창스크롤 제거 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 우측열 운영\|GPS\|과태료만 세로 · 수선 2×1은 좌하단 · 빈칸 유지(억지배치 금지) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 우측열에 #4운영·#6GPS·#7과태료 1×1 세로나열 · #8수선 2×1(col4–5) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` #5보험=1×2 · 필드=보험사·증권·대인ⅠⅡ·대물·자차·분납횟수·총보험료 등 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 조회/신규 탭 제거 · 기본=조회 · 우측「신규등록」버튼→등록면 · 취소로 복귀 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` #4운영·#6GPS·#7과태료=1×1 · #8수선=2×1 · #5보험=1×2 · 하단 여백 유지 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널 본문 기본 overflow hidden(스크롤 제거) · 이력/회차표만 scroll | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널 불변/가변/이력 뱃지 제거 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산 패널번호 #1~8 · #1~3 등록\|제원\|취득 각1×2 · #4~6 운영\|보험\|GPS 각1×2 · #7~8 과태료\|수선 각3×1 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=패널6 가로배열(등록\|제원\|취득\|운영\|보험\|GPS) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=가로1×6 · col1에 등록/제원/취득 세로 · col2~6 운영·보험·GPS·과태료·수선(세로3) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=좌 세로스택 등록→제원→취득(각 가로2) · 중 운영\|보험\|GPS · 우 과태료\|수선 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=6×3 칸좌표 고정(1행등록\|제원\|취득 · 2행운영\|보험\|GPS · 3행과태료\|수선) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=6×3그리드(1fr×3) · 1행등록\|제원\|취득(각2) · 2행운영\|보험\|GPS(각2) · 3행과태료\|수선(각3) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 같은 행 패널 세로높이 맞춤(stretch+fill) · GPS는 2행 말단 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=6슬롯 · 1행 메인3+운영(2)\|보험 · 2행 메인밑과태료 / 우밑수선+GPS | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=가로6슬롯 · 1행 내용높이(등록\|제원\|취득\|운영\|보험\|GPS) · 2행 과태료\|수선 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=좌½ 메인3열(등록\|제원\|취득) + 우½ 운영\|보험\|GPS + 과태료\|수선 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 메인3=[등록\|제원\|취득] 좌측 가로50%만 · 우측비움 · 부가행 중요도폭 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 부가행=중요도별 폭(GPS 140px)·남은 가로 비움 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=위 메인3(등록\|제원\|취득) + 아래 부가5 가로 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=좌½에 [등록\|제원\|취득] 3열나란히 / 우½ 부가 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=좌반 등록·제원·취득 세로스택 / 우반 운영·보험·GPS·이력 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=등록|제원|취득 3열세로길게 + 하단 운영3·이력 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=6열세로1행(등록·제원·취득할부·운영·보험·GPS)+하단과태료/수선 · 할부스케줄첨부·잔액표시 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=불변(등록·제원·취득)/운영(상태·보험·GPS)/이력 · 상품손익 제외 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산=5열×2행(좁고 세로길게) · KV 짧게 · 계약조건 240px | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` ★차량등록정보·제조사제원=핵심불변(상단2칸·hero) · 제원증빙=견적/발주/계약사실확인 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널 가로압축(자산4열·계약300px×2+이력세로·KV max340) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널 하단 첨부(보기·다운로드 Modal) · InfoDoc/_docs 모델 시안 | (셸불가) |
| 2026-07-25 | Cursor | Page frame 높이=`100vh−bar−dock` · `--fp-dock-h` SSOT(SessionBar) · car-desk 하단바 감안 꽉채움·페이지스크롤제거 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 자산탭=Vehicle360「이 차」맵(등록증·5단·GPS·취득/구매방법·보험·운영·상품손익·과태료·수선) 3×3 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 패널 타이틀·종류마크를 박스 안 헤더로(밖 텍스트 제거) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 탭별 불변·가변·이력 패널로 꽉 채움(자산3+2 / 계약2×2 / 수납2×2) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 탭=자산|계약|수납(굵직) · 헤더에 미수/D-day 한눈 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 도메인학습반영 — 한눈이슈·현재3원장·계약/차량이력분리·전문은첨부 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 계약이력 추가(현재②아래+이력렌즈=계약|차량분리) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 현재=①차량②계약③이행(수납) 3축 · 기본렌즈=현재 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 문서함버튼/오버레이 제거 — 첨부는 섹션 AttChip만(보관=백엔드) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 문서함=보관목록→전산화면으로꺼냄(등록증·증권·할부·과태료) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 수납·할부표·타임라인=섹션내 ScrollBody(자체스크롤) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 렌즈3 — 한눈(이슈)·현재(원장)·이력(타임라인) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 수납=360고정폭 · 현황전폭·계약이 가로여유 우선 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 시안 방향 OK(한눈+문서함+전폭) — 미세수정 대기 | — |
| 2026-07-25 | Cursor | `/dev/car-desk` 이전(상·하단뎁스)·문서함전폭·grid fr로 뷰포트꽉 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 문서함(등록증·계약서·증권·할부표·과태료·수선) · 데스크=한눈만 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 한눈vs문서 — 원천(등록증·계약서·증권·할부표)은 버튼, 상시필드는 최소 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 섹션고유버튼+인라인기능(반납/입금/시동/정비/통화 등) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` Page frame=원장시트 동일여백(16/24·전폭·뷰포트꽉) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 용도별 구역 — 좌원장스택·중계약/수납주표·우파생·하이력(활동넓게) | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 버튼=섹션만(상단액션제거) · 수정/저장·입금·반납 각 박스 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 시안=박스수정/저장 · 조회↔신규(빈칸) 토글 · 같은페이지 채우기 | (셸불가) |
| 2026-07-25 | Cursor | `/dev/car-desk` 시안 표통일 — Num칩/반납일자줄 제거 · 현황·계약·자산·수납·보험·취득·상품·보증 전부 KV/표 박스 | (셸불가·미검증) |
| 2026-07-25 | Cursor | 자산상세 디자인시안 `/dev/car-desk` (한화면·타이틀+박스4칸·실연결X) | tsc0 |
| 2026-07-25 | Cursor | 자산상세 원자분석후 완전신작: DetailGrid·플랫Num·표·Disclosure · Metric/옛패널0 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 완전재작성: Metric/Sec박스·옛패널스택 폐기 · 플랫Stat+KV+표 단일면 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 여백=원장Page동일(16/24·1680) · fill엣지블리드 해제 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 작업탭(한눈/이차/수납/이력) 제거 · 단일화면 스크롤+와이드다열 | tsc0 |
| 2026-07-25 | Cursor | 자산상세「한눈」=필수지표+계약/자산/보험/수납피크 · 그자리 입금·수정 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 기본=와이드모니터(useDeskTier) · 좁으면 1열스크롤 · 지금지표\|계약 2열 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 웹=그리드짜임새·손롤박스제거(플랫행/표만) · ObjCard원자유지 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 fill ERP밀도(웹뷰포트채움·모바일 sticky크롬) · DetailShell fill | tsc0 |
| 2026-07-25 | Cursor | 자산상세=ERP워크벤치(작업영역1개·좌컨텍스트/우처리) · 스크롤문서폐기 | tsc0 |
| 2026-07-25 | Cursor | 자산상세 틀폐기→VehiclePage(웹좌레일+우작업·focus우선) · useVehicleDetail유지 | tsc0 |
| 2026-07-25 | Cursor | Vehicle360 UI 완전교체→`VehicleDetail` 고정스크롤 4장 · `useVehicleDetail` · 배럴 · legacy→tools/archive | tsc0 |
| 2026-07-25 | Cursor | Vehicle360 로직→`useVehicleDetail` 훅 추출(JSX없음) · types.ts · UI는 미작성 | tsc0 |
| 2026-07-25 | Cursor | Vehicle360 세부스펙=지금/이차/수납정산/이력 원자배열 · SEC_DEFAULT·Sample360 동기 · 캔버스 detail-spec | tsc0 |
| 2026-07-25 | Cursor | Vehicle360: 계약조건→현황 하위 · 할부스케줄→취득 Disclosure 인라인 · Disclosure원자 | tsc0 |
| 2026-07-25 | Cursor | Vehicle360: 탭렌즈 철회 · SectionLabel(운영·자산·계약·이력)+Sec스크롤(freepass상세) · Input/출력▾ 유지 | tsc0 |
| 2026-07-25 | Cursor | Vehicle360: sticky 렌즈(운영·자산·계약·이력)+Sec필터 · fInp→Input/Select · 출력▾ · 수납 현재/이전 | tsc0 |
| 2026-07-25 | Cursor | toggleStyle 활성=색만(fontWeight 고정) · ToggleChips→toggleStyle · 선택시 폭 흔들림 제거 | tsc0 |
| 2026-07-25 | Cursor | 빠른입력: 차 선택→입력옆 요약(회사·차번·차종·계약상태) · 아래 텍스트·파일 | tsc0 |
| 2026-07-25 | Cursor | 빠른입력 차번후보=absolute팝업 말고 입력칸 아래 인라인 목록(회사 Badge) | tsc0 |
| 2026-07-25 | Cursor | 빠른입력 차번후보에 회사 표시명 Badge · matchVehicles companyId/sub | tsc0 |
| 2026-07-25 | Cursor | 빠른입력: 탭 제거·웹 좌텍스트/우파일 · 모바일 상하 · FileDrop 붙여넣기 | tsc0 |
| 2026-07-25 | Cursor | 빠른입력 차번=matchVehicles 타이핑 후보(선택시 차번만 채움) | tsc0 |
| 2026-07-25 | Cursor | 빠른입력=QuickInput(차번+텍스트\|파일) 인라인 · inbox plate/note · QuickLogForm은 360용 유지 | tsc0 |
| 2026-07-25 | Cursor | 운영원장 빠른입력=인라인(Modal X)·차번 선택입력 · CTA순서 유지 | tsc0 |
| 2026-07-25 | Cursor | 운영원장 CTA 순서: 빠른입력 · 자산등록 · 데이터센터 | tsc0 |
| 2026-07-25 | Cursor | 운영원장 CTA 3개: 데이터센터 · 자산등록 · 빠른입력(openLog) | tsc0 |
| 2026-07-25 | Cursor | 재무원장 CTA=데이터센터(openIngest) · ingest 하단 이전 | tsc0 |
| 2026-07-25 | Cursor | 재무원장 CTA=거래 입력 1개→ingest · 데이터센터 하단 이전(Page back, WorkHubBack 제거) | tsc0 |
| 2026-07-25 | Cursor | 재무원장 CTA: 담기→계좌·CMS 입력 / 법인카드 입력 | tsc0 |
| 2026-07-25 | Cursor | 재무원장: 24·25 CMS미연결 수백건 DOM폭주→표 200건 상한(월간·검색으로 좁히기) | tsc0 |
| 2026-07-25 | Cursor | 재무원장: 검색cms로 출금 숨기던 필터 원복(검색 가로채기 취소) | tsc0 |
| 2026-07-25 | Cursor | CMS업로드=원장 CMS미연결 반영 · 계좌CMS집금과 수동/자동 매칭 · 입금합계는 계좌만 | tsc0 |
| 2026-07-25 | Cursor | CMS: 매칭분 상시하위행(펼침X)·집금클릭=수동매칭·담기시 자동정산 유지 | tsc0 |
| 2026-07-25 | Cursor | 담기 후 자동정산: bank_tx·card_tx→CMS/카드집금 high·medium 자동붙임 (`payments/auto-settle` · intake 부수효과) | tsc0 |
| 2026-07-25 | Cursor | CMS매칭: 성공→집금 3~5일(창1~7) · 집금라벨만 deposit · 정산엑셀 672건 투입 · 정산 deposit13/item29 | tsc0 |
| 2026-07-25 | Cursor | Search X=칸 안 absolute(width는 wrap) · 입력해도 검색칸 안 커짐 | tsc0 |
| 2026-07-25 | Cursor | Search 입력값 있으면 X 지우기 · 재무원장 CMS정산 deposit 펼침→구성건(item) 나열 · deposit출처=CMS | tsc0 |
| 2026-07-25 | Cursor | 재무원장 펼침=법인카드·CMS·카드매출·미분류만 · 카드→card_tx담기 · CMS→매칭/담기 CTA | tsc0 |
| 2026-07-25 | Cursor | `/dev/sample` ERP 3축 시안: 원장(상단필터·기본/전체·행→360) · 고유 큐(ObjCard) · 안내. FacetRail/뷰토글 없음 | tsc0 |
| 2026-07-24 | Cursor | 모바일 메뉴=ERP4: 열리면 TopBar 상태가「☰ 메뉴」+우측 X · 패널 bar 아래 펼침 | tsc0 |
| 2026-07-24 | Cursor | 모바일 메뉴=ERP4: TopBar z80 유지·햄버거↔X · 패널/스크림은 bar 아래만 | tsc0 |
| 2026-07-24 | Cursor | BottomSheet 푸터=ERP4 std/filter/commit: 검색[지우기·닫기] · 필터[해제·선택N·닫기] · 회사/보기[닫기] · SCRIM | tsc0 |
| 2026-07-24 | Cursor | 모바일 2단 크롬 정합: TopBar↓PageToolBar 밀착(상단 음수마진·pad 제거) · 홈 tools슬롯 · --topbar-h=56 | tsc0(수동확인권장) |
| 2026-07-24 | Cursor | 모바일 TopBar 복구(ERP4): 허브·뎁스 공통 상단 제목+메뉴 · 메뉴는 TopBar · PageToolBar에서 메뉴툴 제거 · sticky top=bar-h | tsc0 |
| 2026-07-24 | Cursor | 모바일 툴바=ERP4 PageToolBar 이식: 균등 검색·필터·보기·회사·메뉴 → 시트. 회사칩+사각아이콘 행 폐기 | tsc0 |
| 2026-07-24 | Cursor | 모바일↔ERP4 패리티: 뎁스 상단제목 · TabBar 토큰 · bar56 · ObjCard56 · WorkbenchBar ctrlH/PillTabs md · ActionBar SH | tsc0 |
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
