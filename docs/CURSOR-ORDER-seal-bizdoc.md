조사 완료. 실제 파일·줄번호로 확인했고 코드는 손대지 않았다. 아래가 커서 오더다.

---

# 커서 오더 — ① 법인 직인(인감) 등록·문서 합성 ② 사업자등록증 OCR → 법인 마스터

브랜치 `redesign/pagedef-p0`. **읽기전용 조사 결과이며 구현은 커서가 한다.**

## 0. 착수 전 확인 — 게이트가 지금 빨간불이다

```
lib/finance/cash-cols.tsx(97,5)  error TS2322: '("계좌이체"|"CMS"|…)[]' is not assignable to '(row: CashRow) => string[]'
lib/finance/cash-cols.tsx(104,5) error TS2322: 동일 (상태 옵션 배열)
```

- 원인은 이 오더와 무관하다 — 병행 작업 중인 `components/ui/excel-sheet.tsx`(수정중)의 `Col` 필터옵션 타입이 함수 시그니처로 바뀌었고 `lib/finance/cash-cols.tsx`(수정중)가 아직 배열이다.
- **이 2건을 이 오더의 결과로 착각하지 말고, 이 오더 작업 중에 고치지도 마라**(같은 파일을 두 오더가 동시에 만지면 충돌). 착수 시점에 `npx tsc --noEmit`을 먼저 돌려 «기존 빨간불 2건»을 기록해 두고, 종료 시 그 2건 외에 늘어난 게 없어야 한다.

## 1. 조사 결론 (사실 — 전부 파일 확인)

### 1-1. jpkerp5 이식 판정

| 원본 | 판정 | 근거 |
|---|---|---|
| `D:\dev\jpkerp5\lib\seal-bg-remove.ts` (125행, `removeWhiteBackground`) | **거의 그대로 이식** | 순수 canvas. 흰배경 alpha 0 + soft alpha(58-63행) + bbox trim(82-92행) + `toBlob`/`toDataURL`(94-97행). renman 의존성 0 |
| `jpkerp5\app\companies\page.tsx:973-1107` `StampUploader` | **로직만 참고, UI 재작성** | v5 클래스 CSS(`btn btn-sm`·`var(--border)`) 사용 → renman 토큰 체계와 불일치. threshold 슬라이더(1073-1092행)·체크무늬 미리보기(1019-1027행) 아이디어는 채택 |
| `jpkerp5\components\notice\cert-document.tsx:256-266` + CSS `436-447` | **패턴 채택** | `.cd-seal img { width:42px; height:42px; object-fit:contain; transform:rotate(-4deg) }` · 미등록 시 `(직인생략)` 폴백 배지 |
| `jpkerp5\lib\types.ts:582-585` `stampUrl/stampFileName/stampUploadedAt` | **이식 금지** | renman 대응물 `lib/payments/types/company.ts:95-98`은 **죽은 타입**이다 — `Company`를 import하는 파일이 0개(`lib/payments/types.ts:9`의 re-export만 존재). 여기에 필드를 늘리면 아무 화면도 읽지 않는다 |
| `jpkerp5\lib\firebase\storage.ts` `uploadDocument`/`deleteDocumentByUrl` | **이식 금지** | renman은 `lib/storage.ts` `uploadDoc`+`docPath`가 SSOT(24-44행). 특히 **기존 도장 즉시 삭제**(v5 companies/page.tsx:993, 1011)는 절대 이식 금지 → §5 함정 T4 |

### 1-2. 살아있는 법인 신원 SSOT는 `CompanyMaster` 하나뿐

- `lib/company-master.ts:23-37` `CompanyMaster` — Firestore `company_master/{companyId}` 1문서 = 1법인. **법인이 3사면 문서가 3개**(`firestore.rules:64-68`)이므로 «도장 3종»은 배열 없이 자동 해결된다.
- 이 마스터를 읽어 **대외문서에 인쇄**하는 곳: `components/PrintHost.tsx:117,155,207,240,284` · `components/PenaltyDocs.tsx:71,110` · `app/docs/issue/page.tsx:54`.
- **★치명 발견**: 위 7개 호출부는 전부 `loadMaster()`(동기·localStorage)만 부르고 `ensureCompanyMasterHydrated()`(`lib/company-master.ts:164`)를 **아무도 부르지 않는다**. 하이드레이트하는 곳은 `app/company/[id]/page.tsx:39` 단 한 곳. → 법인정보를 입력하지 않은 PC에서 내용증명·과태료 공문을 뽑으면 대표·주소·사업자번호가 공란으로 인쇄된다. **직인도 같은 경로라, 이걸 안 고치면 «직인 등록했는데 다른 PC에서 안 찍히는» 버그가 그대로 재현된다.** → §3-B0 필수 작업

### 1-3. 새니타이저 충돌 — 정확한 사실

- `lib/docs/sanitize-html.ts:26` `DROP_WITH_CONTENT`에 `'img'`와 `'a'`가 있다 → **본문에 `<img>`를 넣으면 노드째 삭제**. `:23` `ALLOWED_ATTRS`에 `style`이 없어 인라인 배경도 불가.
- 반면 `:15` `ALLOWED_TAGS`에 `'span'`, `:23`에 `'class'`가 **살아있다**. 그리고 현재 양식 4종이 이미 `<span class="seal">印</span>`을 본문에 갖고 있다(`lib/doc-templates.ts:179, 226, 274, 321`) — 이 span은 새니타이저를 **통과한다**(단 `data-*`는 제거됨).
- 결론 = **본문은 손대지 않는다. 직인은 «본문 밖 레이어»(우리 코드가 쓰는 `<style>`)로 합성한다.** 상세·대안 비교는 §3-B1.

