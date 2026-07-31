# ★커서 필독 — 규격이 바뀌었다 (2026-07-31)

**진행 중인 오더 4건을 계속하기 전에 이 문서를 먼저 읽어라.** 네가 작업하는 동안 내(Claude)가
사장님 확정으로 규격을 여러 번 바꿨다. 지금 작업트리에 미커밋 39개 파일이 있으므로, 커밋 전에
아래 항목을 자기 코드에 대조해라. 어기면 `npx vitest run` 이 실패한다(규격이 테스트로 박제돼 있다).

---

## 0. 먼저 할 일 — 리베이스/대조

```
git log --oneline -8          # e9d77d8 부터 f74b3d8 까지 규격 커밋 7건이 새로 들어왔다
npx tsc --noEmit              # 0 이어야 함
npx vitest run                # 235 통과여야 함 (tests/row-grammar.test.ts 58건이 규격 게이트)
```

**내가 이미 고쳐놓은 네 파일 — 덮어쓰지 마라:**
- `lib/staff-cols.tsx` — 「회사」→「회사명」, 「신원」 2줄 셀 → 「이름」+「이메일」 2컬럼으로 분리했다.
  결과적으로 직원 탭도 `회사명·이름·이메일·직원분류·직원상태` 로 규격 4·5 슬롯에 맞았다.
- `lib/master-ledger-cols.tsx` 의 `SCHEDULE_SHEET_KEYS` — 분류·상태가 6·7번이던 것을 **4·5번**으로 옮겼다.
- `lib/master-ledger-cols.tsx` 의 `label: '대여형태'` → `'계약분류'`.
- `lib/finance/cash-cols.tsx` 의 `'계정과목'`→`'자금분류'`, `'매칭상태'`→`'자금상태'`.

**내가 잡고 있어서 손대면 안 되는 파일** (필요한 변경은 나에게 «요청»으로 남겨라):
`lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `firestore.rules` ·
`app/api/entities/[entity]/route.ts` · `lib/payments/duplicate-cash.ts` · `lib/plate.ts` ·
`lib/penalty-reassign.ts` · `app/settings/page.tsx` · `components/vehicle-detail/useVehicleDetail.ts`

---

## 1. 열 순서 — 기준은 **자산관리**

```
회사명(1) · 식별자(2) · 이름(3) · X분류(4) · X상태(5) · 나머지
```

자산관리 = `회사명 · 차량번호 · 차명 · 자산분류 · 자산상태 · …` ← 원래부터 이 형태였고 이게 정답이다.
11개 화면 전부 이 슬롯에 맞췄다. **새 표를 만들면 반드시 이 순서**여야 한다.

- 분류·상태 라벨은 **같은 접두어 쌍** — 「자산분류/자산상태」·「리스크분류/리스크상태」.
  「구분」·「세부」·「종류」·「이행」·「유형」·「표시명」 같은 모호한 라벨은 **테스트가 실패시킨다.**
- 「대상」 같은 뭉뚱그린 신원 칸을 만들지 마라. **차량번호·계약자** 처럼 실제 식별자로 쪼갠다.
- 사유·제목은 신원이 아니다 → 「X내용」 별도 칸(리스크내용·업무내용).
- **새 표를 만들면 `tests/row-grammar.test.ts` 의 `SCREENS` 배열에 등록해라.** 등록 안 하면 규격 밖에 산다.

## 2. 표에서 **2줄 셀 금지**

`TwoLineCell` 을 열 카탈로그에서 import 하면 **테스트가 실패한다**. 행 높이가 고정이고 B2B 표는 조밀해야
읽힌다. 2줄로 숨기지 말고 **각자의 컬럼으로 내보내라**.
(상세패널·카드에서는 계속 써도 된다 — 금지는 «표»에 한정.)

## 3. 표 행 높이 30px

`--ledger-row-h: 30px`(데스크톱) · 모바일 34px(배지가 22px라서). jpkerp5·freepasserp4 와 같은 값이다.
44px 였던 이유는 2줄 셀 수용이었고 그게 폐기됐다. **폰트·패딩을 키우지 마라.** 회귀 테스트 3건이 지킨다.

## 4. 차량번호 조인은 **별칭**으로 (신규 SSOT)

```ts
import { plateAliasesOf, plateAliasesFor, inPlateAliases } from '@/lib/plate';

