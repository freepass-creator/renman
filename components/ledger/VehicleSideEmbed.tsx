'use client';
/**
 * 원장 우측 패널용 차량 완결 상세 — VehicleDetail 재사용(embed).
 * 이탈 링크(새 라우트) 대신 패널 안 스크롤.
 */
import { VehicleDetail } from '@/components/vehicle-detail/VehicleDetail';

export function VehicleSideEmbed({ plate, focus }: { plate: string; focus?: string }) {
  if (!plate) return null;
  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 160px)', padding: '0 2px 12px' }}>
      <VehicleDetail plate={plate} focus={focus} embed />
    </div>
  );
}
