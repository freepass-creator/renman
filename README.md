# jpkerp6 — 증명서 기반 멀티테넌트 렌터카 ERP (Next.js + Firebase)

v5/v4의 검증된 로직을 재사용하되, **한 회사가 법인 여러 개를 운영**하고(본사=전 법인 / 직원=배정 법인만), 증명서 OCR로 데이터를 모으는 렌터카 ERP.

## 핵심 철학
- **데이터는 사람이 입력하지 않는다.** 증명서(자동차등록증·운전면허증·등본·보험증권·고지서·계약서)를 OCR로 읽어 자동 수집.
- 사람 입력 = 제조사 스펙 정도 (나중에 차종마스터 연동).
- UI/UX는 나중. 우선 **정보를 정확히 가져오는 것** (OCR 인제스천).

## 현재 (Phase 1 — OCR 인제스천 토대)
- `app/api/ocr/extract/route.ts` — Gemini 2.5 구조화 추출 (v5에서 이식). 문서종류: vehicle_reg / license / business_reg / insurance_policy / penalty / rental_contract / contract_doc
- `app/ingest/page.tsx` — 문서 업로드 → 추출 결과 plain 나열 (시험용)
- `lib/api-auth.ts` — 인증 graceful skip (로컬). production은 Firebase Admin로 교체
- `lib/firebase/client.ts` — Firebase 초기화 스텁 (다음: 추출 데이터 저장)

## 실행
```
npm install
# .env.local 만들고 GEMINI_API_KEY 채우기 (.env.local.example 참고)
npm run dev   # http://localhost:6006 → /ingest 에서 증명서 추출 시험
```

## 빌드 캐시 (백업 시 중요)
`.next`는 **프로젝트 안**에 둔다 (밖으로 빼면 Turbopack이 tailwind 등을 못 찾음).  
백업 = 소스만 복사하고 **`node_modules`·`.next` 제외**. 상세 → **`docs/CACHE.md`**.

## 로드맵
- **Phase 1 (지금)**: OCR 인제스천 — 증명서 → 구조화 데이터 추출
- Phase 2: 추출 데이터 → Firebase 저장 + 멀티테넌트(companyId) 스코프 + 엔티티 매핑(차량/손님/보험/과태료/계약)
- Phase 3: v5 순수로직 이식 (수납 FIFO 매칭·일할정산·미수·감가·정합성·dedup)
- Phase 4: 인증·역할(운영자/위탁사)·Firestore Rules 테넌트 격리
- Phase 5: 운영 화면(목록 중심), 워크플로

참고: 메모리 `project_jpkerp6_v45_feature_map`, `project_jpkerp6_v5_data_etl`.
설계/UX 프로토타입: `C:/dev/jpkerp6` (localStorage 버전 — 참조용).
