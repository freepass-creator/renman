# v5 → v6 이식 플레이북 (학습·거르기·넣기)

> **원칙:** 구조는 **v6만**. 기능은 **v5에서 학습**해 v6 원자/엔진에 넣는다.  
> **금지:** v5 페이지 JSX 복붙 · v5 store 패턴으로 v6 되돌리기 · 필요 없는 라우트 75개 복제.  
> **v5:** `C:\dev\_backup\jpkerp5` · **v6:** `C:\dev\jpkerp6-app`

---

## 이식 규칙 (에이전트 SSOT)

1. **엔진 먼저** — 순수 로직은 `lib/*` (또는 기존 `lib/payments`·`lib/finance`·`lib/domain`). 페이지는 호출만.
2. **UI는 원자만** — `Page`/`FacetPage`/`WorkbenchBar`/`Sec`/`Metric`/`Btn`… (`CLAUDE.md`). Phosphor·손롤 툴바 금지.
3. **새 깊은 URL 금지** — v5 `/asset/loan` 같은 건 **Vehicle360 탭·홈 렌즈·CashHub 탭**으로 흡수.
4. **이미 v6에 있으면** — 로직만 diff·보강. UI 재구현 금지.
5. **거를 것** — 아래 SKIP. 백업에서 import 금지.

---

## 판정표

### KEEP → v6에 **넣기** (엔진/면 흡수)

| v5 출처 | 학습할 것 | v6 넣을 자리 | 비고 |
|---------|-----------|--------------|------|
| `closed-periods-store` + `/admin/closing` | 월 마감·재오픈 | `lib/finance/period-lock.ts` 완성 + `/dev` 또는 설정 | 수납/자금 쓰기 가드 |
| `locked-update` / `safe-update` | 동시편집·Lost Update | `lib/store` 쓰기 경로 | Firestore transaction |
| `notice/cert*` + cert PDF | 내용증명 문서·위약금 | `lib/domain/early-termination` + PrintHost/doc | 미수 화면에서 발송 |
| `/m/entry/deliver`·`return`·`today` | 출고·반납·오늘 할일 | `/field` + Agenda | 모바일 셸은 v6 유지 |
| `loan-schedule-calc` / asset loan UI | 할부 스케줄 | Vehicle360 탭 + 기존 `loan-schedule` | 페이지 `/asset/loan` 만들지 말 것 |
| insurance OCR·만기 | 증권 추출·만기 | ingest + Vehicle360 + 정합 섹션 | |
| `use-busy-action` | 더블탭 차단 | 공용 hook → Btn/저장 | |
| CMS 매칭·업로드 자동매칭 | 휴리스틱 | `receipt-match` / ingest | |
| `modOn` 모듈 토글 | 회사별 on/off | settings (선택) | v6 tier와 중복 주의 |

### ABSORB → **라우트 없이** 기존 v6 면으로

| v5 라우트 묶음 | v6 흡수처 | 거를 것 |
|----------------|-----------|---------|
| `/finance/daily`·`vat`·`gl`·customer/vendor | **CashHub** (`/finance`…`/vat`) | GL 전문 화면 복제 여부 = 나중에 |
| `/contract/overdue`·`expire`·`idle`·`return` | 홈 렌즈 · `/contract` FacetRail · Customer360 | 전용 목록 URL |
| `/asset/insurance`·`repair`·`inspection`·`gps`… | **Vehicle360** 탭 · `/asset` 필터 | `/asset/*` 8개 URL |
| `/admin/integrity`·`reconcile`·`migrate-*` | `/integrity` · `/dev/data` · pack | migrate UI 전부 복제 |
| `/admin/audit` | `/audit` | |
| `/dashboard`·`/profit` | 홈 + CashHub `/pnl`·`/manage` | 중복 KPI 대시보드 |
| `/customer`·`/customer/[plate]` | Customer360 · 검색 | |

### SKIP → v6에 **안 넣음** (당분간)

| 항목 | 이유 |
|------|------|
| `/m` 현장 허브 | 액션 그리드만 → 기존 라우트 (옵션 B ✅ 2026-07-18). `/m/*` 깊은 트리·근태·주문은 SKIP |
| `/attendance` · `/m/me/attendance` | 렌터카 ERP 코어 아님 |
| `/proposal` · `/help` · `/activity` | 영업/장식성 |
| `/general` · fleet-apply print | 별도 워크플로 — 요청 시 |
| Puppeteer/chromium 서버 PDF 파이프 | 무거움; 클라이언트 PDF·PrintHost 우선 |
| Phosphor · v5 globals 손롤 | v6 토큰/원자 |
| 엔티티별 `*-store.ts` 복제 | `getStore()` SSOT |
| `fix-1900-dates` admin 페이지 | v6는 parse에서 1930→2030 처리됨 |
| Google Workspace / 홈택스 연동 | v5도 미완·키 대기 |
| v5 `dashboard` 죽은 컴포넌트류 | CHANGELOG에 cleanup 이력 |

---

## 웨이브 (실행 순서)

