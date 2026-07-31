'use client';
/**
 * 정합성 — 데이터 이상·컴플라이언스(checkCompliance) 목록.
 *   컴플라이언스는 리스크 표에서 분리 → 여기로. ?open= = riskComplianceOpenId.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import { ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { FacetPage, Sec, Cards, Metric, EmptyState, Badge, RISK_TONE, SevTag, ExcelSheet, won, C, type SheetCol, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { companyLabel } from '@/lib/companies';
import { scanRisks } from '@/lib/risk-ops';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { riskKindMatch } from '@/lib/lens-filters';
import { textMatch } from '@/lib/search-match';
import { CheckCircle2 } from 'lucide-react';
import { TODAY, dday } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { crossCheckDocuments } from '@/lib/integrity/doc-crosscheck';
import { checkCompliance } from '@/lib/compliance';
import { computeContractView } from '@/lib/contract-ops';
import { normPlate } from '@/lib/plate';
import { riskComplianceOpenId } from '@/lib/ledger-open-ids';

type Sev = 'high' | 'mid';
type RiskItem = {
  id: string;
  sev: Sev;
  kind: string;
  target: string;
  detail: string;
  href: string;
  co: unknown;
};

const RISK_ENTITIES = ['vehicle', 'contract', 'insurance', 'penalty', 'bank_tx'] as const;

function dataChecks(data: Record<string, EntityRecord[]>): RiskItem[] {
  const out: RiskItem[] = [];
  const vehicles = data.vehicle || [];
  const plates = new Set(vehicles.map((v) => String(v.plate || '')).filter(Boolean));
  const push = (sev: Sev, kind: string, entity: string, rec: EntityRecord, detail: string) => {
    const plate = String(rec.plate || '');
    const href = plate
      ? `/vehicle/${encodeURIComponent(plate)}`
      : `/list/${entity}/${encodeURIComponent(String(rec._key || ''))}`;
    out.push({
      id: `${kind}:${entity}:${rec._key || plate || detail}`,
      sev, kind,
      target: `${ENTITIES[entity]?.label || entity}${plate ? ' · ' + plate : ''}`,
      detail, href, co: rec.companyId,
    });
  };

  for (const key of RISK_ENTITIES) {
    const e = ENTITIES[key];
    if (!e) continue;
    for (const rec of data[key] || []) {
      const miss = e.fields.filter((f) => f.required && (rec[f.key] == null || rec[f.key] === '')).map((f) => f.label);
      if (miss.length) push('high', '필수누락', key, rec, `${e.label}: ${miss.join(', ')} 비어있음`);
    }
  }
  for (const ins of data.insurance || []) {
    const d = dday(ins.endDate);
    if (d != null && d < 0) push('high', '보험만료', 'insurance', ins, `보험 만료 ${-d}일 경과`);
    else if (d != null && d <= 30) push('mid', '보험임박', 'insurance', ins, `보험 만기 D-${d}`);
  }
  for (const v of vehicles) {
    const d = dday(v.inspectionTo);
    if (d != null && d < 0) push('high', '검사만료', 'vehicle', v, `정기검사 ${-d}일 경과`);
    else if (d != null && d <= 30) push('mid', '검사임박', 'vehicle', v, `검사 만기 D-${d}`);
  }
  for (const ek of ['contract', 'insurance', 'penalty'] as const)
    for (const rec of data[ek] || []) {
      const p = String(rec.plate || '');
      if (p && !plates.has(p)) push('mid', 'plate고아', ek, rec, `차량 ${p} 미등록`);
    }
  for (const k of data.contract || [])
    if (k.startDate && k.endDate && String(k.startDate) > String(k.endDate)) {
      push('high', '날짜역전', 'contract', k, `시작 ${k.startDate} > 종료 ${k.endDate}`);
    }
  return out;
}

/** checkCompliance 소비 — 새 판정 금지. high 우선. */
function complianceItems(contracts: EntityRecord[], vehicles: EntityRecord[]): RiskItem[] {
  const vehByPlate = new Map(vehicles.map((vv) => [normPlate(vv.plate), vv]));
  const out: RiskItem[] = [];
  for (const c of contracts) {
    const v = computeContractView(c, TODAY);
    if (v.status !== '운행') continue;
    const flags = checkCompliance(c, vehByPlate.get(normPlate(c.plate)) || null, TODAY);
    if (!flags.length) continue;
    const top = flags.find((f) => f.severity === 'high') || flags[0];
    const plate = String(c.plate || '');
    out.push({
      id: riskComplianceOpenId(c),
      sev: top.severity === 'high' ? 'high' : 'mid',
      kind: top.label,
      target: `${plate || LEDGER_EMPTY_NONE} · ${c.contractorName || ''}`.trim(),
      detail: flags.map((f) => f.detail || f.label).filter(Boolean).join(' · '),
      href: plate ? `/vehicle/${encodeURIComponent(plate)}` : `/contract?open=${encodeURIComponent(String(c._key || ''))}`,
      co: c.companyId,
    });
  }
  return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
}

