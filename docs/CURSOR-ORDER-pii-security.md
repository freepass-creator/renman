# 커서 구현 오더 — 출시 전 보안 잔여 3건 (PII 마스킹 · 자동 로그아웃 · 세션 감사)

조사 기준: `D:\dev\renman` @ `redesign/pagedef-p0`, 작업트리 미커밋 42개(조사 중 39→42로 증가 — 커서가 계속 쓰고 있음). 모든 줄번호는 **작업트리 현재 상태** 기준.

---

## 0. 착수 전 필수 확인 (중복작업·충돌 방지)

### 0-1. 커서가 이미 끝낸 것 = 오더에서 제외

| 항목 | 상태 | 근거 |
|---|---|---|
| `lib/pii.ts` 마스커 6종(license·resident·name·phone·address) | **HEAD에 이미 있음** | `git diff lib/pii.ts` 는 48줄 이후만 추가 |
| `maskAccount` · `PII_MASKERS` · `looksLikePhone` · `looksLikeResident` | **커서 신규(미커밋)** | `lib/pii.ts:52-86` |
| **엑셀 내보내기 마스킹 배선** | **완료** | `lib/sheet-export.ts:7` (유일한 pii import), `:46-78 applyMask`, `:91 toCell` |
| 원문 엑셀 게이트(본사 전용 + 확인 다이얼로그) | **완료** | `components/ui/use-sheet-export.ts:105-120` |
| 엑셀 마스킹 테스트 | **완료** | `tests/sheet-export.test.ts:57-73` |
| `lib/audit.ts` login/logout 액션 타입·라벨·배지톤 | **이미 있음(기록만 0건)** | `lib/audit.ts:12`, `:86`, `app/audit/page.tsx:16` |
| 서버 audit_logs 쓰기 헬퍼 | **커서 신규** `writeStaffAudit` | `lib/staff-admin.ts:108-142` |

→ **`lib/pii.ts` 의 마스커 함수 신설·엑셀 마스킹 배선은 오더에 넣지 않는다.** 남은 건 «화면·검색·문서·발송·감사Diff» 배선과 «lib/pii.ts 3건 결함 수정»뿐이다.

### 0-2. 착수 시점 — 게이트가 지금 빨갛다

```
lib/finance/cash-cols.tsx(97,5): error TS2322: Type '(...)[]' is not assignable to type '(row: CashRow) => string[]'
lib/finance/cash-cols.tsx(104,5): error TS2322: (동일)
```
원인: `lib/finance/cash-cols.tsx:97` `values: [...MONEY_CLASS]` / `:104` `values: [...MONEY_STATUS]` — `SheetCol.values` 는 `(row: T) => string[]`(`components/ui/excel-sheet.tsx:41`). 커서가 진행 중인 `lib/finance/money-status.ts` 이식 작업이 아직 안 끝난 상태다.

**지시: 이 오더는 오더 4건(계정콘솔·엑셀내보내기·회차원장·자산공백) 커밋 + `npx tsc --noEmit` 0 회복 후에 착수한다.** 이 오더가 건드릴 파일 중 `lib/pii.ts` · `components/ui/excel-sheet.tsx` · `components/NotifyDialog.tsx` · `app/asset/page.tsx` · `app/contract/page.tsx` 가 지금 커서 손에 있다 → 동시 편집 금지.

---

## 1. 오더 ① PII 마스킹 배선

### 1-1. ★마스킹 / 원문 구분표 (이 표가 규격이다)

| # | 지점 | 파일:줄 | 지금 | 규격 | 근거 |
|---|---|---|---|---|---|
| A | 계약원장 「연락처」 열 | `lib/master-ledger-cols.tsx:263` | 원문 | **마스킹** | 목록=대량스캔. `lib/pii.ts:2` 주석 규격 |
| B | 계약 전체보기 생년월일·면허번호·주소 | 카탈로그 `lib/master-ledger-cols.tsx:306-308` / 뷰키 `:376`, `:407` | 원문 | **마스킹** | 동일 |
| C | 운영현황 「연락처」 열 | `lib/sheet-cols.tsx:70` (뷰키 `:193`,`:198`,`:219`) | 원문 | **마스킹** | 동일 |
| D | 리스크관리 「연락처」 열 | `lib/risk-cols.tsx:59-61` (뷰키 `:100`,`:101`,`:113`) | 원문 | **마스킹** | 동일 |
| E | 자산 「딜러연락처」 | `lib/master-ledger-cols.tsx:93` | 원문 | **마스킹** | 개인 연락처 |
| F | 자산 「법인번호/생년월일」 | `lib/master-ledger-cols.tsx:72` | 원문 | **화면 원문 유지 / 엑셀만 마스킹** | 법인 소유차는 법인등록번호(개인정보 아님)·등록증 대사에 필요. 개인소유차만 생년월일 |
| G | 계좌번호·카드번호 | `lib/finance/account-cols.tsx:18` · `cash-cols.tsx:60`,`:218` | 원문 | **원문 유지(화면·엑셀 모두)** | 자기 법인 계좌 = 개인정보 아님. 자금대사에 필수. cardLast4는 이미 끝4 |
| H | **일반 CRUD 목록**(손님 = 성명·면허번호·면허종류·생년월일·**주민번호앞6**·주소) | `app/list/[entity]/page.tsx:43-49` (`entity.fields.slice(0,8)` 원문 렌더) | 원문 | **마스킹 (최우선)** | 노출 폭 최대. `lib/intake/entities.ts:201-214` 에 `residentFront` 존재 |
| I | 통합검색 결과 sub | `app/search/page.tsx:69` (`e.fields[1]` = customer의 `licenseNo`) | 원문 | **마스킹** | 목록 성격 |
| J | 문자발송 다이얼로그 «수신자» 목록 | `components/NotifyDialog.tsx:153` | 원문 | **마스킹** | 화면 표시 |
| K | 문자 실제 발송 payload | `components/NotifyDialog.tsx:97` `tel: r.phone` | 원문 | **★원문 필수 — 절대 건드리지 마라** | 발송 대상 번호. 마스킹하면 문자가 안 간다 |
| L | 감사로그 Diff | `app/audit/page.tsx:119 show()` | 원문 | **마스킹** | before/after 에 `contractorPhone`·`contractorLicenseNo` 그대로 |
| M | **상세패널(원장 우측)** | `components/ui/record-panel.tsx:108` `col.render(row)` | 원문 | **★원문 유지** | `lib/pii.ts:3` 확정 규격 — 운영자가 신원을 대조하는 자리 |
| N | 차량360 임차인·면허 | `components/vehicle-detail/VehicleDetail.tsx:211-212` · `panels/StatusPanel.tsx:81` | 원문 | **원문 유지** | 단일 차 상세 |
| O | 고객360 연락처·면허 | `components/Customer360.tsx:42`, `:53` | 원문 | **원문 유지** | 단일 고객 상세 |
| P | **내용증명** 수신인 성명·주소 | `components/PrintHost.tsx:133` | 원문 | **★원문 필수** | 최고장은 상대를 특정해야 법적 효력. 마스킹 = 문서 무효 |
| Q | **과태료 변경부과 요청 공문** 실운전자·연락처 | `components/PrintHost.tsx:264-271` | 원문 | **★원문 필수** | 재부과 대상 특정 |
| R | **대여계약서** 임차인 성명·연락처·면허번호·주소 | `components/PrintHost.tsx:294-296` | 원문 | **★원문 필수** | 계약 당사자 본인 교부 문서 |
| S | **임대차 계약 사실확인서** 성명·연락처·면허번호·주소 | `components/PenaltyDocs.tsx:117-118` | 원문 | **★원문 필수** | 관청 제출 증빙 |
| T | 거래사실확인서 등 서식 상대방 | `lib/doc-templates.ts:203`,`:257`,`:298` (`target.mainPhone`) | 원문 | **원문 필수** | 사용자가 직접 입력한 상대 법인 정보(`app/docs/issue/page.tsx:176`) |
| U | **설정 → 엔티티 CSV 내보내기** | `app/settings/page.tsx:135-147` | **원문 전량** | **마스킹 (커서의 sheet-export 가 못 막는 별도 유출로)** | `lib/export-csv.ts` 는 pii import 0. `ent.fields` 전 항목을 그대로 CSV로 씀 |