### 1-4. 사업자등록증 OCR — 서버는 이미 준비됐고 클라이언트가 0이다

- `app/api/ocr/extract/type-specs.ts:50-71` `business_reg` 스펙 존재(프롬프트 20행) + `app/api/ocr/extract/schemas.ts:61-87` `BUSINESS_REG_SCHEMA` 16필드(`required`에 16개 전부).
- 그런데 **`business_reg`를 호출하는 클라이언트가 없다**: `lib/intake/entities.ts`의 `ocrType` 선언은 5개(41·202·217·248·359행 = vehicle_reg/license/insurance_policy/rental_contract/penalty)뿐이고 `business_reg`는 없다.
- 따라서 `lib/ocr-client.ts:26-35` `mapOcrToEntity()`는 **쓸 수 없다** — `ENTITIES[entityKey].fields[].ocrFrom` 기반이라 엔티티가 없는 `business_reg`엔 매핑 대상이 0개. 매핑은 이 오더에서 명시적으로 손으로 쓴다(§3-C2).
- `lib/ocr-crosscheck.ts:200-208` 디스패처에 `business_reg` 케이스가 없어 **검산이 0**이다(default → `{level:'ok', confidence:100}`). `tests/ocr-crosscheck.test.ts:212-215`가 쓰는 미지원 타입은 `'unknown_type'`이므로 케이스를 추가해도 기존 테스트는 깨지지 않는다.
- OCR 라우트의 plate 후처리(`route.ts:139`)는 `business_reg`를 포함하지 않는다 — **건드리지 마라**(사업자등록증에 차량번호는 없다).

---

## 2. 아키텍처 결정 (이대로 구현. 임의 변경 금지)

**D1. 인쇄용 이미지 SSOT = `master.seal.dataUrl` (Firestore 인라인 `data:image/png;base64,…`). Storage URL로 인쇄하지 않는다.**
- 이유(3개, 전부 근거 있음):
  1. `app/docs/issue/page.tsx:87` · `app/docs/page.tsx:35`의 인쇄 팝업은 `window.onload` **250ms 뒤 `window.print()`**. 원격 이미지가 그 안에 못 오면 **직인 없이 인쇄된다**(사고가 조용히 난다).
  2. `lib/storage.ts:33`은 `getDownloadURL()`을 쓴다 → 토큰 포함 URL은 **로그인 없이 누구나 열 수 있는 링크**다. 법인 인감 이미지를 그런 링크로 상시 노출하면 문서 위조 재료를 뿌리는 셈. data URL은 `firestore.rules:64-65`(tenant/HQ만 read)로 보호된다.
  3. `firebasestorage` URL을 `fetch`→dataURL로 바꾸려면 버킷 CORS 설정이 필요하다(현재 저장소에 CORS 설정 파일 없음).

**D2. Storage에는 «원본 스캔»만 올린다 — `lib/storage.ts` `uploadDoc` + `docPath` 규약 그대로.**
- 경로: `docPath(companyId, 'company_master', 'seal', file.name)` → `docs/{companyId}/company_master/seal/{ts}_{name}`.
- `storage.rules:19-25`가 이 경로를 지배: 서명 필요 + 회사 격리 + `size<=20MB` + `contentType image/(jpeg|png|webp)|application/pdf` → **PNG/JPG 그대로 통과**. 새 규칙 추가 불필요(= rules 재배포 불필요).
- 원본 URL은 `master.seal.originalUrl`에 «감사·재처리용»으로만 보관. **인쇄 경로에서 절대 참조 금지.**

**D3. 크기 상한 — 누끼 결과를 최대변 300px로 축소하고 base64 64KB 초과면 재인코딩, 120KB 초과는 거부.**
- 이유: `company_master` 1문서에 차고지·증차신청·공문대장이 함께 들어 있고 `saveMaster`는 **전체 교체**(`lib/company-master.ts:135` `tx.set`). Firestore 1MB를 넘기면 저장이 실패하고 `lib/company-master.ts:94-96` 경로로 «이 PC에만 남았습니다»가 되면서 **직인이 서버에 영원히 안 올라간다.** 상한은 코드로 강제해야 한다.

**D4. 직인은 «발행 시점»에 봉인한다 — `issued_doc.sealVersion`(= 그때의 `seal.uploadedAt`)을 함께 저장.**
- 도장을 바꾼 뒤 옛 문서를 재인쇄하면 관청에 낸 원본과 다른 도장이 찍힌다. 그래서 (a) `sealVersion`이 **없는** 옛 문서는 지금까지처럼 `印` 자리표시자로 인쇄(과거 재현 충실), (b) 있는데 현재 직인과 다르면 재인쇄 화면에 «발행 시점 직인과 다름» 경고. `bodyHtml`을 동결하는 것과 같은 이유(`lib/docs/sanitize-html.ts:4-7`).

**D5. 자동 반영 금지 — OCR은 «확인 후 반영».** 근거는 §4.

---

## 3. 파일별 작업 지시

### A. 인감 등록 (법인 워크스페이스)

