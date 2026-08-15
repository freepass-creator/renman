'use client';
/**
 * 업무조회(/) — 앱의 입구. **뭐가 문제고 뭘 해야 하는지**만 답한다.
 *
 * 설계 = docs/DESIGN-2026-08. 조각으로 손대지 말 것.
 *
 * ## 왜 이 모양인가
 *   원장은 제대로만 돌면 볼 일이 없다(사장님 2026-08-09). 그래서 입구는 원장이 아니다.
 *   들어오면 «지금 챙길 건수» 하나가 크게 보이고, 그 아래에 급한 순으로 할 일이 있고,
 *   나머지는 찾아서 간다.
 *
 *   [문제]   지금 챙길 건수 하나 — 화면에서 제일 큰 글자(--text-display)
 *   [찾기]   차번·계약자·업무 무엇이든 한 줄
 *   [할 일]  시점 버킷(경과·오늘·이번 주…). 누르면 그 건으로
 *   [현황]   한 줄 요약. 자세한 건 원장이 한다
 *
 * ## 안 하는 것
 *   · 표를 그리지 않는다 — 표는 원장(데이터센터)의 일이다.
 *   · 원장 바로가기를 늘어놓지 않는다 — 그건 메뉴트리를 홈에 옮기는 것뿐이다.
 *   · 교차검증·손익 같은 분석을 얹지 않는다(/integrity 가 전담).
 *
 * 데이터는 selectTodayPanel · computeKPI 만. 페이지에서 재집계하지 않는다.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search as SearchIcon } from 'lucide-react';
import {
  Page, Sec, Rows, ObjRow, EmptyState, PageLoading, Btn, Search, C, won,
  DISPLAY_FS, SP, type BadgeTone,
} from '@/components/ui';
import { TODAY } from '@/lib/dashboard-consts';
import { computeKPI } from '@/lib/kpi';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { hrefForTodayRow, selectTodayPanel, type HomeQueueRow } from '@/lib/home-rows';
import { useIsMobile } from '@/lib/use-mobile';

/**
 * 급한 정도 = 색. 신호는 셋뿐이다(DESIGN §3-4).
 *   빨강 = 지금(기한 경과·미수·사고) · 주황 = 곧 · 회색 = 나머지
 */
function taskTone(row: HomeQueueRow): BadgeTone {
  if ((row.dday != null && row.dday < 0) || row.kind === '사고' || row.kind.includes('위험') || row.kind.includes('미수')) return 'red';
  if (row.dday == null) return 'gray';
  return 'amber';
}

const BUCKET_TONE: Record<string, BadgeTone> = {
  경과: 'red', 오늘: 'amber', '이번 주': 'amber', '이번 달': 'gray', 상시: 'gray',
};

