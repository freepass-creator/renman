'use client';
/**
 * 프리패스 상품 연동 — 보유·상품대기(매각계열 제외) 차량을 freepasserp4 product(매물)로 전송.
 *   차종마스터 5단계가 erp4 product와 1:1. 검토 후 전송(팝업 아닌 페이지).
 *   erp4 수신 엔드포인트 미구성이면 전송 시 안내(연동 대기).
 */
import { useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { type EntityRecord } from '@/lib/intake/entities';
import { eligibleForProduct, vehicleToProduct, pushToFreepass, PROVIDER_CODE } from '@/lib/freepass/product-sync';
import { companyLabel } from '@/lib/companies';
import { useSession } from '@/lib/session';
import { Page, Panel, Btn, Badge, EmptyState, DataTable, C, SPACE_M, type Col, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { toast } from '@/lib/toast';

type Row = { v: EntityRecord; product: Record<string, unknown>; plate: string; five: string };

export default function FreepassSyncPage() {
  const { companyId, scopeAll } = useSession();
  const { data: [vs = []], loading } = useEntityLists(['vehicle']);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => eligibleForProduct(vs).map((v) => {
    const product = vehicleToProduct(v);
    const five = [v.maker, v.modelLine, v.subModel, v.variant, v.trim].map((x) => String(x || '')).filter(Boolean).join(' · ') || '—';
    return { v, product, plate: String(v.plate || ''), five };
  }), [vs]);

  const send = async () => {
    if (!rows.length) return;
    setBusy(true);
    const r = await pushToFreepass(rows.map((x) => x.product));
    setBusy(false);
    if (r.ok) toast(`프리패스 전송 ${rows.length}건${r.created != null ? ` · 신규 ${r.created}` : ''}${r.updated != null ? ` · 갱신 ${r.updated}` : ''}`, 'success');
    else toast('전송 실패: ' + (r.error || r.body || `HTTP ${r.status}`), 'error');
  };

  const cols: Col<Row>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (r: Row) => <span style={{ color: C.mute }}>{companyLabel(r.v.companyId)}</span> }] : []),
    { key: 'plate', label: '차량번호', render: (r) => <span style={{ fontFamily: 'var(--font-mono)' }}>{r.plate || '—'}</span> },
    { key: 'car', label: '차명', render: (r) => String(r.v.carName || '—') },
    { key: 'five', label: '5단계(제조사·모델·세부모델·파워트레인·트림)', render: (r) => <span style={{ color: C.ink }}>{r.five}</span> },
    { key: 'code', label: '상품코드', render: (r) => <span style={{ fontSize: 12, color: C.mute }}>{String(r.product.product_code || '')}</span> },
  ];

  return (
    <Page
      title="프리패스 상품 연동"
      tools={<WorkbenchBar mid={<span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>{`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 대상 ${rows.length}대 · 공급사 ${PROVIDER_CODE}`}</span>} />}
    >
      {loading ? <PageLoading />
        : (
          <Panel title="상품대기 → 프리패스 매물 전송">
            <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.6 }}>
              <b>보유 · 상품대기</b>(매각 제외) 차량을 프리패스(freepasserp4) 매물로 등록합니다. 차종마스터 5단계가 그대로 매핑됩니다.
              enum·트림 정밀보정은 프리패스 수신 시 차종마스터 스냅으로 마무리됩니다.
              <br /><span style={{ color: C.warn }}>※ 프리패스 수신 엔드포인트 미구성 시 전송은 «연동 대기»로 안내됩니다(FREEPASS_PRODUCT_API env).</span>
            </p>
            <div style={{ display: 'flex', gap: SPACE_M, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn onClick={send} disabled={busy || !rows.length}><UploadCloud size={15} /> {busy ? '전송 중…' : `${rows.length}건 프리패스로 전송`}</Btn>
              <Badge tone={rows.length ? 'green' : 'gray'}>{rows.length}대 대기</Badge>
            </div>
            {rows.length === 0
              ? <EmptyState>상품대기 상태의 차량이 없습니다 (차량 상태를 «상품대기»로 두면 여기 모입니다)</EmptyState>
              : <DataTable cols={cols} rows={rows} />}
          </Panel>
        )}
    </Page>
  );
}