#### A1. 신설 `lib/seal-bg-remove.ts`
- `D:\dev\jpkerp5\lib\seal-bg-remove.ts`를 **그대로 복사**한 뒤 아래만 수정:
  - 상단 주석에 「renman: 인쇄는 dataUrl(Firestore 인라인)이 SSOT. blob은 Storage 원본 보관용」 한 줄 추가.
  - 반환 타입에 `scaledDataUrl: string` 추가 — 최대변 `maxSide`(기본 300px)로 축소한 PNG. `out` 캔버스를 한 번 더 `drawImage`로 줄여 만든다.
  - `threshold` 클램프는 여기서 하지 말고 A2의 순수 함수로 뺀다(테스트 대상).
- `document`/`canvas` 사용 파일이므로 **테스트 대상 아님**(vitest는 `environment:'node'` — `vitest.config.ts:12`).

#### A2. 신설 `lib/docs/seal.ts` — 순수 정책(테스트 대상, DOM·import 금지)
```ts
export type SealKind = '직인' | '사용인감' | '법인인감';
export type SealRec = {
  dataUrl: string;        // 인쇄 SSOT. data:image/png;base64,…
  w: number; h: number;   // 누끼 결과 픽셀(가로세로비 유지용)
  kind: SealKind;
  originalUrl?: string;   // Storage 원본 스캔(감사) — 인쇄에 쓰지 않는다
  originalName?: string;
  threshold?: number;     // 재처리 재현용
  uploadedAt: string;     // ISO — sealVersion(발행 시점 봉인)로도 쓰임
  uploadedBy?: string;
};
export const SEAL_MAX_BYTES = 120 * 1024;
export const SEAL_TARGET_BYTES = 64 * 1024;
export function clampThreshold(v: unknown): number;            // 180~250, 기본 235
export function isSafeSealDataUrl(s: unknown): boolean;        // ★아래 이유 필수
export function sealPrintCss(dataUrl: string, opts?: { size?: string }): string; // 불안전하면 '' 반환
```
- **`isSafeSealDataUrl`이 반드시 있어야 하는 이유(보안)**: `sealPrintCss`가 만드는 것은 `url("<dataUrl>")`이 들어간 **CSS 문자열**이고, 그 값의 출처는 `company_master`다. `firestore.rules:66`은 **그 법인 직원에게도 쓰기를 허용**한다 → 직원이 `") ; } body{…` 같은 문자열을 넣으면 인쇄 팝업 CSS를 탈취할 수 있고, `next.config.mjs:13`이 `style-src 'unsafe-inline'`이라 CSP가 막아주지 않는다.
  → 정규식 `^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$` **완전 일치** + 길이 `<= SEAL_MAX_BYTES*1.4` 검사. 하나라도 어긋나면 `false`, `sealPrintCss`는 `''`를 돌려주고 호출부는 `印`/`(인)` 폴백으로 간다. `svg+xml`·`http(s)`·`javascript:`는 전부 거부(SVG는 그 안에 스크립트가 들어간다).
- `sealPrintCss` 출력(정확히 이 구조):
```
.doc-paper[data-seal="1"] .seal{background:url("<dataUrl>") center/contain no-repeat;border-color:transparent;color:transparent;}
```
  → 본문의 `印` 글자와 붉은 원 테두리(`lib/doc-templates.ts:130`)를 **CSS로만** 가린다. 저장된 본문은 1바이트도 바꾸지 않는다.

#### A3. 신설 `lib/company-master-ext.ts` — 임시 브릿지 (커서가 `lib/company-master.ts`를 만지지 않기 위한 장치)
```ts
'use client';
// ★임시 브릿지 — Claude가 R1~R3을 lib/company-master.ts에 반영하면 이 파일의 타입 선언을 지우고
//   CompanyMaster 재수출만 남긴다. 그때까지 커서는 이 파일만 수정한다(company-master.ts 직접 수정 금지).
import { loadMaster, type CompanyMaster } from '@/lib/company-master';
import type { SealRec } from '@/lib/docs/seal';

export type BizProfile = { bizType?: string; bizItem?: string; openDate?: string; taxOffice?: string; taxEmail?: string; entityType?: 'corporate'|'individual' };
export type MasterExt = CompanyMaster & {
  seal?: SealRec;
  bizProfile?: BizProfile;
  bizRegDoc?: { url?: string; name?: string; at?: string };
};
export function loadMasterExt(companyId: string): MasterExt { return loadMaster(companyId) as MasterExt; }
export function sealOf(companyId: string): SealRec | undefined { return loadMasterExt(companyId).seal; }
```
- 이걸로 커서는 **R 대기 없이 착수**할 수 있다. `MasterExt`는 `CompanyMaster`에 대입 가능하므로 `saveMaster(id, next)` 호출도 타입 통과한다(객체 리터럴을 직접 넘기지 말고 `const next: MasterExt = {...}` 변수로 만들어 넘길 것 — excess property check 회피).

