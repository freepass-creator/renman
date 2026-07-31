/**
 * 자산분류(표시용 생애주기) — lifecycle Badge 톤 SSOT.
 * classifyVehicle.ownership과 별개(등록예정→구매예정 합침 · 4값).
 */
import {
  OUT, VEHICLE_BUY_PLAN, VEHICLE_DISPOSE_PLAN, VEHICLE_REG_PLAN,
} from '@/lib/domain/status';

export type AssetLifecycle = '구매예정' | '보유중' | '처분예정' | '처분완료';

/** redesign 분류 표 보강 — domain Set 밖 표시값도 SSOT에 포함. */
const LC_BUY = new Set(['발주', '상품', '상품대기', '상품화']);
const LC_DISPOSE_PLAN = new Set(['매물', '상담', '매각계약']);
const LC_DISPOSE_DONE = new Set(['폐차', '전손', '반납']);

export function assetLifecycle(status: string, disposed = false): AssetLifecycle {
  const s = String(status || '');
  if (disposed || OUT.has(s) || LC_DISPOSE_DONE.has(s)) return '처분완료';
  if (VEHICLE_DISPOSE_PLAN.has(s) || LC_DISPOSE_PLAN.has(s)) return '처분예정';
  if (VEHICLE_BUY_PLAN.has(s) || VEHICLE_REG_PLAN.has(s) || LC_BUY.has(s)) return '구매예정';
  return '보유중';
}

/** 보유중=중립(gray) — 다수가 보유중이라 초록 전면칠은 정보량 0. 구매=파랑·처분예정=주황·처분완료=회색. */
export function assetLifecycleTone(lc: AssetLifecycle): 'blue' | 'gray' | 'amber' {
  if (lc === '구매예정') return 'blue';
  if (lc === '처분예정') return 'amber';
  return 'gray'; // 보유중 · 처분완료
}
