'use client';
/** /m 리스크 (B) — 챙겨야 할 위험을 상태그룹 ObjRow로. 미수·만기·보험·검사. 행 탭 → 자산360. */
import { useMemo } from 'react';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, fleetRail, type FleetRow } from '@/lib/sheet-rows';
import { useRouter } from 'next/navigation';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Metric, Rows, ObjRow, EmptyState, PageLoading, won, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MRisk() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const rows = useMemo(() => {
    const f = linkFleet(vs, cs, TODAY);
    return buildFleetRows(f.vehicles, ins, f.contracts, hs, TODAY);
  }, [vs, cs, ins, hs]);

  const held = rows.filter((r) => r.ownership !== '처분완료');
  const misu = held.filter((r) => r.net > 0).sort((a, b) => b.net - a.net);
  const overdue = held.filter((r) => r.dday != null && r.dday < 0);
  const soon = held.filter((r) => r.dday != null && r.dday >= 0 && r.dday <= 30);
  const insSoon = held.filter((r) => { const d = dday(r.insEnd); return d != null && d <= 30; });
  const noIns = held.filter((r) => !r.insurer);
  const inspSoon = held.filter((r) => { const d = dday(r.inspectionTo); return d != null && d <= 30; });
  const netTotal = misu.reduce((s, r) => s + r.net, 0);

  const R = (r: FleetRow, sub: string, right?: React.ReactNode) => (
    <ObjRow key={r.plate} rail={fleetRail(r)} co={r.companyId} plate={r.plate} meta={r.carName}
      sub={sub} right={right} rightTone="danger" onClick={() => router.push(`/m/vehicle/${encodeURIComponent(r.plate)}${right ? '?do=unpaid' : ''}`)} />
  );

  const empty = !misu.length && !overdue.length && !soon.length && !insSoon.length && !noIns.length && !inspSoon.length;

  return (
    <>
      <MHead title="리스크" sub="전체 회사" color={C.danger} />
      {loading ? <PageLoading />
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Metric label="미수 총액" value={netTotal ? won(netTotal) : '0'} tone={netTotal ? 'danger' : undefined} />
              <Metric label="만기 경과" value={overdue.length} tone={overdue.length ? 'danger' : undefined} />
              <Metric label="만기 임박" value={soon.length} tone={soon.length ? 'warn' : undefined} />
              <Metric label="무보험" value={noIns.length} tone={noIns.length ? 'warn' : undefined} />
            </div>
            {empty && <EmptyState variant="ok">지금 챙길 위험이 없습니다</EmptyState>}
            {misu.length > 0 && <Rows title="미수 발생" tone="red" n={misu.length} collapsible id="risk-misu">{misu.map((r) => R(r, `연체 ${r.overdueDays}일 · ${r.customer || '—'}`, won(r.net)))}</Rows>}
            {overdue.length > 0 && <Rows title="만기 경과" tone="red" n={overdue.length} collapsible id="risk-overdue">{overdue.map((r) => R(r, `만기 ${r.end.slice(2)} 지남 · ${r.customer || '—'}`))}</Rows>}
            {soon.length > 0 && <Rows title="만기 임박" tone="amber" n={soon.length} collapsible id="risk-soon">{soon.map((r) => R(r, `만기 ${r.end.slice(2)} (D-${r.dday}) · ${r.customer || '—'}`))}</Rows>}
            {insSoon.length > 0 && <Rows title="보험 만료 임박" tone="orange" n={insSoon.length} collapsible id="risk-ins">{insSoon.map((r) => R(r, `보험 만료 ${r.insEnd.slice(2)}`))}</Rows>}
            {noIns.length > 0 && <Rows title="무보험" tone="purple" n={noIns.length} collapsible id="risk-noins">{noIns.map((r) => R(r, r.customer || '계약없음'))}</Rows>}
            {inspSoon.length > 0 && <Rows title="검사 임박" tone="amber" n={inspSoon.length} collapsible id="risk-insp">{inspSoon.map((r) => R(r, `검사 만료 ${r.inspectionTo.slice(2)}`))}</Rows>}
          </div>
        )}
    </>
  );
}
