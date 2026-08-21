/** 구글·회사 계정 ↔ 시트의 「담당」 이름.
 *  시트는 이름으로 담당을 적는다. 로그인은 메일로 한다. 그 둘을 잇는다.
 */
export type 사람 = { 메일: string; 이름: string; 대표?: boolean };

export const 사람들: 사람[] = [
  // 대표(2026-08-21): 「나는 다른 직원들 거 다 보여야지」 — 대표는 기본이 «전체»다
  { 메일: 'pyh@teamjpk.com', 이름: '박영협', 대표: true },
  { 메일: 'jpkpyh@gmail.com', 이름: '박영협', 대표: true },
  { 메일: 'pty@teamjpk.com', 이름: '박태윤' },
  { 메일: 'ksm@teamjpk.com', 이름: '권성민' },
  { 메일: 'kjs@teamjpk.com', 이름: '강지수' },
  { 메일: 'yyd@teamjpk.com', 이름: '양용득' },
  { 메일: 'sym@teamjpk.com', 이름: '성유민' },
];

export function 사람찾기(메일?: string | null): 사람 | null {
  if (!메일) return null;
  const m = String(메일).toLowerCase().trim();
  return 사람들.find((p) => p.메일.toLowerCase() === m) ?? null;
}

/** 이 사람이 남의 일까지 다 보나 */
export function 대표인가(메일?: string | null): boolean {
  return !!사람찾기(메일)?.대표;
}

/** 이름을 모르면 메일 앞부분이라도 보여준다 */
export function 이름추정(메일?: string | null, 표시이름?: string | null): string {
  return 사람찾기(메일)?.이름 || (표시이름 ?? '').trim() || String(메일 ?? '').split('@')[0];
}
