'use client';
/**
 * 일정관리 — buildAgenda 원장 (홈 브리핑과 분리).
 * 옛 홈 탭「일정」흡수처. /desk 유지.
 */
import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { buildAgenda } from '@/lib/agenda';
import { AGENDA_BASIC_COLS, AGENDA_DETAIL_SECTIONS, AGENDA_EXPANDED_COLS } from '@/lib/agenda-cols';
import { useEntityLists } from '@/lib/use-entity-lists';
import { textMatch } from '@/lib/search-match';
import {
  Btn, C, FilterChips, LedgerActions, LedgerFrame, LedgerRecordPanel, Search,
  type LedgerColView,
} from '@/components/ui';
import { useIsMobile } from '@/lib/use-mobile';
import { openCar } from '@/lib/ui-bus';

type AgendaStatusFilter = '어김' | '임박' | '예정';

export default function DeskPage() {
  const mobile = useIsMobile();
  const { data: [contracts = [], vehicles = [], insurances = [], penalties = []], loading } = useEntityLists([
    'contract', 'vehicle', 'insurance', 'penalty',
  ]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<AgendaStatusFilter | null>(null);
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selected, setSelected] = useState<ReturnType<typeof buildAgenda>[number] | null>(null);

  const allRows = useMemo(
    () => buildAgenda(contracts, vehicles, insurances, penalties),
    [contracts, vehicles, insurances, penalties],
  );
  const rows = useMemo(() => allRows.filter((r) => {
    if (status && r.status !== status) return false;
    return textMatch(q, r.company, r.plate, r.title, r.kind, r.status, r.date);
  }), [allRows, status, q]);
  const broken = allRows.filter((r) => r.status === '어김').length;

  return (
    <LedgerFrame
      title="일정관리"
      right={undefined}
      filters={(
        <>
          <Search size="sm" placeholder="회사·차량·구분·상태" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: mobile ? '100%' : 240 }} />
          <FilterChips
            allowOff
            value={status}
            onChange={setStatus}
            options={[
              { key: '어김', label: '어김' },
              { key: '임박', label: '임박' },
              { key: '예정', label: '예정' },
            ]}
          />
        </>
      )}
      stats={<span style={{ fontSize: 12.5, color: C.mute }}>전체 <b>{rows.length}</b> · 어김 <b style={{ color: broken ? C.danger : C.ok }}>{broken}</b></span>}
      colView={colView}
      onColView={setColView}
      loading={loading}
      empty="일정이 없습니다."
      cols={colView === '기본' ? AGENDA_BASIC_COLS : AGENDA_EXPANDED_COLS}
      rows={rows}
      rowKey={(r) => r.key}
      selectedRowKey={selected?.key}
      onRowDoubleClick={setSelected}
      onCloseDetail={() => setSelected(null)}
      sidePanel={selected ? (
        <LedgerRecordPanel
          title={selected.plate || selected.kind}
          subtitle={`${selected.status} · ${selected.kind} · ${selected.date}`}
          row={selected}
          cols={AGENDA_EXPANDED_COLS}
          sections={AGENDA_DETAIL_SECTIONS}
          onClose={() => setSelected(null)}
          actions={selected.plate ? (
            <LedgerActions>
              <Btn size="sm" variant="ghost" iconOnly tip="차량 상세" onClick={() => openCar(selected.plate)}>
                <ExternalLink size={14} />
              </Btn>
            </LedgerActions>
          ) : null}
        />
      ) : null}
    />
  );
}
