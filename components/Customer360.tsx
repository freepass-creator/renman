'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore, listsCached } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { computeContractView } from '@/lib/contract-ops';
import { findCustomer } from '@/lib/customers';
import { collectionStage } from '@/lib/collection';
import { Sec, Cards, Metric, ObjCard, Badge, Btn, won, C, PageLoading } from '@/components/ui';
import { companyLabel } from '@/lib/companies';
import { openCar } from '@/lib/ui-bus';
import { QuickLogForm, type QuickLogCtx } from '@/components/QuickLogForm';
import { TODAY } from '@/lib/dashboard-consts';

const COMM_KINDS = new Set(['통화', '문자', '방문', '메모', '상담']);
function commTone(cat: string): 'green' | 'purple' | 'gray' {
  return cat === '통화' || cat === '문자' ? 'green' : cat === '방문' || cat === '상담' ? 'purple' : 'gray';
}

/** 한 고객(손님)의 360 — 계약·미수·이력을 고객 단위로. 제목은 DetailShell(onTitle). */
export function Customer360({ ckey, onTitle }: { ckey: string; onTitle?: (name: string) => void }) {
  const { companyId } = useSession();
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [history, setHistory] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [logOpen, setLogOpen] = useState(false);
  const loadedKey = useRef<string | null>(null);
  useEffect(() => { function onSaved() { setTick((t) => t + 1); } window.addEventListener('jpk:saved', onSaved); return () => window.removeEventListener('jpk:saved', onSaved); }, []);
  useEffect(() => {
    const store = getStore();
    const warm = listsCached(['contract', 'history'], companyId);
    if (loadedKey.current !== companyId && !warm) setLoading(true);
    Promise.all([store.list('contract', companyId), store.list('history', companyId)])
      .then(([cs, his]) => { setContracts(cs); setHistory(his); setLoading(false); loadedKey.current = companyId; })
      .catch(() => setLoading(false));
  }, [companyId, tick]);

  const cust = useMemo(() => (loading ? null : findCustomer(contracts, ckey, TODAY)), [loading, contracts, ckey]);
  useEffect(() => { if (cust?.name) onTitle?.(cust.name); }, [cust?.name, onTitle]);

  if (loading) return <PageLoading />;
  if (!cust) return <div style={{ padding: 20, fontSize: 13, color: C.faint }}>고객을 찾을 수 없습니다.</div>;
  const views = cust.contracts.map((c) => ({ c, v: computeContractView(c, TODAY) }));
  const activeV = views.filter((x) => x.v.status === '운행');
  const pastV = views.filter((x) => x.v.status !== '운행');

  const custPlates = new Set(cust.vehicles);
  const comms = history
    .filter((h) => {
      if (!COMM_KINDS.has(String(h.category || ''))) return false;
      const hc = String(h.customer || '').trim();
      if (hc) return hc === cust.name;
      return h.plate ? custPlates.has(String(h.plate)) : false;
    })
    .sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
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
