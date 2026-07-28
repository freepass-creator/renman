'use client';
/** 계약 상세 패널 — 수납스케줄(SchedulePanel) 재사용. */
import { useVehicleDetail } from '@/components/vehicle-detail/useVehicleDetail';
import { SchedulePanel } from '@/components/vehicle-detail/panels/SettlePanels';
import { PageLoading, EmptyState } from '@/components/ui';

export function ContractScheduleEmbed({ plate }: { plate: string }) {
  const vd = useVehicleDetail(plate);
  if (!plate) return <EmptyState variant="sec">차량 미연결</EmptyState>;
  if (vd.loading) return <PageLoading />;
  return (
    <div style={{ marginTop: 8 }}>
      <SchedulePanel plate={plate} vd={vd} />
    </div>
  );
}
