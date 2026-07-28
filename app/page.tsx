'use client';
/**
 * 대시보드(/) — 관제 콕핏.
 * 셸 = LedgerFrame(회사 스코프·헤더 존 규격). 본문 = KPI + 법인별 표.
 * 데이터 = computeKPI · kpiByCompany · buildCashLedger · groupOfLabel (도메인 SSOT만).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  LedgerFrame, Sec, Cards, Metric, Btn, ExcelSheet, EmptyState, won, C,
  type SheetCol,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { COMPANIES, companyDisplay } from '@/lib/companies';
import { computeKPI, kpiByCompany, type KPI } from '@/lib/kpi';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import { groupOfLabel } from '@/lib/payments/ledger-subjects';
import { useEntityLists } from '@/lib/use-entity-lists';
import { openIngest } from '@/lib/ui-bus';

const CO_COLS: SheetCol<KPI>[] = [
  { key: 'co', label: '법인', render: (r) => companyDisplay(r.companyId), text: (r) => companyDisplay(r.companyId) },
  { key: 'held', label: '보유', align: 'r', sortNum: true, render: (r) => r.totalVehicles, text: (r) => r.totalVehicles },
  { key: 'run', label: '운행', align: 'r', sortNum: true, render: (r) => r.running, text: (r) => r.running },
  { key: 'idle', label: '휴차', align: 'r', sortNum: true, render: (r) => r.idle, text: (r) => r.idle },
  { key: 'util', label: '가동률', align: 'r', sortNum: true, render: (r) => `${r.util}%`, text: (r) => r.util },
  {
    key: 'misuA', label: '운행중 미수', align: 'r', sortNum: true,
    render: (r) => (r.misuActive ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.misuActive)}</span> : '—'),
    text: (r) => r.misuActive,
  },
  {
    key: 'misuT', label: '총 미수', align: 'r', sortNum: true,
    render: (r) => (r.totalUnpaid ? won(r.totalUnpaid) : '—'),
    text: (r) => r.totalUnpaid,
  },
];

function monthOpProfit(bank: Parameters<typeof buildCashLedger>[0], card: Parameters<typeof buildCashLedger>[1], today: string): number {
  const ym = today.slice(0, 7);
  let inc = 0;
  let exp = 0;
  for (const row of buildCashLedger(bank, card)) {
    if (String(row.date || '').slice(0, 7) !== ym) continue;
    if (groupOfLabel(row.category) !== '영업') continue;
    inc += row.inAmt;
    exp += row.outAmt;
  }
  return inc - exp;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: [contracts = [], vehicles = [], bank = [], card = []], loading } = useEntityLists([
    'contract', 'vehicle', 'bank_tx', 'card_tx',
  ]);

  const total = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const byCo = useMemo(() => kpiByCompany(contracts, vehicles, TODAY, COMPANIES), [contracts, vehicles]);
  const pnl = useMemo(() => monthOpProfit(bank, card, TODAY), [bank, card]);

  const v = (n: number | string) => (loading ? '…' : n);
  const go = (href: string) => router.push(href);

  // 미수 aging 막대 = computeKPI.aging SSOT (월별 추이 SSOT 없음 → 이걸로 대체)
  const agingMax = Math.max(1, ...total.aging);
  const agingLabels = ['0~30일', '31~60일', '61~90일', '90일+'] as const;
  const agingTone = [C.ok, C.warn, C.warn, C.danger] as const;

  return (
    <LedgerFrame
      title="대시보드"
      meta="관제"
      showColView={false}
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터센터" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
      body={(
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
          <Sec id="dash-kpi" title="KPI" desc="클릭 → 원장·리스크">
            <Cards min={128} fit>
              <Metric
                label="보유"
                value={v(`${total.totalVehicles}대`)}
                onClick={() => go('/status')}
              />
              <Metric
                label="가동률"
                value={v(`${total.util}%`)}
                hint={loading ? undefined : `운행 ${total.running}`}
                tone={!loading && total.util >= 70 ? 'ok' : !loading && total.util < 50 ? 'warn' : 'ink'}
                onClick={() => go('/status')}
              />
              <Metric
                label="운행중 미수"
                value={v(won(total.misuActive))}
                tone={!loading && total.misuActive > 0 ? 'danger' : 'ink'}
                onClick={() => go('/risk')}
              />
              <Metric
                label="휴차"
                value={v(total.idle)}
                tone={!loading && total.idle > 0 ? 'warn' : 'ink'}
                onClick={() => go('/risk')}
              />
              <Metric
                label="손익"
                value={v(won(pnl))}
                hint={loading ? undefined : '이번달 영업'}
                tone={!loading && pnl < 0 ? 'danger' : !loading && pnl > 0 ? 'ok' : 'ink'}
                onClick={() => go('/cash')}
              />
            </Cards>
          </Sec>

          <Sec id="dash-aging" title="미수 aging" desc="운행중 미수 · 경과별">
            {loading ? (
              <EmptyState variant="sec">…</EmptyState>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {total.aging.map((amt, i) => (
                  <div key={agingLabels[i]} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 66, flex: '0 0 66px', fontSize: 12, color: C.mute }}>{agingLabels[i]}</span>
                    <div style={{ flex: 1, height: 18, background: 'var(--bg-stripe)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.round((amt / agingMax) * 100)}%`,
                        height: '100%',
                        background: agingTone[i],
                      }}
                      />
                    </div>
                    <span style={{
                      width: 120, flex: '0 0 120px', textAlign: 'right',
                      fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {won(amt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Sec>

          <Sec id="dash-co" title="법인별" desc="보유 · 가동 · 미수">
            {loading ? (
              <EmptyState variant="sec">…</EmptyState>
            ) : byCo.length === 0 ? (
              <EmptyState variant="sec">표시할 법인이 없습니다</EmptyState>
            ) : (
              <ExcelSheet cols={CO_COLS} rows={byCo} rowKey={(r) => r.companyId} />
            )}
          </Sec>
        </div>
      )}
    />
  );
}
