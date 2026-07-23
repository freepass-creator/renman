// 대시보드 공용 상수/도우미 — 홈 렌즈·담당자 워크벤치·공유 훅이 같은 정의를 쓴다(SSOT).
// (홈 page.tsx에 흩어져 있던 TODAY·dday·IDLE·OUT을 한 곳으로.)
// ★ 페이지·컴포넌트에서 `const TODAY = new Date()…` 재선언 금지 — 여기만 import.
// IDLE/OUT 파티션 본문 = lib/domain/status (호환 re-export).
import { todayKST } from './contracts/dates';

// ★ 오늘은 KST 기준(todayKST). UTC toISOString 은 KST 00~09시에 하루 이르다 — 재선언 금지, 여기/todayKST만.
export { todayKST };
export const TODAY = todayKST();

/** ISO(yyyy-mm-dd) 대비 오늘까지 남은 일수. 음수=경과. 형식 아니면 null. */
export function dday(d: unknown): number | null {
  const s = String(d || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return Math.round((new Date(s.slice(0, 10)).getTime() - new Date(TODAY).getTime()) / 86400000);
}

export { IDLE, OUT, VEHICLE_IDLE, VEHICLE_OUT } from './domain/status';