const LEDGER_EMPTY_NONE = '—';

function IntegrityInner() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: [vehicles = [], contracts = [], insurance = [], penalty = [], bankTx = []], loading } = useEntityLists(RISK_ENTITIES);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openedRef = useState({ done: '' })[0];
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const { items, unpaidTotal } = useMemo(() => {
    const data: Record<string, EntityRecord[]> = { vehicle: vehicles, contract: contracts, insurance, penalty };
    const base: RiskItem[] = scanRisks(contracts, TODAY).flatMap((r) =>
      r.flags.map((f) => ({
        id: `scan:${r.rec._key || r.rec.plate}:${f.kind}`,
        sev: f.sev === 'high' ? 'high' as Sev : 'mid' as Sev,
        kind: f.kind,
        target: `${r.rec.plate || ''} · ${r.rec.contractorName || ''}`,
        detail: f.detail,
        href: r.rec.plate ? `/vehicle/${encodeURIComponent(String(r.rec.plate))}?do=unpaid` : `/contract`,
        co: r.rec.companyId,
      })));
    const compliance = complianceItems(contracts, vehicles);
    /* 서류 교차검증 — 등록증·보험증권·계약서를 올리는 순간 결과가 갱신된다(정적 JSON 아님).
       기존 items 파이프라인에 합류시키므로 요약 카드·필터·표·검색이 그대로 작동한다. */
    const cross: RiskItem[] = crossCheckDocuments({
      vehicles, insurances: insurance, contracts, bankTx, today: TODAY,
    }).map((c) => ({
      id: `서류:${c.kind}:${c.plate}`,
      sev: c.sev === 'high' ? 'high' as Sev : 'mid' as Sev,
      kind: c.kind,
      target: c.plate,
      detail: `${c.detail} — ${c.evidence.join(' · ')}`,
      href: c.plate ? `/vehicle/${encodeURIComponent(c.plate)}` : '/asset',
      co: c.companyId,
    }));
    const all = [...compliance, ...cross, ...base, ...dataChecks(data)].sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
    return { items: all, unpaidTotal: selectReceivables(contracts, TODAY).total };
  }, [vehicles, contracts, insurance, penalty, bankTx]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (!open || !items.length || openedRef.done === open) return;
    const hit = items.find((it) => it.id === open || it.id === decodeURIComponent(open));
    if (!hit) return;
    openedRef.done = open;
    setSelectedId(hit.id);
  }, [searchParams, items, openedRef]);

  const sevSel = (['위험', '주의'] as const).filter((x) => facets.has(x));
  const shown = items.filter((it) => {
    if (sevSel.length && !((sevSel.includes('위험') && it.sev === 'high') || (sevSel.includes('주의') && it.sev === 'mid'))) return false;
    if (!riskKindMatch(facets, it.kind)) return false;
    return textMatch(q, it.target, it.detail, it.kind);
  });
  const highCount = items.filter((it) => it.sev === 'high').length;
  const midCount = items.filter((it) => it.sev === 'mid').length;
  const inspCount = items.filter((it) => it.kind.includes('검사')).length;
  const insCount = items.filter((it) => it.kind.includes('보험') || it.kind.includes('면허')).length;
  const compCount = items.filter((it) => it.id.startsWith('컴플라이언스:')).length;

  const counts = useMemo(() => {
    const kinds = ['필수누락', '만기', '고아', '날짜역전', '미납', '보험불일치', '반납지남', '면허 만료', '면허 미확인', '무보험 운행',
      // 서류 교차검증 5종 — 업로드한 서류와 데이터가 어긋난 것
      '번호오기입', '정체불명', '무보험', '서류미비', '차종불일치'];
    const c: Record<string, number> = { 위험: 0, 주의: 0 };
    for (const k of kinds) c[k] = 0;
    for (const it of items) {
      if (it.sev === 'high') c['위험']++; else if (it.sev === 'mid') c['주의']++;
      for (const k of kinds) if (riskKindMatch(new Set([k]), it.kind)) c[k]++;
    }
    return c;
  }, [items]);

  const cols: SheetCol<RiskItem>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (it: RiskItem) => <span style={{ color: C.mute }}>{companyLabel(it.co)}</span>, text: (it: RiskItem) => companyLabel(it.co) }] : []),
    { key: 'sev', label: '위험도', render: (it) => <SevTag high={it.sev === 'high'} />, text: (it) => (it.sev === 'high' ? '위험' : '주의') },
    { key: 'target', label: '대상', render: (it) => it.target, text: (it) => it.target },
    { key: 'risk', label: '내용', text: (it) => `${it.kind} ${it.detail}`, render: (it) => {
        const col = it.sev === 'high' ? C.danger : C.warn;
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Badge tone={RISK_TONE[it.kind] || 'gray'}>{it.kind}</Badge>
            <span style={{ color: col, fontWeight: 700 }}>{it.detail}</span>
          </span>
        );
      } },
  ];

  return (
    <FacetPage
      title="정합성"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${items.length}건 · 컴플 ${compCount}`}
      tools={<WorkbenchBar search={{ value: q, onChange: setQ, placeholder: '대상·내용·종류' }} stat={<span style={{ fontSize: 13, fontWeight: 800, color: highCount ? C.danger : C.ok, whiteSpace: 'nowrap' }}>위험 {highCount}</span>} />}
      rail={!loading ? <FacetRail lensKey="정합성" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      <Sec id="i-summary" title="요약">
        <Cards min={128} fit>
          <Metric label="전체" value={loading ? '…' : items.length} tone={items.length ? 'warn' : 'ok'} onClick={resetFacets} />
          <Metric label="위험 / 주의" value={loading ? '…' : `${highCount} / ${midCount}`} tone={highCount ? 'danger' : 'warn'} />
          <Metric label="컴플라이언스" value={loading ? '…' : compCount} tone={compCount ? 'danger' : 'ink'} />
          <Metric label="미납합" value={loading ? '…' : won(unpaidTotal)} tone={unpaidTotal > 0 ? 'danger' : 'ink'} />
          <Metric label="검사·보험·면허" value={loading ? '…' : inspCount + insCount} tone={(inspCount + insCount) ? 'warn' : 'ink'} />
        </Cards>
      </Sec>
      <Sec id="i-list" title="상세 목록" n={shown.length}>
        {loading ? <PageLoading />
          : items.length === 0 ? <EmptyState><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.ok, fontWeight: 700 }}><CheckCircle2 size={15} /> 이상 없음 — 정합성 모두 일치</span></EmptyState>
          : shown.length === 0 ? <EmptyState>해당 항목 없음</EmptyState>
          : (
            <ExcelSheet
              cols={cols}
              rows={shown}
              rowKey={(it) => it.id}
              selectedRowKey={selectedId}
              onRow={(it) => { setSelectedId(it.id); router.push(it.href); }}
            />
          )}
      </Sec>
    </FacetPage>
  );
}

export default function IntegrityPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <IntegrityInner />
    </Suspense>
  );
}