| Wave | 목표 | 완료 기준 | v5 볼 파일 |
|------|------|-----------|------------|
| **W1 안전** | 마감 + 쓰기 가드 | ✅ 2026-07-18 — period-lock 메타·재오픈사유 · store 가드 · optimistic lock · safeUpdate · 설정 UI · 수납/분류 연결 | `closed-periods` · `locked-update` · `safe-update` |
| **W2 채권** | 내용증명 PDF | ✅ 2026-07-18 — notice-claim SSOT · sendNoticeCert · PrintHost 납부기한/한글금액 · 미수·360 발송+이력 | `cert-document` · early-termination |
| **W3 현장** | 출고·반납·오늘 | ✅ 2026-07-18 — field-queue SSOT · /field 오늘|인도|반납 탭·검색 · 위저드 유지 · /m 라우트 안 만듦 | `m/today` · `m/entry/deliver|return` |
| **W4 자산탭** | 할부·보험 뎁스 | ✅ 2026-07-18 — vehicle-asset SSOT · Vehicle360 자산\|계약 렌즈 · 할부 메트릭·편집필드 · 보험연령 경고 · /asset 할부·보험 패싯(새 URL X) | `asset/loan` · `insurance` · loan-schedule-calc |
| **W5a CMS** | CMS 묶음·수수료 매칭 | ✅ 2026-07-18 — cms-matching · /payments CMS 집금정산 · cash-ledger item 제외 · receipt-match deposit 스킵 | `cms-matching` |
| **W5b 채권일괄** | 내용증명 일괄 | ✅ 2026-07-18 — sendNoticeCertBulk · PrintHost N페이지 · /receivables 체크·일괄 (새 /notice 라우트 X) | `notice/cert/bulk` |
| **W5c 현장부가** | 경비·면허·메모·검사 | ✅ 2026-07-18 — /dispatch 현장입력(openLog·ingest history/customer) · history 카테고리에 주유·통행료·주차·소모품 (/m 라우트 X) | `/m/entry/*` |
| **W5 선택** | modOn | 요청 시 (busy-action은 W1에 이식됨) | 각 lib |

### W1 이식됨 (파일)
- `lib/finance/period-lock.ts` — close/reopen·PeriodClosedError·assertMoneyMutable·useClosedPeriods
- `lib/lock-conflict.ts` — LockConflictError · `_expectedUpdatedAt`
- `lib/safe-update.ts` — toast 통합
- `lib/use-busy-action.ts` — 더블탭 가드
- `lib/store.ts` — 자금 update/remove 마감 가드 + optimistic lock
- `lib/classify-tx.ts` · `app/settings` ClosingPanel · `app/payments` 적용/해제

### W2 이식됨 (파일)
- `lib/docs/notice-claim.ts` — 청구액·문서번호·납부기한 SSOT
- `lib/docs/send-notice.ts` — 인쇄+계약 발송이력+history
- `components/PrintHost.tsx` NoticeDoc — SSOT·기한·한글금액·contractKey
- `app/receivables` · `Vehicle360` — sendNoticeCert

### W3 이식됨 (파일)
- `lib/field-queue.ts` — 오늘 인도/반납/지남 · 전체 큐
- `app/field/page.tsx` — WorkbenchBar 탭(오늘|인도|반납)·검색 · Delivery/ReturnWizard

### W4 이식됨 (파일)
- `lib/vehicle-asset.ts` — vehicleLoanView · parseInsuranceMinAge · insuranceAgeGap
- `components/Vehicle360.tsx` — PillTabs 전체|자산|계약 · 할부 Cards · 보험 운전연령/연령미달 · 매입 할부필드 확장 · focus=loan|insurance
- `app/asset/page.tsx` · `lib/lens-filters.ts` — 할부있음·보험없음 패싯 · 할부잔여/보험임박 메트릭

**SKIP (W4):** v5 `/asset/loan`·`/asset/insurance` 단독 라우트 복제.

한 웨이브 = **엔진 + 기존 화면 연결**. 새 `app/admin/...` 트리 열지 말 것.
**SKIP (W3):** v5 배차 주문·근태·/m 셸 전체 복제.

---

## 학습 체크리스트 (기능 하나 옮길 때)

```
[ ] v5에서 순수함수/규칙만 추출 (JSX 제외)
[ ] v6 lib에 SSOT 위치 정함 (기존 파일 보강 우선)
[ ] EntityRecord / getStore 로 입출력 맞춤
[ ] UI는 기존 Page/360/CashHub/field 에 슬롯만 추가
[ ] tsc --noEmit
[ ] 핸드오프에 "이식됨" 한 줄 추가
```

---

## 이미 v6에 있어서 **재이식 금지** (보강만)

- switchplan migrate · pack · frozen JSON  
- receipt-match · payment-schedule · contract-ops  
- cash-ledger · CashHub 7탭  
- section-registry · reflect · operating-snapshot  
- collection stage(내용증명 단계) · early-termination 요율  
- period-lock **골격** (동작 완성 = W1)

---

## 클로드/후속에게

시작 명령 예:  
`W1 진행 — v5 closed-periods + locked-update 학습해서 v6 period-lock·store에 넣어. 새 admin 라우트 금지.`
