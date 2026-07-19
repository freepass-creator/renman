/**
 * 버전(티어) — 빌드타임 상수. 설정 토글 아님. 만들 때 결정.
 *   라이트(운영) ⊂ 스탠다드(관리) ⊂ 비즈니스(경영). 누적 개방.
 *   우리 빌드 = 비즈니스(전부). 라이트/스탠다드로 팔 땐 BUILD_TIER 이 한 줄만 교체 → 전 기능 자동 반영.
 *
 * 라이트 범위 (운영):
 *   · 메뉴 = 홈 · 마이페이지 · 현황(자산·계약·재무) · 설정(·검색)
 *   · 처리 = 홈/마이에서 그자리(context): 360·QuickLog·위저드·미결 카드 조치
 *   · 메뉴「비즈니스」(배차·미수·자금일보…)·경영 = 스탠다드+ (URL 딥링크는 조치용 허용)
 *
 * 기능 원자화: 메뉴·탭·PAGE_IA 가 minTier 를 달고 tierIncludes() 로 판단.
 *   페이지가 티어를 손롤 분기하지 않는다(SSOT).
 */
export const TIER_ORDER = ['라이트', '스탠다드', '비즈니스'] as const;
export type Tier = typeof TIER_ORDER[number];

export const TIER_SCOPE: Record<Tier, string> = {
  '라이트': '운영',
  '스탠다드': '관리',
  '비즈니스': '경영',
};

/** 이 빌드가 포함하는 최고 티어. ★판매 버전 바꾸려면 여기만 교체★ */
export const BUILD_TIER: Tier = '비즈니스';

const rank = (t: Tier): number => TIER_ORDER.indexOf(t);

/** 이 기능(minTier)이 현재 빌드에 포함되나? 메뉴·섹션·기능 원자의 단일 게이트. */
export function tierIncludes(minTier: Tier): boolean {
  return rank(BUILD_TIER) >= rank(minTier);
}
