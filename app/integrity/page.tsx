'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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

// 리스크 = 정합성이 안 맞는 모든 것. 베이스 경고 + 데이터 점검을 같은 규격 한 줄로. 필터=공용 FacetRail(lensKey='정합성').
type Sev = 'high' | 'mid';
type RiskItem = { sev: Sev; kind: string; target: string; detail: string; href: string; co: unknown };

// 정합성 점검에 쓰는 엔티티만 — ENTITIES 전체 fan-out 금지(필수누락·고아·만기 SSOT 범위).
const RISK_ENTITIES = ['vehicle', 'contract', 'insurance', 'penalty'] as const;

// 데이터 정합성 점검(심화) — 같은 RiskItem 으로 산출.
function dataChecks(data: Record<string, EntityRecord[]>): RiskItem[] {
  const out: RiskItem[] = [];
  const vehicles = data.vehicle || [];
  const plates = new Set(vehicles.map((v) => String(v.plate || '')).filter(Boolean));
  const push = (sev: Sev, kind: string, entity: string, rec: EntityRecord, detail: string) => {
    const plate = String(rec.plate || '');
    const href = plate
      ? `/vehicle/${encodeURIComponent(plate)}`
      : `/list/${entity}/${encodeURIComponent(String(rec._key || ''))}`;
    out.push({ sev, kind, target: `${ENTITIES[entity]?.label || entity}${plate ? ' · ' + plate : ''}`, detail, href, co: rec.companyId });
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
    if (k.startDate && k.endDate && String(k.startDate) > String(k.endDate)) push('high', '날짜역전', 'contract', k, `시작 ${k.startDate} > 종료 ${k.endDate}`);
  return out;
}

export default function RiskPage() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const { data: [vehicles = [], contracts = [], insurance = [], penalty = []], loading } = useEntityLists(RISK_ENTITIES);
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const { items, unpaidTotal } = useMemo(() => {
    const data: Record<string, EntityRecord[]> = { vehicle: vehicles, contract: contracts, insurance, penalty };
    const base: RiskItem[] = scanRisks(contracts, TODAY).flatMap((r) =>
      r.flags.map((f) => ({ sev: f.sev === 'high' ? 'high' as Sev : 'mid' as Sev, kind: f.kind,
        target: `${r.rec.plate || ''} · ${r.rec.contractorName || ''}`, detail: f.detail,
        href: r.rec.plate ? `/vehicle/${encodeURIComponent(String(r.rec.plate))}?do=unpaid` : `/contract`, co: r.rec.companyId })));
    const all = [...base, ...dataChecks(data)].sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
    return { items: all, unpaidTotal: selectReceivables(contracts, TODAY).total };
  }, [vehicles, contracts, insurance, penalty]);

  const sevSel = (['위험', '주의'] as const).filter((x) => facets.has(x));
  const shown = items.filter((it) => {
    if (sevSel.length && !((sevSel.includes('위험') && it.sev === 'high') || (sevSel.includes('주의') && it.sev === 'mid'))) return false;
    if (!riskKindMatch(facets, it.kind)) return false;
    return textMatch(q, it.target, it.detail, it.kind);
  });
  const highCount = items.filter((it) => it.sev === 'high').length;
  const midCount = items.filter((it) => it.sev === 'mid').length;
  const inspCount = items.filter((it) => it.kind.includes('검사')).length;
  const insCount = items.filter((it) => it.kind.includes('보험')).length;

  // 칩별 매칭 건수(erp3식 '라벨(N)') — 심각도=sev, 종류=riskKindMatch(단일 라벨) 재사용. 전체 정적 집계.
  const counts = useMemo(() => {
    const kinds = ['필수누락', '만기', '고아', '날짜역전', '미납', '보험불일치', '반납지남'];
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
    { key: 'risk', label: '리스크 내용', text: (it) => `${it.kind === '미수' ? '미납' : it.kind} ${it.detail}`, render: (it) => {
        const label = it.kind === '미수' ? '미납' : it.kind;
        const col = it.sev === 'high' ? C.danger : C.warn;
        const body = it.detail.replace(new RegExp('^' + it.kind + '\\s*'), '').replace(/^미수\s*/, '');
        return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Badge tone={RISK_TONE[it.kind] || 'gray'}>{label}</Badge><span style={{ color: col, fontWeight: 700 }}>{body}</span></span>;
      } },
  ];

  return (
    <FacetPage
      title="리스크 관리"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · ${items.length}건`}
      tools={<WorkbenchBar search={{ value: q, onChange: setQ, placeholder: '대상·내용·종류' }} stat={<span style={{ fontSize: 13, fontWeight: 800, color: highCount ? C.danger : C.ok, whiteSpace: 'nowrap' }}>위험 {highCount}</span>} />}
      rail={!loading ? <FacetRail lensKey="정합성" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : null}
    >
      <Sec id="i-summary" title="리스크 요약">
        <Cards min={128} fit>
          <Metric label="전체 리스크" value={loading ? '…' : items.length} tone={items.length ? 'warn' : 'ok'} onClick={resetFacets} />
          <Metric label="위험 / 주의" value={loading ? '…' : `${highCount} / ${midCount}`} tone={highCount ? 'danger' : 'warn'} />
          <Metric label="미납" value={loading ? '…' : won(unpaidTotal)} tone={unpaidTotal > 0 ? 'danger' : 'ink'} />
          <Metric label="검사·만기" value={loading ? '…' : inspCount} tone={inspCount ? 'warn' : 'ink'} />
          <Metric label="보험·서류" value={loading ? '…' : insCount} tone={insCount ? 'warn' : 'ink'} />
        </Cards>
      </Sec>
      <Sec id="i-list" title="위험 상세 목록" n={shown.length}>
        {loading ? <PageLoading />
          : items.length === 0 ? <EmptyState><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.ok, fontWeight: 700 }}><CheckCircle2 size={15} /> 이상 없음 — 정합성 모두 일치</span></EmptyState>
          : shown.length === 0 ? <EmptyState>해당 리스크 없음</EmptyState>
          : <ExcelSheet cols={cols} rows={shown} rowKey={(it, i) => `${it.href}-${i}`} onRow={(it) => router.push(it.href)} />}
      </Sec>
    </FacetPage>
  );
}
