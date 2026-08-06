'use client';
/** 모바일 차량 조회 — 웹 Vehicle360을 축소하지 않고 실무 조회 원자만 재구성한다. */
import { useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { MHead } from '@/components/m/MHead';
import { C, EmptyState, ErrorState, IconBtn, Metric, ObjRow, PageLoading, Rows, won } from '@/components/ui';
import { useEntityLists } from '@/lib/use-entity-lists';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows } from '@/lib/sheet-rows';
import { buildRiskSheetRows } from '@/lib/risk-ledger';
import { buildWorkItemLedgerRows, workAttentionRank, workDueSignal, workStatusTone } from '@/lib/work-ledger';
import { normPlate } from '@/lib/plate';
import { buildMobileVehicleScope, scopeMobileVehicleRecords } from '@/lib/mobile-vehicle-scope';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import type { EntityRecord } from '@/lib/intake/entities';

export const dynamic = 'force-dynamic';

function recentStamp(record: EntityRecord): string {
  return String(record.updatedAt || record.occurredAt || record.date || record.createdAt || '');
}

function historyTitle(record: EntityRecord): string {
  return String(record.title || record.description || record.memo || record.note || LEDGER_EMPTY.dash);
}

export default function MVehicle() {
  const router = useRouter();
  const plate = decodeURIComponent(String(useParams().plate || ''));
  const params = useSearchParams();
  const companyId = params.get('company') || '';
  const focus = params.get('do') || '';
  const { data: [vehicles = [], contracts = [], insurances = [], histories = [], penalties = [], bankTx = [], workItems = []], loading, error, reload } =
    useEntityLists(['vehicle', 'contract', 'insurance', 'history', 'penalty', 'bank_tx', 'work_item']);
  const scope = useMemo(() => buildMobileVehicleScope(vehicles, contracts, plate, companyId), [companyId, contracts, plate, vehicles]);
  const scopedContracts = useMemo(() => scopeMobileVehicleRecords(scope, contracts), [contracts, scope]);
  const scopedInsurances = useMemo(() => scopeMobileVehicleRecords(scope, insurances), [insurances, scope]);
  const scopedHistories = useMemo(() => scopeMobileVehicleRecords(scope, histories), [histories, scope]);
  const scopedPenalties = useMemo(() => scopeMobileVehicleRecords(scope, penalties), [penalties, scope]);
  const scopedBankTx = useMemo(() => scopeMobileVehicleRecords(scope, bankTx), [bankTx, scope]);
  const scopedWorkItems = useMemo(() => scopeMobileVehicleRecords(scope, workItems), [scope, workItems]);
  const scopedVehicles = scope.vehicles;
  const canonicalPlate = scope.canonicalPlate;

  const fleet = useMemo(() => linkFleet(scopedVehicles, scopedContracts, TODAY), [scopedContracts, scopedVehicles]);
  const fleetRows = useMemo(
    () => buildFleetRows(fleet.vehicles, scopedInsurances, fleet.contracts, scopedHistories, TODAY),
    [fleet, scopedHistories, scopedInsurances],
  );
  const row = useMemo(() => fleetRows.find((item) => normPlate(item.plate) === normPlate(canonicalPlate)), [canonicalPlate, fleetRows]);

  const risks = useMemo(() => buildRiskSheetRows(scopedVehicles, scopedContracts, scopedInsurances, scopedPenalties, scopedHistories, TODAY, scopedBankTx)
    .filter((item) => normPlate(item.plate) === normPlate(canonicalPlate)),
  [canonicalPlate, scopedBankTx, scopedContracts, scopedHistories, scopedInsurances, scopedPenalties, scopedVehicles]);
  const workRows = useMemo(() => buildWorkItemLedgerRows(scopedWorkItems, scopedContracts, scopedVehicles)
    .filter((item) => normPlate(item.plate) === normPlate(canonicalPlate))
    .filter((item) => item.status !== '완료')
    .sort((a, b) => workAttentionRank(a, TODAY) - workAttentionRank(b, TODAY)
      || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5), [canonicalPlate, scopedContracts, scopedVehicles, scopedWorkItems]);
  const recentHistory = useMemo(() => scopedHistories.filter((record) => normPlate(record.plate) === normPlate(canonicalPlate))
    .sort((a, b) => recentStamp(b).localeCompare(recentStamp(a)))
    .slice(0, 5), [canonicalPlate, scopedHistories]);

  if (loading) return <PageLoading label="차량 정보를 불러오는 중…" />;
  if (error) return <div style={{ padding: 14 }}><ErrorState message={error} onRetry={reload} /></div>;
  if (!row) return <div style={{ padding: 14 }}><EmptyState>차량을 찾을 수 없습니다</EmptyState></div>;

  const createWork = () => {
    const query = new URLSearchParams({ plate: row.plate });
    if (row.companyId) query.set('company', row.companyId);
    router.push(`/m/work/new?${query.toString()}`);
  };
  const contractTone = row.contractState === '계약유지' ? 'green' : row.contractState === '계약예정' ? 'blue' : 'gray';

  return (
    <>
      <MHead
        title={row.plate}
        sub={`${row.company} · ${row.carName || '차종 미등록'}`}
        color={C.brand}
        right={<IconBtn title="업무 생성" onClick={createWork}><Plus size={18} /></IconBtn>}
      />
      <div style={{ padding: '12px 14px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Rows>
          <ObjRow
            co={row.companyId}
            plate={row.plate}
            badge={row.util || row.status}
            badgeTone={row.util === '운행' ? 'green' : row.util === '휴차' ? 'purple' : 'amber'}
            meta={row.carName || '차종 미등록'}
            fields={[["소유", row.ownership || '미등록'], ["위치", row.location || '미등록'], ["연식", row.year || '미등록']]}
          />
        </Rows>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Metric label="계약 상태" value={row.contractState} tone={row.contractState === '계약유지' ? 'ok' : 'ink'} />
          <Metric label="전체 미수" value={won(row.net)} tone={row.net > 0 ? 'danger' : 'ink'} />
          <Metric label="계약유지 미수" value={won(row.maintainedNet)} tone={row.maintainedNet > 0 ? 'danger' : 'ink'} />
          <Metric label="계약종료 미수" value={won(row.endedNet)} tone={row.endedNet > 0 ? 'danger' : 'ink'} />
        </div>

        {row.customer ? (
          <Rows title="현재 계약" tone="teal" n={1} id="m-vehicle-contract">
            <ObjRow
              badge={row.contractState}
              badgeTone={contractTone}
              name={row.customer}
              meta={row.contractNo || '계약번호 미등록'}
              fields={[["기간", `${row.start || '미등록'} ~ ${row.end || '미등록'}`], ["월대여료", won(row.rent)], ["납부", row.paymentDay ? `${row.paymentDay}일 · ${row.paymentTiming || '기준 미등록'}` : '미등록']]}
            />
          </Rows>
        ) : <EmptyState variant="sec">연결된 현재 계약이 없습니다</EmptyState>}

        {risks.length > 0 && (
          <Rows title="주의" tone="red" n={risks.length} id="m-vehicle-risk">
            {risks.slice(0, 5).map((item) => (
              <ObjRow
                key={item.id}
                badge={item.group}
                badgeTone={item.badgeTone}
                name={item.kind}
                meta={item.subject}
                sub={item.due}
                right={item.amount > 0 ? won(item.amount) : item.status}
                rightTone={item.amount > 0 ? 'danger' : item.tone === 'warn' ? 'warn' : 'ink'}
              />
            ))}
          </Rows>
        )}

        <Rows title="진행 업무" tone="amber" n={workRows.length} id="m-vehicle-work">
          {workRows.length ? workRows.map((item) => {
            const key = String(item.raw._key || item.raw.id || '');
            const due = workDueSignal(item.dueDate, item.status, TODAY);
            return (
              <ObjRow
                key={item.id}
                badge={item.status}
                badgeTone={workStatusTone(item.status)}
                name={item.title || LEDGER_EMPTY.dash}
                meta={item.kind}
                fields={[["기한", item.dueDate ? `${item.dueDate}${due.label ? ` · ${due.label}` : ''}` : '미지정'], ["담당", item.assignee || LEDGER_EMPTY.unassigned]]}
                onClick={key ? () => router.push(`/m/work/${encodeURIComponent(key)}`) : undefined}
              />
            );
          }) : <EmptyState variant="sec">연결된 진행 업무가 없습니다</EmptyState>}
        </Rows>

        {recentHistory.length > 0 && (
          <Rows title="최근 이력" tone="gray" n={recentHistory.length} id="m-vehicle-history" collapsible>
            {recentHistory.map((item, index) => (
              <ObjRow
                key={String(item._key || item.id || `${recentStamp(item)}:${index}`)}
                badge={String(item.kind || item.workType || item.type || '이력')}
                name={historyTitle(item)}
                sub={recentStamp(item).slice(0, 10) || '일자 미등록'}
              />
            ))}
          </Rows>
        )}

        <Rows title="차량 정보" tone="gray" id="m-vehicle-info" collapsible defaultOpen={focus !== 'unpaid'}>
          <ObjRow name="검사 · 보험" fields={[["검사만기", row.inspectionTo || '미등록'], ["보험사", row.insurer || '미등록'], ["보험만기", row.insEnd || '미등록']]} />
          <ObjRow name="식별 · 운행" fields={[["차대번호", row.vin || '미등록'], ["주행거리", row.mileage ? `${row.mileage.toLocaleString('ko-KR')}km` : '미등록'], ["GPS", row.gps || '미등록']]} />
        </Rows>
      </div>
    </>
  );
}
