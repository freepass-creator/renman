# jpkerp6 배포 가이드

로컬 실행은 `README.md` 참고. 이 문서는 **실 백엔드 연결 + production 배포** 순서.

## ★ 오픈 전 필수 게이트 (이거 안 하면 오픈 불가)
오픈 감사(2026-07)에서 확인된 필수 항목. 코드는 반영됨 — 아래는 **배포/설정 작업**.
1. **환경변수** — Vercel(또는 배포 호스트)에 `NEXT_PUBLIC_FIREBASE_*` 6개 등록 **후** 빌드. (없으면 앱이 `서버가 연결되지 않았습니다` 화면으로 하드 차단 — 조용한 localStorage 폴백 방지 가드가 들어감.)
2. **회사격리 Rules 배포** — `firebase deploy --only firestore:rules` (아래 2.3). **Firebase 콘솔 → Firestore → Rules에 test-mode(`allow read,write: if request.time < ...`) 블록이 없어야 함.** 이게 서버측 회사격리의 유일한 방어선.
3. **Rules 검증(필수 테스트)** — 법인 A 계정으로 로그인 → 법인 B 문서 읽기 시도 → **PERMISSION_DENIED** 나와야 정상. 안 나오면 배포 안 된 것.
4. **본사 마스터 계정 사전생성** — Firebase Auth 콘솔에서 `pyh@teamjpk.com` 미리 생성. (가입폼에서 이 이메일 선점은 코드로 차단됨 — auth.ts. 그래도 사전생성이 정석.)
5. **API 라우트 잠금** — ALIGO/Gemini 실키를 붙이면 `/api/notify`·`/api/ocr`가 무단 호출 위험 → 배포 env에 **`API_SHARED_SECRET`** 설정(설정 시 미일치 요청 401). 아직 안 붙였으면 **ALIGO_* 키를 prod에 넣지 말 것**(SMS는 mock 유지=악용 0).

## 0. 지금 상태
- 코드 골격 완성 (OCR 수집 · v5 로직 · 멀티테넌트 · CRUD · 운영화면)
- Firebase 미설정 시 → **LocalAdapter**(localStorage)로 동작 (개발/데모)
- OCR 라우트는 라이브 — `GEMINI_API_KEY`만 있으면 작동

## 1. OCR만 먼저 (Firebase 불요)
```
# .env.local
GEMINI_API_KEY=AIza...   # https://aistudio.google.com/apikey
```
`npm run dev` → http://localhost:6006/ingest → 자동차등록증 업로드. 저장은 localStorage.

## 2. Firebase 연결 (실 저장 + 테넌트 격리 발효)
1. Firebase 콘솔에서 프로젝트 생성 → **Firestore Database** 활성화 (Native 모드)
2. 웹 앱 등록 → 설정값을 `.env.local`에:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```
   → 이 순간 `getStore()`가 **FirestoreAdapter**로 자동 전환 (코드 수정 0).
3. **테넌트 격리 Rules 배포**:
```
npm i -g firebase-tools
firebase login
firebase use --add        # 프로젝트 선택
firebase deploy --only firestore:rules
```
   → `firestore.rules`(companyId 기반 격리)가 서버에 발효. 법인 소속 직원은 자기 법인 문서만.
4. **users/{uid} 프로필** 생성 — `{ role: '본사'|'법인', companyId }`. 본사=`companyId: null`(전 법인), 직원=`role: '법인'` + 배정 `companyId`. (레거시 `운영자`/`위탁사`도 앱·rules가 호환 인식)

## 3. 실 인증 (Firebase Auth) — 대부분 반영됨
- ✅ `lib/session.tsx`는 이미 Firebase Auth(`watchAuth`/`onAuthStateChanged`) 사용 — `firebaseReady()`면 자동. `loadProfile`이 `users/{uid}`로 role·companyId 세팅. 미프로비저닝 계정은 `no-profile`(잠금).
- ✅ prod에서 env 미설정이면 `no-backend` 하드 차단(localStorage 폴백 방지).
- ⚠️ `lib/api-auth.ts` — 현재 `API_SHARED_SECRET` opt-in 가드(설정 시 401). **완전 인증**은 Firebase Admin `verifyIdToken`으로 교체 + 클라이언트(`NotifyDialog`·OCR 호출)가 ID토큰을 Authorization 헤더로 전송하도록 배선(TODO).

## 4. Vercel 배포
```
# Vercel 프로젝트 연결 후 환경변수(GEMINI_API_KEY + NEXT_PUBLIC_FIREBASE_*) 등록
# 빌드: next build / 출력: .next
```
주의: `app/api/ocr/extract`는 `runtime='nodejs'`, `maxDuration=120` — Vercel Node 런타임 필요.

## 알려진 제약 (비블로커, 감사 확인)
- **OCR maxDuration=120s** — Vercel Hobby(~60s)에선 긴 OCR이 잘림. Pro 이상 또는 값 하향 필요(`app/api/ocr/extract/route.ts`).
- **ESLint 미설치** — `next build`가 lint 건너뜀(빌드는 통과). 원하면 `eslint`+`eslint-config-next` 추가.
- **Pretendard 폰트 CDN(jsdelivr)** — 폐쇄망에서 차단 시 시스템폰트로 폴백. 자체호스팅(next/font/local) 고려.
- **first `next build` 미실행** — Windows dev 전용 워크플로우. 배포 전 한 번 `next build`로 확인 권장(`/vehicle/[plate]`는 force-dynamic로 useSearchParams bailout 방지 완료).

## 미설정이어도 안전
- Firebase 없으면 LocalAdapter로 graceful 동작(단 **prod 빌드는 env 없으면 하드 차단** — 위 필수 게이트 1). 키를 단계적으로 붙여도 됨 (OCR → 저장 → Rules → Auth 순).
