/**
 * 행문법 SSOT — 「어느 페이지를 가도 같은 자리에 같은 성격의 칸이 있다」를 코드로.
 *
 * ## 왜 있나
 *   이 규격은 그동안 **주석에만** 있었다(ledger-ext 헤더 · risk-cols 106번 줄 ·
 *   redesign.mdc). 주석은 빌드를 못 깨므로 새 원장을 만들 때마다 사람이 손으로 맞춰야 했고,
 *   어긋나도 사장님이 화면에서 발견할 때까지 아무도 몰랐다.
 *   `tests/ledger-grammar.test.ts` 가 전 원장을 가로질러 이 규칙을 강제한다.
 *
 * ## 앞 5칸은 전 원장 동일 (사장님 확정 2026-08-07)
 *   ```
 *   [1] 회사명 · [2] 차량번호 · [3] 차명 · [4] X분류 · [5] X상태 · 그 뒤로 필요한 것
 *   ```
 *   여기까지는 **어느 원장을 열어도 똑같다.** 계약번호·계약자·금액처럼 원장마다 다른 것은
 *   6번 칸부터. 눈이 늘 같은 자리를 보므로 화면을 옮겨도 다시 찾지 않는다.
 *
 *   · 1번은 언제나 `company`. 여러 법인이 한 표에 섞이므로 «누구 것인지»가 먼저다.
 *   · 2·3번은 차량 신원. 사유·제목·금액을 이 자리에 두지 않는다.
 *   · 분류 바로 뒤에 상태. 둘은 «쌍»이라 떨어지면 눈이 다시 찾아야 한다.
 *   · 라벨은 「X분류 / X상태 / X내용」 — X는 원장 이름(리스크분류·업무상태·일정내용).
 *     「구분」·「세부」·「상태」 같은 맨 이름은 규격 위반이다.
 *
 * ## 예외
 *   **차량을 다루지 않는 원장**(임직원 등)은 2·3번이 그 원장의 신원이다(이름·이메일).
 *   차량 원장인데 차명이 없으면 «차명 칸을 만들어라»가 답이지 예외가 아니다 —
 *   일정 원장이 그랬고, 차량 원장에서 차명을 붙여 해결했다(lib/agenda.ts).
 */
import type { SheetCol } from '@/components/ui';

/** 1번 칸 key — 전 원장 공통. */
export const GRAMMAR_COMPANY_KEY = 'company';

/**
 * 앞 5칸 고정 라벨. 4·5번은 원장 이름이 접두로 붙으므로 정규식으로 본다.
 * (라벨로 검사한다 — key 이름은 원장마다 다르다: 운영 `car` / 자산 `carName`.)
 */
export const FIXED_HEAD_LABELS = ['회사명', '차량번호', '차명'] as const;

/** 신원 블록(1번 칸 뒤 ~ 분류 앞)에 허용되는 칸 수. */
export const GRAMMAR_IDENTITY_MIN = 1;
export const GRAMMAR_IDENTITY_MAX = 2;

export const CLASS_LABEL = /분류$/;
export const STATUS_LABEL = /상태$/;
export const CONTENT_LABEL = /내용$/;

/** 「X분류」·「X상태」·「X내용」 — 맨 이름(접두 없음)은 규격 위반. */
export const BARE_LABELS: ReadonlySet<string> = new Set(['분류', '상태', '내용', '구분', '세부']);

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 기본보기 열 배열이 행문법을 지키는지 검사. 위반 문장 배열(빈 배열 = 통과).
 * @param vehicleLedger 차량을 다루는 원장이면 앞 5칸(회사명·차량번호·차명·분류·상태)까지 강제한다.
 *                      아니면(임직원 등) 회사명 + 분류·상태 쌍만 본다.
 */
export function checkRowGrammar(cols: SheetCol<any>[], vehicleLedger = true): string[] {
  const bad: string[] = [];
  const label = (c: SheetCol<any>) => (typeof c.label === 'string' ? c.label : '');

  if (!cols.length) return ['열이 없다'];

  // [1] 회사
  if (cols[0].key !== GRAMMAR_COMPANY_KEY) {
    bad.push(`1번 칸이 ${GRAMMAR_COMPANY_KEY} 가 아니다 (지금 ${cols[0].key})`);
  }

  // 분류·상태 쌍
  const classIdx = cols.findIndex((c) => CLASS_LABEL.test(label(c)));
  if (classIdx < 0) {
    bad.push('「…분류」 칸이 없다');
    return bad;
  }
  const statusIdx = classIdx + 1;
  const next = cols[statusIdx];                   // 분류가 마지막 열이면 undefined
  if (!next || !STATUS_LABEL.test(label(next))) {
    bad.push(`분류(${label(cols[classIdx])}) 바로 뒤가 「…상태」가 아니다 (지금 ${next ? label(next) : '없음'})`);
  }

  // 신원 블록 = 1번 칸 뒤 ~ 분류 앞
  const identity = classIdx - 1;
  if (identity < GRAMMAR_IDENTITY_MIN || identity > GRAMMAR_IDENTITY_MAX) {
    bad.push(`신원 칸이 ${identity}개다 (${GRAMMAR_IDENTITY_MIN}~${GRAMMAR_IDENTITY_MAX}개여야 한다)`);
  }

  // 앞 5칸 고정 — 차량 원장은 회사명·차량번호·차명이 1~3번이고 그다음이 분류·상태.
  if (vehicleLedger) {
    FIXED_HEAD_LABELS.forEach((want, i) => {
      const got = cols[i] ? label(cols[i]) : '';
      if (got !== want) bad.push(`${i + 1}번 칸이 「${want}」가 아니다 (지금 「${got || '없음'}」)`);
    });
    if (classIdx !== FIXED_HEAD_LABELS.length) {
      bad.push(`분류가 ${classIdx + 1}번 칸이다 — ${FIXED_HEAD_LABELS.length + 1}번이어야 한다`);
    }
  }

  // 내용은 상태 뒤 — 신원 자리에 사유·제목을 두지 않는다
  for (let i = 0; i <= classIdx; i += 1) {
    if (CONTENT_LABEL.test(label(cols[i]))) {
      bad.push(`「${label(cols[i])}」가 상태보다 앞에 있다 — 내용은 분류·상태 뒤로`);
    }
  }

  // 맨 이름 라벨 금지
  for (const c of cols) {
    if (BARE_LABELS.has(label(c))) bad.push(`라벨 「${label(c)}」는 접두가 없다 — 「X${label(c)}」로`);
  }

  return bad;
}
