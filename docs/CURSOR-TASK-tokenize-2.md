# Cursor 작업지시 2차 — 잔여 하드코딩 색 · 손롤 스크림

> 1차(`CURSOR-TASK-tokenize.md`) 완료 후 남은 것. Claude가 1~4단계를 끝낸 상태.
> **1차 지시서의 규칙·매핑표를 그대로 따른다** — 여기엔 대상만 적는다.

## 1차 회고 (읽고 시작할 것)

1차에서 지시대로 정확히 해줬다. 다만 **내(Claude) 지시서에 누락이 있었다** — Vehicle360을 `:54` 한 줄만 적었는데
실제로는 5곳이 더 있었다. 이번엔 파일 단위로 적는다. **라인 번호는 참고용이고, 파일 전체를 훑을 것.**

## 규칙 (1차와 동일 + 추가)

- 색은 `C.*` 토큰만. 매핑표는 1차 지시서 참조.
- **치수·레이아웃·로직 건드리지 말 것.**
- 매핑표에 없는 색 → 임의로 고르지 말고 되물을 것.
- **추가:** 어떤 색이 "의도된 예외"로 보이면 (예: 어두운 스크림 위 흰 글자) 바꾸지 말고
  **주석으로 왜 예외인지 남길 것.** 토큰으로 바꾸면 오히려 깨지는 자리가 있다.
- 끝나면 `npx tsc --noEmit` → EXIT 0.

## 대상

### 1. `components/PenaltyDocs.tsx` — 인쇄 시트 잔여
1차에서 hex는 0이 됐지만 `sheet` 등 인쇄용 스타일 객체에 `rgb()`/`rgba()`가 남았는지 확인.
**인쇄(print) 전용 스타일이면 건드리지 말 것** — 프린터는 테마를 모른다. 화면용만 토큰화.

### 2. `components/NotifyDialog.tsx` — 손롤 헤더 밑줄
라인 123, 127 부근 `borderBottom` — 다이얼로그 헤더 구분선.
**Modal 원자가 이미 헤더를 그리는지 먼저 확인**하고, 그렇다면 손롤 헤더를 지우고 원자에 맡길 것.
아니라면 그대로 두고 한 줄 보고.

### 3. `app/dev/data/page.tsx` · `app/audit/page.tsx` — 인라인 th/td (dev 제외 해제)
라인 100~101 / 59~60의 인라인 `th`/`td` 스타일 객체를
`import { th, td } from '@/components/ui'` 로 교체.
※ `app/audit`은 1차에서 처리됐을 수 있음 — 이미 됐으면 스킵하고 보고.

### 4. 전역 스윕 — 남은 hex 찾기
```
grep -rnE "#[0-9a-fA-F]{3,6}\b" app components --include=*.tsx | grep -v node_modules
```
나온 것 중 **아래 제외 목록에 없는 것**만 매핑표대로 치환.
각 파일에서 몇 건 고쳤는지 표로 보고할 것.

## 하지 말 것 (제외 — 1차와 동일 + 추가)

- `components/PrintHost.tsx` — 인쇄 CSS. 27건 그대로 둘 것.
- `app/error.tsx`, `app/global-error.tsx` — 에러 바운더리, 원자 import 불가.
- `components/ui/**` — 원자. Claude 담당.
- **추가:** `components/Spinner.tsx` `LoadingOverlay`의 `'#fff'` —
  **의도된 예외.** 스크림이 항상 어두워서 흰색이 맞고, `var(--text-inverse)`로 바꾸면
  다크테마에서 어두운 색으로 뒤집혀 안 보이게 된다. 이미 주석 달아뒀다. 건드리지 말 것.
- **추가:** `components/SessionBar.tsx:58,108` · `app/payments/page.tsx:383` 의 `rgba(0,0,0,0.4)` 스크림 —
  오버레이 공용 원자로 접어야 하는 건이라 **Claude 담당.** 제외.

## 완료 기준

1. 제외 목록 밖 hex 0건 (위 grep으로 확인)
2. `npx tsc --noEmit` EXIT 0
3. `RENMAN-CURSOR.md` §5 핸드오프 로그 한 줄
4. **보고: 파일별 수정 건수 + "예외로 판단해 남긴 것" 목록**
   (남긴 이유를 한 줄씩 — 이게 다음 사람에게 제일 중요하다)
