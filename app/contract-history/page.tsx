'use client';
// 지난 계약 — (a) 현황형: 카드↔엑셀 · FacetRail(지난계약 렌즈) · Sec.
import { useEffect, useMemo, useState } from 'react';
import { LayoutGrid, Table } from 'lucide-react';
import { useSession } from '@/lib/session';
import { normPlate } from '@/lib/plate';
import { type EntityRecord } from '@/lib/intake/entities';
import { FacetPage, Sec, EmptyState, Badge, TextLink, ExcelSheet, IconSeg, ObjCard, won, C, SPACE_M, type SheetCol, PageLoading } from '@/components/ui';
import { FacetRail } from '@/components/FacetRail';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { companyLabel } from '@/lib/companies';
import { openCar } from '@/lib/ui-bus';
import { useEntityList } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';

const yy = (s: unknown) => { const t = String(s || ''); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(2, 10) : (t || '—'); };
const endKind = (c: EntityRecord): '만료' | '중도해지' | '기타' => {
  const r = String(c.endReason || c.status || '');
  if (r.includes('중도')) return '중도해지';
  if (r.includes('만료') || r.includes('종료') || r.includes('반납')) return '만료';
  return '기타';
};

export default function ContractHistoryPage() {
  const { companyId, scopeAll } = useSession();
  const [plate, setPlate] = useState('');
  const [facets, setFacets] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [view, setView] = useState<'card' | 'excel'>('card');
  const { rows, loading } = useEntityList('contract');
  useEffect(() => { try { setPlate(new URLSearchParams(window.location.search).get('plate') || ''); } catch { /* 무시 */ } }, []);
  const toggleFacet = (label: string) => setFacets((s) => { const n = new Set(s); n.has(label) ? n.delete(label) : n.add(label); return n; });
  const resetFacets = () => setFacets(new Set());

  const past = useMemo(() => rows
    .filter((c) => c.returnedDate && (!plate || normPlate(c.plate) === normPlate(plate)))
    .sort((a, b) => String(b.returnedDate || '').localeCompare(String(a.returnedDate || ''))), [rows, plate]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { 만료: 0, 중도해지: 0, 기타: 0 };
    for (const r of past) c[endKind(r)]++;
    return c;
  }, [past]);

  const shown = past.filter((c) => {
    if (facets.size && !facets.has(endKind(c))) return false;
    return textMatch(q, c.contractorName, c.plate, c.contractNo, c.endReason);
  });

  const cols: SheetCol<EntityRecord>[] = [
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (c: EntityRecord) => <span style={{ color: C.mute }}>{companyLabel(c.companyId)}</span>, text: (c: EntityRecord) => companyLabel(c.companyId) }] : []),
    ...(plate ? [] : [{ key: 'plate', label: '차량', render: (c: EntityRecord) => <TextLink mono onClick={() => openCar(String(c.plate || ''))}>{String(c.plate || '—')}</TextLink>, text: (c: EntityRecord) => String(c.plate || '') }]),
    { key: 'name', label: '계약자', render: (c) => String(c.contractorName || c.contractNo || '—'), text: (c) => String(c.contractorName || c.contractNo || '') },
    { key: 'period', label: '기간', render: (c) => `${yy(c.startDate)} ~ ${yy(c.returnedDate || c.endDate)}`, text: (c) => `${c.startDate}~${c.returnedDate || c.endDate}` },
    { key: 'rent', label: '월대여료', align: 'r', sortNum: true, render: (c) => (c.monthlyRent ? won(c.monthlyRent) : '—'), text: (c) => Number(c.monthlyRent) || 0 },
    { key: 'months', label: '개월', align: 'r', sortNum: true, render: (c) => (c.rentalMonths ? `${c.rentalMonths}` : '—'), text: (c) => Number(c.rentalMonths) || 0 },
    { key: 'end', label: '반납일', align: 'r', render: (c) => yy(c.returnedDate), text: (c) => String(c.returnedDate || '') },
    { key: 'reason', label: '종료사유', render: (c) => <Badge tone={String(c.endReason) === '중도해지' ? 'amber' : 'gray'}>{String(c.endReason || c.status || '종료')}</Badge>, text: (c) => String(c.endReason || c.status || '종료') },
  ];

  return (
    <FacetPage
      title="지난 계약"
      meta={`${plate ? plate : companyLabel(companyId)} · 종료 ${past.length}건`}
      tools={<WorkbenchBar
        search={{ value: q, onChange: setQ, placeholder: '손님·차량·사유' }}
        view={<IconSeg value={view} onChange={setView} options={[
          { key: 'card', label: '카드', icon: <LayoutGrid size={15} /> },
          { key: 'excel', label: '엑셀', icon: <Table size={15} /> },
        ]} />}
      />}
      rail={!loading && !plate ? <FacetRail lensKey="지난계약" facets={facets} onToggle={toggleFacet} onReset={resetFacets} counts={counts} /> : undefined}
    >
      {loading ? <PageLoading />
        : past.length === 0 ? <EmptyState>지난 계약 없음</EmptyState>
          : view === 'excel'
            ? (shown.length === 0 ? <EmptyState>해당 계약 없음</EmptyState>
              : <ExcelSheet cols={cols} rows={shown} rowKey={(c) => String(c._key || c.contractNo || '')} />)
            : (
              <Sec id="ch-list" title="종료 계약" n={shown.length} desc="반납일 최신순">
                {shown.length === 0 ? <EmptyState variant="sec">해당 계약 없음</EmptyState>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
                    {shown.map((c) => (
                      <ObjCard
                        key={String(c._key || c.contractNo)}
                        badge={endKind(c)}
                        badgeTone={endKind(c) === '중도해지' ? 'amber' : 'gray'}
                        co={scopeAll ? String(c.companyId || '') : undefined}
                        plate={plate ? undefined : String(c.plate || '')}
                        name={String(c.contractorName || c.contractNo || '—')}
                        carType={plate ? undefined : String(c.carName || '')}
                        fields={[
                          ['기간', `${yy(c.startDate)} ~ ${yy(c.returnedDate || c.endDate)}`],
                          ['월대여료', c.monthlyRent ? won(c.monthlyRent) : '—'],
                          ['반납일', yy(c.returnedDate)],
                        ]}
                        onClick={() => { if (c.plate) openCar(String(c.plate)); }}
                      />
                    ))}
                  </div>}
              </Sec>
            )}
    </FacetPage>
  );
}
