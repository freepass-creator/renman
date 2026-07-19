'use client';
// 햅틱 — 모바일 네이티브 촉감. navigator.vibrate 래퍼(미지원·SSR·데스크톱 무해 no-op).
//   웹에선 대부분 무시되지만 모바일 크롬/안드로이드에서 탭·전환·성공/실패를 손끝으로 느끼게.
//   패턴은 짧게(과하면 거슬림): 탭 8~12ms, 전환 6ms, 성공 짧은2연, 실패 굵은2연.
function buzz(pattern: number | number[]): void {
  if (typeof window === 'undefined') return;
  try {
    const nav = window.navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    nav.vibrate?.(pattern);
  } catch { /* 미지원 무시 */ }
}

export const haptic = {
  tap: () => buzz(9),          // 일반 탭(버튼·행)
  select: () => buzz(14),      // 선택·토글
  nav: () => buzz(6),          // 화면 전환(탭바·이동)
  back: () => buzz(7),         // 뒤로가기
  success: () => buzz([12, 30, 18]),
  error: () => buzz([28, 40, 28]),
  impact: () => buzz(20),      // 강조(삭제·확정)
};
