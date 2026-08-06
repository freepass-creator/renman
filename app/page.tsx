'use client';
/**
 * 대시보드(/) — 메인=관제 KPI·일정 달력·예상 현금흐름, 우측 패널=«할 일·미점검» 시점별.
 *   (2026-08-05 사장님 지시: 법인별 요약·손익추이 자리 → 일정 달력. 현금흐름 예측 신설.)
 *   셸=LedgerFrame(body+sidePanel — 원장과 동일 2분할 규격) · Sec 접기 없음 · 색=C.* 토큰.
 *   데이터=computeKPI · selectTodayPanel · operatingProfit · buildAgenda · buildCashPlan SSOT만.
 *   지시 노출 = 우측 패널(경과→오늘→이번 주→이번 달→상시 미점검, 클릭=딥링크). 접기·닫기 없음.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import {
  LedgerFrame, EmptyState, ErrorState, ExcelSheet, Badge, PageLoading, MonthCalendar, won, C, R, NUM,
  type SheetCol, type CalendarItem,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeKPI } from '@/lib/kpi';
import { buildAgenda, agendaByDate, type AgendaKind } from '@/lib/agenda';
import { buildCashLedger } from '@/lib/finance/cash-ledger';
import { buildCashPlan, summarizeCashPlanMonths, type CashPlanMonth, type CashPlanSource } from '@/lib/finance/cash-plan';
import { operatingProfit } from '@/lib/finance/operating-profit';
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
      {/* 스크롤은 패널 안에서만 — 화면(프레임)은 넘치지 않는다. */}
      <div style={{ flex: 1, minHeight: 0, padding: 12, overflow: 'auto' }}>{children}</div>
    </section>
  );
}

/* ── 일정 달력 — 어젠다 SSOT를 달력 항목으로 (여기선 표기만) ── */

const AGENDA_SHORT: Record<AgendaKind, string> = {
  '반납·만기': '만기', 검사만기: '검사', 보험만기: '보험', '과태료 기한': '과태료', '세금 만기': '세금',
};

/* ── 예상 현금흐름 — 월 버킷 행 (엔진=cash-plan SSOT, 여기선 표기만) ── */

type OutlookRow = CashPlanMonth & { label: string };

const OUTLOOK_SOURCE_SHORT: Array<[CashPlanSource, string]> = [
  ['계약대여료', '대여료'], ['할부', '할부'], ['보험료', '보험'],
  ['임차료', '임차'], ['과태료', '과태료'], ['보증금반환', '보증금'], ['자금업무', '자금업무'],
];

