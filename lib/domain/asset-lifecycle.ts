/**
 * 자산분류(표시용 생애주기) — rail 폐기로 사라진 구매예정·처분예정 등 식별.
 * classifyVehicle.ownership과 별개(등록예정→구매예정 합침 · 4값).
 */
import {
  OUT, VEHICLE_BUY_PLAN, VEHICLE_DISPOSE_PLAN, VEHICLE_REG_PLAN,
} from '@/lib/domain/status';

export type AssetLifecycle = '구매예정' | '보유중' | '처분예정' | '처분완료';

export function assetLifecycle(status: string, disposed = false): AssetLifecycle {
  const s = String(status || '');
  if (disposed || OUT.has(s)) return '처분완료';
  if (VEHICLE_DISPOSE_PLAN.has(s)) return '처분예정';
  if (VEHICLE_BUY_PLAN.has(s) || VEHICLE_REG_PLAN.has(s)) return '구매예정';
  return '보유중';
}

export function assetLifecycleTone(lc: AssetLifecycle): 'blue' | 'gray' | 'amber' | 'green' {
  if (lc === '구매예정') return 'blue';
  if (lc === '처분예정') return 'amber';
  if (lc === '처분완료') return 'gray';
  return 'green';
}
