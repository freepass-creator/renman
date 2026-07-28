'use client';
/**
 * 홈 — 한눈 지표 허브(②). 표·큐·Facet·ExcelSheet 금지.
 *
 *   함대          → /status
 *   오늘 끝낼 일  → /desk  (Metric + agenda 미리보기 ≤5)
 *   계속 관리     → /contract · /cash
 *   데이터센터    → tools ghost (KPI Metric 아님)
 *
 * 데이터 = computeDashboard + buildAgenda + selectPendingWork (페이지 손합 금지).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  Page, Sec, Cards, Metric, Btn, EmptyState, ListBox, ListRow, PageLoading, won, C,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeDashboard } from '@/lib/operating-snapshot';
import { buildAgenda } from '@/lib/agenda';
import { selectPendingWork } from '@/lib/snapshot/selectors';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar, openFinance, openIngest } from '@/lib/ui-bus';

const PREVIEW_CAP = 5;

function ddayLabel(d: number): string {
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

export default function HomePage() {
  const router = useRouter();
  const { data: [contracts = [], vehicles = [], insurances = [], penalties = [], bankTx = []], loading } = useEntityLists([
    'contract', 'vehicle', 'insurance', 'penalty', 'bank_tx',
  ]);

  const D = useMemo(
    () => computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY),
    [contracts, vehicles, insurances, penalties, bankTx],
  );
  const agenda = useMemo(
    () => buildAgenda(contracts, vehicles, insurances, penalties),
    [contracts, vehicles, insurances, penalties],
  );
  const brokenN = useMemo(() => agenda.filter((a) => a.status === '어김').length, [agenda]);
  const soonN = useMemo(() => agenda.filter((a) => a.status === '임박').length, [agenda]);
  const pending = useMemo(() => selectPendingWork(D), [D]);
  const preview = useMemo(() => {
    const rank = (s: string) => (s === '어김' ? 0 : s === '임박' ? 1 : 2);
    return agenda
      .filter((a) => a.status === '어김' || a.status === '임박')
      .sort((a, b) => rank(a.status) - rank(b.status) || a.dday - b.dday || a.date.localeCompare(b.date))
      .slice(0, PREVIEW_CAP);
  }, [agenda]);

  const go = (href: string) => router.push(href);
  const { held, util, running, idle, misuActive, misuReturned, unclassified } = D.summary;

  return (
    <Page
      title="홈"
      meta="한눈 지표"
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터센터" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
    >
      {loading ? <PageLoading /> : (
        <>
          <Sec id="home-fleet" title="함대" desc="보유 · 가동">
            <Cards min={128} fit>
              <Metric label="보유" value={`${held}대`} onClick={() => go('/status')} />
              <Metric
                label="가동률"
                value={`${util}%`}
                hint={`운행 ${running} · 휴차 ${idle}`}
                tone={util >= 70 ? 'ok' : util < 50 ? 'warn' : 'ink'}
                onClick={() => go('/status')}
              />
              <Metric label="운행" value={running} onClick={() => go('/status')} />
              <Metric label="휴차" value={idle} tone={idle ? 'warn' : 'ink'} onClick={() => go('/status')} />
            </Cards>
          </Sec>

          <Sec
            id="home-today"
            title="오늘 끝낼 일"
            desc="기한·큐 — 처리하면 사라짐"
            right={<Btn size="sm" variant="ghost" onClick={() => go('/desk')}>전체</Btn>}
          >
            <Cards min={128} fit>
              <Metric label="어김" value={brokenN} tone={brokenN ? 'danger' : 'ok'} onClick={() => go('/desk')} />
              <Metric label="임박" value={soonN} tone={soonN ? 'warn' : 'ink'} onClick={() => go('/desk')} />
              <Metric label="미결" value={pending.count} tone={pending.count ? 'danger' : 'ok'} onClick={() => go('/desk')} />
            </Cards>
            {preview.length === 0 ? (
              <EmptyState variant="ok">오늘 급한 것 없음</EmptyState>
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

          <Sec id="home-ongoing" title="계속 관리" desc="미수·미분류 — 처리해도 계속 관리">
            <Cards min={128} fit>
              <Metric
                label="운행중 미수"
                value={won(misuActive)}
                tone={misuActive > 0 ? 'danger' : 'ink'}
                onClick={() => go('/contract')}
              />
              <Metric
                label="종료 미수"
                value={won(misuReturned)}
                tone={misuReturned > 0 ? 'danger' : 'ink'}
                onClick={() => go('/contract')}
              />
              <Metric
                label="자금 미분류"
                value={unclassified}
                tone={unclassified ? 'warn' : 'ink'}
                onClick={() => openFinance({ unclassified: true })}
              />
            </Cards>
          </Sec>
        </>
      )}
    </Page>
  );
}