**한 줄 규칙**: 마스킹 = «여러 사람이 한 화면·한 파일에 나열되는 곳». 원문 = «한 사람의 상세» + «상대를 특정해야 하는 대외문서» + «발송 대상 번호».

### 1-2. `lib/pii.ts` — 수정 3건 + 신설 1건

★이 파일은 커서가 지금 만지고 있다. 오더 4건 커밋 후 착수.

1. **`lib/pii.ts:73` `cardLast4: maskAccount` 제거.**
   `maskAccount` 는 `d.length <= 4` 일 때 `'●'.repeat(v.length)`(`:57`) → 이미 최소화된 끝4자리가 엑셀에서 완전히 사라져 카드 대사가 불가능해진다. 표의 render(`lib/finance/cash-cols.tsx:218`)는 `•••• 1234` 로 이미 안전.
2. **`lib/pii.ts:68` `ownerBizNo: maskResident` → `maskBizOrBirth` 신설로 교체.**
   `maskResident`(`:17-22`)는 `d.slice(0,4) + '●●'` 다. 13자리 법인등록번호에 적용하면 앞 4자리만 남고 나머지 9자리가 `●●` 2글자로 뭉개진다 = 값 파괴(마스킹이 아님). 신설:
   ```ts
   /** 법인등록번호(13)=원문 / 그 외(생년월일 등)=maskResident. 등록증 '법인번호/생년월일' 겸용 칸. */
   export function maskBizOrBirth(s: unknown): string
   ```
3. **`lib/pii.ts:66` `contractorBirth` 는 주민번호가 아니라 date 필드다.**
   `lib/master-ledger-cols.tsx:306` `cx('contractorBirth', '생년월일', { date: true })` → 값이 `1985-03-12`. `maskResident` 를 태우면 `1985●●` 가 되어 **월이 사라지고 일자는 남지 않는다**(주석 `:16` «뒤 2자리 마스킹»과 실제 동작 불일치). `maskBirthDate(s) → '1985-03-●●'` 를 신설해 매핑을 바꿔라.
4. **신설 `SCREEN_MASKERS`** — `PII_MASKERS`(파일 내보내기용)와 **분리**한다.
   ```ts
   /** 화면 목록·검색 결과 전용. 파일 내보내기(PII_MASKERS)와 다르다 —
    *  계좌·카드·법인번호·사용본거지는 자금대사·등록증 대사에 필요해 화면에서는 가리지 않는다. */
   export const SCREEN_MASKERS: Record<string, (v: unknown) => string> = {
     phone: maskPhone, contractorPhone: maskPhone, dealerPhone: maskPhone, driverPhone: maskPhone,
     contractorLicenseNo: maskLicense, licenseNo: maskLicense,
     contractorBirth: maskBirthDate, birth: maskBirthDate,
     residentFront: maskResident,
     contractorAddress: maskAddress, address: maskAddress,
   };
   ```
   `account` · `acct` · `cardLast4` · `useAddress` · `ownerBizNo` 는 **넣지 마라**(표 G·F 근거).

### 1-3. `components/ui/excel-sheet.tsx` — 목록 렌더러 1곳에서 일괄 (A~E)

목록 render 호출부는 **3군데뿐**: `:223`(모바일 카드 title) · `:224`(카드 fields) · `:362`(표 셀).
`components/ui/record-panel.tsx:108` 은 **같은 카탈로그를 쓰지만 손대지 않는다** → 표 M(상세 원문) 규격이 자동 성립. 이게 이 방식을 택한 이유다.

```ts
import { SCREEN_MASKERS } from '@/lib/pii';

/** 목록 셀 — PII 열은 text()를 마스킹해 표시. 상세패널(record-panel)은 이 함수를 쓰지 않는다(원문). */
const cellNode = <T,>(c: SheetCol<T>, r: T): React.ReactNode => {
  const fn = SCREEN_MASKERS[c.key];
  if (!fn || !c.text) return c.render(r);
  const raw = c.text(r);
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return c.render(r);   // 빈 값은 원래 render의 '—'(LEDGER_EMPTY.dash) 유지
  return fn(s);
};
```
`:223`/`:224`/`:362` 의 `c.render(r)` / `visibleCols[0]?.render(r)` 를 `cellNode(c, r)` 로 교체.

