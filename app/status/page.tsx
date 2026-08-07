'use client';
/**
 * 운영현황 — 차량 1대=1행 통합 원장 (LedgerFrame 규격).
 * 기본 스코프 = isVehicleHeld(실물 보유). 필터줄 = 검색·☰필터(기간 없음 — 현재 스냅샷).
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { isVehicleHeld, linkFleet } from '@/lib/domain/model';
import { buildFleetRows, statusRank, type FleetRow } from '@/lib/sheet-rows';
import { FLEET_BASIC_COLS, FLEET_DETAIL_SECTIONS, FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { summarizeFleetStatusStats } from '@/lib/ledger-stats';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, ContextMenu, type ContextMenuItem, LedgerActiveFilters, LedgerFilterButton, LedgerFilterFields, LedgerFilterPanel, LedgerFrame, LedgerRecordPanel,
  Search, useSheetExport, won,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { useSession } from '@/lib/session';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import {
  FLEET_FILTER_DEFS, countActiveFilters, emptyFilterValues, matchLedgerFilters,
} from '@/lib/ledger-filter-defs';
import { openCar, openReceivables } from '@/lib/ui-bus';

type ScopeChip = '전체' | '운행' | '정비' | '휴차' | '리스크';
const SCOPE_OPTS = ['전체', '운행', '정비', '휴차', '리스크'] as const;

export default function StatusPage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { isOperator } = useSession();
  const { data: [vs = [], cs = [], ins = [], hs = []], loading, error: loadError } = useEntityLists(['vehicle', 'contract', 'insurance', 'history']);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<ScopeChip>('전체');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<FleetRow | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [detailFilters, setDetailFilters] = useState(() => emptyFilterValues(FLEET_FILTER_DEFS));
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number }>({ open: false, x: 0, y: 0 });
  const xl = useSheetExport<FleetRow>({
    title: '운영현황',
    filterSummary: () => {
      const parts = [scope === '전체' ? '' : scope].filter(Boolean);
      if (q.trim()) parts.push('검색');
      return parts.join(' · ') || '전체';
    },
  });
  const ctxItems: ContextMenuItem[] = [
    xl.exportItem(),
    ...(isOperator ? [xl.exportItem({ unmasked: true })] : []),
  ];

  const allRows = useMemo(() => {
    const fleet = linkFleet(vs, cs, TODAY);
    return buildFleetRows(fleet.vehicles, ins, fleet.contracts, hs, TODAY)
      .sort((a, b) => statusRank(a) - statusRank(b) || a.plate.localeCompare(b.plate, 'ko'));
  }, [vs, cs, ins, hs]);

  const heldRows = useMemo(() => allRows.filter(isVehicleHeld), [allRows]);

  const searched = useMemo(() => heldRows.filter((r) =>
    textMatch(q, r.company, r.plate, r.carName, r.maker, r.customer, r.phone, r.status, r.util, r.location),
  ), [heldRows, q]);

  const activeScope = (detailFilters.scope || scope || '전체') as ScopeChip;

  const rows = useMemo(() => searched.filter((r) => {
    if (activeScope === '운행' || activeScope === '정비' || activeScope === '휴차') {
      if (r.util !== activeScope) return false;
    } else if (activeScope === '리스크') {
      // 운영현황은 계약유지 미수만 — 종료 미수는 /risk·계약에서.
      if (!(r.maintainedNet > 0 || r.warnings.length > 0 || (r.dday != null && r.dday < 0))) return false;
    }
    return matchLedgerFilters(r, detailFilters, {
      scope: () => true,
      contract: (row, v) => (v === '있음' ? !!row.customer : v === '없음' ? !row.customer : true),
      lifecycle: (row, v) => row.ownership === v,
      status: (row, v) => row.status === v,
      warn: (row, v) => (v === '있음' ? row.warnings.length > 0 : v === '없음' ? row.warnings.length === 0 : true),
    });
  }), [searched, activeScope, detailFilters]);

  const { heldN, utilPct, maintainedNetSum, inspSoon } = useMemo(
    () => summarizeFleetStatusStats(searched, rows),
    [searched, rows],
  );

  // 옵션은 실제 데이터에서 모은다 — 값이 늘어도 필터가 따라온다(빈 조합 방지).
  const lifecycleOpts = useMemo(
    () => [...new Set(heldRows.map((r) => r.ownership).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [heldRows],
  );
  const statusOpts = useMemo(
    () => [...new Set(heldRows.map((r) => r.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
    [heldRows],
  );
  const activeFilterValues = { ...detailFilters, scope: activeScope === '전체' ? '' : activeScope };
  const filterCount = countActiveFilters(activeFilterValues, FLEET_FILTER_DEFS);

  return (
    <>
    <LedgerFrame
      title="운영현황"
      meta="보유 차량 1대=1행 · 조회 전용"
      filters={<>
        <Search
          size="sm"
          placeholder="회사·차량·차명·계약자·상태"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: mobile ? undefined : 280, flex: mobile ? 1 : undefined, minWidth: mobile ? 0 : undefined }}
        />
        <LedgerFilterButton open={filterOpen} count={filterCount} onClick={() => setFilterOpen((o) => !o)} />
        {!filterOpen && <LedgerActiveFilters
          defs={FLEET_FILTER_DEFS}
          values={activeFilterValues}
          onClear={(key) => {
            if (key === 'scope') setScope('전체');
            setDetailFilters((prev) => ({ ...prev, [key]: '' }));
          }}
          onClearAll={() => { setDetailFilters(emptyFilterValues(FLEET_FILTER_DEFS)); setScope('전체'); }}
        />}
      </>}
      filterPanel={filterOpen ? (
        <LedgerFilterPanel
          title="운영 필터"
          onReset={() => {
            setDetailFilters(emptyFilterValues(FLEET_FILTER_DEFS));
            setScope('전체');
          }}
          onClose={() => setFilterOpen(false)}
        >
          <LedgerFilterFields
            defs={FLEET_FILTER_DEFS}
            values={{ ...detailFilters, scope: activeScope === '전체' ? '' : activeScope }}
            onChange={(key, value) => {
              if (key === 'scope') {
                setScope((value || '전체') as ScopeChip);
                setDetailFilters((prev) => ({ ...prev, scope: value }));
                return;
              }
              setDetailFilters((prev) => ({ ...prev, [key]: value }));
            }}
            options={{
              scope: SCOPE_OPTS.filter((s) => s !== '전체'),
              lifecycle: lifecycleOpts,
              status: statusOpts,
              contract: ['있음', '없음'],
              warn: ['있음', '없음'],
            }}
          />
        </LedgerFilterPanel>
      ) : null}
      stats={
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap', display: 'inline-flex', gap: 12 }}>
          <span>보유 <b style={{ color: C.ink }}>{heldN}</b></span>
          <span>가동률 <b style={{ color: utilPct >= 70 ? 'var(--green-text)' : utilPct < 50 ? C.warn : C.ink }}>{utilPct}%</b></span>
          {maintainedNetSum > 0 && <span>계약유지 미수 <b style={{ color: C.danger }}>{won(maintainedNetSum)}</b></span>}
          {inspSoon > 0 && <span>검사임박 <b style={{ color: C.warn }}>{inspSoon}</b></span>}
        </span>
      }
      colView={colView}
      onColView={setColView}
      loading={loading}
      error={loadError}
      empty="표시할 차량이 없습니다."
      cols={colView === '기본' ? FLEET_BASIC_COLS : FLEET_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => `${r.companyId}:${r.plate || r.customer}`}
      selectedRowKey={selected ? `${selected.companyId}:${selected.plate || selected.customer}` : null}
      mobileCard={(r) => ({
        co: isOperator ? r.companyId : undefined,
        badge: r.status,
        badgeTone: r.tone === 'danger' ? 'red' : r.tone === 'warn' ? 'amber' : r.tone === 'ok' ? 'green' : 'gray',
        plate: r.plate || LEDGER_EMPTY.unassigned,
        carType: r.carName || r.ownership || undefined,
        fields: [
          ['계약', r.contractState],
          ['사용처', r.customer || LEDGER_EMPTY.noContract],
          ...(r.warnings.length ? [['확인', `${r.warnings.length}건`] as [string, string]] : []),
        ],
        right: r.maintainedNet > 0 ? won(r.maintainedNet) : undefined,
      })}
      onView={xl.onView}
      onRowContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ open: true, x: e.clientX, y: e.clientY });
      }}
      onRowDoubleClick={(row) => setSelected(row)}
      onCloseDetail={() => setSelected(null)}
      sidePanel={selected ? (
        <LedgerRecordPanel
          title={selected.carName || selected.status || '차량'}
          identity={`${selected.plate || LEDGER_EMPTY.unassigned} · ${selected.customer || LEDGER_EMPTY.noContract}`}
          statusBadge={FLEET_EXPANDED_COLS.find((c) => c.key === 'status')?.render(selected)}
          row={selected}
          cols={FLEET_EXPANDED_COLS}
          sections={FLEET_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={(
            <>
              {selected.plate ? <Btn size="sm" onClick={() => openCar(selected.plate, undefined, selected.companyId)}>차량 360</Btn> : null}
              {selected.contractNo ? <Btn size="sm" variant="ghost" onClick={() => router.push(`/contract?open=${encodeURIComponent(selected.contractNo)}`)}>계약 열기</Btn> : null}
              {selected.maintainedNet > 0 ? <Btn size="sm" variant="ghost" onClick={() => openReceivables()}>미수 회수</Btn> : null}
            </>
          )}
        />
      ) : null}
    />
    <ContextMenu
      open={ctxMenu.open}
      x={ctxMenu.x}
      y={ctxMenu.y}
      onClose={() => setCtxMenu((m) => ({ ...m, open: false }))}
      items={ctxItems}
    />
    </>
  );
}
