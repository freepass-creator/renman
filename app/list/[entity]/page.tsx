'use client';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { computeAssetLedgerEntry } from '@/lib/payments/asset-ledger';
import type { Vehicle } from '@/lib/payments/types';
import { openIngest } from '@/lib/ui-bus';
import { Page, Sec, Cards, Metric, DataTable, Btn, Badge, EmptyState, won, C, Panel, type Col, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { companyLabel } from '@/lib/companies';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityList } from '@/lib/use-entity-lists';

// v6 차량 레코드 → 감가엔진(장부가). 증명서 OCR 데이터로 v5 Vehicle 타입 매핑.
function bookValue(rec: EntityRecord): number | null {
  const price = Number(rec.acquisitionPrice);
  if (!price) return null;
  const v = {
    id: String(rec._key || ''), plate: String(rec.plate || ''), model: String(rec.carName || ''),
    status: '운행', purchasePrice: price, firstRegisteredDate: String(rec.firstReg || ''),
  } as unknown as Vehicle;
  return computeAssetLedgerEntry(v, TODAY).bookValue;
}

export default function ListPage() {
  const params = useParams();
  const router = useRouter();
  const entityKey = String(params.entity);
  const { companyId, user, scopeAll } = useSession();
  const entity = ENTITIES[entityKey];
  const { rows: records, loading } = useEntityList(entity ? entityKey : 'vehicle');
  const scopeLabel = scopeAll ? '전체' : companyLabel(companyId);

  if (!entity) return <Page title={`알 수 없는 엔티티: ${entityKey}`}><EmptyState>존재하지 않는 데이터 종류입니다.</EmptyState></Page>;

  const showBook = entityKey === 'vehicle';
  function rowHref(r: EntityRecord) {
    return entityKey === 'vehicle' ? `/vehicle/${encodeURIComponent(String(r.plate || r._key || ''))}`
      : entityKey === 'customer' ? `/customer/${encodeURIComponent(String(r._key || ''))}`
      : entityKey === 'insurance' ? `/insurance/${encodeURIComponent(String(r._key || ''))}`
      : `/list/${entityKey}/${encodeURIComponent(String(r._key || ''))}`;
  }

  const cols: Col<EntityRecord>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (r: EntityRecord) => <span style={{ color: C.mute }}>{companyLabel(r.companyId)}</span> }] : []),
    ...entity.fields.slice(0, 8).map((f) => ({
      key: f.key, label: f.label,
      render: (r: EntityRecord) => {
        const v = r[f.key]; const filled = v != null && v !== '';
        return <span style={{ color: filled ? C.ink : C.lineStrong }}>{filled ? String(v) : '—'}</span>;
      },
    })),
    ...(showBook ? [{ key: '_book', label: '장부가(감가)', align: 'r' as const, render: (r: EntityRecord) => { const b = bookValue(r); return b != null ? won(b) : '—'; } }] : []),
  ];

  return (
    <Page title={entity.label} meta={`${companyLabel(companyId)} · ${records.length}건 · ${user.role}`}
      tools={<WorkbenchBar />}
      right={<Btn variant="solid" onClick={() => openIngest(entityKey)}>+ {entity.label} 담기</Btn>}>
      <Sec title="현황" desc="엔티티 요약">
        <Cards min={128} fit>
          <Metric label="데이터 건수" value={loading ? '…' : records.length} tone="ink" />
          <Metric label="엔티티" value={entity.label} tone="ink" />
          <Metric label="회사 범위" value={scopeLabel} tone="ok" />
          <Metric label="목록" value="빠른 조회" tone="warn" />
        </Cards>
      </Sec>
      <Panel title="목록">
        {loading ? <PageLoading />
          : records.length === 0 ? <EmptyState>아직 {entity.label} 없음 — <button type="button" data-ui="action" onClick={() => openIngest(entityKey)} style={{ border: 'none', background: 'none', padding: 0, color: C.accent, fontWeight: 700, cursor: 'pointer', font: 'inherit' }}>담기로 수집</button></EmptyState>
          : <DataTable cols={cols} rows={records} onRow={(r) => router.push(rowHref(r))} />}
      </Panel>
    </Page>
  );
}