**함정 (근거 있음)**
- `text()` 는 **절대 마스킹하지 마라.** `text()` 는 ①헤더필터 값목록(`:49 cellText` → `:52 cellValues`) ②정렬(`:59 sortVal`) ③검색 ④엑셀(`lib/sheet-export.ts:87 col.text(row)`)의 입력이다. 마스킹하면 «전화번호로 검색»이 죽고, 엑셀은 `applyMask` 로 **이중 마스킹**된다.
- 헤더필터 팝오버(`:69 FilterPop`)는 `cellValues`→`text()` 를 쓰므로 **필터 드롭다운에는 원문이 남는다.** 이건 이번 오더 범위 밖(별도 판단) — 임의로 `cellValues` 를 마스킹하면 필터 선택값과 실 데이터가 어긋나 필터가 아무것도 못 걸러낸다. **건드리지 말고 오더 완료 보고에 «잔여»로 적어라.**
- 셀에 자물쇠 아이콘·툴팁 배지 등 **엘리먼트를 추가하지 마라.** `--ledger-row-h: 30px`(모바일 34px) 고정 규격이다. 마스킹은 문자열 치환만.
- `●` 는 전각이라 폭이 늘 수 있다. 컬럼 폭은 `lib/sheet-export.ts:111 colWidth` 가 label 기준이므로 엑셀은 영향 없다. 화면은 폭 지정 변경 금지 — 필요하면 보고만.

### 1-4. `app/list/[entity]/page.tsx` — 최우선 (표 H)

`:43-49` 의 `render` 를 `SCREEN_MASKERS[f.key]` 경유로 바꾼다. **`DataTable` 은 `ExcelSheet` 가 아니라 별도 원자다** → 1-3의 수정으로 커버되지 않는다.

```ts
...entity.fields.slice(0, 8).map((f) => ({
  key: f.key, label: f.label,
  render: (r: EntityRecord) => {
    const v = r[f.key]; const filled = v != null && v !== '';
    const mask = SCREEN_MASKERS[f.key];
    const shown = filled ? (mask ? mask(v) : String(v)) : '—';
    return <span style={{ color: filled ? C.ink : C.lineStrong }}>{shown}</span>;
  },
})),
```
근거: `lib/intake/entities.ts:201-214` `customer.fields` = `name, licenseNo, licenseType, birth, residentFront, address, ...` → 지금 `/list/customer` 는 **주민번호 앞6까지 목록에 원문으로 찍고 있다.**

### 1-5. `app/search/page.tsx` (표 I)

`:69` `sub: ... String(rec[f1.key] ?? '')` → `f1.key` 에 `SCREEN_MASKERS` 적용. `label`(`f0.key`, 성명)은 마스킹하지 않는다(검색 결과를 못 알아보게 된다). `:22 customerKey(rec.name, rec.phone)` 는 **라우팅 키**이므로 원문 유지 — 마스킹하면 고객360으로 이동이 깨진다.

### 1-6. `components/NotifyDialog.tsx` (표 J·K)

- `:153` `{r.phone}` → `{maskPhone(r.phone)}`.
- **`:97` `tel: r.phone` 은 그대로.** `:73 targets = recipients.filter(r => r.phone)` 도 그대로.
- `lib/notify/recipients.ts:29 phone: String(rec.contractorPhone || '')` 는 **원문 유지** — 여기서 마스킹하면 발송이 죽는다.
- `lib/notify/types.ts` `NotifyRecipient.phone` 타입 변경 금지.

### 1-7. `app/audit/page.tsx` (표 L)

`:119 const show = (v) => ...` → 키 인자를 받아 마스킹:
```ts
const show = (k: string, v: unknown) => {
  if (v == null || v === '') return '—';
  const fn = SCREEN_MASKERS[k];
  return fn ? fn(v) : String(v);
};
```
`:130-131` 의 `show(b)`/`show(a)`/`show(a ?? b)` 를 `show(k, …)` 로. `:116` 의 제외 키 목록은 유지.

### 1-8. `app/settings/page.tsx` (표 U) — 별도 유출로

`:141` 에서 `PII_MASKERS`(엑셀용, `SCREEN_MASKERS` 아님) 적용:
```ts
const rows = records.map((r) => [companyLabel(r.companyId), ...ent.fields.map((f) => {
  const v = r[f.key];
  if (v == null || typeof v === 'object') return '';
  const fn = PII_MASKERS[f.key];
  return fn ? fn(v) : String(v);
})]);
```
그리고 이 CSV 버튼에 **원문 게이트를 붙이지 마라** — `use-sheet-export.ts` 의 원문 경로와 별개 UI를 새로 만들면 게이트가 둘로 갈린다. 여기는 **마스킹 전용**으로 못박고, 원문이 필요하면 원장의 «원문 엑셀» 메뉴를 쓰게 한다. `:143` 성공 메시지에 «(개인정보 마스킹됨)» 문구 추가.

### 1-9. 권한별 노출 — 판정 (조사항목 3)

**결론: 본사(hq)와 법인(tenant)에 «같은» 마스킹을 적용한다. 화면 마스킹에 권한 분기를 넣지 마라.**

근거:
- `lib/session.tsx:146` `isOperator = user.role === '본사'`, `:148` `scopeAll = isOperator && companyId === ALL_COMPANIES`. 즉 **본사는 전 법인 데이터를 한 화면에 합본으로 본다**(`lib/store.ts` DispatchStore `COMPANIES` fan-out). 노출 범위가 가장 넓은 주체에게 원문을 주는 것은 개인정보 최소노출 원칙과 정반대다.
- 진짜 권한 경계는 `firestore.rules:9 isHQ()` / `lib/api-auth.ts:56` 의 Custom Claims(`systemRole`)이고, 그건 **어느 회사 데이터를 읽을 수 있나**를 정한다. **한 사람의 전화번호를 화면에 몇 자리까지 보이나**는 별개 축이다. 두 축을 섞으면 «본사 계정 하나만 뚫리면 전 법인 고객 원문»이 된다.
- 원문이 실제로 필요한 사람은 «그 고객에게 전화·고지하는 담당자» = 법인 쪽이다. 그 수요는 이미 **상세패널 원문**(표 M)으로 충족된다.

