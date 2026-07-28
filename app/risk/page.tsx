'use client';
/**
 * 리스크관리 — 예외 통합 원장 (LedgerFrame).
 * 데이터 = lib/risk-ledger SSOT. 칩: 전체·미완료·미납·만기·휴차.
 */
import { useMemo, useState } from 'react';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { buildRiskSheetRows, type RiskSheetGroup } from '@/lib/risk-ledger';
import { RISK_BASIC_COLS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import {
  C, FilterChips, LedgerFrame, PeriodBar, Search,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

const GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];
type GroupFilter = '전체' | RiskSheetGroup;

export default function RiskPage() {
  const mobile = useIsMobile();
  const { contracts, vehicles, insurances, penalties, history, loading } = useDashboardData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');

  const allRows = useMemo(
    () => buildRiskSheetRows(vehicles, contracts, insurances, penalties, history),
    [vehicles, contracts, insurances, penalties, history],
  );
  const searched = useMemo(() => allRows.filter((r) =>
    textMatch(q, r.group, r.kind, r.plate, r.customer, r.carName, r.status, r.due),
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

  const latest = useMemo(() => allRows.reduce((acc, r) => (r.dueDate > acc ? r.dueDate : acc), TODAY), [allRows]);
  const counts = useMemo(() => ({
    전체: searched.length,
    미완료: searched.filter((r) => r.group === '미완료').length,
    미납: searched.filter((r) => r.group === '미납').length,
    만기: searched.filter((r) => r.group === '만기').length,
    휴차: searched.filter((r) => r.group === '휴차').length,
  }), [searched]);

  return (
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
            style={{ width: mobile ? '100%' : 240 }}
          />
          <FilterChips
            value={group}
            onChange={(v) => { if (v) setGroup(v); }}
            options={[
              { key: '전체' as const, label: '전체', count: counts.전체 || undefined },
              ...GROUPS.map((key) => ({ key, label: key, count: counts[key] || undefined })),
            ]}
          />
          <PeriodBar latest={latest || TODAY} initial="전체" size="sm" onRange={setRange} />
        </>
      )}
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
      onRow={(r) => { if (r.plate) openCar(r.plate); }}
      onRowDoubleClick={(r) => { if (r.plate) openCar(r.plate, r.group === '미납' ? 'unpaid' : undefined); }}
    />
  );
}
