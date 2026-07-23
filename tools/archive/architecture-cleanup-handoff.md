# 아키텍처 정리 핸드오프 (Cursor → Claude)

> **읽는 이:** Claude Code / 후속 에이전트  
> **목적:** 누더기 접기(리라이트 금지). Phase 0~3까지 Cursor(Composer)가 적용함.  
> **검수 캔버스(시각):** `~/.cursor/projects/c-dev-jpkerp6-app/canvases/architecture-greenfield.canvas.tsx`  
> **검증:** `npx tsc --noEmit` (turbo `:6006` 중 `npm run build` 금지)

---

## 실행 체크리스트 (로컬 가동)

> 실측 2026-07-18 · 이 머신

### 적용됨 (2026-07-18 추천 트랙)
- `.env.local` → `NEXT_PUBLIC_MIGRATE_MODE=frozen`
- `npm run dev` 재시작 (:6006, Environments: `.env.local`)
- 홈·`/dev/data` HTTP 200
- **사용자 다음:** 로그인 → `/dev/data` → 스위치플랜 **반영**

### 이미 OK
| 항목 | 상태 |
|------|------|
| Node / npm | v24 / 있음 |
| `node_modules` | 있음 |
| `npm run dev` (:6006) | 이미 기동 중일 수 있음 |
| frozen JSON | `lib/migrate/switchplan-data.json` + insurance + registration + doc-audit |
| 원천 폴더 | `C:\dev\jpkerp6-마이그레이션\switchplan_스위치플랜\` (사업현황·자금일보 xlsx 존재) |
| Firebase 키 | `.env.local`에 **채워짐** → Firestore+로그인 모드 |

### 구멍 / 결정 필요
| 항목 | 상태 | 액션 |
|------|------|------|
| **실행 트랙** | Firebase ON | **A** 실데이터: Auth 로그인(`pyh@teamjpk.com` 등) 후 `/dev/data` 반영<br>**B** 로컬만: Firebase `NEXT_PUBLIC_*` 비우고 재시작 → DEV_USERS |
| `GEMINI_API_KEY` | 비어 있음 | OCR 쓰려면 AI Studio 키. 없으면 수기 폴백 |
| `NEXT_PUBLIC_MIGRATE_MODE` | 미설정(=auto) | 안정 시드 권장: `.env.local`에 `NEXT_PUBLIC_MIGRATE_MODE=frozen` |
| `DATABASE_URL` | 비어 있음 | Firestore만 쓰면 OK (RTDB 미사용) |
| Aligo | 미설정 | 문자 mock — 실발송 때만 채움 |
| live xlsx 파일명 | 폴더에 `*사업현황*.xlsx` / `*자금일보*.xlsx` | `/api/migrate-source`가 이름 탐색(고정 파일명 불필요) |

### 권장 첫 실행 (Firebase 유지)
1. `.env.local`에 `NEXT_PUBLIC_MIGRATE_MODE=frozen` 추가 → **dev 재시작**
2. http://localhost:6006 → 로그인
3. 설정 → 개발도구 `/dev/data` → 스위치플랜 **반영**
4. 홈·자금일보·미수 확인

### 권장 첫 실행 (로컬 미리보기만)
1. Firebase `NEXT_PUBLIC_*` 주석/비움 + `NEXT_PUBLIC_MIGRATE_MODE=frozen`
2. `npm run dev` → 자동 DEV 유저
3. `/dev/data` 반영 (localStorage)

### 검증
```
npx tsc --noEmit
curl http://localhost:6006/api/migrate-source
# found.biz / found.jbo true 이면 live 가능. frozen이면 시드는 JSON만으로도 OK
```

**금지:** turbo `:6006` 중 `npm run build`

---

## 한줄 상태 (2026-07-18)

| Phase | 상태 | 요약 |
|------|------|------|
| 0 동결 | ✅ | 죽은 Nav/Sidebar/`lib/tenant` 삭제 · Phosphor 제거 |
| 1 SSOT | ✅ | `TODAY`→`dashboard-consts` · migrate plate→`lib/plate` · scripts→`tools/archive` |
| 2 migrate·audit | ✅ | 시드 단일 진입 + doc-audit integrity 엔진 |
| 3 Cash hub | ✅ | 7개 자금 화면에 공용 탭 · SessionBar 메뉴 축소 |
| 4 UI/CSS | ◐ | `globals.css` 죽은 셸(sidebar/topbar/page-shell/dashboard/panel/kpi) 제거(2026-07-22). `.btn` 등 class 프리미티브·레거시 잔여 |
| 5 packages | ⬜ | 동작 안정 후 물리 폴더 이동 (선택) |

**척추(건드리지 말 것):** `store`→`intake` · `domain/model` · `section-registry` · `WorkbenchBar`/`FacetPage` · `Vehicle360`/`Customer360` · `contract-ops` · `operating-snapshot`

---

## Phase 2 — 시드 / migrate 단일 진입

### SSOT
| 파일 | 역할 |
|------|------|
| `lib/migrate/pack.ts` | **유일한** 회사 팩 빌더. `buildCompanyPack(companyId, mode?)` |
| `lib/seed.ts` | `buildCompanyPack`만 호출. 페이지/시드는 여기 경유 |
| `lib/migrate/switchplan.ts` | frozen JSON (`buildSwitchplanPack`) — pack이 호출 |
| `lib/migrate/switchplan-parse.ts` | live xlsx (`buildSwitchplanPackFromBuffer`) — pack이 호출 |
| `app/api/migrate-source/route.ts` | live 파일 로더 (dev only) |

### 모드 플래그
```
NEXT_PUBLIC_MIGRATE_MODE | JPK_MIGRATE_MODE
  auto    (기본) live → frozen → demo
  live    /api/migrate-source만 · 실패 시 demo
  frozen  switchplan-data.json만 (+보험·등록증 enrich)
  demo    seed-demo만
