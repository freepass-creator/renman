# Cursor 작업지시 — 하드코딩 색상 토큰화 (안티패턴 Rule 4)

> Claude가 1단계(`tokens.tsx` 근원 수정)를 끝낸 상태. 이 문서는 **기계적 치환 노가다**만 담는다.
> 판단이 필요한 항목(원자 추출·구조 변경)은 Claude가 별도로 진행하므로 **여기 없는 파일은 건드리지 말 것.**

## 왜 하는가 (스킵 금지 이유)

`globals.css`에 다크모드 + 테마 5종(`sepia`/`cool`/`warm`/`mint`/`dark`)이 있다.
하드코딩 hex는 테마가 바뀌어도 그대로라 **다크모드에서 실제로 깨진다.** 스타일 취향 문제가 아니라 버그다.

## 규칙

- 색은 **`C.*` 토큰만**. hex·rgb 직접 사용 금지. (`import { C } from '@/components/ui'`)
- **치수·레이아웃·로직은 건드리지 말 것.** 이번 작업은 색상 치환 only.
- 매핑표에 없는 색이 나오면 **임의로 고르지 말고** 파일·라인 적어서 되물을 것.
- 끝나면 `npx tsc --noEmit` → **EXIT 0** 확인. 아니면 넘기지 말 것.

## 매핑표 (이대로만 치환)

| 하드코딩 | → 토큰 | 실제값 |
|---|---|---|
| `#fff` `#ffffff` `white` | `C.card` | `--bg-card` |
| `#111` `#18181b` `#33415a` | `C.ink` | `--text-main` |
| `#666` `#64748b` `#475569` | `C.mute` | `--text-sub` |
| `#94a3b8` | `C.faint` | `--text-weak` |
| `#e2e8f0` `#e4e4e7` | `C.line` | `--border` |
| `#cbd5e1` `#c4ccd8` `#d4d4d8` | `C.lineStrong` | `--border-strong` |
| `#f4f4f5` `#eef2f7` | `C.head` | `--bg-header` |
| `#f8fafc` `#f9f9fa` | `C.zebra` | `--bg-stripe` |
| `#d97706` `#ea580c` `#9a3412` | `C.warn` | `--orange-text` |
| `#fff7ed` | `'var(--orange-bg)'` | 토큰 없음 — 문자열 그대로 |

## 대상 파일 (이것만)

### 1. `components/PenaltyDocs.tsx` — 최우선, 최대 offender
라인 16,17,18,19,20,51,55,62,69,71,96,108. 슬레이트 팔레트 통째로 하드코딩, `C.*` 사용 0회.
`import { C } from '@/components/ui'` 추가하고 위 매핑표대로 전부 치환.

**주의:** 라인 62의 빈 상태 `<div style={{textAlign:'center',padding:40,...}}>매칭된 과태료가 없습니다…</div>` 는
**색만 바꾸고 구조는 그대로 둘 것.** `<EmptyState>` 교체는 Claude가 따로 한다.

### 2. `app/manage/page.tsx`
- 라인 13 `AGING_COLORS` — 원시 `#d97706`/`#ea580c` → `C.warn`
- 라인 45, 60 `background: '#fff'` → `C.card`

**주의:** 같은 라인 45,60에 있는 `border: 1px solid ${C.line}` **박스 래퍼는 건드리지 말 것** (Claude가 제거 예정).

### 3. `app/ingest/page.tsx`
라인 208, 217 — `#9a3412` → `C.warn`, `#fff7ed` → `'var(--orange-bg)'`, `#fff` → `C.card`

### 4. `app/list/[entity]/page.tsx`
라인 50 `color: '#cbd5e1'` → `C.lineStrong`

### 5. `app/audit/page.tsx` — 치환이 아니라 **재사용**
라인 59, 60의 인라인 `th`/`td` 스타일 객체를 지우고,
이미 존재하는 `import { th, td } from '@/components/ui'` 로 교체.
(`components/ui/tokens.tsx`에 이미 있는 것을 복붙해 둔 상태 = 재사용 위반)

### 6. `components/Vehicle360.tsx` / `DeliveryWizard.tsx` / `ReturnWizard.tsx`
`background: '#fff'` → `C.card` **한 곳씩만** (Vehicle360:54, DeliveryWizard:26, ReturnWizard:26).

**주의:** 같은 라인의 `height: 48` / `height: 32` 등 **숫자 높이는 절대 건드리지 말 것.**
Wizard 공용 원자 추출을 Claude가 진행 중이라 충돌난다.

## 하지 말 것 (명시적 제외)

- `components/PrintHost.tsx` — hex 27개 있지만 **인쇄 CSS라 정당.** 손대지 말 것.
- `app/error.tsx`, `app/global-error.tsx` — 프레임워크 에러 바운더리, 원자 import 불가. 제외.
- `app/dev/**` — dev 전용 툴링. 제외.
- `components/SessionBar.tsx`, `app/payments/page.tsx` 의 `rgba(0,0,0,0.4)` 스크림 — 오버레이 원자로 접어야 하는 건이라 Claude 담당. 제외.
- `components/ui/**` — 원자 자체. 1단계에서 Claude가 이미 정리함. 제외.

## 완료 기준

1. 위 6개 파일에서 매핑표 대상 hex가 0건 (`grep -nE '#[0-9a-fA-F]{3,6}'`로 확인)
2. `npx tsc --noEmit` EXIT 0
3. `RENMAN-CURSOR.md` §5 핸드오프 로그에 한 줄 추가
4. 육안 확인: `localhost:6006/manage`, `/ingest`, `/audit` 를 **라이트·다크 양쪽**에서 열어 깨진 곳 없는지
