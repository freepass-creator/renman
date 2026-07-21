'use client';
/**
 * 운영시트 — 프리패스 엑셀뷰 이식. 함대+계약 현황을 표로 한눈.
 * 카드/리스트 토글 금지 · ExcelSheet 원자만. 행 클릭 → Vehicle360.
 */
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildSheetRows, type SheetRow } from '@/lib/sheet-rows';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Page, ExcelSheet, Badge, Btn, EmptyState, PageLoading, won, C, type SheetCol } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

const toneBadge = (t: SheetRow['tone']): 'green' | 'amber' | 'red' | 'gray' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';

const COLS: SheetCol<SheetRow>[] = [
  { key: 'plate', label: '차량번호', pin: true, render: (r) => r.plate || '—', text: (r) => r.plate },
  { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'own', label: '소유', render: (r) => <Badge tone="gray">{r.ownership}</Badge>, text: (r) => r.ownership },
  { key: 'util', label: '가동', render: (r) => <Badge tone={toneBadge(r.tone)}>{r.util}</Badge>, text: (r) => r.util },
  { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  { key: 'year', label: '연식', render: (r) => r.year || '—', text: (r) => r.year },
  { key: 'cust', label: '계약자', render: (r) => r.customer || '—', text: (r) => r.customer },
  { key: 'rent', label: '대여료', align: 'r', render: (r) => r.rent ? won(r.rent) : '—', text: (r) => r.rent },
  {
    key: 'net', label: '미수', align: 'r',
    render: (r) => r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—',
    text: (r) => r.net,
  },
  { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  {
    key: 'dday', label: 'D-day', align: 'r',
    render: (r) => r.dday == null ? '—' : r.dday < 0 ? <span style={{ color: C.danger }}>{r.dday}</span> : `D-${r.dday}`,
    text: (r) => r.dday ?? '',
  },
];

export default function SheetPage() {
  const { data: [vs = [], cs = []], loading } = useEntityLists(['vehicle', 'contract']);
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const fleet = linkFleet(vs, cs, TODAY);
    let list = buildSheetRows(fleet.vehicles);
    if (q.trim()) list = list.filter((r) => textMatch(q, r.plate, r.carName, r.customer, r.company, r.util, r.ownership));
    return list;
  }, [vs, cs, q]);

  const exportCsv = () => {
    downloadCsv(
      `운영시트_${TODAY}`,
      COLS.map((c) => c.label),
      rows.map((r) => COLS.map((c) => (c.text ? c.text(r) : ''))),
    );
  };

  if (loading) return <Page title="운영시트"><PageLoading /></Page>;

  return (
    <Page
      title="운영시트"
      meta={`원장 한눈 · ${rows.length}대`}
      tools={<WorkbenchBar search={{ value: q, onChange: setQ, placeholder: '차번·차명·계약자' }} actions={
        <Btn size="sm" variant="ghost" onClick={exportCsv} disabled={!rows.length}><Download size={14} /> CSV</Btn>
      } />}
    >
      {!rows.length
        ? <EmptyState>표시할 차량이 없습니다</EmptyState>
        : <ExcelSheet cols={COLS} rows={rows} rowKey={(r) => r.plate} onRow={(r) => openCar(r.plate)} />}
    </Page>
  );
}
