'use client';
/**
 * 홈 — 주의원장 LedgerFrame (미결·리스크·휴차).
 * 데이터 = lib/home-briefing SSOT. 하단 원장 바로가기 유지.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { TODAY } from '@/lib/dashboard-consts';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { textMatch } from '@/lib/search-match';
import { openCar, openIngest } from '@/lib/ui-bus';
import { buildHomeSheetRows, homeLedgerShortcuts, type HomeSheetGroup } from '@/lib/home-briefing';
import { HOME_BASIC_COLS, HOME_EXPANDED_COLS } from '@/lib/home-cols';
import {
  Btn, C, FilterChips, LedgerActions, LedgerFrame, PeriodBar, Search,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';

const GROUPS: HomeSheetGroup[] = ['미결', '리스크', '휴차'];
type GroupFilter = '전체' | HomeSheetGroup;

export default function HomePage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { contracts, vehicles, insurances, penalties, history, loading } = useDashboardData();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [range, setRange] = useState({ from: '', to: '' });
  const [colView, setColView] = useState<LedgerColView>('기본');

  const allRows = useMemo(
    () => buildHomeSheetRows(vehicles, contracts, insurances, penalties, history),
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
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);
  const counts = useMemo(() => ({
    전체: searched.length,
    미결: searched.filter((r) => r.group === '미결').length,
    리스크: searched.filter((r) => r.group === '리스크').length,
    휴차: searched.filter((r) => r.group === '휴차').length,
  }), [searched]);

  const shortcutBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
      <span style={{ fontSize: 12, fontWeight: 800, color: C.mute, marginRight: 4 }}>원장 바로가기</span>
      {shortcuts.map((it) => {
        const Icon = it.icon;
        return (
          <Btn key={it.href} size="sm" variant="ghost" onClick={() => router.push(it.href)}>
            <Icon size={14} strokeWidth={2.2} aria-hidden /> {it.label}
          </Btn>
        );
      })}
    </div>
  );

  return (
    <LedgerFrame
      title="홈"
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
            options={([
              { key: '전체' as const, label: '전체', count: counts.전체 || undefined },
              ...GROUPS.map((key) => ({ key, label: key, count: counts[key] || undefined })),
            ])}
          />
          <PeriodBar latest={latest || TODAY} initial="전체" size="sm" onRange={setRange} />
        </>
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
          미결 <b style={{ color: counts.미결 ? C.danger : C.ok }}>{counts.미결}</b>
          {' · '}리스크 <b style={{ color: counts.리스크 ? C.warn : C.ink }}>{counts.리스크}</b>
          {' · '}휴차 <b>{counts.휴차}</b>
        </span>
      )}
      colView={colView}
      onColView={setColView}
      tools={(
        <LedgerActions aria-label="워크플로">
          <Btn size="sm" variant="ghost" iconOnly tip="데이터센터" onClick={() => openIngest()}>
            <UploadCloud size={14} />
          </Btn>
        </LedgerActions>
      )}
      loading={loading}
      empty={(
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <span>{group === '전체' ? '오늘 급한 것 없음' : `${group} 없음`}</span>
          {shortcutBar}
        </div>
      )}
      cols={colView === '기본' ? HOME_BASIC_COLS : HOME_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.id}
      onRow={(r) => { if (r.plate) openCar(r.plate); }}
      onRowDoubleClick={(r) => { if (r.plate) openCar(r.plate); }}
      detail={shortcutBar}
    />
  );
}