```

### live 기본 경로 (env로 오버라이드)
- `MIGRATE_ROOT` 기본: `C:\dev\jpkerp6-마이그레이션\switchplan_스위치플랜`
- `MIGRATE_BIZ_PATH` / `MIGRATE_JBO_PATH` 개별 지정 가능
- 파일명 기본: `[스위치플랜] 사업현황.xlsx` · `26년_스위치플랜_자금일보.xlsx`

### 금지
- 페이지·`seed.ts`에서 `buildSwitchplanPack` / `FromBuffer` **직접 호출 금지** (마이그레이션 도구·pack 내부만)
- 새 로컬 `normPlate` / `const TODAY = new Date()…` 금지

---

## Phase 2 — 정합성(doc-audit) 엔진

| 파일 | 역할 |
|------|------|
| `lib/integrity/doc-audit.ts` | **UI가 보는 SSOT.** `DOC_AUDIT` · `docAuditForPlates(plates)` |
| `lib/migrate/contract-doc-audit.json` | 원천 JSON(1회 산출물). 직접 import 하지 말 것 |
| `lib/section-registry.tsx` | `r-integrity` 섹션 → `docAuditForPlates`만 사용 |

종류: `입금확인` · `연락처확인` · `보험만기` · `보험없음` · `연령미달`  
심각도: `high` > `med` > `low`

---

## Phase 3 — 자금 허브 (Cash hub)

URL은 **유지**(리다이렉트 접기 안 함). 탭으로만 묶음.

| 파일 | 역할 |
|------|------|
| `components/CashHubTabs.tsx` | `CASH_TABS` · `useCashHubNav()` · `<CashHubTabs />` |
| 적용 페이지 | `/finance` `/payments` `/receivables` `/pnl` `/vat` `/financials` `/manage` |
| `components/SessionBar.tsx` | 메뉴: 자금(`/finance`)·미수 유지 · 수납/재무/부가세는 허브로 흡수 · 경영=`/pnl`(손익·자금) |

### 페이지 연결 패턴
```tsx
const cashNav = useCashHubNav();
// WorkbenchBar가 있는 화면
<WorkbenchBar {...cashNav} mid={...} search={...} />
// DetailShell만 있는 manage
<DetailShell actions={<WorkbenchBar {...cashNav} />} />
```

탭 순서 SSOT (`CASH_TABS`):  
자금일보 → 수납매칭 → 미수 → 손익 → 부가세 → 재무상태 → 경영지표

---

## Phase 0~1 잔여 맵 (이미 적용)

| 항목 | 위치 |
|------|------|
| TODAY | `lib/dashboard-consts.ts` only |
| plate | `lib/plate.ts` (`normPlate`) — migrate-parse도 여기 |
| 일회 스크립트 | `tools/archive/scripts/` (+ `tools/archive/README.md`) |
| 앱 scripts | `scripts/e2e-*.mts`만 잔류 |
| 삭제됨 | `components/Nav.tsx` · `Sidebar.tsx` · `lib/tenant.ts` · `@phosphor-icons/react` |

---

## Phase 4 다음 할 일 (미착수)

1. `app/globals.css` — jpkerp5 레거시 클래스 제거, 토큰(`C.*` / CSS vars)만
2. 페이지 손롤 style·높이 혼재 점검 (32/28 규격)
3. (선택) Phase 3 보강: `/finance?tab=` 단일 라우트 + 구 URL 리다이렉트

## Phase 5 (선택·나중)

물리 `packages/*` 이동 — 동작 동일할 때만. 리라이트 금지.

---

## 관련 감사 산출물 (참고)

| 산출 | 경로 |
|------|------|
| 구조 검수 캔버스 | `…/canvases/architecture-greenfield.canvas.tsx` |
| 마이그레이션 전체감사 | `…/canvases/migration-full-audit.canvas.tsx` |
| 스위치플랜 정합성 | `…/canvases/switchplan-integrity-audit.canvas.tsx` |
| 원천 폴더(앱 밖) | `C:\dev\jpkerp6-마이그레이션\` |

날짜 보정(이미 적용): Excel `1930–1939` → `+100년`(2030–2039) — `switchplan-parse` / `switchplan` / frozen JSON.

---

## 하지 말 것 (재확인)

- Vehicle360 / contract-ops / domain/model **재작성**
- 새 UI 키트로 원자 교체
- archive 스크립트를 앱 기능으로 승격
- section-registry에 `contract-doc-audit.json` 재import
- seed에서 migrate 파서 직접 호출
- 확정 작동 기능·정책·UI를 요청 없이 변경
- 자동 `git push`
