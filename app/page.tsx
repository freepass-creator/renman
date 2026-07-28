'use client';
/**
 * 홈 — 관제 대시보드(② 지표).
 * 한눈 지표 스트립 + 일정(본체). 엑셀·Facet·PageLoading 금지.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  Page, Sec, Cards, Metric, Btn, EmptyState, ListBox, ListRow, Message, won, C,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeDashboard } from '@/lib/operating-snapshot';
import { buildAgenda } from '@/lib/agenda';
import { selectPendingWork } from '@/lib/snapshot/selectors';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar, openFinance, openIngest } from '@/lib/ui-bus';
import { agendaPreview, ddayLabel, softVal } from '@/lib/home-kpi';

export default function HomePage() {
  const router = useRouter();
  const { data: [contracts = [], vehicles = [], insurances = [], penalties = [], bankTx = []], loading } = useEntityLists([
    'contract', 'vehicle', 'insurance', 'penalty', 'bank_tx',
  ]);

  const D = useMemo(
    () => computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY),
    [contracts, vehicles, bankTx, insurances, penalties],
  );
  const agenda = useMemo(
    () => buildAgenda(contracts, vehicles, insurances, penalties),
    [contracts, vehicles, insurances, penalties],
  );
  const brokenN = useMemo(() => agenda.filter((a) => a.status === '어김').length, [agenda]);
  const soonN = useMemo(() => agenda.filter((a) => a.status === '임박').length, [agenda]);
  const pending = useMemo(() => selectPendingWork(D), [D]);
  const preview = useMemo(() => (loading ? [] : agendaPreview(agenda)), [agenda, loading]);

  const go = (href: string) => router.push(href);
  const { held, util, running, idle, misuActive, misuReturned, unclassified } = D.summary;
  const alertN = brokenN + pending.count;
  const showAlert = !loading && alertN > 0;

  return (
    <Page
      title="관제"
      meta="대시보드"
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터센터" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
    >
      {showAlert && (
        <Message variant="danger">
          어김 {brokenN} · 미결 {pending.count} — 일정·업무에서 처리
        </Message>
      )}

      <Sec id="tower-glance" title="한눈" desc="함대 · 오늘 · 미수">
        <Cards min={112} fit>
          <Metric label="보유" value={softVal(loading, `${held}대`)} onClick={() => go('/status')} />
          <Metric
            label="가동률"
            value={softVal(loading, `${util}%`)}
            hint={loading ? undefined : `운행 ${running} · 휴차 ${idle}`}
            tone={!loading && util >= 70 ? 'ok' : !loading && util < 50 ? 'warn' : 'ink'}
            onClick={() => go('/status')}
          />
          <Metric label="어김" value={softVal(loading, brokenN)} tone={!loading && brokenN ? 'danger' : 'ok'} onClick={() => go('/desk')} />
          <Metric label="임박" value={softVal(loading, soonN)} tone={!loading && soonN ? 'warn' : 'ink'} onClick={() => go('/desk')} />
          <Metric label="미결" value={softVal(loading, pending.count)} tone={!loading && pending.count ? 'danger' : 'ok'} onClick={() => go('/desk')} />
          <Metric
            label="운행중 미수"
            value={softVal(loading, won(misuActive))}
            tone={!loading && misuActive > 0 ? 'danger' : 'ink'}
            onClick={() => go('/contract')}
          />
          <Metric
            label="종료 미수"
            value={softVal(loading, won(misuReturned))}
            tone={!loading && misuReturned > 0 ? 'danger' : 'ink'}
            onClick={() => go('/contract')}
          />
          <Metric
            label="자금 미분류"
            value={softVal(loading, unclassified)}
            tone={!loading && unclassified ? 'warn' : 'ink'}
            onClick={() => openFinance({ unclassified: true })}
          />
        </Cards>
      </Sec>

      <Sec
        id="tower-agenda"
        title="일정"
        desc="어김·임박 — 처리하면 사라짐"
        right={<Btn size="sm" variant="ghost" onClick={() => go('/desk')}>전체</Btn>}
      >
        {loading ? (
          <EmptyState variant="sec">일정 불러오는 중…</EmptyState>
        ) : preview.length === 0 ? (
          <EmptyState variant="ok">오늘 급한 일정 없음</EmptyState>
        ) : (
          <ListBox>
            {preview.map((a) => (
              <ListRow
                key={a.key}
                badge={a.status}
                badgeTone={a.status === '어김' ? 'red' : 'amber'}
                main={`${a.plate || '—'} · ${a.title}`}
                sub={`${a.kind} · ${a.date}`}
                right={(
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    color: a.status === '어김' ? C.danger : C.warn,
                  }}>
                    {ddayLabel(a.dday)}
                  </span>
                )}
                onClick={() => { if (a.plate) openCar(a.plate); }}
              />
            ))}
          </ListBox>
        )}
      </Sec>
    </Page>
  );
}
