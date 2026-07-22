'use client';
/**
 * 운영시트 — 프리패스 엑셀뷰 이식. 함대+계약 현황을 표로 한눈.
 * 보기전환(카드↔엑셀) = `IconSeg` 원자, 자리는 검색창 오른쪽 고정. 손롤 토글 금지.
 * 표·카드 모두 ExcelSheet 원자 하나가 같은 cols로 그린다. 행 클릭 → Vehicle360.
 *
 * 탭 3종 — 자산(차량 1행) · 계약(계약 1행) · 미수(계약 중 net>0).
 *   손바뀜 때문에 자산 수 ≠ 계약 수인 게 정상.
 *   미수는 계약의 «필터»일 뿐 — 별도 집계 손롤 금지(전부 computeContractView 파생).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildSheetRows, buildContractRows, type SheetRow, type ContractRow } from '@/lib/sheet-rows';
import { ASSET_COLS, CONTRACT_COLS, DEBT_COLS } from '@/lib/sheet-cols';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Page, ExcelSheet, Btn, EmptyState, PageLoading, won, C } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type Tab = '자산' | '계약' | '미수';
const TABS: Tab[] = ['자산', '계약', '미수'];

/* 열 문법(자산·계약·미수)은 lib/sheet-cols SSOT — /sheet·/asset·/contract 공용. */

export default function SheetPage() {
  const { data: [vs = [], cs = []], loading } = useEntityLists(['vehicle', 'contract']);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('자산');
  // 운영시트 = 엑셀 고정(태생이 시트). 카드↔엑셀 토글은 다른 현황(카드 기본)에서 씀. 모바일은 ExcelSheet가 카드 폴백.

  const fleet = useMemo(() => linkFleet(vs, cs, TODAY), [vs, cs]);

  const assetRows = useMemo(() => {
    let list = buildSheetRows(fleet.vehicles);
    if (q.trim()) list = list.filter((r) => textMatch(q, r.plate, r.carName, r.customer, r.company, r.util, r.ownership));
    return list;
  }, [fleet, q]);

  const ctRows = useMemo(() => {
    const all = buildContractRows(fleet.contracts);
    const byTab = tab === '미수' ? all.filter((r) => r.net > 0) : all;
    if (!q.trim()) return byTab;
    return byTab.filter((r) => textMatch(q, r.plate, r.carName, r.customer, r.company, r.status, r.phone));
  }, [fleet, q, tab]);

  const cols = tab === '미수' ? DEBT_COLS : CONTRACT_COLS;

  // 헤더 필터는 ExcelSheet 안에서 돈다 — 그 «결과»를 받아 건수·합계·CSV에 쓴다(페이지에서 재계산 금지).
  const [shownAsset, setShownAsset] = useState<SheetRow[]>([]);
  const [shownCt, setShownCt] = useState<ContractRow[]>([]);
  useEffect(() => { setShownAsset(assetRows); }, [assetRows]);
  useEffect(() => { setShownCt(ctRows); }, [ctRows]);

  const count = tab === '자산' ? shownAsset.length : shownCt.length;
  const debtTotal = useMemo(() => shownCt.reduce((s, r) => s + Math.max(0, r.net), 0), [shownCt]);

  const exportCsv = () => {
    const [labels, body] = tab === '자산'
      ? [ASSET_COLS.map((c) => c.label), shownAsset.map((r) => ASSET_COLS.map((c) => (c.text ? c.text(r) : '')))]
      : [cols.map((c) => c.label), shownCt.map((r) => cols.map((c) => (c.text ? c.text(r) : '')))];
    downloadCsv(`운영시트_${tab}_${TODAY}`, labels, body);
  };

  if (loading) return <Page title="운영시트"><PageLoading /></Page>;

  const meta = tab === '자산'
    ? `원장 한눈 · ${count}대`
    : tab === '미수'
      ? `${count}건 · 미수 ${won(debtTotal)}`
      : `${count}건`;

  return (
    /* tools 대신 left — tools로 넘기면 Page가 「제목·회사·meta·툴바」 순으로 그려서 탭이 건수 뒤로 밀린다.
       left면 회사 필터 바로 옆이 탭 자리. 건수·미수합계는 stat으로 우측에 붙인다. */
    <Page
      title="운영시트"
      left={<WorkbenchBar
        tabs={TABS.map((t) => ({ key: t, label: t }))}
        tab={tab}
        onTab={setTab}
        search={{ value: q, onChange: setQ, placeholder: tab === '자산' ? '차번·차명·계약자' : '차번·계약자·연락처' }}
        /* mid = 탭 «바로 뒤». stat으로 주면 스페이서 건너 우측 끝으로 밀린다 — 건수는 탭이 바꾼 결과라 붙어 있어야 읽힌다. */
        mid={<span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>{meta}</span>}
        actions={<Btn size="sm" variant="ghost" onClick={exportCsv} disabled={!count}><Download size={14} /> CSV</Btn>}
      />}
    >
      {!count
        ? <EmptyState>{tab === '미수' ? '미수 건이 없습니다' : `표시할 ${tab}이 없습니다`}</EmptyState>
        : tab === '자산'
          ? <ExcelSheet cols={ASSET_COLS} rows={assetRows} rowKey={(r) => r.plate} onRow={(r) => openCar(r.plate)} onFiltered={setShownAsset} />
          : <ExcelSheet cols={cols} rows={ctRows} rowKey={(r) => r.contractNo || r.plate} onRow={(r) => openCar(r.plate)} onFiltered={setShownCt} />}
    </Page>
  );
}
