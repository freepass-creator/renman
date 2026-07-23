# RENMAN 보안 상태 (서버 권한 경계)

> 진짜 보안 경계는 **Firestore Rules + 서버 API**다. 화면 메뉴 숨김·클라이언트 검증은 UX일 뿐 경계가 아니다.
> 테넌트 모델: `users/{uid} = { role, companyId }`. 본사(companyId=null)=전 법인, 법인 직원=배정 companyId 문서만.

## Firestore Rules 테스트

Firestore 에뮬레이터(**JRE 필요**) 위에서 권한 경계를 검증한다. 로컬:

```bash
npm run test:rules   # firebase emulators:exec --only firestore → vitest (tests/rules/**)
```

Java 없으면 로컬 실행 불가 → CI(`.github/workflows/ci.yml` `rules` 잡, temurin JDK17)에서 매 push/PR 실행.
테스트 본체: [tests/rules/firestore.rules.test.ts](tests/rules/firestore.rules.test.ts).

---

## ✅ 수정됨

### P0-1 — 법인 사용자의 본사 권한 자기승격 (BLOCKER)
- **문제:** `match /users/{uid}`(본사만 update)와 범용 `match /{coll}/{docId}`가 **같은 문서에 OR로 평가**됨.
  범용 update가 `tenantOK && companyId불변`만 요구해, 법인 직원이 자기 `users/{uid}`에서 `companyId`는 그대로 두고
  `role`만 `'본사'`로 바꾸면 허용 → `isHQ()`가 이를 신뢰 → 전 법인 접근.
- **수정:** `businessColl(coll)` 도입 — 범용 규칙이 `users`·`period_locks`·`audit_logs`에는 **절대 적용되지 않도록 배제**.
  민감 컬렉션은 각자의 명시 match만 지배. (전 컬렉션 열거식 제거 대신 배제 방식 — 업무 컬렉션 누락으로 정상 쓰기가 막히는 위험 회피.)
- **부수효과 차단:** 범용 update가 `period_locks`를 제외하지 않던 구멍(법인이 마감문서 수정)도 함께 폐쇄.
- **검증:** `tests/rules/firestore.rules.test.ts` — 자기승격 거부 · 테넌트 격리 · 마감/감사 우회 거부 · 정상 업무 쓰기 유지.
  OR 논증: `users/{uid}` update = ①전용 match `isHQ()`=false(법인) ②범용 match `businessColl('users')`=false → **둘 다 deny**.

### 얼린 시드 PII 가명화
- **문제:** `lib/migrate/switchplan-data.json`(실고객 177명 실명·전화·번호판·VIN)이 `switchplan.ts`에서 **정적 import(번들)** 되어 GitHub로 푸시됨. 주민번호는 없으나 이름+전화는 개인정보. (정적 import라 gitignore 시 CI/클론 빌드 실패 → 가명화가 정답.)
- **수정:** `tools/mask-switchplan-pii.ts` — 실명→`고객NNN`·전화·번호판·VIN·임차인 counterparty를 **결정적·참조무결성 보존**으로 치환(회사 상대방은 보존). 재무·날짜·상태·`_carryUnpaid`는 무변경. `rebuild-switchplan-frozen`이 기록 직전 자동 마스킹 → **재생성해도 PII 유입 없음**.
- **검증:** 실PII 잔존 0 · carry 합 142,315,000(불변) · 163/177 · tsc 0 · test 32/32.
- **잔여:** git **히스토리**엔 과거 실데이터가 남아 있음(BFG/history purge는 공유 히스토리 재작성이라 별도 결정 필요). 향후 커밋부터는 유입 차단됨.

---

## ⏳ 남은 P0 (미착수 — 우선순위 순)

| # | 항목 | 요지 | 착수 조건 |
|---|---|---|---|
| P0-2 | 마스터=이메일 문자열 | `isMaster()`가 `pyh@teamjpk.com` 이메일 신뢰. 클라 가입폼 우회 가능 → **Firebase Custom Claims**(`systemRole:hq`, `companyIds[]`)로 이관. 마스터 2계정·MFA·재인증·권한변경 감사. | Firebase Admin/배포 |
| P0-3 | API shared secret 공개 | 서버가 `API_SHARED_SECRET` 검사하나 클라가 `NEXT_PUBLIC_*`로 같은 값 전송 → 브라우저 번들에 노출(비밀 아님). **Firebase ID Token 검증**(`getIdToken()` → Admin `verifyIdToken()` → `users/{uid}` role/companyId)으로 교체. | Firebase Admin |
| P0-4 | 법인 직원 = 전 컬렉션 수정 | 역할이 사실상 본사/법인 2단. 같은 회사면 컬렉션 무관 수정 가능. **컬렉션별 필드 화이트리스트 + 세분 역할**(contract/collections/finance/field/read_only). | 역할 모델 설계 |
| P0-5 | `commitAll()` 비원자 | `for…await commitUpdate` 순차 — 계약+입금 중 하나 실패 시 부분반영(중복수납 위험). **`writeBatch`/`runTransaction`**으로 교체(계약+차량, 계약+입금, 은행+배분, 반납+보증금, 해지+위약금, 과태료+납부, 문서매칭). | Firebase(로컬 로직 일부 선작업 가능) |
| P0-6 | 감사로그 비원자 | 본 데이터 저장 후 감사로그 async·실패삼킴 → 변경은 되고 로그는 유실 가능. 금액·권한·상태 변경은 **본 데이터와 같은 batch/transaction**. | P0-5와 함께 |
| — | optimistic lock 비원자 | `getDoc→비교→setDoc` 사이 경합 → last-write-wins. `runTransaction()` 안에서 버전 비교. | P0-5와 함께 |
| — | 회계마감 강제 | Rules가 개별 금융문서 update 시 `period_locks` 미확인 → 마감월 수정 가능. 서버/Rules에서 강제. | Rules |

## P1 (데이터 정합성)
- 상태 머신 커맨드층 강제: **①완료** — `commitUpdate()`에 `canSetStatus` 백스톱(종료 계약 부활 차단, SM-1). **잔여** — 전진 전이 세부 검증·서버측(rules) status 가드(SM-4)·`transitionContract(id, action)` 명령 API.
- **Zod를 저장 경계에 연결** — `commitSave/commitUpdate`에서 `parseContract`/`parsePaymentEntry` 실행. 현재는 진단 도구.
- 입금·반납·해지 명령에 idempotencyKey.
- `_carryUnpaid` → 장기적으로 `opening_balance` 원장 거래로.

## 원칙
- 주민번호 원본 저장 금지(마스킹/암호화).
- 하드삭제는 Firebase 미연결 로컬에서만. 일반 삭제=soft-delete.
- 감사로그 append-only(수정·삭제 불가, `byUid`=로그인 uid 강제).