★**추가 발견 — 원문 엑셀 게이트가 뒤집혀 있다.**
`components/ui/use-sheet-export.ts:105-107` 이 `unmasked` 를 `isOperator`(본사)에게만 허용한다. 결과:
- 법인 담당자는 자기 고객 명단조차 원문으로 못 뽑는다(업무 방해).
- 본사는 **전 법인 고객 원문을 한 파일로** 뽑을 수 있다(최악의 유출 시나리오).

**수정 지시**: 조건을 `isOperator` → `!scopeAll`(단일 법인 스코프)로 바꾼다. hq·tenant 모두 «단일 법인일 때만» 원문 허용, 확인 다이얼로그(`:116-119`)는 그대로 유지.
```ts
if (unmasked && scopeAll) {
  return { label: '원문 엑셀 (법인 선택 후 가능)', disabled: true, onClick: () => {} };
}
```
`scopeAll` 은 이미 `:67` 에서 구조분해되어 있다. `:128` deps 배열에 `scopeAll` 추가.

### 1-10. 테스트 — `tests/pii.test.ts` 신설 (필수)

```
maskBizOrBirth: 13자리 법인등록번호 → 원문 / 8자리 생년월일 → 부분 마스킹
maskBirthDate:  '1985-03-12' → '1985-03-●●'  (월이 살아 있을 것)
SCREEN_MASKERS: account·acct·cardLast4·useAddress·ownerBizNo 키가 **없을** 것
PII_MASKERS:    cardLast4 키가 **없을** 것 (끝4 파괴 회귀 방지)
양쪽 공통:      phone·contractorPhone·contractorLicenseNo 키 존재
```
`tests/row-grammar.test.ts` 는 **손대지 않는다** — 이 오더는 컬럼을 추가·삭제·재배치하지 않으므로 `SCREENS` 배열 변경 불필요. 새 표를 만들지도 않는다.

---

## 2. 오더 ② 자동 로그아웃

### 2-1. 구현 방식 판정 — «Firebase 세션 만료» 는 불가능하다

`lib/firebase/client.ts` 전문 확인: `setPersistence` 호출 없음 → Firebase Auth 기본 `browserLocalPersistence`. `lib/firebase/auth.ts:40-49` 도 persistence 미설정. ID 토큰은 1시간 만료지만 SDK가 refresh token 으로 자동 갱신하므로 **«유휴로 인한 세션 만료»라는 개념이 Firebase Auth 에 없다.** 서버측 강제 종료 수단은 `revokeRefreshTokens(uid)`(`app/api/staff/role/route.ts:60` 에서 사용) 뿐이고 이건 즉시·전기기 강제이지 유휴 감지가 아니다. `lib/api-auth.ts:53 verifyIdToken(token, true)` 는 revoke 여부만 검사한다.

→ **결론: 클라이언트 유휴 타이머가 유일한 현실적 구현이다.** 위협모델이 «공용 PC 방치»(악의적 내부자가 아니라 부주의)이므로 클라이언트 타이머로 충분하다.

**`browserSessionPersistence` 로 바꾸지 마라.** 탭 단위 세션이 되어 «새 탭에서 원장 열기»마다 재로그인이 필요해진다. 렌터카 ERP는 여러 탭을 상시 띄워 쓰는 도구다.

### 2-2. 기본 유휴 시간 제안 — **30분 유휴 + 60초 경고**

근거:
- 「개인정보의 안전성 확보조치 기준」 접근통제 조항이 «개인정보취급자가 일정 시간 이상 업무처리를 하지 않는 경우 자동으로 접속이 차단»되도록 요구한다. **조항은 분 수치를 특정하지 않고**, 해설 실무에서 통상 10~30분을 든다. (★법령 인용은 사장님이 최종 확인 — 나는 조문 번호를 확정하지 않는다.)
- 금융권(전자금융감독규정 계열)은 10분대를 쓰지만, 이 ERP는 원장을 열어두고 전화·현장 대응을 병행하는 도구라 10분은 업무 방해다.
- `SECURITY.md:58` 「주민번호 원본 저장 금지(마스킹/암호화)」와 같은 층의 «최소노출» 원칙 → 상한(30분)을 택하되 채택하지 않을 이유가 없는 경고 유예(60초)를 둔다.

상수는 코드 상단에 두고 env 로 조정 가능하게:
```ts
export const IDLE_MS  = Number(process.env.NEXT_PUBLIC_IDLE_MS  || 30 * 60_000);
export const WARN_MS  = Number(process.env.NEXT_PUBLIC_IDLE_WARN_MS || 60_000);
export const DIRTY_GRACE_MS = 120_000;  // 미저장 변경이 있을 때 경고 유예
```

### 2-3. 신설 파일 3개

#### (a) `lib/idle-timer.ts` — 순수 로직 (React·DOM 의존 0, vitest node 통과)
```ts
export type IdlePhase = 'active' | 'warning' | 'expired';
export function idlePhaseAt(now: number, lastActivity: number, dirty: boolean,
  o?: { idleMs?: number; warnMs?: number; dirtyGraceMs?: number }): IdlePhase
export function secondsUntilLogout(now: number, lastActivity: number, dirty: boolean, o?): number
```
따라야 할 패턴: `lib/sheet-export.ts` 헤더 주석 «xlsx import 금지 — vitest node 통과» 와 동일한 «순수 계산 분리» 규율.

#### (b) `lib/dirty-guard.ts` — 미저장 변경 레지스트리 (React 비의존, 모듈 스코프)
따라야 할 패턴: **`lib/audit.ts:29-34`** (`let _actor` + `setAuditActor`/`getAuditActor` 모듈 스코프) 와 **`lib/store.ts:460-484`** (`_listErrors` Map + `window.dispatchEvent(new Event(LIST_ERROR_EVENT))` + `subscribeListErrors`). 그대로 베껴라.
```ts
const _dirty = new Set<string>();
export function markDirty(token: string): void
export function clearDirty(token: string): void
export function isAnyDirty(): boolean
export function dirtyTokens(): string[]
export function subscribeDirty(fn: () => void): () => void   // 'jpk:dirty-change' 이벤트
```

