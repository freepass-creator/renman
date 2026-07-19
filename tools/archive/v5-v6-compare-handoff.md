# jpkerp5 ↔ jpkerp6 비교 핸드오프

> **v5 경로:** `C:\dev\_backup\jpkerp5` (백업 · 5.0.42 · port **7502**)  
> **v6 경로:** `C:\dev\jpkerp6-app` (현재 · 6.0.0-alpha · port **6006**)  
> **시각:** Cursor canvas `v5-v6-compare.canvas.tsx`  
> **원데이터:** `tools/archive/v5-v6-compare.json` · 재실행 `python tools/archive/_cmp_v5v6.py`

---

## 한줄

v6 = **척추·원자·시드·자금허브가 더 깔끔**.  
v5 = **운영 면적(모바일·admin·마감·내용증명·자산세부)이 더 넓고 검증됨**.  
전략 = 리라이트 금지, **v5 검증본을 v6 뼈대에 이식**.

**이식 플레이북 (KEEP/ABSORB/SKIP · Wave):**  
→ **`tools/archive/v5-to-v6-port-playbook.md`**

(참고: `C:\dev\_backup\jpkerp6\FROM_V5.md` — 예전 프로토타입 기준 이식 메모. 지금 앱은 `jpkerp6-app`.)

---

## 규모

| | v5 | v6 |
|--|----|----|
| 페이지(`page.tsx`) | **85** | **33** |
| 공통 라우트 | 10 (`/` asset contract dispatch finance inbox payments penalty receivables settings) | |
| v5만 | **75** | — |
| v6만 | — | **23** (ops·field·ingest·CashHub·360·integrity…) |
| 추가 deps | PDF/Puppeteer/exceljs/Admin… | lucide |

---

## 아키텍처

| 축 | v5 | v6 |
|----|----|----|
| 데이터 | `lib/types.ts` + 엔티티별 `firebase/*-store` | `EntityRecord` + `getStore()` (Local/Firestore) |
| 화면 | 기능별 깊은 URL 트리 | FacetRail·360·CashHub로 접기 |
| 시드 | `/admin/migrate-switchplan` | `lib/migrate/pack` + `/dev/data` 반영 |
| UI | 성숙·두꺼운 페이지·Phosphor | 원자 SSOT·손롤 금지 (`CLAUDE.md`) |

---

## 엔진 이식

| 엔진 | v5 | v6 |
|------|----|----|
| migrate/switchplan | ✅ | ✅ (+ pack 단일진입) |
| receipt-match · payment-schedule · early-termination | ✅ | ✅ |
| contract lifecycle/ops | ✅ | ✅ `contract-ops` |
| cash / classify / GL | ✅ | ✅ cash-ledger · CashHub |
| OCR | ✅ 성숙 | ✅ 토대 (GEMINI 키) |
| operating-snapshot · section-registry | —/부분 | ✅ v6 SSOT |
| attendance | ✅ | ❌ |
| closing · locked-update | ✅ | △/❌ |
| 내용증명 cert PDF | ✅ 풀 | △ notify |

---

## v5만 있는 면 (이식 후보 묶음)

| 묶음 | 개수 | 메모 |
|------|------|------|
| `/m/*` 모바일 현장 | 22 | 출고·반납·OCR·오늘할일 — **최우선 후보** |
| `/admin/*` | 18 | 마감·정합·유저·마이그레이션 UI |
| `/asset/*` 세부 | 8 | 할부·보험·정비 → Vehicle360 탭으로 흡수 가능 |
| `/contract/*` 세부 | 8 | 반납·연체·만기 → 렌즈/섹션으로 흡수 가능 |
| `/finance/*` 세부 | 5 | 일보·VAT·GL → **CashHub에 이미 상당 부분** |
| `/notice*` | 3 | 내용증명 |
| 기타 | 11 | attendance·profit·proposal·dashboard… |

---

## 추천 이식 순서 (v6 위에)

1. **기간마감 + 동시편집** (`closing` · `locked-update` / `safe-update`) — 실운영 안전
2. **내용증명 / 위약금 PDF** — 미수 워크플로 완성
3. **현장 `/m` 핵심** → `/field`에 흡수 (출고·반납·오늘)
4. **자산 세부** (할부·보험) → `Vehicle360` 탭
5. admin 도구는 `/dev`·`/integrity`에 선택 이식 (전부 복제 금지)

---

## 하지 말 것

- v5 페이지 JSX를 v6에 통째 복붙
- v6 `store`/`domain`/`WorkbenchBar`를 v5 store 패턴으로 되돌리기
- v5 Phosphor·두꺼운 손롤 툴바 재도입
- 백업 폴더(`_backup`)를 앱에서 import

---

## 나란히 켜보기

```bat
:: v5 (백업) — 다른 포트
cd C:\dev\_backup\jpkerp5
npm run dev
:: http://localhost:7502

:: v6 (현재)
cd C:\dev\jpkerp6-app
npm run dev
:: http://localhost:6006
```

Firebase 프로젝트가 같으면 **데이터 충돌 주의**. v5는 RTDB 테넌트 prefix, v6는 Firestore/local — 그래도 Auth 계정은 공유될 수 있음.
