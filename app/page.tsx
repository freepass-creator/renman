'use client';
/**
 * 대시보드(/) — 백지 신규. 관제 KPI + 법인별 요약.
 *   셸=LedgerFrame · Sec 접기 없음 · 색=C.* 토큰.
 *   데이터=computeKPI · kpiByCompany · buildCashLedger(손익) SSOT만.
 */
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  LedgerFrame, EmptyState, ExcelSheet, won, C, R, NUM, SPACE_GROUP_M,
  type SheetCol,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeKPI, kpiByCompany, type KPI } from '@/lib/kpi';
import { COMPANIES, companyShort } from '@/lib/companies';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import { groupOfLabel } from '@/lib/payments/ledger-subjects';
import { useEntityLists } from '@/lib/use-entity-lists';
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
        boxShadow: 'var(--shadow-sm)',
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
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 11, color: C.mute, marginTop: 3 }}>{desc}</div>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: 12 }}>{children}</div>
    </section>
  );
}

type CoRow = KPI & { company: string; profit: number };

const gridKpi: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 12,
};

export default function DashboardPage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { data: [contracts = [], vehicles = [], bankTx = [], cardTx = []], loading } = useEntityLists([
    'contract', 'vehicle', 'bank_tx', 'card_tx',
  ]);

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const byCo = useMemo(() => kpiByCompany(contracts, vehicles, TODAY, COMPANIES), [contracts, vehicles]);

  const cash = useMemo(() => buildCashLedger(bankTx, cardTx), [bankTx, cardTx]);
  const opProfit = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const r of cash) {
      if (groupOfLabel(r.category) !== '영업') continue;
      inc += r.inAmt;
      exp += r.outAmt;
    }
    return inc - exp;
  }, [cash]);

  const profitByCo = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of cash) {
      if (groupOfLabel(r.category) !== '영업') continue;
      const id = String(r.companyId || '');
      map.set(id, (map.get(id) || 0) + r.inAmt - r.outAmt);
    }
    return map;
  }, [cash]);

  const trend = useMemo(() => {
    const now = new Date(`${TODAY}T12:00:00`);
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
    const by = new Map(months.map((m) => [m, 0]));
    for (const r of cash) {
      if (groupOfLabel(r.category) !== '영업') continue;
      const m = String(r.date || '').slice(0, 7);
      if (!by.has(m)) continue;
      by.set(m, (by.get(m) || 0) + r.inAmt - r.outAmt);
    }
    const list = months.map((m) => ({ m, profit: by.get(m) || 0 }));
    const maxAbs = Math.max(1, ...list.map((x) => Math.abs(x.profit)));
    return { list, maxAbs };
  }, [cash]);

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
      meta="관제"
      showColView={false}
      body={(
        <div style={{
          display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M,
          padding: mobile ? '8px 0 24px' : '4px 0 28px', maxWidth: 1500,
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
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 1.6fr) minmax(240px, 1fr)',
            gap: 16,
          }}>
            <Panel title="법인별 요약" desc="보유·가동·미수·영업손익 — 같은 KPI SSOT.">
              {loading ? (
                <EmptyState variant="sec">…</EmptyState>
              ) : coRows.length === 0 ? (
                <EmptyState variant="sec">표시할 법인이 없습니다</EmptyState>
              ) : (
                <ExcelSheet cols={coCols} rows={coRows} rowKey={(r) => r.companyId} />
              )}
            </Panel>

            <Panel title="영업손익 추이" desc="최근 6개월 · 현금 기준.">
              {loading ? (
                <EmptyState variant="sec">…</EmptyState>
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
