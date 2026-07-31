'use client';
/**
 * 대시보드(/) — 메인=관제 KPI·법인별·손익추이, 우측 패널=«할 일·미점검» 시점별.
 *   셸=LedgerFrame(body+sidePanel — 원장과 동일 2분할 규격) · Sec 접기 없음 · 색=C.* 토큰.
 *   데이터=computeKPI · selectTodayPanel · operatingProfit* SSOT만.
 *   지시 노출 = 우측 패널(경과→오늘→이번 주→이번 달→상시 미점검, 클릭=딥링크). 접기·닫기 없음.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  LedgerFrame, EmptyState, ExcelSheet, Badge, PageLoading, won, C, R, NUM,
  type SheetCol,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeKPI, kpiByCompany, type KPI } from '@/lib/kpi';
import { COMPANIES, companyShort } from '@/lib/companies';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import {
  operatingProfit, operatingProfitByCompany, operatingProfitTrend,
} from '@/lib/finance/operating-profit';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { useEntityLists } from '@/lib/use-entity-lists';
import { selectTodayPanel } from '@/lib/snapshot/selectors';
import { hrefForTodayRow, type DueBucket, type HomeQueueRow } from '@/lib/home-rows';
import { useIsMobile } from '@/lib/use-mobile';

function Soft(loading: boolean, n: number | string): number | string {
  return loading ? '…' : n;
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
        minHeight: mobile ? 118 : 136,
        border: `1px solid ${C.line}`,
        borderRadius: R,
        background: C.card,
        textAlign: 'left',
        padding: mobile ? '12px 13px' : '15px 16px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: C.sub }}>{label}</span>
      <span style={{
        display: 'block', marginTop: 12, fontSize: mobile ? 22 : 28, lineHeight: 1,
        fontWeight: 800, letterSpacing: '-0.04em', fontFamily: NUM, fontVariantNumeric: 'tabular-nums', color: C.ink,
      }}>
        {value}
        {unit != null && <small style={{ fontSize: 13, marginLeft: 2, fontWeight: 600 }}>{unit}</small>}
      </span>
      {meta != null && (
        <span style={{ display: 'block', marginTop: 8, fontSize: 10.5, color: C.mute }}>{meta}</span>
      )}
      {bar != null && <div style={{ marginTop: 'auto', paddingTop: 12 }}>{bar}</div>}
    </button>
  );
}

function Panel({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <section style={{
      border: `1px solid ${C.line}`, borderRadius: R, background: C.card, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* 패널 제목 위계 = 상세패널 규격(13.5/800) */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.line}`, background: 'var(--bg-header)' }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11.5, color: C.mute, marginTop: 3 }}>{desc}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 12 }}>{children}</div>
    </section>
  );
}

type CoRow = KPI & { company: string; profit: number };

/* ── 우측 «할 일·미점검» 패널 — 시점별 버킷. 원장 상세패널과 같은 클래스·위계. ── */

const BUCKET_TONE: Record<DueBucket, 'red' | 'amber' | 'gray'> = {
  경과: 'red', 오늘: 'amber', '이번 주': 'amber', '이번 달': 'gray', 상시: 'gray',
};
const BUCKET_LABEL: Record<DueBucket, string> = {
  경과: '경과 (기한 지남)', 오늘: '오늘', '이번 주': '이번 주', '이번 달': '이번 달', 상시: '상시 미점검',
};
const BUCKET_CAP = 12;

function rowTone(row: HomeQueueRow): 'red' | 'amber' | 'gray' {
  if ((row.dday != null && row.dday < 0) || row.kind === '사고' || row.kind.includes('위험') || row.kind.includes('미수')) return 'red';
  if (row.dday == null) return 'gray';
  return 'amber';
}

function TodoRow({ row, onGo, first }: { row: HomeQueueRow; onGo: (href: string) => void; first?: boolean }) {
  // 상태 신호 = 배지 색으로만(사장님 확정) — 행 배경 틴트 없음.
  return (
    <button
      type="button"
      onClick={() => onGo(hrefForTodayRow(row))}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
        padding: '7px 10px', border: 'none', borderTop: first ? 'none' : `1px solid ${C.line2}`,
        background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <Badge tone={rowTone(row)}>{row.kind}</Badge>
      <span style={{
        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontSize: 12.5, fontWeight: 700, color: C.ink,
      }}>
        {row.plate ? `${row.plate} · ` : ''}{row.title}
      </span>
      <span style={{ fontSize: 10.5, color: C.mute, whiteSpace: 'nowrap' }}>{row.detail}</span>
      {row.amount > 0 ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.danger, fontFamily: NUM, whiteSpace: 'nowrap' }}>{won(row.amount)}</span>
      ) : null}
    </button>
  );
}

const gridKpi: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 12,
};

export default function DashboardPage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { D, contracts, vehicles, bankTx, loading } = useDashboardData();
  const { data: [cardTx = []] } = useEntityLists(['card_tx']);

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const byCo = useMemo(() => kpiByCompany(contracts, vehicles, TODAY, COMPANIES), [contracts, vehicles]);

  const cash = useMemo(() => buildCashLedger(bankTx, cardTx), [bankTx, cardTx]);
  const opProfit = useMemo(() => operatingProfit(cash), [cash]);
  const profitByCo = useMemo(() => operatingProfitByCompany(cash), [cash]);
  const trend = useMemo(() => operatingProfitTrend(cash, 6, TODAY), [cash]);
  const todayPanel = useMemo(() => selectTodayPanel(D), [D]);

  const coRows: CoRow[] = useMemo(() => byCo.map((k) => ({
    ...k,
    company: companyShort(k.companyId),
    profit: profitByCo.get(k.companyId) || 0,
  })), [byCo, profitByCo]);

  const coCols: SheetCol<CoRow>[] = useMemo(() => [
    { key: 'company', label: '법인', pin: true, render: (r) => r.company, text: (r) => r.company },
    { key: 'veh', label: '보유', align: 'r', render: (r) => r.totalVehicles, text: (r) => r.totalVehicles },
    { key: 'util', label: '가동률', align: 'r', render: (r) => `${r.util}%`, text: (r) => r.util },
    { key: 'run', label: '운행', align: 'r', render: (r) => r.running, text: (r) => r.running },
    { key: 'idle', label: '휴차', align: 'r', render: (r) => r.idle, text: (r) => r.idle },
    {
      key: 'misu', label: '운행미수', align: 'r',
      render: (r) => r.misuActive ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.misuActive)}</span> : '—',
      text: (r) => r.misuActive,
    },
    {
      key: 'profit', label: '영업손익', align: 'r',
      render: (r) => (
        <span style={{ color: r.profit >= 0 ? C.ok : C.danger, fontWeight: 700 }}>{won(r.profit)}</span>
      ),
      text: (r) => r.profit,
    },
  ], []);

  const go = (href: string) => router.push(href);

  return (
    <LedgerFrame
      title="대시보드"
      meta="한눈 지표 · 우측 = 할 일·미점검"
      showColView={false}
      sidePanel={(
        <section className="ledger-record-panel" aria-label="할 일·미점검">
          <header className="ledger-record-panel__header">
            <div className="ledger-record-panel__heading">
              <div className="ledger-record-panel__title">할 일·미점검</div>
              {!loading && (
                <div className="ledger-record-panel__meta">
                  <Badge tone={todayPanel.count > 0 ? 'red' : 'green'}>{todayPanel.count}건</Badge>
                </div>
              )}
            </div>
          </header>
          <div className="ledger-record-panel__body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
            {loading ? (
              <PageLoading />
            ) : todayPanel.count === 0 ? (
              <EmptyState variant="ok">오늘 챙길 일이 없습니다</EmptyState>
            ) : (
              <div className="ledger-record-panel__sections">
                {todayPanel.groups.map((g) => (
                  <details
                    key={g.bucket}
                    className="ledger-record-panel__section"
                    open={g.bucket === '경과' || g.bucket === '오늘'}
                  >
                    <summary>
                      <ChevronRight className="ledger-record-panel__chevron" size={14} aria-hidden="true" />
                      {BUCKET_LABEL[g.bucket]}
                      <Badge tone={BUCKET_TONE[g.bucket]}>{g.rows.length}</Badge>
                    </summary>
                    <div style={{ borderTop: `1px solid ${C.line2}` }}>
                      {g.rows.slice(0, BUCKET_CAP).map((row, i) => (
                        <TodoRow key={row.id} row={row} onGo={go} first={i === 0} />
                      ))}
                      {g.rows.length > BUCKET_CAP ? (
                        <div style={{ fontSize: 11, color: C.faint, padding: '6px 10px', borderTop: `1px solid ${C.line2}` }}>
                          외 {g.rows.length - BUCKET_CAP}건 — 해당 원장에서 확인
                        </div>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
      body={(
        // 원장 시트와 동일: 워크스페이스 폭 그대로 · 상단 0(패널과 정렬) · 간격 12 통일
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          padding: mobile ? '0 0 24px' : '0 0 28px',
        }}>
          <div style={{
            ...gridKpi,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
          }}>
            <KpiTile
              label="보유"
              value={Soft(loading, kpi.totalVehicles)}
              unit="대"
              meta={loading ? undefined : `운행 ${kpi.running} · 계약 ${kpi.activeContracts}`}
              bar={<Bar pct={loading || !kpi.totalVehicles ? 0 : 100} />}
              onClick={() => go('/asset')}
            />
            <KpiTile
              label="가동률"
              value={Soft(loading, kpi.util)}
              unit="%"
              meta={loading ? undefined : `운행 ${kpi.running} / 보유 ${kpi.totalVehicles}`}
              bar={<Bar pct={loading ? 0 : kpi.util} tone={kpi.util >= 70 ? 'ok' : 'warn'} />}
              onClick={() => go('/status')}
            />
            <KpiTile
              label="운행중미수"
              value={Soft(loading, won(kpi.misuActive))}
              meta={loading ? undefined : `건수 ${kpi.unpaidCount} · 반환미수 ${won(kpi.misuReturned)}`}
              bar={<Bar pct={loading || !kpi.monthlyBilled ? 0 : Math.min(100, Math.round((kpi.misuActive / kpi.monthlyBilled) * 100))} tone="danger" />}
              onClick={() => go('/risk')}
            />
            <KpiTile
              label="휴차"
              value={Soft(loading, kpi.idle)}
              unit="대"
              meta={loading ? undefined : `보유 대비 ${kpi.totalVehicles ? Math.round((kpi.idle / kpi.totalVehicles) * 100) : 0}%`}
              bar={<Bar pct={loading || !kpi.totalVehicles ? 0 : Math.round((kpi.idle / kpi.totalVehicles) * 100)} tone="warn" />}
              onClick={() => go('/risk')}
            />
            <KpiTile
              label="손익"
              value={Soft(loading, won(opProfit))}
              meta={loading ? undefined : `영업수입−영업비용 · 월청구 ${won(kpi.monthlyBilled)}`}
              bar={<Bar pct={loading ? 0 : Math.min(100, Math.abs(opProfit) > 0 ? 70 : 0)} tone={opProfit >= 0 ? 'ok' : 'danger'} />}
              onClick={() => go('/cash')}
            />
          </div>

          <div style={{
            display: 'grid',
            // 3:2 = KPI 타일 5열의 3번째/4번째 경계와 정렬(gap 12 동일)
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 3fr) minmax(240px, 2fr)',
            gap: 12,
          }}>
            <Panel title="법인별 요약" desc="보유·가동·미수·영업손익 — 같은 KPI SSOT.">
              {loading ? (
                <PageLoading />
              ) : coRows.length === 0 ? (
                <EmptyState variant="sec">표시할 법인이 없습니다</EmptyState>
              ) : (
                <ExcelSheet cols={coCols} rows={coRows} rowKey={(r) => r.companyId} />
              )}
            </Panel>

            <Panel title="영업손익 추이" desc="최근 6개월 · 현금 기준.">
              {loading ? (
                <PageLoading />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
                  {trend.list.map((x) => {
                    const pct = Math.round((Math.abs(x.profit) / trend.maxAbs) * 100);
                    return (
                      <div key={x.m} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 72px', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: C.mute, fontFamily: NUM }}>{x.m.slice(5)}</span>
                        <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-stripe)', overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: x.profit >= 0 ? C.ok : C.danger,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 700, textAlign: 'right', fontFamily: NUM,
                          color: x.profit >= 0 ? C.ink : C.danger,
                        }}>
                          {won(x.profit)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    />
  );
}