#### A4. 신설 `components/company/SealModule.tsx` — 등록 UI
- **부모의 `set()`으로만 값을 올린다. 자체 저장(saveMaster) 절대 금지.** 이유: `app/company/[id]/page.tsx:64-77`의 `save()`가 `baseUpdatedAt`(CAS) 기준값을 들고 있는 유일한 지점이다(`lib/company-master.ts:99-102, 128-133`). 모듈이 따로 저장하면 CAS 기준이 어긋나 **차고지·공문대장이 통째로 사라진다**.
- 흐름: `input[type=file] accept="image/png,image/jpeg"` → `validateDocument(f.name, f.type, new Uint8Array(await f.arrayBuffer()))`(`lib/file-security.ts:45`) → `removeWhiteBackground(f,{threshold})` → 미리보기(체크무늬 배경) → **「업로드」 누름** → `uploadDoc(new File([blob], …), docPath(id,'company_master','seal', f.name))` → 성공 후 `set({ seal: {...} })`.
- **토스트 문구는 사실 그대로**: 업로드 성공 시 `toast('직인 원본 업로드 완료 — 상단 「저장」을 눌러야 서버에 반영됩니다', 'success')`. `uploadDoc`이 `null`을 주면(`lib/storage.ts:36`) 에러 메시지 + `set()` **하지 않는다**(규칙 8: 서버 성공 후에만 화면 갱신).
- threshold 슬라이더(180~250, step 5) + 「재처리」 — 원본 `File`을 `useRef`에 붙잡아 재실행. 재처리는 Storage 재업로드 없이 dataUrl만 갱신할 수 있게 «미리보기 → 확정» 2단계로.
- 삭제: `useConfirm()`(패턴 = `components/CompanyRegistry.tsx:9,17`) → `set({ seal: undefined })`. **Storage 파일은 지우지 마라**(§5 T4).
- 종류 선택 `Select`: 직인 / 사용인감 / 법인인감 (기본 '직인'). 라벨은 「직인종류」가 아니라 **「직인분류」**로 써라 — 「종류」는 금지 어휘다(`tests/row-grammar.test.ts` BANNED 목록).
- 미등록 상태 안내 문구: 「직인 미등록 — 공문·내용증명이 (인) 자리표시자로 인쇄됩니다」.

#### A5. `app/company/[id]/page.tsx` — 3곳만 수정
1. **140행** `license` 모듈 스텁(`'사업자등록증·… 연동 예정.'`)을 `<LicenseModule m={m} set={set} companyId={id} />`로 교체. 그 안에 A4 `SealModule` + C의 사업자등록증 OCR 블록을 배치.
   → **`MODULE_CATALOG`(`lib/company-master.ts:42-49`)에 새 키를 추가하지 마라.** `license`(48행 「인허가 증빙」)가 이미 있고, 그게 이 기능의 정확한 자리다. 모듈 키 신설은 R 요청 사항.
2. **134-142행** `renderModule()`에 `LicenseModule` 분기 추가(기존 `if (key === 'license')` 줄을 대체). `companyId`를 인자로 넘기도록 `renderModule` 시그니처에 `id` 추가.
3. **96-105행** 법인 스위처 버튼에 직인 유무 표시: `sealOf(c) ? null : <span title="직인 미등록">·</span>` 수준의 **미세 표시**만. 여기에 표(DataTable)를 새로 만들지 마라(§6 금지 3).

---

### B. 문서 직인 합성

#### B0. (필수·선행) 마스터 하이드레이트 누락 수리 — 이걸 빼면 기능이 «내 PC에서만» 동작한다
- `components/PrintHost.tsx:51-84` 이펙트의 `Promise.all` 배열에 `ensureCompanyMasterHydrated(companyId)`를 추가하고(반환 무시), `setReady(true)`를 그 뒤에 두라. import는 7행에 `ensureCompanyMasterHydrated` 추가.
- `components/PenaltyDocs.tsx`: `useEffect`로 `ensureCompanyMasterHydrated(companyId)` → `hydrated` state. `ready`(31-32행) 조건에 `&& hydrated`를 곱해 **하이드레이트 전에는 문서를 그리지 않는다**(64행 「인쇄/PDF 저장」 버튼도 그때까지 `disabled`).
- `app/docs/issue/page.tsx`: `issuerId` 변경 이펙트에서 `ensureCompanyMasterHydrated(issuerId)` 호출 후 `master`를 다시 읽는다(54행). 하이드레이트 완료 전에는 128-129행 「인쇄/PDF」·「발급」 버튼 `disabled`.
- 근거: `lib/company-master.ts:145-148` 주석이 이미 이 설계를 요구하고 있는데 호출부가 안 따랐다.

#### B1. `lib/docs/sanitize-html.ts` — **수정 금지**. 충돌은 아래 방식으로 푼다
- **채택안: 본문 밖 레이어.** 저장 본문은 `<span class="seal">印</span>` 그대로 두고(새니타이저 통과: `:15` span, `:23` class), 인쇄를 조립하는 **우리 코드**가 (a) 래퍼 `div.doc-paper`에 `data-seal="1"`을 붙이고 (b) `sealPrintCss(dataUrl)`를 `<style>`에 넣는다. 이미지 데이터가 저장 본문을 **통과하지 않으므로 새니타이저와 무관**하고, 이미 발행된 문서도 마이그레이션 없이 합성된다.
- **기각안 ①「img 허용 태그 추가」** — 새로 생기는 위험을 명시한다: `DROP_WITH_CONTENT`(`:26`)에서 `img`를 빼면 **저장 본문이 임의 URL을 가리킬 수 있게 된다** → (ⓐ) 재인쇄할 때마다 외부 서버로 요청이 나가 «누가 언제 이 문서를 열었는지»가 새는 추적 픽셀, (ⓑ) 법인 직원이 다른 회사 직인 이미지를 본문에 심어 **동결 대외문서를 위조**, (ⓒ) 거대 data URL로 인쇄 팝업 마비. `img-src`가 `data: blob: https:`로 열려 있어(`next.config.mjs:14`) CSP 방어도 없다. → **금지**.
- **기각안 ②「style 속성 허용」** — `:22` 주석이 명시한 `url()`·`expression` 위험이 그대로 되살아난다. → **금지**.

