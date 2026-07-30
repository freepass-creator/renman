'use client';
/**
 * 리스크관리 — 예외 통합 원장 (LedgerFrame).
 *   상단 = 지시 · 표 = 어느 건.
 *   선택 = 클릭/Shift/Ctrl · 우클릭 메뉴 · LedgerSelectionBar.
 * TODO(2단계): ack/snoozeUntil — 지시 무시·미루기.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileWarning, HandCoins } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { textMatch } from '@/lib/search-match';
import { buildRiskSheetRows, countRiskSheetGroups, riskRail, riskRailStyle, type RiskSheetGroup, type RiskSheetRow } from '@/lib/risk-ledger';
import { RISK_BASIC_COLS, RISK_DETAIL_SECTIONS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { latestDateOf } from '@/lib/ledger-stats';
import { sendNoticeCert, sendNoticeCertBulk } from '@/lib/docs/send-notice';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { openReceivables } from '@/lib/ui-bus';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import {
  Badge, Btn, C, ContextMenu, type ContextMenuItem, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, LedgerSelectionBar, PageLoading, PeriodBar, Search,
  useConfirm, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import {
  RISK_FILTER_DEFS, countActiveFilters, emptyFilterValues,
} from '@/lib/ledger-filter-defs';

type GroupFilter = '전체' | RiskSheetGroup;

const RISK_GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];

function RiskLedgerInner() {
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const { companyId } = useSession();
  const { contracts, vehicles, insurances, penalties, history, bankTx, loading } = useDashboardData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<RiskSheetRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(RISK_FILTER_DEFS));
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });

  const sel = useTableSelection();
  const { clear: clearSel } = sel;

  const allRows = useMemo(
    () => buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, TODAY, bankTx),
    [vehicles, contracts, insurances, penalties, history, bankTx],
  );
  const searched = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.group, r.kind, r.plate, r.customer, r.carName, r.status, r.due),
  ), [allRows, q]);
  const rows = useMemo(() => searched.filter((r) => {
    if (group !== '전체' && r.group !== group) return false;
    if (range.from || range.to) {
      if (!r.dueDate) return false;
      if (range.from && r.dueDate < range.from) return false;
      if (range.to && r.dueDate > range.to) return false;
    }
    return true;
  }), [searched, group, range.from, range.to]);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const rowSel = useRowSelection({ ids: rowIds, selection: sel });
  useCtrlASelectAll(rowSel, sel);

  useEffect(() => { clearSel(); }, [group, q, range.from, range.to, clearSel]);

  // ?group= · ?open= — 지시 스트립·홈 딥링크.
  useEffect(() => {
    const g = searchParams.get('group');
    if (g && (RISK_GROUPS as string[]).includes(g)) {
      setGroup(g as RiskSheetGroup);
      setDetailFilters((prev) => ({ ...prev, group: g }));
    }
  }, [searchParams]);

  useEffect(() => {
    const open = searchParams.get('open');
    if (!open || !allRows.length) return;
    const hit = allRows.find((r) =>
      r.id === open
      || r.id === decodeURIComponent(open)
      || r.plate === open
      || r.contractKey === open,
    );
    if (hit) {
      setSelected(hit);
      sel.setSelectedIds(new Set([hit.id]));
      if (hit.group) {
        setGroup(hit.group);
        setDetailFilters((prev) => ({ ...prev, group: hit.group }));
      }
    }
  // sel.setSelectedIds는 stable
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allRows]);

  const latest = useMemo(() => latestDateOf(allRows, (r) => r.dueDate, TODAY), [allRows]);
  const counts = useMemo(() => countRiskSheetGroups(searched), [searched]);
  const filterCount = countActiveFilters(
    { ...detailFilters, group: group === '전체' ? '' : group },
    RISK_FILTER_DEFS,
  );

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const selectedRows = useMemo(
    () => [...sel.selectedIds].map((id) => rowById.get(id)).filter(Boolean) as RiskSheetRow[],
    [sel.selectedIds, rowById],
  );
  const noticeTargets = selectedRows.filter((r) => r.group === '미납' && r.contractKey);
  const unpaidInView = useMemo(
    () => rows.filter((r) => r.group === '미납' && r.contractKey),
    [rows],
  );

  const contractByKey = useMemo(() => {
    const m = new Map(contracts.map((c) => [String(c._key || ''), c]));
    return m;
  }, [contracts]);

  async function sendOne(row: RiskSheetRow) {
    const rec = row.contractKey ? contractByKey.get(row.contractKey) : undefined;
    if (!rec) { toast('계약 키 없음', 'error'); return; }
    const r = await sendNoticeCert({ rec, companyId });
    toast(`내용증명 ${r.docNo} · 청구 ${won(r.claim)}`, 'success');
  }

  async function sendBulk(targets: RiskSheetRow[]) {
    const recs = targets
      .map((r) => (r.contractKey ? contractByKey.get(r.contractKey) : undefined))
      .filter(Boolean) as typeof contracts;
    if (!recs.length) return;
    if (!(await confirm({ message: `내용증명 ${recs.length}건을 일괄 생성(인쇄)·기록합니까?` }))) return;
    const r = await sendNoticeCertBulk({ recs, companyId });
    toast(`내용증명 일괄 ${r.count}건 · 청구합 ${won(r.totalClaim)}`, 'success');
    clearSel();
  }

  const ctxItems: ContextMenuItem[] = (() => {
    if (!ctxMenu.open || !selectedRows.length) return [];
    const items: ContextMenuItem[] = [
      {
        label: '상세 열기',
        onClick: () => setSelected(selectedRows[0]),
      },
      {
        label: '회수 큐 열기',
        icon: <HandCoins size={14} />,
        onClick: () => openReceivables(),
      },
    ];
    if (noticeTargets.length) {
      items.push({ type: 'separator' });
      items.push({
        label: noticeTargets.length > 1
          ? `내용증명 일괄 (${noticeTargets.length})`
          : '내용증명',
        icon: <FileWarning size={14} />,
        danger: true,
        onClick: () => { void sendBulk(noticeTargets); },
      });
    }
    return items;
  })();

  return (
    <>
      <LedgerFrame
        title="리스크관리"
        meta="챙길 예외·미완료·미납·만기·휴차"
        filters={(
          <>
            <Search
              size="sm"
              placeholder="구분·차번·대상·차명·상태"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: mobile ? 160 : 280, flexShrink: 0 }}
            />
            <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
            <PeriodBar latest={latest || TODAY} initial="전체" size="sm" onRange={setRange} />
          </>
        )}
        filterPanel={filterOpen ? (
          <LedgerFilterPanel
            title="리스크 필터"
            onReset={() => {
              setDetailFilters(emptyFilterValues(RISK_FILTER_DEFS));
              setGroup('전체');
            }}
            onClose={() => setFilterOpen(false)}
          >
            <LedgerFilterFields
              defs={RISK_FILTER_DEFS}
              values={{ ...detailFilters, group: group === '전체' ? '' : group }}
              onChange={(key, value) => {
                if (key === 'group') {
                  setGroup((value || '전체') as GroupFilter);
                  setDetailFilters((prev) => ({ ...prev, group: value }));
                  return;
                }
                setDetailFilters((prev) => ({ ...prev, [key]: value }));
              }}
              options={{
                group: RISK_GROUPS,
              }}
            />
          </LedgerFilterPanel>
        ) : null}
        stats={(
          <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
            미완료 <b style={{ color: counts.미완료 ? C.danger : C.ok }}>{counts.미완료}</b>
            {' · '}미납 <b style={{ color: counts.미납 ? C.danger : C.ink }}>{counts.미납}</b>
            {' · '}만기 <b style={{ color: counts.만기 ? C.warn : C.ink }}>{counts.만기}</b>
            {' · '}휴차 <b>{counts.휴차}</b>
          </span>
        )}
        colView={colView}
        onColView={setColView}
        loading={loading}
        empty={group === '전체' ? '지금 챙길 위험이 없습니다' : `${group} 없음`}
        cols={colView === '기본' ? RISK_BASIC_COLS : RISK_EXPANDED_COLS}
        rows={rows}
        rowKey={(r) => r.id}
        selectedRowKey={selected?.id ?? null}
        rowStyle={(r) => riskRailStyle(riskRail(r))}
        selectedKeys={sel.selectedIds}
        onRowMouseDown={(e) => rowSel.onRowMouseDown(e)}
        onRowClickEvent={(e, r, idx) => {
          rowSel.onRowClick(e, r.id, idx);
        }}
        onRowContextMenu={(e, r, idx) => {
          rowSel.onRowContextMenu(e, r.id, idx, () => {
            setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
          });
        }}
        selectionBar={sel.size > 0 ? (
          <LedgerSelectionBar
            count={sel.size}
            onSelectAll={() => sel.selectAll(unpaidInView.length ? unpaidInView.map((r) => r.id) : rowIds)}
            onClear={() => clearSel()}
          >
            <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>회수 큐 열기</Btn>
            <Btn
              size="sm"
              variant="danger"
              disabled={!noticeTargets.length}
              onClick={() => { void sendBulk(noticeTargets); }}
            >
              내용증명 일괄{noticeTargets.length ? ` (${noticeTargets.length})` : ''}
            </Btn>
          </LedgerSelectionBar>
        ) : null}
        onRowDoubleClick={(r) => setSelected(r)}
        onCloseDetail={() => setSelected(null)}
        sidePanel={selected ? (
          <LedgerRecordPanel
            title={selected.kind || selected.group}
            identity={`${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customer || LEDGER_EMPTY.none}`}
            statusBadge={<Badge tone={selected.badgeTone}>{selected.status}</Badge>}
            row={selected}
            cols={RISK_EXPANDED_COLS}
            sections={RISK_DETAIL_SECTIONS}
            onClose={() => setSelected(null)}
            actions={(
              <>
                <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>회수 큐</Btn>
                {selected.group === '미납' && selected.contractKey && (
                  <Btn size="sm" variant="danger" onClick={() => void sendOne(selected)}>내용증명</Btn>
                )}
              </>
            )}
          />
        ) : null}
      />
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        onClose={() => setCtxMenu((c) => ({ ...c, open: false }))}
        items={ctxItems}
      />
    </>
  );
}

export default function RiskPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <RiskLedgerInner />
    </Suspense>
  );
}