#### (c) `lib/idle-logout.tsx` — `'use client'`, React 배선
```tsx
export function useDirtyFlag(active: boolean, token: string): void   // useEffect로 mark/clear
export function IdleGuard(): JSX.Element | null
```

`IdleGuard` 동작:
1. **활동 감지** — `pointerdown` · `keydown` · `wheel` · `touchstart` 를 `document` 에 `{ passive: true, capture: true }` 로 붙인다. 이벤트마다 타이머를 다시 걸지 말고 모듈 스코프 `lastActivity = Date.now()` 만 갱신 + `setInterval(tick, 5_000)` 하나로 판정(`idlePhaseAt`). 이유: 30px 행 수천 개짜리 원장에서 이벤트당 `setTimeout` 재설정은 스크롤을 끊는다.
2. **탭 간 동기화** — 활동 시각을 `localStorage['jpk:last-activity']` 에 **10초 스로틀**로 쓰고, tick 에서 `Math.max(로컬, localStorage 값)` 을 본다. **이걸 빼면 «A탭에서 일하는데 B탭 때문에 로그아웃»이 된다.** `lib/companies.ts:45 window.dispatchEvent(new Event('jpk:companies-change'))` 와 같은 크로스탭 관례를 따른다.
3. **경고** — `phase === 'warning'` 이면 모달. **`useConfirm` 을 쓰지 마라** — `components/ui/confirm.tsx:26 ConfirmProvider` 는 `pending` 이 하나뿐(`useState<Pending|null>`)이라 사용자가 열어 둔 확인창을 밀어낸다. `components/ui/overlays.tsx` 의 `Modal` 을 직접 쓰고, 남은 초를 카운트다운, 버튼은 「계속 사용」(solid) / 「지금 로그아웃」(ghost) 2개.
4. **미저장 보호** — `isAnyDirty()` 가 true 면 `dirtyGraceMs`(120초)로 유예를 늘리고 모달 문구를 바꾼다: 「저장하지 않은 변경이 있습니다 — 저장하거나 취소한 뒤 계속 사용을 누르세요」. **유예가 끝나면 그래도 로그아웃한다**(보안 우선). 자동 저장은 **금지** — 규칙 8(서버 성공 후에만 갱신)·규칙 6(새 자금 쓰기 경로 금지) 위반이다.
5. **만료** — `logSessionEvent('logout', 'idle')` **await** 후 `signOutUser()`. 순서 반대로 하면 토큰이 사라져 감사기록이 유실된다(§3-4 함정 참조).

### 2-4. 수정 파일

| 파일:줄 | 지시 |
|---|---|
| `lib/session.tsx:149` | `{phase === 'ready' ? children : …}` → `{phase === 'ready' ? <>{children}<IdleGuard /></> : …}`. **`app/layout.tsx` 에 마운트하지 마라** — 로그인 화면(`phase==='signed-out'`)에서도 타이머가 돌면 로그인 폼 입력 중에 모달이 뜬다. |
| `lib/session.tsx:139` | `function logout() { if (firebaseReady()) void signOutUser(); }` → `logSessionEvent('logout','manual')` 을 **await 후** signOut (§3-4) |
| `app/settings/page.tsx:156-164` | 「계정」 Panel 마지막에 `<ListRow main="로그아웃" …>` 추가. ★**조사 결과 앱 어디에도 로그아웃 버튼이 없다** — `logout` 은 `lib/session.tsx:152`·`:153` 의 Gate(정지·미등록 계정)에서만 호출된다. 공용 PC 대응에 «자동 로그아웃»만 넣고 «수동 로그아웃»을 빼면 반쪽이다. **좌측 메뉴·`lib/nav.ts` 는 건드리지 마라**(규칙 9) — 기존 Panel 안 ListRow 한 줄이다. |
| `app/company/[id]/page.tsx:27` | `const [dirty, setDirty] = useState(false)` 뒤에 `useDirtyFlag(dirty, 'company-master')` |
| `app/asset/page.tsx:80` | `const [editing, setEditing] = useState(false)` 뒤에 `useDirtyFlag(editing, 'asset-edit')` |
| `app/contract/page.tsx:76` | 동일 → `useDirtyFlag(editing, 'contract-edit')` |
| `components/ui/bottom-sheet.tsx:24` | `dirty = false` prop 을 이미 받는다(`:41`) → `useDirtyFlag(dirty, id or 'bottom-sheet')` |

### 2-5. 테스트 — `tests/idle-timer.test.ts` 신설
```
30분 미만 → 'active'
30분 경과 → 'warning'
30분 + 60초 → 'expired'
dirty=true 면 30분 + 60초 시점에도 'warning'(유예), 30분 + 120초에 'expired'
secondsUntilLogout 가 음수를 반환하지 않을 것
```
`lib/idle-logout.tsx`(DOM·React)는 vitest 대상이 아니다 — 그래서 로직을 (a)로 분리한다.

---

## 3. 오더 ③ 로그인/로그아웃 감사기록

### 3-1. 현재 상태

- `lib/audit.ts:12` `AuditAction` 에 `'login' | 'logout'` **이미 있음**. `:86` 한글 라벨도 있음. `app/audit/page.tsx:16` 배지 톤도 있음.
- **기록하는 코드는 0건.** `grep -rn "'login'"` 결과가 타입·라벨·톤 3곳뿐.
- `firestore.rules:50-57` audit_logs: `create` = 로그인 + `tenantOK(companyId)` + `companyId is string` + **`byUid == request.auth.uid`**, `update/delete` = `false`(append-only). `businessColl()`(`:27-33`)이 audit_logs 를 제외해 범용 규칙 우회도 차단됨.
- `tests/rules/firestore.rules.test.ts:108-119` 가 위 4개를 이미 검증(36건 중).

### 3-2. ★클라이언트 store 로 쓰면 본사 로그인이 조용히 실패한다 (핵심 함정)

