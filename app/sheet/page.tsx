'use client';
/**
 * 운영시트 — 프리패스 엑셀뷰 이식. 함대+계약 현황을 표로 한눈.
 * 카드/리스트 토글 금지 · ExcelSheet 원자만. 행 클릭 → Vehicle360.
 *
 * 탭 4종 = 사업현황.xlsx 시트 구성 그대로(자산·계약·채권·반납) — 쓰던 장부와 같은 단위.
 *   자산은 차량 1행, 나머지는 계약 1행. 손바뀜 때문에 자산 수 ≠ 계약 수인 게 정상.
 *   채권/반납은 계약의 필터일 뿐 — 별도 집계 손롤 금지(전부 computeContractView 파생).
 */
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildSheetRows, buildContractRows, type SheetRow, type ContractRow } from '@/lib/sheet-rows';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Page, ExcelSheet, Badge, Btn, EmptyState, PageLoading, won, C, type SheetCol } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type Tab = '자산' | '계약' | '채권' | '반납';
const TABS: Tab[] = ['자산', '계약', '채권', '반납'];

const toneBadge = (t: SheetRow['tone']): 'green' | 'amber' | 'red' | 'gray' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';

const ASSET_COLS: SheetCol<SheetRow>[] = [
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

const misu = (r: ContractRow) =>
  r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—';

/** 계약 공통 열 — 앞부분은 세 탭이 같다. */
const CT_BASE: SheetCol<ContractRow>[] = [
  { key: 'plate', label: '차량번호', pin: true, render: (r) => r.plate || '—', text: (r) => r.plate },
  { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'cust', label: '계약자', render: (r) => r.customer || '—', text: (r) => r.customer },
  { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  { key: 'rent', label: '대여료', align: 'r', render: (r) => r.rent ? won(r.rent) : '—', text: (r) => r.rent },
];

const CONTRACT_COLS: SheetCol<ContractRow>[] = [
  ...CT_BASE,
  { key: 'dep', label: '보증금', align: 'r', render: (r) => r.deposit ? won(r.deposit) : '—', text: (r) => r.deposit },
  { key: 'st', label: '상태', render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  {
    key: 'dday', label: 'D-day', align: 'r',
    render: (r) => r.dday == null ? '—' : r.dday < 0 ? <span style={{ color: C.danger }}>{r.dday}</span> : `D-${r.dday}`,
    text: (r) => r.dday ?? '',
  },
  { key: 'net', label: '미수', align: 'r', render: misu, text: (r) => r.net },
  { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
];

/* 채권 = 미수 있는 계약. 회수 판단에 필요한 열(연체일·회차)을 앞으로 뺀다. */
const DEBT_COLS: SheetCol<ContractRow>[] = [
  ...CT_BASE,
  { key: 'net', label: '미수', align: 'r', render: misu, text: (r) => r.net },
  {
    key: 'od', label: '연체일', align: 'r',
    render: (r) => r.overdueDays > 0
      ? <span style={{ color: r.overdueDays >= 90 ? C.danger : C.warn, fontWeight: 700 }}>{r.overdueDays}일</span>
      : '—',
    text: (r) => r.overdueDays,
  },
  { key: 'cnt', label: '미납회차', align: 'r', render: (r) => r.count || '—', text: (r) => r.count },
  { key: 'st', label: '상태', render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
];

/* 반납 = 종료 계약. 반납일과 잔여 채권이 핵심. */
const RETURN_COLS: SheetCol<ContractRow>[] = [
  ...CT_BASE,
  { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  { key: 'ret', label: '반납일', render: (r) => r.returned || '—', text: (r) => r.returned },
  { key: 'dep', label: '보증금', align: 'r', render: (r) => r.deposit ? won(r.deposit) : '—', text: (r) => r.deposit },
  { key: 'net', label: '잔여미수', align: 'r', render: misu, text: (r) => r.net },
  { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
];

export default function SheetPage() {
  const { data: [vs = [], cs = []], loading } = useEntityLists(['vehicle', 'contract']);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('자산');

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);

  const assetRows = useMemo(() => {
    let list = buildSheetRows(fleet.vehicles);
    if (q.trim()) list = list.filter((r) => textMatch(q, r.plate, r.carName, r.customer, r.company, r.util, r.ownership));
    return list;
  }, [fleet, q]);

  const ctRows = useMemo(() => {
    const all = buildContractRows(fleet.contracts);
    const byTab = tab === '채권' ? all.filter((r) => r.net > 0)
      : tab === '반납' ? all.filter((r) => r.ended)
        : all;
    if (!q.trim()) return byTab;
    return byTab.filter((r) => textMatch(q, r.plate, r.carName, r.customer, r.company, r.status, r.phone));
  }, [fleet, q, tab]);

  const cols = tab === '계약' ? CONTRACT_COLS : tab === '채권' ? DEBT_COLS : RETURN_COLS;
  const count = tab === '자산' ? assetRows.length : ctRows.length;
  const debtTotal = useMemo(() => ctRows.reduce((s, r) => s + Math.max(0, r.net), 0), [ctRows]);

  const exportCsv = () => {
    const [labels, body] = tab === '자산'
      ? [ASSET_COLS.map((c) => c.label), assetRows.map((r) => ASSET_COLS.map((c) => (c.text ? c.text(r) : '')))]
      : [cols.map((c) => c.label), ctRows.map((r) => cols.map((c) => (c.text ? c.text(r) : '')))];
    downloadCsv(`운영시트_${tab}_${TODAY}`, labels, body);
  };

  if (loading) return <Page title="운영시트"><PageLoading /></Page>;

  const meta = tab === '자산'
    ? `원장 한눈 · ${count}대`
    : tab === '채권'
      ? `${count}건 · 미수 ${won(debtTotal)}`
      : `${count}건`;

  return (
    <Page
      title="운영시트"
      meta={meta}
      tools={<WorkbenchBar
        tabs={TABS.map((t) => ({ key: t, label: t }))}
        tab={tab}
        onTab={setTab}
        search={{ value: q, onChange: setQ, placeholder: tab === '자산' ? '차번·차명·계약자' : '차번·계약자·연락처' }}
        actions={<Btn size="sm" variant="ghost" onClick={exportCsv} disabled={!count}><Download size={14} /> CSV</Btn>}
      />}
    >
      {!count
        ? <EmptyState>{tab === '채권' ? '미수 건이 없습니다' : `표시할 ${tab}이 없습니다`}</EmptyState>
        : tab === '자산'
          ? <ExcelSheet cols={ASSET_COLS} rows={assetRows} rowKey={(r) => r.plate} onRow={(r) => openCar(r.plate)} />
          : <ExcelSheet cols={cols} rows={ctRows} rowKey={(r) => r.contractNo || r.plate} onRow={(r) => openCar(r.plate)} />}
    </Page>
  );
}