function outlookDetail(m: CashPlanMonth): string {
  const parts = OUTLOOK_SOURCE_SHORT
    .filter(([key]) => (m.bySource[key] || 0) > 0)
    .map(([key, label]) => `${label} ${won(m.bySource[key] || 0)}`);
  return parts.join(' · ') || '—';
}

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
        minHeight: 44,
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
  const { D, contracts, vehicles, bankTx, loading, error: loadError } = useDashboardData();
  const {
    data: [cardTx = [], planWork = [], planInsurances = [], planPenalties = [], planLeases = []],
    loading: planLoading,
  } = useEntityLists(['card_tx', 'work_item', 'insurance', 'penalty', 'lease']);

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);

  const cash = useMemo(() => buildCashLedger(bankTx, cardTx), [bankTx, cardTx]);
  const opProfit = useMemo(() => operatingProfit(cash), [cash]);
  const todayPanel = useMemo(() => selectTodayPanel(D), [D]);

  const [calYm, setCalYm] = useState(() => TODAY.slice(0, 7));

  // 예상 현금흐름 — 자금계획 SSOT(buildCashPlan)를 당월~+2개월 버킷으로. horizon = 마지막 달 말일까지.
  const cashOutlook = useMemo(() => {
    const [y, m, d] = TODAY.split('-').map(Number);
    const lastDay = Date.UTC(y, m - 1 + 3, 0); // +2개월의 말일
    const horizonDays = Math.round((lastDay - Date.UTC(y, m - 1, d)) / 86400000);
    const { rows } = buildCashPlan({
      contracts, vehicles, workItems: planWork, insurances: planInsurances,
      penalties: planPenalties, leases: planLeases, today: TODAY, horizonDays,
    });
    return summarizeCashPlanMonths(rows, TODAY, 3);
  }, [contracts, vehicles, planWork, planInsurances, planPenalties, planLeases]);

  const outlookRows: OutlookRow[] = useMemo(() => cashOutlook.months.map((m, i) => ({
    ...m, label: i === 0 ? `이번달 (${Number(m.ym.slice(5))}월)` : `${Number(m.ym.slice(5))}월`,
  })), [cashOutlook]);

  /* 폭을 준 이유: 홈은 「화면 한 판」이라 패널 안에서 가로 스크롤이 나면 안 된다.
     월·금액 3열은 폭이 정해진 값이고, 남는 폭은 「구성」이 가져간다(안 주면 5열 균등분할이라
     금액열이 폭을 낭비하고 구성이 과하게 잘린다). */
  const outlookCols: SheetCol<OutlookRow>[] = useMemo(() => [
    { key: 'label', label: '월', pin: true, width: 104, render: (r) => r.label, text: (r) => r.label },
    { key: 'inflow', label: '들어올 돈', align: 'r', width: 108, sortNum: true, xf: 'money', render: (r) => won(r.inflow), text: (r) => r.inflow },
    { key: 'outflow', label: '나갈 돈', align: 'r', width: 108, sortNum: true, xf: 'money', render: (r) => won(r.outflow), text: (r) => r.outflow },
    {
      key: 'net', label: '순현금흐름', align: 'r', width: 112, sortNum: true, xf: 'money',
      render: (r) => (
        <span style={{ color: r.net >= 0 ? C.ok : C.danger, fontWeight: 800 }}>{won(r.net)}</span>
      ),
      text: (r) => r.net,
    },
    {
      key: 'detail', label: '구성',
      // 남는 폭 담당 — 좁으면 잘린다. 전체 내역은 행을 눌러 /cash 에서 본다.
      render: (r) => <span style={{ color: C.mute, fontSize: 11 }} title={outlookDetail(r)}>{outlookDetail(r)}</span>,
      text: (r) => outlookDetail(r),
    },
  ], []);

  const outlookNotes = useMemo(() => [
    cashOutlook.overdueInflow > 0 ? `기한경과 입금 ${won(cashOutlook.overdueInflow)}` : '',
    cashOutlook.overdueOutflow > 0 ? `기한경과 출금 ${won(cashOutlook.overdueOutflow)}` : '',
    cashOutlook.unscheduledCount > 0 ? `일정 미확정 ${cashOutlook.unscheduledCount}건` : '',
  ].filter(Boolean).join(' · '), [cashOutlook]);

  const go = (href: string) => router.push(href);

  // 일정 달력 — 어젠다 SSOT(buildAgenda)를 날짜별 항목으로. 과태료만 업무 딥링크, 나머지=리스크.
  const calendarItems = useMemo(() => {
    const byDate = agendaByDate(buildAgenda(contracts, vehicles, planInsurances, planPenalties));
    const out = new Map<string, CalendarItem[]>();
    for (const [date, list] of byDate) {
      out.set(date, list.map((it) => ({
        key: it.key,
        label: `${AGENDA_SHORT[it.kind]} ${it.plate || it.title}`,
        tone: it.tone,
        onClick: () => go(it.kind === '과태료 기한' ? '/work?group=과태료' : '/risk'),
      })));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contracts, vehicles, planInsurances, planPenalties]);

  return (
    <LedgerFrame
      title="대시보드"
      meta="한눈 지표 · 할 일·미점검"
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
        /* 원장 시트와 동일: 워크스페이스 폭 그대로 · 상단 0(패널과 정렬) · 간격 12 통일.
           ★데스크톱은 «화면 한 판» — 프레임 높이를 그대로 채우고 페이지 스크롤을 만들지 않는다.
             남는 높이는 아래 2분할(달력·현금흐름)이 먹고, 넘치는 내용은 각 패널 안에서 스크롤한다.
             모바일은 세로로 쌓이므로 한 판에 넣지 않는다(자연 높이 + 스크롤). */
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          ...(mobile
            ? { padding: '0 0 24px' }
            : { flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }),
        }}>
          {/* ★조회 실패를 지표 «0»으로 위장하지 않는다 — 거짓 안심 방지(QA 중요). */}
          {loadError ? <ErrorState variant="sec" message={`${loadError} — 아래 지표는 불완전합니다`} /> : null}
          <div style={{
            ...gridKpi,
            gridTemplateColumns: mobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))',
            flexShrink: 0,
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
              label="계약유지 미수"
              value={Soft(loading, won(kpi.misuActive))}
              meta={loading ? undefined : `유지 ${kpi.misuActiveCount}건`}
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

          {/* 2026-08-05 사장님 지시: 법인별 요약·손익추이 자리 → 일정 달력 + 예상 현금흐름 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: mobile ? '1fr' : 'minmax(0, 3fr) minmax(280px, 2fr)',
            gap: 12,
            ...(mobile ? {} : { flex: '1 1 auto', minHeight: 0 }),
          }}>
            <Panel title="일정 달력" desc="반납·만기 · 검사 · 보험 · 세금 · 과태료 — 어젠다 SSOT · 항목 클릭=해당 원장">
              {loading || planLoading ? (
                <PageLoading />
              ) : (
                <MonthCalendar ym={calYm} onYm={setCalYm} today={TODAY} items={calendarItems} fill={!mobile} />
              )}
            </Panel>

            <Panel title="예상 현금흐름" desc="기계약 회차 대여료 등 들어올 돈 − 할부·보험·임차료 등 나갈 돈 · 자금계획 SSOT">
              {loading || planLoading ? (
                <PageLoading />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* fit = 기본보기(표를 패널 폭에 맞춘다). 안 주면 폭이 `max-content` 라
                      「구성」의 긴 텍스트가 표를 밀어내 패널에 가로 스크롤이 생긴다. */}
                  <ExcelSheet fit cols={outlookCols} rows={outlookRows} rowKey={(r) => r.ym} onRow={() => go('/cash')} />
                  {outlookNotes ? (
                    <div style={{ fontSize: 11, color: C.mute }}>
                      {outlookNotes} — 자금관리 › 자금계획에서 확인
                    </div>
                  ) : null}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}
    />
  );
}
