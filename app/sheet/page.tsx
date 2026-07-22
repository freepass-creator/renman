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
import { ASSET_COLS } from '@/lib/sheet-cols';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { downloadCsv } from '@/lib/export-csv';
import { useEntityLists } from '@/lib/use-entity-lists';
import { Page, ExcelSheet, Badge, Btn, EmptyState, PageLoading, won, C, type SheetCol } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

type Tab = '자산' | '계약' | '미수';
const TABS: Tab[] = ['자산', '계약', '미수'];

/* ── 열 문법 (전 탭 공통) ─────────────────────────────────────────
 *   ① 무엇 : 차량번호(고정) · 법인 · 차명
 *   ② 누구 : 계약자
 *   ③ 돈   : 대여료 · 보증금 · 미수        ← 금액은 항상 우측정렬·이 순서
 *   ④ 시간 : 시작 · 만기 · D-day
 *   ⑤ 상태 : 상태 뱃지 · 연체일 · 미납회차
 *   ⑥ 연락 : 연락처                        ← 항상 맨 끝
 * 탭마다 «빼기»만 한다. 자리를 바꾸지 않는다 — 탭을 옮겨도 눈이 같은 데를 본다.
 * 라벨도 고정: 같은 값은 어느 탭에서든 같은 이름.
 * ───────────────────────────────────────────────────────────── */

const misu = (r: ContractRow) =>
  r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—';

const CT = {
  // 틀고정 안 함 — 고정 칸은 자기 배경이 필요해 행 호버가 그 칸만 끊긴다(전 행 한 줄로 읽혀야 함).
  plate: { key: 'plate', label: '차량번호', render: (r) => r.plate || '—', text: (r) => r.plate },
  co: { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  car: { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  cust: { key: 'cust', label: '계약자', render: (r) => r.customer || '—', text: (r) => r.customer },
  rent: { key: 'rent', label: '대여료', align: 'r', render: (r) => r.rent ? won(r.rent) : '—', text: (r) => r.rent },
  dep: { key: 'dep', label: '보증금', align: 'r', render: (r) => r.deposit ? won(r.deposit) : '—', text: (r) => r.deposit },
  net: { key: 'net', label: '미수', align: 'r', render: misu, text: (r) => r.net },
  start: { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  end: { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  dday: {
    key: 'dday', label: 'D-day', align: 'r',
    render: (r) => r.dday == null ? '—' : r.dday < 0 ? <span style={{ color: C.danger }}>{r.dday}</span> : `D-${r.dday}`,
    text: (r) => r.dday ?? '',
  },
  ret: { key: 'ret', label: '반납일', render: (r) => r.returned || '—', text: (r) => r.returned },
  st: { key: 'st', label: '상태', render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  od: {
    key: 'od', label: '연체일', align: 'r',
    render: (r) => r.overdueDays > 0
      ? <span style={{ color: r.overdueDays >= 90 ? C.danger : C.warn, fontWeight: 700 }}>{r.overdueDays}일</span>
      : '—',
    text: (r) => r.overdueDays,
  },
  cnt: { key: 'cnt', label: '미납회차', align: 'r', render: (r) => r.count || '—', text: (r) => r.count },
  phone: { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
} satisfies Record<string, SheetCol<ContractRow>>;

// 계약 = 기준 열. 미수 탭은 여기에 회수 열만 더한 것(자리 동일).
const CONTRACT_COLS: SheetCol<ContractRow>[] = [
  CT.plate, CT.co, CT.car, CT.cust,
  CT.rent, CT.dep, CT.net,
  CT.start, CT.end, CT.dday,
  CT.st,
  CT.phone,
];

/* 미수 = 미수 있는 계약. 회수 판단 열(연체일·미납회차)을 ⑤ 자리에 «추가»한다 — 앞으로 당기지 않는다.
   반납 건도 미수가 남아 있으면 여기 뜬다(반납했다고 채권이 사라지지 않는다). */
const DEBT_COLS: SheetCol<ContractRow>[] = [
  CT.plate, CT.co, CT.car, CT.cust,
  CT.rent, CT.dep, CT.net,
  CT.start, CT.end, CT.dday,
  CT.st, CT.od, CT.cnt,
  CT.phone,
];

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