#### B2. `lib/doc-templates.ts` — CSS 1줄만
- **130행** `.seal` 규칙에 `background-position:center; background-size:contain; background-repeat:no-repeat;`를 추가(빈 배경이면 아무 변화 없음). 붉은 원·`印`·크기(18mm)는 그대로 둔다 — 폴백이 자리표시자다.
- **179 / 226 / 274 / 321행 본문(`<span class="seal">印</span>`)은 절대 수정하지 마라.** 옛 발행 문서와 문자열이 어긋나면 재인쇄 조립이 갈라진다.

#### B3. `app/docs/issue/page.tsx` — 미리보기·인쇄·발급
- **54행** 뒤에 `const seal = sealOf(issuerId)` + `const sealCss = seal && isSafeSealDataUrl(seal.dataUrl) ? sealPrintCss(seal.dataUrl) : ''`.
- **87행 `print()`**: `<style>` 안의 `${DOC_PRINT_CSS}` 뒤에 `${sealCss}`를 붙이고, `<div class="doc-paper" style="position:relative"` 에 `${sealCss ? ' data-seal="1"' : ''}`를 추가.
- **193-198행 미리보기**: `<style dangerouslySetInnerHTML>`에 `DOC_PRINT_CSS + sealCss`, `.doc-paper` div에 `data-seal={sealCss ? '1' : undefined}`. → 발급 전에 화면에서 직인 위치를 확인할 수 있어야 한다.
- **98-110행 `commitSave`**: `records[0]`에 `sealVersion: seal?.uploadedAt || ''`, `sealKind: seal?.kind || ''` 추가. `bodyHtml`(107행 `sanitizeDocHtml`)은 **그대로**.
- 직인 미등록이고 `template.category`가 `'대외' | '행정' | '법무'`면 발급 버튼 위에 `<Message variant="warning">직인 미등록 — 관청·보험사 제출 문서는 반송될 수 있습니다</Message>`. **발급을 막지는 마라**(직인생략 공문도 실무에 있다).

#### B4. `app/docs/page.tsx` — 재인쇄
- **30-37행 `reprint(d)`**: `d.sealVersion`이 있을 때만 직인을 합성한다.
  ```
  const seal = sealOf(d.companyId || companyId);
  const same = !!seal && !!d.sealVersion && seal.uploadedAt === d.sealVersion;
  const css = same && isSafeSealDataUrl(seal!.dataUrl) ? sealPrintCss(seal!.dataUrl) : '';
  ```
  `sealVersion`이 없는 옛 문서 → `印` 그대로(과거 재현). `sealVersion`이 있는데 현재 직인과 다르면 → 직인 없이 인쇄 + `toast('발행 시점 직인과 현재 직인이 다릅니다 — 직인 없이 재인쇄합니다','error')`.
- **48-55행 `cols` 배열은 손대지 마라.** 이 표는 라벨이 「분류」·「대상」(금지 어휘)이라 행 문법을 이미 어기고 있지만 `tests/row-grammar.test.ts`의 `SCREENS`에 등록돼 있지 않다. 여기에 열을 더하거나 `SCREENS`에 등록하면 **58건 테스트가 즉시 빨간불**이 되고 그 정리는 이 오더의 범위가 아니다.

#### B5. 신설 `components/DocSeal.tsx` — React 문서용 원자
```tsx
export function DocSeal({ companyId, size = 46 }: { companyId: string; size?: number }) // <img> 또는 '(인)'
```
- `sealOf` + `isSafeSealDataUrl` 통과 시 `<img src={dataUrl} alt="" style={{ width:size, height:size, objectFit:'contain', transform:'rotate(-4deg)', verticalAlign:'middle', marginLeft:6 }} />`, 아니면 `<span>(인)</span>`.
- **토큰(`C.*`) 사용 금지 — px 하드코딩.** 근거: `components/PenaltyDocs.tsx:16-21` 주석(A4 종이는 테마를 따라가면 인쇄 시 흰 글자가 된다).
- 적용 지점(각 `(인)` 텍스트를 `<DocSeal companyId={co} />`로 교체):
  - `components/PrintHost.tsx:148`(내용증명) `:199`(정산서) `:232`(영수증) `:277`(과태료 공문) `:320`(계약서)
  - `components/PenaltyDocs.tsx:104`(변경부과 요청 공문) `:134`(사실확인서)
- `PrintHost`는 이벤트 오버레이(16-17행)라 `@media print`가 이미 잡혀 있다(92행) — 별도 인쇄 CSS 불필요.

---

### C. 사업자등록증 OCR → 법인 마스터 (확인 후 반영)

#### C1. 신설 `lib/biz-no.ts` — 순수(테스트 대상)
```ts
export function normBizNo(v: unknown): string;        // 숫자만 10자리
export function fmtBizNo(v: unknown): string;         // 123-45-67890
export function isValidBizNo(v: unknown): boolean;    // 국세청 체크섬
export function normCorpNo(v: unknown): string;       // 숫자만 13자리
```
- 체크섬(사업자등록번호 10자리 `d1..d10`): 가중치 `[1,3,7,1,3,7,1,3,5]`로 `d1..d9` 가중합 → `sum += Math.floor(d9*5/10)` → `check = (10 - sum%10) % 10` → `check === d10`.
- 이게 이 오더에서 가장 값싼 안전장치다 — **1↔7, 0↔8 오독을 결정적으로 잡는다.** 법인등록번호는 **형식(13자리)만** 검사하고 체크섬을 만들지 마라(확립된 공개 알고리즘 없음 — 추측 금지).

