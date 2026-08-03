'use client';
/**
 * 리스크관리 — 예외 통합 원장 (LedgerFrame).
 *   상단 = 지시 · 표 = 어느 건.
 *   선택 = 클릭/Shift/Ctrl · 우클릭 메뉴 · LedgerSelectionBar.
 * TODO(2단계): ack/snoozeUntil — 지시 무시·미루기.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileWarning, HandCoins, MessageSquare } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { textMatch } from '@/lib/search-match';
import { buildRiskSheetRows, countRiskSheetGroups, type RiskSheetGroup, type RiskSheetRow } from '@/lib/risk-ledger';
import { RISK_BASIC_COLS, RISK_DETAIL_SECTIONS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { latestDateOf } from '@/lib/ledger-stats';
import { sendNoticeCert, sendNoticeCertBulk } from '@/lib/docs/send-notice';
import { useSession } from '@/lib/session';
import { toast } from '@/lib/toast';
import { openCar, openFinance, openIngest, openReceivables } from '@/lib/ui-bus';
import { useTableSelection } from '@/lib/use-table-selection';
import { useRowSelection, useCtrlASelectAll } from '@/lib/use-row-selection';
import {
  Badge, Btn, C, ContextMenu, type ContextMenuItem, LedgerActiveFilters, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel, LedgerSelectionBar, PageLoading, PeriodBar, Search, useSheetExport, won,
  useConfirm,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import {
  RISK_FILTER_DEFS, countActiveFilters, emptyFilterValues,
} from '@/lib/ledger-filter-defs';
import { NotifyDialog } from '@/components/NotifyDialog';
import { notifyRecipients } from '@/lib/notify/recipients';

type GroupFilter = '전체' | RiskSheetGroup;

const RISK_GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];

function RiskLedgerInner() {
  const mobile = useIsMobile();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const { companyId, isOperator } = useSession();
  const { contracts, vehicles, insurances, penalties, history, bankTx, loading, error: loadError } = useDashboardData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<RiskSheetRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(RISK_FILTER_DEFS));
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsRecipients, setSmsRecipients] = useState<ReturnType<typeof notifyRecipients>>([]);

  const xl = useSheetExport<RiskSheetRow>({
    title: '리스크관리',
    filterSummary: () => {
      const parts = [group === '전체' ? '' : group, detailFilters.kind, detailFilters.status].filter(Boolean);
      if (range.from || range.to) parts.push(`${range.from || '…'}~${range.to || '…'}`);
      if (q.trim()) parts.push('검색');
      return parts.join(' · ') || '전체';
    },
  });

  const sel = useTableSelection();
  const { clear: clearSel } = sel;

  const allRows = useMemo(
    () => buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, TODAY, bankTx),
    [vehicles, contracts, insurances, penalties, history, bankTx],
  );
  const searched = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.company, r.group, r.kind, r.plate, r.customer, r.subject, r.carName, r.status, r.due),
  ), [allRows, q]);
  /* 필터 옵션 — 실제 데이터에서 수집한다(분류·상태 값을 바꿔도 필터가 따라오게).
     구분 필터가 걸려 있으면 그 구분 안의 분류·상태만 보여준다(빈 조합 선택 방지). */
  const kindOptions = useMemo(() => {
    const base = group === '전체' ? allRows : allRows.filter((r) => r.group === group);
    return [...new Set(base.map((r) => r.kind).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [allRows, group]);
  const statusOptions = useMemo(() => {
    const base = group === '전체' ? allRows : allRows.filter((r) => r.group === group);
    return [...new Set(base.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [allRows, group]);

  const rows = useMemo(() => searched.filter((r) => {
    if (group !== '전체' && r.group !== group) return false;
    if (detailFilters.kind && r.kind !== detailFilters.kind) return false;
    if (detailFilters.status && r.status !== detailFilters.status) return false;
    if (range.from || range.to) {
      if (!r.dueDate) return false;
      if (range.from && r.dueDate < range.from) return false;
      if (range.to && r.dueDate > range.to) return false;
    }
    return true;
  }), [searched, group, detailFilters.kind, detailFilters.status, range.from, range.to]);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const rowSel = useRowSelection({ ids: rowIds, selection: sel });
  useCtrlASelectAll(rowSel, sel);

  useEffect(() => { clearSel(); }, [group, q, range.from, range.to, detailFilters.kind, detailFilters.status, clearSel]);

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
  const activeFilterValues = { ...detailFilters, group: group === '전체' ? '' : group };
  const filterCount = countActiveFilters(activeFilterValues, RISK_FILTER_DEFS);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const selectedRows = useMemo(
    () => [...sel.selectedIds].map((id) => rowById.get(id)).filter(Boolean) as RiskSheetRow[],
    [sel.selectedIds, rowById],
  );
  const noticeTargets = selectedRows.filter((r) => r.group === '미납' && r.contractKey);
  const smsTargets = selectedRows.filter((r) => r.group === '만기' && r.kind === '만기임박' && r.contractKey);
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
    const r = await sendNoticeCert({ rec, companyId: row.companyId || companyId });
    toast(`내용증명 ${r.docNo} · 청구 ${won(r.claim)}`, 'success');
  }

  async function sendBulk(targets: RiskSheetRow[]) {
    const recs = targets
      .map((r) => (r.contractKey ? contractByKey.get(r.contractKey) : undefined))
      .filter(Boolean) as typeof contracts;
    if (!recs.length) return;
    const companies = new Set(recs.map((rec) => String(rec.companyId || companyId)).filter(Boolean));
    if (companies.size > 1) {
      toast('내용증명 일괄 처리는 한 법인씩 선택해 주세요', 'error');
      return;
    }
    if (!(await confirm({ message: `내용증명 ${recs.length}건을 일괄 생성(인쇄)·기록합니까?` }))) return;
    const r = await sendNoticeCertBulk({ recs, companyId: [...companies][0] || companyId });
    toast(`내용증명 일괄 ${r.count}건 · 청구합 ${won(r.totalClaim)}`, 'success');
    clearSel();
  }

  const ctxItems: ContextMenuItem[] = (() => {
    if (!ctxMenu.open || !selectedRows.length) return [];
    const first = selectedRows[0];
    const items: ContextMenuItem[] = [
      {
        label: '상세 열기',
        onClick: () => setSelected(selectedRows[0]),
      },
    ];
    if (first.group === '미납') items.push({ label: '회수 큐 열기', icon: <HandCoins size={14} />, onClick: () => openReceivables() });
    else if (first.kind === '자금미분류') items.push({ label: '자금 분류 열기', onClick: () => openFinance({ unclassified: true }) });
    else if (first.kind === '서류미첨부') items.push({ label: '데이터센터 열기', onClick: () => openIngest('vehicle', first.plate) });
    else if (first.plate) items.push({ label: '차량 360 열기', onClick: () => openCar(first.plate, undefined, first.companyId) });
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
    if (smsTargets.length) {
      items.push({ type: 'separator' });
      items.push({
        label: smsTargets.length > 1
          ? `문자 발송 (${smsTargets.length})`
          : '문자 발송',
        icon: <MessageSquare size={14} />,
        onClick: () => {
          const recs = smsTargets
            .map((r) => (r.contractKey ? contractByKey.get(r.contractKey) : undefined))
            .filter(Boolean) as typeof contracts;
          setSmsRecipients(notifyRecipients(recs, TODAY));
          setSmsOpen(true);
        },
      });
    }
    items.push({ type: 'separator' });
    items.push(xl.exportItem());
    if (sel.size >= 1) items.push(xl.exportItem({ selected: selectedRows }));
    if (isOperator) {
      items.push(xl.exportItem({ unmasked: true }));
      if (sel.size >= 1) items.push(xl.exportItem({ selected: selectedRows, unmasked: true }));
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
            {!filterOpen && <LedgerActiveFilters
              defs={RISK_FILTER_DEFS}
              values={activeFilterValues}
              onClear={(key) => {
                if (key === 'group') {
                  setGroup('전체');
                  setDetailFilters((prev) => ({ ...prev, group: '', kind: '', status: '' }));
                  return;
                }
                setDetailFilters((prev) => ({ ...prev, [key]: '' }));
              }}
              onClearAll={() => { setDetailFilters(emptyFilterValues(RISK_FILTER_DEFS)); setGroup('전체'); }}
            />}
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
                  // 구분을 바꾸면 그 구분에 없는 분류·상태는 해제 — 빈 표가 되는 조합을 막는다.
                  setDetailFilters((prev) => ({ ...prev, group: value, kind: '', status: '' }));
                  return;
                }
                setDetailFilters((prev) => ({ ...prev, [key]: value }));
              }}
              options={{
                group: RISK_GROUPS,
                kind: kindOptions,
                status: statusOptions,
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
        error={loadError}
        empty={group === '전체' ? '지금 챙길 위험이 없습니다' : `${group} 없음`}
        cols={colView === '기본' ? RISK_BASIC_COLS : RISK_EXPANDED_COLS}
        rows={rows}
        mobileCard={(r) => {
          const plate = r.plate && r.plate !== LEDGER_EMPTY.dash ? r.plate : undefined;
          const customer = r.customer && r.customer !== LEDGER_EMPTY.none && r.customer !== LEDGER_EMPTY.dash
            ? r.customer
            : undefined;
          const carName = r.carName && r.carName !== LEDGER_EMPTY.dash ? r.carName : undefined;
          return {
            co: r.company,
            badge: r.status,
            badgeTone: r.badgeTone,
            rail: r.tone === 'danger' ? 'danger' : 'none',
            plate,
            name: plate ? undefined : (customer || r.subject),
            carType: plate ? (customer || carName) : carName,
            fields: [
              ['리스크분류', r.kind],
              ['기한', r.due],
            ],
            right: r.amount > 0 ? won(r.amount) : undefined,
          };
        }}
        rowKey={(r) => r.id}
        selectedRowKey={selected?.id ?? null}
        selectedKeys={sel.selectedIds}
        onView={xl.onView}
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
            {noticeTargets.length > 0 ? <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>회수 큐 열기</Btn> : null}
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
                {selected.group === '미납' ? <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>회수 큐</Btn> : null}
                {selected.kind === '자금미분류' ? <Btn size="sm" variant="ghost" onClick={() => openFinance({ unclassified: true })}>자금 분류</Btn> : null}
                {selected.kind === '서류미첨부' ? <Btn size="sm" variant="ghost" onClick={() => openIngest('vehicle', selected.plate)}>서류 보완</Btn> : null}
                {selected.group !== '미납' && selected.kind !== '자금미분류' && selected.kind !== '서류미첨부' && selected.plate ? (
                  <Btn size="sm" variant="ghost" onClick={() => openCar(selected.plate, undefined, selected.companyId)}>차량 360</Btn>
                ) : null}
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
      {smsOpen && (
        <NotifyDialog
          onClose={() => setSmsOpen(false)}
          recipients={smsRecipients}
          initialLabel="반납 임박"
        />
      )}
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