경로를 따라가면:
`getStore().save('audit_logs', companyId, …)` → `AuditingStore.save`(`lib/store.ts:404`, AUDIT_COLL 은 base 로 통과) → **`DispatchStore.save`(`lib/store.ts:511-514`)**:
```ts
if (this.all(companyId)) throw new Error('전체 합본 보기에서는 저장 대상 회사를 먼저 선택하세요.');
```
그런데 본사 계정의 `companyId` 는 `lib/session.tsx:50 resolveCompany` 에서 **`ALL_COMPANIES`(`'__ALL__'`, `lib/companies.ts:12`)** 다. → **본사 로그인·로그아웃 감사가 100% throw.** 게다가 `AuditingStore.writeLog`(`lib/store.ts:395`)는 `catch { /* 감사 실패는 본 동작 안 막음 */ }` 로 삼켜서 **에러도 안 보인다.**

**→ 지시: 세션 감사는 서버 라우트로만 쓴다. `getStore()` 를 쓰지 마라.**

### 3-3. 신설 `app/api/auth/audit/route.ts`

따라야 할 패턴: **`app/api/staff/role/route.ts` 전체 골격**(`:13 runtime='nodejs'` → `:16 requireAuth` → `:21 enforceApiRateLimit` → 본문 → `:62 writeStaffAudit`).

```ts
export const runtime = 'nodejs';
export async function POST(req: Request) {
  const actor = await requireAuth(req);            // lib/api-auth.ts:43
  if (actor instanceof NextResponse) return actor;
  const limited = await enforceApiRateLimit('auth-audit', actor.uid, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { action?: string; reason?: string } | null;
  const action = body?.action === 'login' || body?.action === 'logout' ? body.action : null;
  if (!action) return NextResponse.json({ error: 'action 은 login 또는 logout' }, { status: 400 });
  const reason = body?.reason === 'idle' ? 'idle' : 'manual';
  await writeSessionAudit(actor, action, reason);   // lib/staff-admin.ts 에 추가
  return NextResponse.json({ ok: true });
}
```

`lib/staff-admin.ts` 에 `writeSessionAudit` 추가 — **`writeStaffAudit`(`:109-142`)를 그대로 복제**하되 `entityType: 'auth_session'`, `entityId: actor.uid`, `label: '로그인 ' + (actor.email || actor.uid)` / `'로그아웃(자동 — 유휴 30분)'`, `before/after: null`.

권한·격리 검증 포인트:
- `requireAuth`(`lib/api-auth.ts:52-64`)가 `verifyIdToken(token, true)` 로 검증하고 `systemRole`/`companyId` 를 **토큰에서** 뽑는다 → 클라이언트가 companyId 를 주장할 여지 없음. body 에 companyId 를 **받지 마라.**
- Admin SDK 쓰기라 `firestore.rules` 를 우회하지만, `writeStaffAudit:136-137` 처럼 `log.byUid = actor.uid` 를 **명시 고정**해라(규칙과 같은 불변식을 서버에서도 유지).

### 3-4. 호출부 — `lib/audit-session.ts` 신설(`'use client'`)

```ts
export async function logSessionEvent(action: 'login' | 'logout', reason: 'manual' | 'idle'): Promise<void>
```
`lib/api-headers.ts` 의 `apiAuthHeaders()` 사용(`headers.set('content-type','application/json')`). 실패는 `console.warn` 으로 삼킨다(감사 실패가 로그인·로그아웃 자체를 막으면 안 된다 — `lib/store.ts:395` 와 동일 판단).

| 호출 위치 | 파일:줄 | 지시 |
|---|---|---|
| **login** | `lib/session.tsx:188` `try { await signInEmail(email, password); }` | 성공 직후 `void logSessionEvent('login','manual')`. ★**`watchAuth` 콜백(`:72-102`)에 넣지 마라** — `onAuthStateChanged` 는 이미 로그인된 사용자의 **모든 페이지 새로고침·모든 새 탭·StrictMode 재마운트**에 발화한다(`:68-71` 주석이 그 재진입을 이미 다룬다) → «로그인» 기록이 수십 건 뻥튀기된다. 실제 로그인 행위 = `signInEmail` 성공 1회. |
| **manual logout** | `lib/session.tsx:139` | `async function logout() { if (!firebaseReady()) return; await logSessionEvent('logout','manual'); await signOutUser(); }` — **반드시 signOut 전에.** `apiAuthHeaders` 는 `getAuthClient()?.currentUser` 가 없으면 `'로그인이 필요합니다.'` 로 throw 한다(`lib/api-headers.ts:11`). signOut 후엔 토큰이 없어 기록이 통째로 유실된다. `Ctx.logout` 타입(`:37 logout: () => void`)은 그대로 두고 내부에서 `void (async () => …)()`. |
| **idle logout** | `lib/idle-logout.tsx` | `await logSessionEvent('logout','idle')` → `signOutUser()` |
| **정지 계정 강제 signOut** | `lib/session.tsx:94` | 기록하지 마라 — 사용자의 로그아웃 행위가 아니고, `app/api/staff/suspend/route.ts` 가 이미 정지 사실을 감사에 남긴다(중복). |
| **Auth hang 탈출** | `lib/session.tsx:159` | 기록하지 마라 — 토큰 상태 불명이라 `apiAuthHeaders` 가 throw 한다. |
| **DEV 모드 login** | `lib/session.tsx:128-138` | `firebaseReady()` false 경로 → 기록 없음(라우트가 `requireAuth` 로 `local` actor 를 돌려주긴 하지만 로컬 시드 데이터에 감사를 섞지 마라). |
| 탭 닫기 | — | **`beforeunload` 로 로그아웃 기록을 시도하지 마라.** 비동기 fetch 가 취소되고, 새로고침·탭이동과 구별이 안 되어 «로그아웃»이 거짓으로 쌓인다. 세션 종료는 유휴 만료로만 기록. |

### 3-5. ★기존 버그 — 본사 감사기록이 화면에서 보이지 않는다 (동시 수정)

`lib/staff-admin.ts:130` 은 `companyId: actor.companyId || '_hq'` 로 쓴다. 그런데 `app/audit/page.tsx:24 useEntityList('audit_logs')` → `lib/use-entity-lists.ts:26 companyId = sessionCo` → 본사는 `'__ALL__'` → `lib/store.ts:519-524` 가 **`COMPANIES` 배열(`lib/companies.ts:40` = switchplan·prime·sonogong)만 fan-out** 한다. `'_hq'` 는 그 배열에 없다.

→ **오늘 커서가 만든 계정콘솔 감사기록(`app/api/staff/{role,suspend,delete,reset-password}`)이 이미 전부 화면에 안 보인다.** 본사 로그인 감사도 같은 운명이 된다.