#### C2. `lib/ocr-crosscheck.ts` — `crosscheckBusinessReg` 추가
- 기존 헬퍼(`str` :36, `summarize` :44-54) 재사용. 발생 규칙(전부 `warn`, **저장·반영을 막지 않는다** — `:9` 원칙):
  - `biz_no`가 없음 / 10자리 아님 / **체크섬 불일치** → 「사업자등록번호 검산 실패 — 자릿수 오독 의심」
  - `entity_type==='corporate'`인데 `corp_no`가 13자리 아님
  - `ceo` 또는 `ceo_type` 값이 라벨 텍스트 그 자체(`대표자`·`대표유형`·`성명`·`법인명`·`상호`)와 같음 → 「라벨을 값으로 읽었을 가능성」. **근거: `schemas.ts:67-68`이 Gemini에게 「라벨 텍스트를 값으로 절대 가져오지 말 것」을 명령하고 있다 = 실제로 그 오독이 있었다는 뜻**
  - `open_date`/`issue_date`가 `YYYY-MM-DD`가 아님, 또는 `issue_date < open_date`
  - `partner_name`이 비었음
- **200-208행 디스패처에 `case 'business_reg': return crosscheckBusinessReg(raw);` 추가.**

#### C3. `components/company/BizRegImport.tsx` (신설) — 「확인 후 반영」 화면
- 업로드는 **기존 원자 재사용**: `<DocUpload ocrType="business_reg" storeAt={{ company: id, entity:'company_master', key:'license' }} accept=".pdf,.jpg,.jpeg,.png,.webp" onDone={…} />`(`components/ui/doc-upload.tsx:36-102`). 손롤 `<input type=file>` 금지.
- 반영 UI는 `components/InfoDoc.tsx:82-107`의 `pending`/`confirm` 패턴을 그대로 따른다 + `<OcrCrosscheck result={…} />`(`components/ui/misc.tsx:251`).
- **반영 대상 매핑(손으로 쓴다 — `mapOcrToEntity` 사용 불가, §1-4)**:

| OCR 키 | 반영 위치 | 비고 |
|---|---|---|
| `biz_no` | `master.bizNo` | `fmtBizNo`로 정규화해 제안, 원문도 함께 보여줌 |
| `corp_no` | `master.corpNo` | |
| `ceo` | `master.ceo` | |
| `hq_address` \|\| `address` | `master.address` | 「본점 소재지」 우선 — 마스터 필드가 본점(`company-master.ts:31`) |
| `industry` / `category` / `open_date` / `tax_office` / `email` | `bizProfile.*`(A3 브릿지) | R2 반영 전까지 브릿지에 보관 |
| `entity_type` | `bizProfile.entityType` | |
| `partner_name` | **반영 금지** | 법인명 SSOT는 `lib/companies.ts:14-18`(`label`/`short`)·`localStorage`다. OCR로 덮으면 원장·뱃지 표시명 체계가 깨진다(`lib/companies.ts:78-89`). 화면엔 「현재 법인명과 다름」 **비교 표시만** |
| `single_tax_flag` / `issue_reason` | **미반영** | 대응 칸 없음 — 「미반영(칸 없음)」 목록에 노출해 사용자가 버려짐을 알게 |

- 각 행 = `[체크박스] 항목 · 현재값 → 제안값`. 기본 체크는 **현재값이 비어 있는 항목만**. 값이 이미 있는 항목은 **기본 해제**(사람이 의도적으로 켜야 덮어쓴다).
- 「반영」 버튼 = 부모 `set(patch)` 호출만. **저장은 상단 「저장」 버튼(CAS)** — 문구로 명시하라: 「반영됨 — 상단 「저장」을 눌러야 서버에 기록됩니다」.
- 원본 파일은 `onDone.url`을 `bizRegDoc`에 보관(`{url, name, at}`).

#### C4. 테스트 신설
- `tests/biz-no.test.ts` — 체크섬 유효/무효(자리 1개 바꿔 실패 확인)·하이픈·전각·빈값·11자리.
- `tests/seal-print.test.ts` — `isSafeSealDataUrl`: 정상 PNG data URL 통과 / `data:image/svg+xml` 거부 / `http://…` 거부 / `") } body{display:none` 같은 이탈 문자열 거부 / 길이 초과 거부. `sealPrintCss`: 불안전 입력 → `''`, 정상 → 문자열에 `[data-seal="1"]`과 `no-repeat` 포함.
- `tests/ocr-crosscheck.test.ts`에 `crosscheckBusinessReg` describe 추가 — 체크섬 실패 → `warn`, 라벨텍스트 `ceo` → `warn`, 정상 → `ok`/`confidence 100`. **기존 205-215행 디스패처 테스트는 수정 금지.**
- `sanitizeDocHtml`은 node 환경에서 항상 `''`를 반환한다(`lib/docs/sanitize-html.ts:54`) → **새니타이저 단위 테스트를 만들지 마라**(jsdom 도입은 범위 밖).

---

## 4. 왜 «자동 반영»이 아니라 «확인 후 반영»이어야 하는가 (오더에 명시된 요구)

