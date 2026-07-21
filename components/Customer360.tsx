'use client';
import { useEffect, useMemo, useState } from 'react';
import { useEntityLists } from '@/lib/use-entity-lists';
import { computeContractView } from '@/lib/contract-ops';
import { findCustomer } from '@/lib/customers';
import { collectionStage } from '@/lib/collection';
import { Sec, Cards, Metric, ObjCard, Badge, Btn, won, C, PageLoading } from '@/components/ui';
import { companyLabel } from '@/lib/companies';
import { openCar } from '@/lib/ui-bus';
import { QuickLogForm, type QuickLogCtx } from '@/components/QuickLogForm';
import { TODAY } from '@/lib/dashboard-consts';
import { selectCustomerComms } from '@/lib/activity-match';

function commTone(cat: string): 'green' | 'purple' | 'gray' {
  return cat === '통화' || cat === '문자' ? 'green' : cat === '방문' || cat === '상담' ? 'purple' : 'gray';
}

/** 한 고객(손님)의 360 — 계약·미수·이력을 고객 단위로. 제목은 DetailShell(onTitle). */
export function Customer360({ ckey, onTitle }: { ckey: string; onTitle?: (name: string) => void }) {
  const { data: [contracts = [], history = []], loading } = useEntityLists(['contract', 'history']);
  const [logOpen, setLogOpen] = useState(false);

  const cust = useMemo(() => (loading ? null : findCustomer(contracts, ckey, TODAY)), [loading, contracts, ckey]);
  useEffect(() => { if (cust?.name) onTitle?.(cust.name); }, [cust?.name, onTitle]);

  if (loading) return <PageLoading />;
  if (!cust) return <div style={{ padding: 20, fontSize: 13, color: C.faint }}>고객을 찾을 수 없습니다.</div>;
  const views = cust.contracts.map((c) => ({ c, v: computeContractView(c, TODAY) }));
  const activeV = views.filter((x) => x.v.status === '운행');
  const pastV = views.filter((x) => x.v.status !== '운행');

  // 활동↔계약 매칭은 lib/activity-match SSOT. 번호판만으로 묶으면 손바뀜 차에서
  // 앞 임차인 통화가 다음 임차인에게 뜬다(288수6402=계약 5건).
  const comms = selectCustomerComms(history, cust.contracts);
  const oneActive = activeV.length === 1 ? activeV[0].c : null;
  const commCtx: QuickLogCtx = { customer: cust.name, companyId: cust.companyId, ...(oneActive ? { plate: String(oneActive.plate || ''), contractNo: String(oneActive.contractNo || '') } : {}) };

  return (
    <div>
      {/* 이름은 DetailShell title. 여기는 전화·법인·미수만. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {cust.phone ? <span style={{ fontSize: 13, color: C.mute }}>{cust.phone}</span> : null}
        {cust.companyId ? <Badge tone="blue">{companyLabel(cust.companyId)}</Badge> : null}
        <span style={{ flex: 1 }} />
        {cust.totalUnpaid > 0 && <span style={{ fontSize: 13.5, color: C.danger, fontWeight: 800, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>미수 {won(cust.totalUnpaid)}</span>}
      </div>

      <Sec id="cu-status" title="현황">
        <Cards min={128}>
          <Metric label="총 계약" value={cust.contracts.length} />
          <Metric label="진행중" value={cust.activeCount} tone="ok" />
          <Metric label="총 미수" value={won(cust.totalUnpaid)} tone={cust.totalUnpaid > 0 ? 'danger' : 'ink'} />
          <Metric label="이용 차량" value={cust.vehicles.length} />
          <Metric label="면허" value={cust.licenseNo || '—'} />
        </Cards>
      </Sec>

      <Sec id="cu-active" title="진행중 계약" n={activeV.length} desc="차 클릭 → 360">
        {activeV.length === 0 ? <div style={{ fontSize: 12.5, color: C.faint }}>진행중 계약 없음</div> :
          <Cards min={340}>{activeV.map(({ c, v }, i) => { const cs = collectionStage(v.overdueDays); return <ObjCard key={i} onClick={() => openCar(c.plate)} rail={v.net > 0 ? 'danger' : 'none'} badge={v.net > 0 ? cs.stage : '운행'} badgeTone={v.net > 0 ? cs.tone : 'green'} plate={String(c.plate)} carType={c.carName ? String(c.carName) : undefined} fields={[['기간', `${c.startDate || ''}~${c.endDate || ''}`], ['월', won(c.monthlyRent)]]} right={v.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>미수 {won(v.net)}</span> : undefined} />; })}</Cards>}
      </Sec>

      <Sec id="cu-past" title="지난 계약" n={pastV.length} desc="재계약 이력">
        {pastV.length === 0 ? <div style={{ fontSize: 12.5, color: C.faint }}>지난 계약 없음</div> :
          <Cards min={340}>{pastV.map(({ c }, i) => <ObjCard key={i} onClick={() => openCar(c.plate)} badge={String(c.status || '종료')} badgeTone="gray" plate={String(c.plate)} carType={c.carName ? String(c.carName) : undefined} fields={[['기간', `${c.startDate || ''}~${c.returnedDate || c.endDate || ''}`], ['월', won(c.monthlyRent)]]} />)}</Cards>}
      </Sec>

      <Sec id="cu-comm" title="소통·상담 이력" n={comms.length} tone={logOpen ? 'ok' : undefined}
        desc="통화·문자·방문·메모·상담"
        right={<Btn variant="ghost" onClick={() => setLogOpen((o) => !o)}>{logOpen ? '닫기' : '+ 기록'}</Btn>}>
        {logOpen ? <QuickLogForm ctx={commCtx} onDone={() => setLogOpen(false)} onCancel={() => setLogOpen(false)} style={{ marginBottom: 12 }} /> : null}
        {comms.length
          ? <Cards min={340}>{comms.map((h, i) => (
              <ObjCard key={i} badge={String(h.category || '기록')} badgeTone={commTone(String(h.category || ''))}
                title={String(h.title || '—')}
                right={h.nextDate ? <span style={{ color: C.warn, fontSize: 11.5 }}>후속 {String(h.nextDate)}</span> : undefined}
                fields={[['일자', String(h.date || '—')], ['작성', String(h.author || '—')]]} />
            ))}</Cards>
          : <div style={{ fontSize: 12.5, color: C.faint }}>기록 없음 · 오른쪽 “+ 기록”으로 남기세요</div>}
      </Sec>
    </div>
  );
}
