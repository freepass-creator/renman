# 커서 오더 — 계정 관리 콘솔 (경영관리 「직원」 탭)

**등급: 필수 (오픈 잔여 1건)** · 작성 2026-07-31 · 대상 브랜치 `redesign/pagedef-p0`

## 왜 필요한가

퇴사자 계정 회수 · 비밀번호 분실 대응 · 권한 승강을 **ERP 안에서 할 수 없다**. 지금은 Firebase 콘솔에 직접 들어가야 하고(사장님 1인 의존), 「누가 마지막에 언제 로그인했나」를 볼 수 없어 미사용 계정이 방치된다 = 보안 노출.

현재 있는 것: `components/StaffConsole.tsx` 의 **localStorage 대장**(이름·이메일·역할·소속·부서) + 서버 조치 1개(`app/api/staff/suspend/route.ts` 정지/해제). 대장의 역할·소속은 **표시용**이라 실제 권한(Custom Claims)과 어긋날 수 있다 — `StaffConsole.tsx:70` 주석이 이미 인정하고 있다.

---

## 어디에 붙이나 (중요 — 메뉴 IA 변경 금지)

확정 메뉴 IA는 **사장님 승인 없이 변경 금지**다. 새 메뉴·새 좌측 항목·새 그룹을 만들지 마라.

- 붙일 곳 = **`app/management/page.tsx` (경영관리)에 「직원」 탭 추가**.
  현재 탭 = `법인 · 계좌 · 임대차` (`app/management/page.tsx:82` `const [tab, setTab] = useState<Tab>('법인')`).
  탭 추가는 IA 변경이 아니다 — 경영관리는 "법인별 관리해야 하는 항목 모조리"가 목적이고 이미 탭 구조다.
- `app/admin/page.tsx`(일반관리)는 **nav에 등록되지 않은 고아 페이지**다(`lib/nav.ts` 에 `/admin` 없음). 거기 있는 `<StaffConsole />` 을 경영관리 탭으로 옮기고, `/admin` 은 그대로 두되 중복 마운트는 제거하라.

---

## 작업 1 — 서버 라우트 4개 신설

기존 패턴 SSOT = **`app/api/staff/suspend/route.ts`**. 이 파일의 구조를 그대로 따라라:

```ts
export const runtime = 'nodejs';
const actor = await requireAuth(req);           // lib/api-auth
if (actor instanceof NextResponse) return actor;
if (actor.systemRole !== 'hq') return NextResponse.json({ error: 'forbidden — 본사 전용' }, { status: 403 });
const limited = await enforceApiRateLimit('<키>', actor.uid, { limit: N, windowMs: 60_000 });
if (limited) return limited;
```

| 라우트 | 메서드 | 하는 일 | rate limit |
|---|---|---|---|
| `app/api/staff/list/route.ts` | GET | `auth.listUsers(1000, pageToken)` 페이지네이션으로 전체 순회 → `{ uid, email, displayName, createdAt, lastSignInAt, disabled, provider, systemRole, companyId }`. **systemRole·companyId 는 `u.customClaims` 에서 읽어라** (renman 권한 SSOT는 Custom Claims — `scripts/set-user-claims.mts:41-43` 참조) | 60 / 분 |
| `app/api/staff/role/route.ts` | POST | `{ uid, systemRole: 'hq' \| 'tenant', companyId? }` → `setCustomUserClaims`. `tenant` 면 `companyId` 필수, `hq` 면 `companyId: null`. **기존 claims 를 보존하고 systemRole·companyId 만 교체**(`set-user-claims.mts:35-43` 과 동일 규약). 변경 후 `revokeRefreshTokens` — 안 하면 최대 1시간 동안 옛 권한이 유효하다 | 30 / 분 |
| `app/api/staff/reset-password/route.ts` | POST | `{ email }` → `auth.generatePasswordResetLink(email)`. **링크를 응답에 담아 화면에 보여주라**(메일 발송 인프라가 renman 에 없다 — ALIGO는 문자 전용). 화면은 그 링크를 복사해 본인에게 전달하는 UX로 | 10 / 분 |
| `app/api/staff/delete/route.ts` | DELETE | `{ uid }` → `auth.deleteUser`. **Auth 삭제는 soft 가 불가능 = 되돌릴 수 없다** | 5 / 분 |

### 서버 안전장치 (전부 필수)

1. **자기 계정 보호** — 정지·강등·삭제 대상이 `actor.uid` 면 400. (`suspend/route.ts:33-36` 이 이미 이메일로 하고 있다. uid 비교가 더 정확하므로 uid 로 통일하고 suspend 도 uid 를 받도록 확장하라.)
2. **마지막 hq 잠금 방지** — `hq` 계정이 1개뿐일 때 그 계정을 강등·정지·삭제하면 400. `listUsers` 로 hq 수를 세고 판정. 이게 없으면 복구가 CLI 뿐이다.
3. **claims 없는 계정** — `customClaims` 가 없는 사용자는 `systemRole: null` 로 표시하고 화면에서 「권한 미부여」 배지. 조용히 `staff` 로 취급하지 마라(실제 권한과 어긋난 표시가 현재 결함이다).
4. **감사 기록** — 정지·권한변경·삭제는 `audit_logs` 에 남겨라. `firestore.rules:48-55` 는 `byUid == request.auth.uid` 를 강제하는 **append-only** 이므로 서버(Admin SDK)에서 쓸 때도 `byUid` 를 actor.uid 로 채워라. 형식은 `lib/audit.ts buildAuditLog` 참조.
5. **오류 응답** — `{ error: '<한국어 사유>' }` + 적절한 status. `suspend/route.ts:47-52` 처럼 `auth/user-not-found` 는 사람이 읽을 문장으로 번역하라.