1. **여기서 읽은 값이 곧바로 대외문서에 인쇄된다.** `bizNo`→`PrintHost.tsx:169,230,251,291`·`PenaltyDocs.tsx:80`, `ceo`→`PrintHost.tsx:133,148,199,232,277,320`, `address`→`PrintHost.tsx:133,231,251`. 사업자번호 한 자리가 틀린 내용증명·거래사실확인서는 **관청·보험사가 반송**하고, 이미 발송된 건은 문서로서 무효가 된다.
2. **검산이 이제야 생긴다.** 지금까지 `business_reg`는 교차검증 대상이 아니었다(`ocr-crosscheck.ts:200-208` default). C2를 넣어도 검산은 **경고**일 뿐 정답 보증이 아니다 — 최종 판단은 사람.
3. **Gemini가 라벨을 값으로 읽은 전력이 스키마에 박제돼 있다.** `schemas.ts:67-68`의 강조 경고(「라벨 텍스트 자체를 값으로 절대 가져오지 말 것」)가 그 증거다. 자동 반영이면 대표자 칸에 「대표유형」이 들어간 채 공문이 나간다.
4. **저장이 «전체 교체 + CAS»다.** 자동 반영이 저장까지 하면 `lib/company-master.ts:69-76`이 경고하는 바로 그 사고(차고지·증차신청·공문대장 전사 소실)를 OCR이 트리거하게 된다. 사람이 「저장」을 누르는 지점을 유지해야 CAS 기준값이 맞는다.
5. **법인명은 OCR이 소유하지 않는다**(§C3 표) — 자동 덮어쓰기가 구조적으로 틀린 필드가 섞여 있다.

---

## 5. 함정 (근거 = 파일:줄)

- **T1 인쇄 타이밍**: `app/docs/issue/page.tsx:87`·`app/docs/page.tsx:35`는 `window.onload` + **250ms**에 인쇄한다. 원격 URL 이미지를 쓰면 조용히 직인 없이 인쇄된다 → 반드시 data URL(§D1). `setTimeout` 값을 늘려 «해결»하려 들지 마라(경합은 남는다).
- **T2 다운로드 URL은 공개 링크**: `lib/storage.ts:33` `getDownloadURL`. 인감 원본 URL을 문서 본문·로그·엑셀 내보내기에 절대 싣지 마라.
- **T3 Drive 미러**: `lib/storage.ts:10-22` — `NEXT_PUBLIC_DRIVE_MIRROR=1`이면 업로드 파일이 회사 Google Drive로 **자동 복사**된다. 인감 스캔도 복사된다는 사실을 UI 안내문에 1줄 넣어라(「원본은 회사 보관 드라이브에도 사본이 남습니다」). `uploadDoc` 시그니처를 바꿔 미러를 끄는 건 **하지 마라**(다른 오더가 같은 파일을 쓰고 있다).
- **T4 옛 도장 파일 삭제 금지**: v5는 교체 즉시 지웠다(`jpkerp5\app\companies\page.tsx:993, 1011`). renman에서 그러면 (a) 저장이 CAS 충돌로 거부됐을 때 되돌릴 원본이 없고, (b) `sealVersion`으로 발행 이력을 추적하는 D4가 무의미해진다. **Storage 파일은 누적 보관, 마스터의 포인터만 교체.**
- **T5 Firestore 문서 크기**: §D3. 상한을 코드로 강제하지 않으면 실패가 `lib/company-master.ts:94-96` 「이 PC에만 남았습니다」로 위장된다.
- **T6 CSS 주입**: §A2 `isSafeSealDataUrl`. `style-src 'unsafe-inline'`(`next.config.mjs:13`)이라 CSP는 방어선이 아니다.
- **T7 `data-*`는 본문에서 살아남지 못한다**: `sanitize-html.ts:23` `ALLOWED_ATTRS`에 없다. `data-seal`은 **우리 코드가 쓰는 래퍼 div**에만 붙여라(본문 안에 넣으면 조용히 사라져 직인이 안 찍힌다).
- **T8 하이드레이트 누락**: §B0. 이걸 안 하면 QA가 「내 PC에선 되는데」로 끝난다.
- **T9 `issued_doc`은 서버 라우트가 없다**: `app/api/entities/[entity]/route.ts:58`이 `ENTITIES`에 없는 엔티티를 404로 거부하고 `lib/store.ts:253-266`이 404를 «일시 실패»로 보아 클라이언트 직접 경로로 폴백한다 → 발급이 동작하는 이유. **여기에 손대지 마라**(고치는 순간 발급 경로가 바뀐다). `sealVersion`은 자유 필드로 그냥 실린다.
- **T10 `lib/payments/types/company.ts:95-98`은 함정 그 자체**: 「stampUrl 주석만 있고 import 0건」의 실체 = 죽은 타입. 여기 필드를 늘려도 아무 것도 동작하지 않는다.

## 6. 금지사항

