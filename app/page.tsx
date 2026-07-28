'use client';
/**
 * 홈 — LedgerFrame 엑셀 양식.
 *   탭: 요약 · 미결 · 리스크 · 휴차 · 일정
 *   일정 = 옛 /desk 원장 흡수. 메뉴「일정관리」없음.
 */
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UploadCloud, LayoutDashboard, CircleDollarSign, ExternalLink } from 'lucide-react';
import {
  LedgerFrame, LedgerActions, LedgerRecordPanel, Btn, PillTabs, Search, Sec, Cards, Metric,
  EmptyState, PageLoading, won, C, type LedgerColView,
} from '@/components/ui';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { buildAgenda } from '@/lib/agenda';
import { AGENDA_BASIC_COLS, AGENDA_DETAIL_SECTIONS, AGENDA_EXPANDED_COLS } from '@/lib/agenda-cols';
import { textMatch } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import {
  buildHomeIdleRows, buildHomePendingRows, buildHomeRiskRows,
  type HomeIdleRow, type HomeQueueRow,
} from '@/lib/home-rows';
import {
  HOME_IDLE_BASIC_COLS, HOME_IDLE_EXPANDED_COLS,
  HOME_QUEUE_BASIC_COLS, HOME_QUEUE_EXPANDED_COLS,
} from '@/lib/home-cols';
import { useIsMobile } from '@/lib/use-mobile';

type HomeTab = '요약' | '미결' | '리스크' | '휴차' | '일정';
const TABS: HomeTab[] = ['요약', '미결', '리스크', '휴차', '일정'];

function parseTab(raw: string | null): HomeTab {
  if (raw && (TABS as string[]).includes(raw)) return raw as HomeTab;
  return '요약';
}

function HomeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const mobile = useIsMobile();
  const { D, contracts, vehicles, insurances, penalties, loading } = useDashboardData();

  const tab = parseTab(sp.get('tab'));
  const setTab = (next: HomeTab) => {
    const q = new URLSearchParams(sp.toString());
    if (next === '요약') q.delete('tab');
    else q.set('tab', next);
    const s = q.toString();
    router.replace(s ? `/?${s}` : '/');
  };

  const [q, setQ] = useState('');
  const [colView, setColView] = useState<LedgerColView>('기본');
  const [selectedQueue, setSelectedQueue] = useState<HomeQueueRow | null>(null);
  const [selectedIdle, setSelectedIdle] = useState<HomeIdleRow | null>(null);
  const [selectedAgenda, setSelectedAgenda] = useState<ReturnType<typeof buildAgenda>[number] | null>(null);

  const pendingRows = useMemo(() => buildHomePendingRows(D), [D]);
  const riskRows = useMemo(() => buildHomeRiskRows(D), [D]);
  const idleRows = useMemo(() => buildHomeIdleRows(D), [D]);
  const agendaRows = useMemo(
    () => (loading ? [] : buildAgenda(contracts, vehicles, insurances, penalties)),
    [loading, contracts, vehicles, insurances, penalties],
  );

  const filterQ = <T extends { plate?: string; title?: string; detail?: string; kind?: string; company?: string; carName?: string; status?: string; customer?: string }>(
    rows: T[],
  ) => rows.filter((r) => textMatch(q, r.company, r.plate, r.title, r.detail, r.kind, r.carName, r.status, r.customer));

  const pending = useMemo(() => filterQ(pendingRows), [pendingRows, q]);
  const risks = useMemo(() => filterQ(riskRows), [riskRows, q]);
  const idles = useMemo(() => filterQ(idleRows), [idleRows, q]);
  const agendas = useMemo(
    () => agendaRows.filter((r) => textMatch(q, r.company, r.plate, r.title, r.kind, r.status, r.date)),
    [agendaRows, q],
  );

  const held = D.summary.held;
  const util = D.summary.util;
  const running = D.summary.running;
  const idleN = D.summary.idle;
  const pendingN = pendingRows.length;
  const riskN = riskRows.length;
  const broken = agendaRows.filter((a) => a.status === '어김').length;

  const go = (href: string) => router.push(href);
  const clearSel = () => {
    setSelectedQueue(null);
    setSelectedIdle(null);
    setSelectedAgenda(null);
  };

  const summaryBody = (
    <Sec title="요약" desc="한눈 지표 · 클릭 시 해당 탭·원장">
      <Cards min={128} fit>
        <Metric label="보유" value={`${held}대`} onClick={() => go('/status')} />
        <Metric
          label="가동률"
          value={`${util}%`}
          hint={`운행 ${running} · 휴차 ${idleN}`}
          tone={util >= 70 ? 'ok' : util < 50 ? 'warn' : 'ink'}
          onClick={() => go('/status')}
        />
        <Metric label="미결" value={pendingN} tone={pendingN ? 'danger' : 'ok'} onClick={() => setTab('미결')} />
        <Metric label="리스크" value={riskN} tone={riskN ? 'danger' : 'ink'} onClick={() => setTab('리스크')} />
        <Metric label="휴차" value={idleN} tone={idleN ? 'warn' : 'ink'} onClick={() => setTab('휴차')} />
        <Metric label="일정 어김" value={broken} tone={broken ? 'danger' : 'ok'} onClick={() => setTab('일정')} />
        <Metric
          label="운행중 미수"
          value={won(D.summary.misuActive)}
          tone={D.summary.misuActive > 0 ? 'danger' : 'ink'}
          onClick={() => setTab('리스크')}
        />
        <Metric
          label="자금 미분류"
          value={D.summary.unclassified}
          tone={D.summary.unclassified ? 'warn' : 'ink'}
          onClick={() => go('/cash')}
        />
      </Cards>
    </Sec>
  );

  const isSheet = tab !== '요약';
  const sheetRows =
    tab === '미결' ? pending
      : tab === '리스크' ? risks
        : tab === '휴차' ? idles
          : tab === '일정' ? agendas
            : [];

  const queueCols = colView === '기본' ? HOME_QUEUE_BASIC_COLS : HOME_QUEUE_EXPANDED_COLS;
  const idleCols = colView === '기본' ? HOME_IDLE_BASIC_COLS : HOME_IDLE_EXPANDED_COLS;
  const agendaCols = colView === '기본' ? AGENDA_BASIC_COLS : AGENDA_EXPANDED_COLS;

  const sidePanel = selectedQueue ? (
    <LedgerRecordPanel
      title={selectedQueue.plate || selectedQueue.kind}
      subtitle={`${selectedQueue.kind} · ${selectedQueue.title}`}
      row={selectedQueue}
      cols={HOME_QUEUE_EXPANDED_COLS}
      onClose={() => setSelectedQueue(null)}
      actions={selectedQueue.plate ? (
        <Btn size="sm" variant="ghost" iconOnly tip="차량 상세" onClick={() => openCar(selectedQueue.plate)}>
          <ExternalLink size={14} />
        </Btn>
      ) : null}
    />
  ) : selectedIdle ? (
    <LedgerRecordPanel
      title={selectedIdle.plate}
      subtitle={`${selectedIdle.carName || '차명 미입력'} · ${selectedIdle.status}`}
      row={selectedIdle}
      cols={HOME_IDLE_EXPANDED_COLS}
      onClose={() => setSelectedIdle(null)}
      actions={(
        <Btn size="sm" variant="ghost" iconOnly tip="차량 상세" onClick={() => openCar(selectedIdle.plate)}>
          <ExternalLink size={14} />
        </Btn>
      )}
    />
  ) : selectedAgenda ? (
    <LedgerRecordPanel
      title={selectedAgenda.plate || selectedAgenda.kind}
      subtitle={`${selectedAgenda.status} · ${selectedAgenda.kind} · ${selectedAgenda.date}`}
      row={selectedAgenda}
      cols={AGENDA_EXPANDED_COLS}
      sections={AGENDA_DETAIL_SECTIONS}
      onClose={() => setSelectedAgenda(null)}
      actions={selectedAgenda.plate ? (
        <Btn size="sm" variant="ghost" iconOnly tip="차량 상세" onClick={() => openCar(selectedAgenda.plate)}>
          <ExternalLink size={14} />
        </Btn>
      ) : null}
    />
  ) : null;

  return (
    <LedgerFrame
      title="홈"
      meta="요약 · 미결 · 리스크 · 휴차 · 일정"
      right={(
        <LedgerActions aria-label="투입">
          <Btn size="sm" variant="ghost" iconOnly tip="데이터센터 — OCR·엑셀 투입" href="/ingest">
            <UploadCloud size={14} />
          </Btn>
        </LedgerActions>
      )}
      tools={(
        <LedgerActions aria-label="워크플로">
          <Btn size="sm" variant="ghost" iconOnly tip="운영현황" href="/status"><LayoutDashboard size={14} /></Btn>
          <Btn size="sm" variant="ghost" iconOnly tip="자금" href="/cash"><CircleDollarSign size={14} /></Btn>
        </LedgerActions>
      )}
      filters={(
        <>
          <PillTabs
            size="sm"
            value={tab}
            onChange={(k) => { clearSel(); setTab(k as HomeTab); }}
            tabs={TABS.map((key) => ({
              key,
              label: key,
              badge: key === '미결' ? pendingN || undefined
                : key === '리스크' ? riskN || undefined
                  : key === '휴차' ? idleN || undefined
                    : key === '일정' ? broken || undefined
                      : undefined,
            }))}
          />
          {isSheet && (
            <Search
              size="sm"
              placeholder="회사·차량·내용·구분"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: mobile ? '100%' : 220 }}
            />
          )}
        </>
      )}
      stats={(
        <span style={{ fontSize: 12.5, color: C.mute, whiteSpace: 'nowrap' }}>
          미결 <b style={{ color: pendingN ? C.danger : C.ok }}>{pendingN}</b>
          {' · '}리스크 <b style={{ color: riskN ? C.danger : C.ink }}>{riskN}</b>
          {' · '}휴차 <b style={{ color: idleN ? C.warn : C.ink }}>{idleN}</b>
          {' · '}가동 <b>{util}%</b>
        </span>
      )}
      showColView={isSheet}
      colView={colView}
      onColView={setColView}
      loading={loading}
      body={tab === '요약' ? summaryBody : undefined}
      empty={
        tab === '미결' ? '미결 없음'
          : tab === '리스크' ? '리스크 없음'
            : tab === '휴차' ? '휴차 없음'
              : tab === '일정' ? '일정 없음'
                : undefined
      }
      cols={(
        tab === '휴차' ? idleCols
          : tab === '일정' ? agendaCols
            : (tab === '미결' || tab === '리스크') ? queueCols
              : undefined
      ) as never}
      rows={isSheet ? (sheetRows as never[]) : undefined}
      rowKey={(r: { id?: string; key?: string; plate?: string }) => String(r.id || r.key || r.plate)}
      selectedRowKey={
        selectedQueue?.id || selectedIdle?.id || selectedAgenda?.key || null
      }
      onRowDoubleClick={(row: unknown) => {
        if (tab === '미결' || tab === '리스크') {
          setSelectedIdle(null);
          setSelectedAgenda(null);
          setSelectedQueue(row as HomeQueueRow);
        } else if (tab === '휴차') {
          setSelectedQueue(null);
          setSelectedAgenda(null);
          setSelectedIdle(row as HomeIdleRow);
        } else if (tab === '일정') {
          setSelectedQueue(null);
          setSelectedIdle(null);
          setSelectedAgenda(row as ReturnType<typeof buildAgenda>[number]);
        }
      }}
      onCloseDetail={clearSel}
      sidePanel={sidePanel}
    />
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <HomeInner />
    </Suspense>
  );
}