---

## 작업 2 — 화면 (경영관리 「직원」 탭)

`components/StaffConsole.tsx` 를 확장하지 말고 **`components/management/StaffTab.tsx` 신설**을 권한다(StaffConsole 은 localStorage 대장 UI라 관심사가 다르다). 대장(`lib/staff.ts`)은 그대로 두고, **Auth 계정 목록을 주(主)로 하고 대장을 보조로 조인**하라 — 이름·부서는 대장에서, 권한·로그인은 Auth 에서.

- 표는 **LedgerFrame 규격**을 따라야 한다: 셀 그릇 SSOT `thX/tdX`(패딩 8/5, 행높이 `--ledger-row-h`), `align:'r'` 은 우측+tabular, 컬럼 정의는 `lib/master-ledger-cols.tsx` 스타일.
- **행 문법 필수** — 모든 행은 `회사 · 신원 · 분류 · 상태 · 수치/기한` 을 보여야 하고 **분류 바로 뒤에 상태**가 온다. 이 탭에서는:
  - 회사 = `companyId`(claims) → `companyLabel()` · hq 는 「전 법인」
  - 신원 = 이름 + 이메일 (`TwoLineCell`)
  - **직원분류** = 본사 / 법인 / 권한미부여
  - **직원상태** = 정상 / 정지 / 미로그인(90일+) / 계정없음(대장에만 있음)
  - 수치·기한 = 마지막 로그인 (D+N)
- **상태 신호는 배지 색으로만.** 좌측 레일·점·행 배경 틴트는 전부 폐기됐다(`lib/work-rail.ts workRailStyle` 이 항상 `undefined` 를 반환한다 — 되살리지 마라).
- 선택은 **체크박스 없이** 클릭·Shift·Ctrl 다중선택 + **우클릭 컨텍스트 메뉴**. 기존 원장의 선택·컨텍스트 메뉴 구현을 그대로 재사용하라(새로 만들지 마라).
- 액션은 컨텍스트 메뉴에 둔다(우측상단 ⋯도구 메뉴는 폐기됨). 헤더는 `[회사][검색][☰필터][기간] + [+생성]` 최소 구성을 깨지 마라.
- **되돌릴 수 없는 조작은 이중 확인** — 삭제는 `useConfirm`(danger) + `usePrompt` 로 **이메일을 그대로 타이핑**하게 하라. `components/MigrateDataButton.tsx` 가 이 패턴의 참고 구현이다.
- 서버 성공 **후에만** 화면 상태를 갱신하라. `components/StaffConsole.tsx:38-59` 가 이미 이 규약을 지키고 있다 — 낙관적 갱신 금지(정지 실패인데 정지된 것처럼 보이면 안 된다).

---

## 게이트 (전부 통과해야 완료)

```
npx tsc --noEmit                       # 0
npx vitest run                         # 현재 156 통과 — 줄지 않아야 함
npm run test:rules                     # 현재 36 통과 (audit_logs 규칙 건드리면 여기서 잡힘)
curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/management    # 200
```

## 금지사항

- `npm run build` 실행 금지(dev 6006 상시 사용 중).
- 좌측 메뉴·그룹 추가·리스크 그룹 변경 금지(확정 스펙, 사장님 승인 필요).
- `--brand: #1B2A4A` 남색 유지 — 파랑으로 바꾸지 마라.
- 다음 파일은 지금 내가 잡고 있으니 손대지 마라: `lib/store.ts`, `lib/company-master.ts`, `lib/finance/period-lock.ts`, `firestore.rules`, `app/api/entities/[entity]/route.ts`, `lib/payments/duplicate-cash.ts`, `components/vehicle-detail/useVehicleDetail.ts`, `app/settings/page.tsx`.
- `app/api/staff/suspend/route.ts` 는 **uid 확장만** 하고 기존 안전장치(자기 계정 정지 금지 · `revokeRefreshTokens`)를 제거하지 마라.

## 참고 원본 (jpkerp5)

`D:\dev\jpkerp5` — `app/api/admin/users/route.ts`(listUsers 페이지네이션·provider 정규화), `app/api/admin/users/[uid]/route.ts`, `app/api/admin/users/[uid]/role/route.ts`, `app/admin/users/page.tsx`(목록·토글·리셋·삭제 UI).
**단, jpkerp5 는 권한을 「admin 이메일 화이트리스트 + RTDB users 노드」로 판정한다. renman 은 Custom Claims(`systemRole`/`companyId`)가 SSOT다** — 이메일 화이트리스트 방식을 가져오지 마라.