1. `lib/company-master.ts` **직접 수정 금지** (Claude가 잡고 있음). 필요한 변경은 §7 요청 목록 → A3 브릿지로 우회.
2. `lib/docs/sanitize-html.ts` 수정 금지(`ALLOWED_TAGS`/`ALLOWED_ATTRS`/`DROP_WITH_CONTENT` 전부).
3. **새 표(DataTable/ExcelSheet) 신설 금지.** 만들면 `tests/row-grammar.test.ts` `SCREENS` 등록 의무가 발동한다. 직인 등록 현황은 폼·배지로 표현.
4. `TwoLineCell` import 금지 · `--ledger-row-h`(데스크톱 30px/모바일 34px) 변경 금지 · 폰트·패딩 확대 금지.
5. **메뉴 IA 변경 금지** — `lib/nav.ts`·`MODULE_CATALOG` 키 추가 금지. 기존 `license` 모듈 안에서 해결.
6. 행 틴트·좌측 레일 금지(`lib/work-rail.ts` `workRailStyle`은 항상 `undefined` 유지). 직인 유무는 배지·아이콘으로만.
7. 자금 경로 무관 — `bank_tx`/`card_tx`·`/api/entities`·`firestore.rules`·`storage.rules` **일절 손대지 마라**(rules 재배포 불필요하도록 §D2를 잡았다).
8. 낙관적 갱신·무조건 성공 토스트 금지(§A4).
9. `npm run build` 금지(dev 6006 상시). `--brand:#1B2A4A` 불변.
10. `app/admin/page.tsx`·`components/ui/excel-sheet.tsx`·`lib/finance/cash-cols.tsx`·`app/cash/page.tsx` **접근 금지**(병행 오더가 수정 중).

## 7. 게이트 (작업 후 전부 통과해야 제출)

```
npx tsc --noEmit          # 착수 시점의 기존 2건(cash-cols) 외 0
npx vitest run            # 235 → 235 + 신규(biz-no · seal-print · business_reg 검산). 기존 235건 중 1건도 깨지면 안 됨
npm run test:rules        # 36 유지 (rules 미변경이므로 숫자 그대로여야 정상)
```
수동 확인(dev 6006):
1. `/company/switchplan` → 「인허가 증빙」 모듈 추가 → 도장 스캔 업로드 → 누끼 미리보기 → 저장 → **새로고침 후에도 유지**.
2. `/docs/issue` 위임장 → 우측 미리보기 발신인란에 직인 합성 → 「인쇄/PDF」 팝업에도 직인이 **처음부터** 찍혀 있음.
3. 「발급」 → `/docs` 「재인쇄」 → 직인 유지. 직인을 교체한 뒤 같은 문서 재인쇄 → 「발행 시점 직인과 다름」 경고 + 직인 없이 인쇄.
4. `/work` 과태료 → 변경부과 문서 → 공문·사실확인서 하단이 `(인)` → 직인 이미지로 바뀜.
5. 다른 브라우저 프로필(= 빈 localStorage)로 로그인 → 위 문서들에 대표·사업자번호·**직인**이 정상 인쇄(= B0 검증).
6. `company_master`에 손으로 `seal.dataUrl = 'data:image/svg+xml,…'`를 넣어도 직인이 **찍히지 않고** `(인)`으로 폴백(= T6 검증).

## 8. 「Claude가 잡고 있는 파일」에 필요한 변경 — 요청 목록 (커서는 손대지 말 것)

| # | 파일 | 변경 | 왜 |
|---|---|---|---|
| **R1** | `lib/company-master.ts:23-37` `CompanyMaster` | `seal?: SealRec;` 추가(타입은 `lib/docs/seal.ts`에서 import) | 인감의 정식 거처. `stampUrl?: string` 평문 URL로 넣지 말 것 — 인쇄는 dataUrl이 SSOT이고 종류(직인/사용인감/법인인감)·업로더·버전을 함께 봉인해야 한다(§D1·D4) |
| **R2** | 동 파일 동 타입 | `bizProfile?: { bizType?; bizItem?; openDate?; taxOffice?; taxEmail?; entityType? }` 추가 | 사업자등록증 OCR이 뽑는 업태·종목·개업일·세무서·전자세금계산서 이메일이 지금은 **버려진다**(마스터에 칸이 없음). 세금계산서·거래처 등록 요청 때 매번 등록증을 다시 뒤진다 |
| **R3** | 동 파일 동 타입 | `bizRegDoc?: { url?; name?; at? }` 추가 | `license` 모듈(48행)이 「사업자등록증 보관」을 이미 약속했는데 저장 칸이 없다 |
| **R4** | 동 파일 `saveMaster`(78-97행) | 저장 전 `JSON.stringify(m).length` 상한 검사(예: 700KB) → 초과 시 `{ok:false, message:'…직인 이미지가 너무 큽니다…'}` 조기 반환 | 현재는 Firestore 1MB 초과가 catch(139-142행)로 흘러 「이 PC에만 남았습니다」로 위장된다. 커서가 클라이언트에서 상한을 걸어도(§D3) 서버측 최후 방어가 필요 |
| **R5** | 동 파일 `MODULE_CATALOG`(42-49행) | (선택) `license` 모듈 설명을 「사업자등록증(OCR)·법인 직인·정관·등기부」로 갱신 | 기능이 붙은 뒤 카탈로그 설명이 실제와 어긋난다. **키 추가는 아님** |
| **R6** | `lib/payments/types/company.ts:95-98` | (선택) `stampUrl/stampFileName/stampUploadedAt` 3줄 **삭제** + 「인감은 `CompanyMaster.seal`」 주석 | 죽은 타입에 남은 v5 잔재가 다음 사람을 또 여기로 유인한다(T10) |

R1~R3이 반영되면 커서는 `lib/company-master-ext.ts`(A3)의 타입 선언을 지우고 `CompanyMaster` 재수출만 남기는 후속 정리를 한다 — **그때까지 브릿지로 진행하므로 착수는 대기하지 않는다.**

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
