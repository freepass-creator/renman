// 대시보드 공용 상수/도우미 — 홈 렌즈·담당자 워크벤치·공유 훅이 같은 정의를 쓴다(SSOT).
// (홈 page.tsx에 흩어져 있던 TODAY·dday·IDLE·OUT을 한 곳으로.)
// ★ 페이지·컴포넌트에서 `const TODAY = new Date()…` 재선언 금지 — 여기만 import.

export const TODAY = new Date().toISOString().slice(0, 10);

/** ISO(yyyy-mm-dd) 대비 오늘까지 남은 일수. 음수=경과. 형식 아니면 null. */
export function dday(d: unknown): number | null {
  const s = String(d || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return Math.round((new Date(s.slice(0, 10)).getTime() - new Date(TODAY).getTime()) / 86400000);
}

// 유휴(세워둔 차) / 운영이탈(실제 처분=매각·말소만) 상태 집합 — 자산 분류 통일.
// 매각대기는 아직 "보유"(팔리기 전) → OUT 아님, 유휴(IDLE)로. (v5·자산페이지 총차량=보유 118과 일치)
// 정비·사고·검사는 repair로 따로 잡히므로 IDLE에 넣지 않음(중복 방지).
export const IDLE = new Set(['대기', '상품대기', '휴차', '유휴', '구매대기', '등록대기', '상품화', '연장대기', '종료대기', '매각대기']);
export const OUT = new Set(['매각', '말소']);