**수정 지시** (`app/audit/page.tsx`):
```ts
const { rows: coRows, loading, reload } = useEntityList('audit_logs');
const { rows: hqRows } = useEntityList('audit_logs', { companyId: '_hq' });   // isOperator 일 때만 의미
const raw = useMemo(() => (isOperator ? [...coRows, ...hqRows] : coRows), [coRows, hqRows, isOperator]);
```
`useEntityList` 는 `opts.companyId` 를 이미 지원한다(`lib/use-entity-lists.ts:19-27`). `firestore.rules:51` 의 `read: tenantOK(resource.data.companyId)` 는 `isHQ()` 로 통과하므로 **규칙 변경은 불필요하다.**
`'_hq'` 리터럴은 `lib/audit.ts` 에 `export const HQ_AUDIT_COMPANY = '_hq'` 로 올려 `lib/staff-admin.ts:130` 과 공유해라(문자열 중복 금지).

### 3-6. `lib/audit.ts` — 대상 라벨 보강

`app/audit/page.tsx:19 entLabel = (k) => ENTITIES[k]?.label || k`. `ENTITIES`(`lib/intake/entities.ts:39`)에 `auth_user`·`auth_session`·`audit_logs` 는 없다 → 「대상」 칸에 `auth_session` 이 영문 그대로 찍히고, `:41-45 entityChips` 페이셋에도 영문이 뜬다.
```ts
// lib/audit.ts
export const AUDIT_ENTITY_LABEL: Record<string, string> = { auth_user: '계정', auth_session: '세션' };
```
`app/audit/page.tsx:19` → `const entLabel = (k) => ENTITIES[k]?.label || AUDIT_ENTITY_LABEL[k] || k;`

---

## 4. 내가(Claude) 잡고 있는 파일 — 변경 «요청» 목록

★`firestore.rules` 와 `tests/rules/firestore.rules.test.ts` 는 **커서가 절대 수정하지 마라.** 아래는 사장님·나에게 올리는 요청이다.

| # | 파일 | 요청 | 이 오더에 **필수인가** |
|---|---|---|---|
| R1 | `firestore.rules:50-57` | audit_logs `create` 조건에 `request.resource.data.action != 'login' && request.resource.data.action != 'logout'` 추가. 세션 감사는 서버 Admin 경로(§3-3)로만 쓰이므로 클라이언트가 «남의 로그인처럼 보이는 기록»을 위조(byUid 는 자기 uid 로 고정되지만 label·at 은 자유)할 여지를 닫는다. | **아니오 — 강화 권고.** 없어도 오더는 동작한다 |
| R2 | `tests/rules/firestore.rules.test.ts` | R1 채택 시 «클라이언트가 action:'login' 으로 audit_logs 생성 시도 → assertFails» 케이스 1건 추가 (36 → 37) | R1과 함께 |
| R3 | `firestore.rules` | **변경 없음 확인.** `'_hq'` companyId 읽기·쓰기는 `isHQ()` → `tenantOK()`(`:16`) 로 이미 통과. §3-5 는 순수 클라이언트 수정 | — |
| R4 | `SECURITY.md:40-48` 표 | 「PII 마스킹」·「자동 로그아웃(유휴 30분)」·「세션 감사」 3행을 **완료**로 추가. 「원문 엑셀은 단일 법인 스코프에서만」 원칙을 `:56-59` 「원칙」 절에 1줄 추가 | 문서 반영(커서 아님) |
| R5 | `lib/finance/cash-cols.tsx:97`,`:104` | `values: [...MONEY_CLASS]` → `values: () => [...MONEY_CLASS]`. **이 오더가 아니라 커서의 진행 중 money-status 작업 소관.** 지금 tsc 를 빨갛게 만들고 있으니 그쪽에서 먼저 닫아야 한다 | 착수 전제(§0-2) |

---

## 5. 게이트 · 금지사항

### 게이트 (오더 완료 판정)
```
npx tsc --noEmit                # 0  (착수 전에도 0 이어야 한다 — §0-2)
npx vitest run                  # 235 → 244 이상 (pii 5 + idle-timer 5 신설)
npx vitest run tests/pii.test.ts tests/idle-timer.test.ts tests/sheet-export.test.ts tests/row-grammar.test.ts
npm run test:rules              # 36 (R1 미채택 시 36 유지, 채택 시 37)
```
`npm run build` **금지** — dev 6006 상시 실행 중. 화면 확인은 `http://localhost:6006` 으로.