export default function HomePage() {
  const router = useRouter();
  const mobile = useIsMobile();
  const { D, contracts, vehicles, loading, error } = useDashboardData();
  const [q, setQ] = useState('');

  const kpi = useMemo(() => computeKPI(contracts, vehicles, TODAY), [contracts, vehicles]);
  const panel = useMemo(() => selectTodayPanel(D), [D]);

  const go = (href: string) => router.push(href);
  const search = () => {
    const t = q.trim();
    if (t) go(`/search?q=${encodeURIComponent(t)}`);
  };

  /* 경과·오늘은 펼치고 그 뒤는 접는다 — 급하지 않은 것이 화면을 먹지 않게. */
  const overdue = panel.groups.find((g) => g.bucket === '경과')?.rows.length ?? 0;

  return (
    <Page title="업무조회" meta="지금 챙길 것" error={error}>
      {/* ── 문제 — 화면에서 제일 큰 글자 하나. 이게 위계의 정점이다. ── */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: SP[3],
        marginBottom: SP[4], flexWrap: 'wrap',
      }}>
        <span style={{
          fontSize: DISPLAY_FS, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
          color: overdue > 0 ? C.danger : C.ink,
        }}>
          {loading ? '…' : panel.count}
        </span>
        <span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}>
          {loading ? '불러오는 중'
            : panel.count === 0 ? '챙길 일 없음'
              : overdue > 0 ? `건 · 그중 기한 지난 것 ${overdue}건` : '건'}
        </span>
      </div>

      {/* ── 찾기 — 원장에 안 가고 여기서 바로 닿는다. ── */}
      <div style={{ display: 'flex', gap: SP[2], alignItems: 'center', marginBottom: SP[5] }}>
        <Search
          placeholder="차량번호 · 계약자 · 업무 찾기"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Btn size="md" variant="ghost" onClick={search} aria-label="찾기">
          <SearchIcon size={15} />
        </Btn>
        <Btn size="md" onClick={() => go('/work')}>
          <Plus size={15} />{mobile ? '업무' : '업무 만들기'}
        </Btn>
      </div>

      {/* ── 할 일 — 시점 버킷으로 급한 순. ── */}
      <Sec id="home-todo" title="할 일" collapsible={false}>
        {loading ? (
          <PageLoading />
        ) : panel.count === 0 ? (
          <EmptyState variant="ok">지금 챙길 일이 없습니다</EmptyState>
        ) : (
          <div style={{ display: 'grid', gap: SP[2] }}>
            {panel.groups.map((g, i) => (
              <Rows
                key={g.bucket}
                id={`todo-${g.bucket}`}
                title={g.bucket}
                tone={BUCKET_TONE[g.bucket] || 'gray'}
                n={g.rows.length}
                collapsible
                defaultOpen={i < 2}
              >
                {g.rows.slice(0, 12).map((row) => (
                  <ObjRow
                    key={row.id}
                    rail={row.dday != null && row.dday < 0 ? 'danger' : 'none'}
                    plate={row.plate || undefined}
                    name={row.plate ? undefined : row.title}
                    badge={row.kind}
                    badgeTone={taskTone(row)}
                    meta={row.plate ? row.title : row.company}
                    sub={row.detail}
                    right={row.amount > 0 ? won(row.amount) : undefined}
                    rightTone={row.amount > 0 ? 'danger' : 'ink'}
                    onClick={() => go(hrefForTodayRow(row))}
                  />
                ))}
              </Rows>
            ))}
          </div>
        )}
      </Sec>

      {/* ── 현황 — 한 줄. 타일로 벌리지 않는다. ── */}
      <Sec id="home-status" title="현황" collapsible={false}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center',
          gap: mobile ? `${SP[2]}px ${SP[4]}px` : `${SP[2]}px ${SP[5]}px`,
          padding: `${SP[1]}px 2px`,
        }}>
          <Stat label="가동률" value={loading ? '…' : `${kpi.util}%`} tone={kpi.util >= 70 ? 'ok' : 'warn'} onClick={() => go('/status')} />
          <Stat label="보유" value={loading ? '…' : `${kpi.totalVehicles}대`} onClick={() => go('/asset')} />
          <Stat label="휴차" value={loading ? '…' : `${kpi.idle}대`} tone={kpi.idle > 0 ? 'warn' : 'ok'} onClick={() => go('/status')} />
          <Stat
            label="미수"
            value={loading ? '…' : won(kpi.misuActive)}
            hint={loading ? undefined : `${kpi.misuActiveCount}건`}
            tone={kpi.misuActive > 0 ? 'danger' : 'ok'}
            onClick={() => go('/risk')}
          />
        </div>
      </Sec>
    </Page>
  );
}

/** 현황 한 칸 — 라벨·값만. 카드로 감싸지 않는다(선을 줄인다 · DESIGN §3-3). */
function Stat({ label, value, hint, tone, onClick }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'danger';
  onClick?: () => void;
}) {
  const color = tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'ok' ? C.ok : C.ink;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: SP[1] + 2,
        background: 'none', border: 'none', padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ color: C.faint, fontSize: 12 }}>{label}</span>
      <span style={{ color, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>{value}</span>
      {hint != null && <span style={{ color: C.faint, fontSize: 11.5 }}>{hint}</span>}
    </button>
  );
}
