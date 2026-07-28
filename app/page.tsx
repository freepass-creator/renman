'use client';
/**
 * 대시보드(/) — `/dev/erp-design` HomeView 시안 1:1 이식.
 *   KPI 4칸(가동률·휴차·미수율·오늘업무) + 오늘 집중 업무 + 데이터 교차검증.
 *   셸 = LedgerFrame(회사 스코프). Sec 접기 없음. 색=C.* 토큰만.
 *   데이터 = computeKPI · computeDashboard · riskAgendaFocus · selectPendingWork.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  LedgerFrame, Btn, EmptyState, ListBox, ListRow, won, C, R, NUM, SPACE_GROUP_M,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeKPI } from '@/lib/kpi';
import { computeDashboard } from '@/lib/operating-snapshot';
import { riskAgendaFocus } from '@/lib/risk-ledger';
import { selectPendingWork } from '@/lib/snapshot/selectors';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openCar, openIngest } from '@/lib/ui-bus';
import { useIsMobile } from '@/lib/use-mobile';

function Soft(loading: boolean, n: number | string): number | string {
  return loading ? '…' : n;
}

function KpiTile({
  label, value, unit, meta, bar, onClick,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  meta?: string;
  bar?: ReactNode;
  onClick?: () => void;
}) {
  const mobile = useIsMobile();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: mobile ? 126 : 148,
        border: `1px solid ${C.line}`,
        borderRadius: R,
        background: C.card,
        textAlign: 'left',
        padding: mobile ? '13px 14px' : '17px 18px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{label}</span>
      <span style={{
        display: 'block', marginTop: 14, fontSize: mobile ? 25 : 30, lineHeight: 1,
        fontWeight: 800, letterSpacing: '-0.04em', fontFamily: NUM, fontVariantNumeric: 'tabular-nums', color: C.ink,
      }}>
        {value}
        {unit != null && <small style={{ fontSize: 14, marginLeft: 2, fontWeight: 600 }}>{unit}</small>}
      </span>
      {meta != null && (
        <span style={{ display: 'block', marginTop: 10, fontSize: 10.5, color: C.mute }}>{meta}</span>
      )}
      {bar != null && <div style={{ marginTop: 'auto', paddingTop: 14 }}>{bar}</div>}
    </button>
  );
}

function Bar({ pct, tone = 'ok' }: { pct: number; tone?: 'ok' | 'danger' | 'warn' }) {
  const fill = tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : C.ok;
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-stripe)', overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: '100%', background: fill }} />
    </div>
  );
}

function Panel({
  title, desc, action, children,
}: {
  title: string; desc: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section style={{
      border: `1px solid ${C.line}`, borderRadius: R, background: C.card, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      <div style={{
        minHeight: 64, padding: '14px 16px', borderBottom: `1px solid ${C.line}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{title}</div>
          <div style={{ fontSize: 11, color: C.mute, marginTop: 3 }}>{desc}</div>
        </div>
        {action}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </section>
  );
}

const gridKpi: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
};
const gridHome: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.55fr) minmax(280px, 1fr)',
  gap: 16,
};

export default function DashboardPage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { data: [contracts = [], vehicles = [], insurances = [], penalties = [], bankTx = []], loading } = useEntityLists([
    'contract', 'vehicle', 'insurance', 'penalty', 'bank_tx',
  ]);

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const D = useMemo(
    () => computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, TODAY),
    [contracts, vehicles, insurances, penalties, bankTx],
  );
  const pending = useMemo(() => selectPendingWork(D), [D]);
  const focusAll = useMemo(
    () => riskAgendaFocus(contracts, vehicles, insurances, penalties),
    [contracts, vehicles, insurances, penalties],
  );
  const focus = useMemo(() => focusAll.slice(0, 5), [focusAll]);
  const delayedN = useMemo(() => focusAll.filter((a) => a.status === '어김').length, [focusAll]);
  const misuRate = kpi.monthlyBilled > 0
    ? Math.round((kpi.misuActive / kpi.monthlyBilled) * 1000) / 10
    : 0;

  const ocrN = D.compliance.length;
  const mismatchN = D.insMismatch.length;
  const unmatchedN = D.unmatchedTx.length + D.ghostPlates.length;

  const validations = useMemo(() => {
    const rows: { key: string; title: string; sub: string; badge: string; plate?: string }[] = [];
    for (const x of D.compliance.slice(0, 3)) {
      rows.push({
        key: `c:${String(x.rec.plate)}:${x.flags[0]?.code || ''}`,
        title: '컴플라이언스',
        sub: `${x.rec.plate || '—'} · ${x.flags[0]?.detail || x.flags[0]?.code || '검토'}`,
        badge: '검토',
        plate: String(x.rec.plate || ''),
      });
    }
    for (const x of D.insMismatch.slice(0, 2)) {
      rows.push({
        key: `i:${String(x.rec.plate)}:${x.detail}`,
        title: '보험불일치',
        sub: `${x.rec.plate || '—'} · ${x.detail}`,
        badge: '검토',
        plate: String(x.rec.plate || ''),
      });
    }
    for (const plate of D.ghostPlates.slice(0, 2)) {
      rows.push({
        key: `g:${plate}`,
        title: '차량 미등록',
        sub: `${plate} · 계약만 있고 차량원장 없음`,
        badge: '매칭',
        plate,
      });
    }
    return rows.slice(0, 5);
  }, [D]);

  const go = (href: string) => router.push(href);
  const dateLabel = (() => {
    try {
      return new Date(`${TODAY}T12:00:00`).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
      });
    } catch { return TODAY; }
  })();

  return (
    <LedgerFrame
      title="대시보드"
      meta="관제"
      showColView={false}
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터관리" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
      body={(
        <div style={{
          display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M,
          padding: mobile ? '8px 0 24px' : '4px 0 28px', maxWidth: 1500,
        }}>
          {/* 시안: pageHeader */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: mobile ? 'flex-start' : 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.mute, letterSpacing: '0.04em' }}>{dateLabel}</div>
              <div style={{ fontSize: mobile ? 20 : 24, fontWeight: 800, letterSpacing: '-0.03em', color: C.ink, marginTop: 4 }}>운영 현황</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>가동과 회수에 집중해야 할 항목을 먼저 보여드립니다.</div>
            </div>
            <div style={{ display: 'inline-flex', gap: 7 }}>
              <Btn size="sm" variant="ghost" onClick={() => go('/risk')}>리스크</Btn>
              <Btn size="sm" variant="solid" onClick={() => go('/work')}>업무</Btn>
            </div>
          </div>

          {/* 시안: kpiGrid 4 */}
          <div style={{
            ...gridKpi,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          }}>
            <KpiTile
              label="보유차량 가동률"
              value={Soft(loading, kpi.util)}
              unit="%"
              meta={loading ? undefined : `가동 ${kpi.running}대 / 운영대상 ${kpi.totalVehicles}대`}
              bar={<Bar pct={loading ? 0 : kpi.util} tone={kpi.util >= 70 ? 'ok' : kpi.util < 50 ? 'warn' : 'ok'} />}
              onClick={() => go('/status')}
            />
            <KpiTile
              label="공차·휴차"
              value={Soft(loading, kpi.idle)}
              unit="대"
              meta={loading ? undefined : `휴차 ${kpi.idle} · 보유 ${kpi.totalVehicles}`}
              bar={<Bar pct={loading || !kpi.totalVehicles ? 0 : Math.round((kpi.idle / kpi.totalVehicles) * 100)} tone="warn" />}
              onClick={() => go('/risk')}
            />
            <KpiTile
              label="현재 미수율"
              value={Soft(loading, misuRate)}
              unit="%"
              meta={loading ? undefined : `미수 ${won(kpi.misuActive)} / 월청구 ${won(kpi.monthlyBilled)}`}
              bar={<Bar pct={loading ? 0 : Math.min(100, misuRate)} tone="danger" />}
              onClick={() => go('/risk')}
            />
            <KpiTile
              label="오늘의 업무"
              value={Soft(loading, pending.count)}
              unit="건"
              meta={loading ? undefined : `미결 ${pending.count} · 어김 ${delayedN}`}
              bar={(
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <i
                      key={i}
                      style={{
                        height: 4, flex: 1, borderRadius: 2,
                        background: !loading && i < Math.min(4, delayedN) ? C.danger : C.mute,
                        opacity: !loading && i < Math.min(4, delayedN) ? 1 : 0.35,
                        display: 'block',
                      }}
                    />
                  ))}
                </div>
              )}
              onClick={() => go('/risk')}
            />
          </div>

          {/* 시안: homeGrid — 업무 | 교차검증 */}
          <div style={{
            ...gridHome,
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.55fr) minmax(280px, 1fr)',
          }}>
            <Panel
              title="오늘 집중할 업무"
              desc="위험도와 기한을 기준으로 정렬했습니다."
              action={<Btn size="sm" variant="ghost" onClick={() => go('/risk')}>리스크 전체</Btn>}
            >
              {loading ? (
                <EmptyState variant="sec">…</EmptyState>
              ) : focus.length === 0 ? (
                <EmptyState variant="ok">오늘 급한 업무 없음</EmptyState>
              ) : (
                <ListBox>
                  {focus.map((a) => (
                    <ListRow
                      key={a.key}
                      badge={a.status}
                      badgeTone={a.status === '어김' ? 'red' : 'amber'}
                      main={`${a.plate || '—'} · ${a.title}`}
                      sub={`${a.kind} · ${a.date}`}
                      right={(
                        <span style={{
                          fontSize: 12, fontWeight: 700, fontFamily: NUM, fontVariantNumeric: 'tabular-nums',
                          color: a.status === '어김' ? C.danger : C.warn,
                        }}>
                          {a.dday < 0 ? `${-a.dday}일 지남` : a.dday === 0 ? '오늘' : `D-${a.dday}`}
                        </span>
                      )}
                      onClick={() => { if (a.plate) openCar(a.plate); else go('/risk'); }}
                    />
                  ))}
                </ListBox>
              )}
            </Panel>

            <Panel
              title="데이터 교차검증"
              desc="원장과 증명서가 다른 항목입니다."
              action={<Btn size="sm" variant="ghost" onClick={() => go('/risk')}>검토함 열기</Btn>}
            >
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                margin: 14, border: `1px solid ${C.line}`, borderRadius: R, overflow: 'hidden',
              }}>
                {[
                  { label: 'OCR·준수', n: ocrN },
                  { label: '값 불일치', n: mismatchN },
                  { label: '미매칭', n: unmatchedN },
                ].map((x, i) => (
                  <div
                    key={x.label}
                    style={{
                      padding: 12,
                      borderRight: i < 2 ? `1px solid ${C.line}` : undefined,
                      display: 'grid', gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 10, color: C.mute }}>{x.label}</span>
                    <strong style={{ fontSize: 20, fontFamily: NUM, fontVariantNumeric: 'tabular-nums', color: C.ink }}>
                      {Soft(loading, x.n)}
                    </strong>
                  </div>
                ))}
              </div>
              {loading ? (
                <EmptyState variant="sec">…</EmptyState>
              ) : validations.length === 0 ? (
                <EmptyState variant="ok">교차검증 이슈 없음</EmptyState>
              ) : (
                <div style={{ padding: '0 8px 10px' }}>
                  <ListBox>
                    {validations.map((r) => (
                      <ListRow
                        key={r.key}
                        badge={r.badge}
                        badgeTone="amber"
                        main={r.title}
                        sub={r.sub}
                        onClick={() => { if (r.plate) openCar(r.plate); else go('/risk'); }}
                      />
                    ))}
                  </ListBox>
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    />
  );
}
