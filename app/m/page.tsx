'use client';
/** /m 홈 — 대시보드(A). 지표 2×2 + 주의 목록(만기경과·임박·미수) ObjRow. 행 탭 → 자산360. */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, fleetRail, type FleetRow } from '@/lib/sheet-rows';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Metric, Rows, ObjRow, EmptyState, PageLoading, won, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MHome() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const rows = useMemo(() => {
    const f = linkFleet(vs, cs, TODAY);
    return buildFleetRows(f.vehicles, ins, f.contracts, hs, TODAY);
  }, [vs, cs, ins, hs]);

  const held = rows.filter((r) => r.ownership !== '처분완료');
  const idle = held.filter((r) => r.util === '휴차').length;
  const net = held.reduce((s, r) => s + Math.max(0, r.net), 0);
  const soon = held.filter((r) => r.dday != null && r.dday >= 0 && r.dday <= 30);
  const overdue = held.filter((r) => r.dday != null && r.dday < 0);
  const misu = held.filter((r) => r.net > 0).sort((a, b) => b.net - a.net);

  const row = (r: FleetRow) => (
    <ObjRow key={r.plate} rail={fleetRail(r)} co={r.companyId} plate={r.plate} meta={r.carName}
      sub={`${r.customer || '계약없음'}${r.end ? ` · 만기 ${r.end.slice(2)}` : ''}`}
      right={r.net > 0 ? won(r.net) : undefined} rightTone="danger" onClick={() => router.push(`/m/vehicle/${encodeURIComponent(r.plate)}`)} />
  );

  return (
    <>
      <MHead title="홈" sub="전체 회사" color={C.ok} />
      {loading ? <PageLoading />
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Metric label="보유" value={held.length} />
              <Metric label="휴차" value={idle} />
              <Metric label="만기임박" value={soon.length} tone={soon.length ? 'warn' : undefined} />
              <Metric label="미수" value={net ? won(net) : '0'} tone={net ? 'danger' : undefined} />
            </div>
            {overdue.length > 0 && <Rows title="만기 경과" tone="red" n={overdue.length} collapsible id="home-overdue">{overdue.slice(0, 5).map(row)}</Rows>}
            {soon.length > 0 && <Rows title="만기 임박" tone="amber" n={soon.length} collapsible id="home-soon">{soon.slice(0, 5).map(row)}</Rows>}
            {misu.length > 0 && <Rows title="미수 발생" tone="red" n={misu.length} collapsible id="home-misu">{misu.slice(0, 6).map(row)}</Rows>}
            {!overdue.length && !soon.length && !misu.length && <EmptyState variant="ok">지금 챙길 급한 건이 없습니다</EmptyState>}
          </div>
        )}
    </>
  );
}