### 금지사항 (근거 포함)
1. **`npm run build` 금지 · dev(6006) 죽이지 마라.**
2. **`SheetCol.text()` 마스킹 금지** — 검색·정렬·헤더필터·엑셀 4개 소비처가 물려 있다(`components/ui/excel-sheet.tsx:49,59` · `lib/sheet-export.ts:87`). 엑셀은 이중 마스킹된다.
3. **`components/ui/record-panel.tsx:108` 마스킹 금지** — `lib/pii.ts:3` 확정 규격(상세=원문).
4. **`components/PrintHost.tsx`(:133,:264-271,:294-296) · `components/PenaltyDocs.tsx`(:117-118) · `lib/doc-templates.ts` 마스킹 절대 금지** — 내용증명·과태료 공문·계약서·사실확인서는 상대를 특정해야 법적 효력이 있다.
5. **`components/NotifyDialog.tsx:97 tel: r.phone` · `lib/notify/recipients.ts:29` 마스킹 금지** — 발송 대상 번호.
6. **`app/search/page.tsx:22 customerKey(rec.name, rec.phone)` 마스킹 금지** — 라우팅 키. 고객360 이동이 깨진다.
7. **`lib/finance/account-cols.tsx:18` · `cash-cols.tsx:60,:218` 계좌·카드 화면 마스킹 금지** — 자기 법인 계좌, 자금대사 필수.
8. **세션 감사를 `getStore().save('audit_logs', …)` 로 쓰지 마라** — 본사 `companyId === '__ALL__'` 에서 `lib/store.ts:512` 가 throw 하고 `:395` 가 삼킨다.
9. **`signOutUser()` 전에 감사를 써라** — `lib/api-headers.ts:11` 이 `currentUser` 없으면 throw.
10. **`watchAuth` 콜백(`lib/session.tsx:72`)에 login 기록 금지** — 새로고침·새 탭·StrictMode 마다 발화.
11. **`setPersistence(browserSessionPersistence)` 금지** — 새 탭마다 재로그인이 되어 실무가 막힌다.
12. **`beforeunload` 로그아웃 기록 금지** — 새로고침과 구별 불가.
13. **`app/layout.tsx` 에 `IdleGuard` 마운트 금지** — 로그인 폼 입력 중 모달.
14. **자동 저장 금지** — 규칙 8(서버 성공 후 갱신)·규칙 6(새 자금 쓰기 경로 금지). 미저장 변경은 유예 + 경고 문구까지만.
15. **`useConfirm` 으로 유휴 경고창 만들지 마라** — `components/ui/confirm.tsx:26` 의 `pending` 은 단일 슬롯. 사용자가 열어 둔 확인창을 밀어낸다.
16. **셀에 아이콘·배지 추가 금지** — `--ledger-row-h: 30px`(모바일 34px). 폰트·패딩도 손대지 마라.
17. **`TwoLineCell` import 금지** (열 카탈로그) · **`lib/work-rail.ts workRailStyle` 사용 금지**(항상 undefined, 행 틴트·레일 금지).
18. **메뉴 IA 변경 금지** — `lib/nav.ts` · 좌측 메뉴 · 리스크 4그룹. 로그아웃은 `app/settings/page.tsx:156` 기존 「계정」 Panel 안의 ListRow 로.
19. **`firestore.rules` · `tests/rules/*` 수정 금지** — §4 요청으로만.
20. **차량번호 조인 규격** — 이 오더는 plate 조인을 만들지 않는다. 만들 일이 생기면 `lib/plate.ts` 의 `plateAliasesOf`/`plateAliasesFor`/`inPlateAliases` 를 쓰고 `normPlate(x) === np` 정확일치 금지.
21. **`--brand: #1B2A4A` 유지.**

### 신설 파일 목록 (7개)
```
lib/idle-timer.ts               순수 유휴 판정 (React·DOM 의존 0)
lib/dirty-guard.ts              미저장 변경 레지스트리
lib/idle-logout.tsx             'use client' — IdleGuard · useDirtyFlag
lib/audit-session.ts            'use client' — logSessionEvent
app/api/auth/audit/route.ts     세션 감사 서버 라우트
tests/pii.test.ts
tests/idle-timer.test.ts
```

### 수정 파일 목록 (13개)
```
lib/pii.ts                              §1-2 (수정3 + SCREEN_MASKERS·maskBizOrBirth·maskBirthDate 신설)
lib/audit.ts                            §3-5 HQ_AUDIT_COMPANY · §3-6 AUDIT_ENTITY_LABEL
lib/staff-admin.ts                      §3-3 writeSessionAudit 추가 · :130 상수화
lib/session.tsx                         :139 logout · :149 IdleGuard · :188 login 기록
components/ui/excel-sheet.tsx           §1-3 cellNode (:223,:224,:362)
components/ui/use-sheet-export.ts       §1-9 :105-107 isOperator → !scopeAll, :128 deps
components/NotifyDialog.tsx             §1-6 :153 표시만
components/ui/bottom-sheet.tsx          §2-4 useDirtyFlag
app/list/[entity]/page.tsx              §1-4 :43-49  ★최우선
app/search/page.tsx                     §1-5 :69
app/audit/page.tsx                      §1-7 :119 · §3-5 :24 · §3-6 :19
app/settings/page.tsx                   §1-8 :141 CSV 마스킹 · §2-4 :156 로그아웃 ListRow
app/company/[id]/page.tsx · app/asset/page.tsx · app/contract/page.tsx   §2-4 useDirtyFlag 1줄씩
```

### 오더 완료 보고에 반드시 적을 «잔여»
- 헤더필터 팝오버(`components/ui/excel-sheet.tsx:69 FilterPop`)의 값 목록에는 전화·면허 원문이 남는다 — `cellValues`(`:52`)를 마스킹하면 선택값과 실 데이터가 어긋나 필터가 전부 0건이 된다. 별도 설계 필요.
- git 히스토리의 과거 실 PII(`SECURITY.md:35`) — 별개 결정 사항.
- 유휴 로그아웃 시 편집 중 폼 내용 복구(sessionStorage 초안) — 이 오더 범위 밖.

---

## 공통 규약 (전 오더 적용)

먼저 **`docs/CURSOR-SPEC-UPDATE.md`** 를 읽어라 — 규격이 여러 번 바뀌었다.

- **게이트**: `npx tsc --noEmit`=0 · `npx vitest run`(현재 **248**, 줄면 안 됨) · `npm run test:rules`=36 ·
  건드린 라우트 `curl -s -o /dev/null -w "%{http_code}" http://localhost:6006/<경로>`=200
- 새 표를 만들면 **`tests/row-grammar.test.ts` 의 `SCREENS` 에 등록**하라.
- `npm run build` 금지(dev 6006 상시) · 메뉴·그룹 추가 금지(탭·views·필터로) · `--brand: #1B2A4A` 유지
- 열 순서 = 회사명(1)·식별자(2)·이름(3)·X분류(4)·X상태(5) · 표에서 2줄 셀 금지 · 행 높이 30/34px
- 차량번호 조인은 `lib/plate.ts` 별칭 헬퍼로(정확일치 신규 금지) · 상태 신호는 배지 색으로만
- 돈 2문서 쓰기 순서 `bank_tx → contract` · **새 자금 쓰기 경로 금지**(마감 3중 방어 우회)
- 서버 성공 후에만 화면·토스트 갱신(낙관적 갱신·무조건 성공 토스트 금지)
- **내가 잡고 있는 파일**은 손대지 말고 «요청 목록»으로 남겨라:
  `lib/store.ts` · `lib/company-master.ts` · `lib/finance/period-lock.ts` · `lib/finance/money-status.ts` ·
  `firestore.rules` · `app/api/entities/[entity]/route.ts` · `lib/payments/duplicate-cash.ts` ·
  `lib/plate.ts` · `lib/penalty-reassign.ts` · `app/settings/page.tsx`