const aliases = plateAliasesFor(vehicles, plate);        // 현재번호 + 번호변경 이력
const mine = contracts.filter((c) => inPlateAliases(aliases, c.plate));
```

`normPlate(x.plate) === np` **정확 일치 조인을 새로 만들지 마라.** 임판→정식번호 전환 후 그 차의
계약·정비이력·과태료·보험이 화면에서 사라진다(실제로 그랬고 방금 고쳤다).

**자녀 레코드(계약·과태료)의 plate 를 소급 변경하는 방식은 금지** — 과태료 고지서에는 옛 번호가 찍혀
있고 계약서도 계약 당시 번호가 원본이다. 법적 근거물이라 바꾸면 안 된다. 조회하는 쪽이 별칭으로 찾는다.

`matchDriver(penalty, contracts, vehicles)` — 3번째 인자에 차량을 넘기면 별칭 매칭이 된다.
새 화면에서 과태료 실운전자를 찾을 때는 **반드시 넘겨라**.

## 5. 상태 신호는 **배지 색으로만**

`lib/work-rail.ts` 의 `workRailStyle` 은 항상 `undefined` 를 반환한다. 좌측 레일·행 배경 틴트·점 표시를
되살리지 마라. 그리고 **분류·상태 둘 다 배지**가 자산관리 형태다(리스크는 분류=배지·구분=평문으로 맞췄다).
배지가 3개 이상 나란히 오면 무엇이 신호인지 흐려진다.

## 6. 회계마감 — **새 자금 쓰기 경로를 만들지 마라**

`bank_tx`·`card_tx` 는 이제 세 겹으로 막혀 있다:
- `firestore.rules` `moneyUpdatable`/`moneyDeletable` — 마감월 수정·삭제 거부(본사도)
- `app/api/entities/[entity]/route.ts` — 마감월 **생성·임포트** 거부(409), 기존 문서의 월도 검사
- `lib/store.ts` — 400·403·409 는 직접 경로로 폴백하지 않고 사유를 그대로 사용자에게 보여준다

새 쓰기 경로를 열면 이 방어가 통째로 우회된다. **회차원장은 읽기 전용**이어야 한다는 오더가 이 이유다.

## 7. 돈 2문서를 쓸 때 순서는 **bank_tx → contract**

`commitAll` 은 트랜잭션이 아니라 앞선 쓰기가 남는다. 계약을 먼저 쓰면 부분 실패 시
«미수만 깎이고 매칭은 안 된» 영구 고아가 되고 화면에서 되돌릴 방법이 없다.
`app/payments/page.tsx` 의 `apply`·`manualMatch`·`unmatch` 가 모두 이 순서로 통일돼 있다.

## 8. 서버 성공 **후에만** 화면·토스트 갱신

이번 주 확정된 결함 다수가 이것이었다 — «저장됐다고 믿는데 서버는 모르는» 상태.
- `safeUpdate`/`commitUpdate` 의 반환값을 확인하고 실패면 성공 토스트를 띄우지 마라.
- 원격 저장 실패를 `console.warn` 으로 삼키지 마라. 사용자에게 알려라.
- 낙관적 갱신 금지.

## 9. 메뉴 IA 변경 금지

좌측 메뉴·그룹 추가, 리스크 4그룹(미완료·미납·만기·휴차) 변경은 **사장님 승인 사항**이다.
탭·`views`·필터로 해결하라. (회차원장을 `lib/nav.ts` 의 `views` 에 넣은 건 올바른 방식이었다.)

## 10. 셀 그릇·표기 SSOT

`thX`/`tdX` · `align:'r'` = 우측+tabular+숫자폰트 · 표는 `money()`(₩ 없음) · 합계·상세는 `won()`(₩) ·
`--brand: #1B2A4A` 남색 유지 · `npm run build` 금지(dev 6006 상시 구동).

---

## 커밋 요청

미커밋 39개 파일을 **오더 단위로 쪼개서** 커밋해라(계정콘솔 / 엑셀 / 회차원장 / 자산공백).
한 커밋에 다 넣으면 문제가 생겼을 때 어느 오더를 되돌려야 하는지 알 수 없다.
커밋 전 게이트: `npx tsc --noEmit`=0 · `npx vitest run`=235 이상 · 건드린 라우트 200.
