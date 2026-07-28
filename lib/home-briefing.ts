/**
 * 홈 «오늘 브리핑» SSOT — 웹(/) · 모바일(/m) 동일.
 * buildAgenda · selectReceivables(동일 net 정의) · linkFleet/buildFleetRows 병합·우선순위 정렬.
 * 페이지는 결과만 소비(손롤 집계 금지).
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, type FleetRow } from '@/lib/sheet-rows';
import { buildAgenda, type AgendaItem } from '@/lib/agenda';
import { computeContractView } from '@/lib/contract-ops';
import { selectReceivables } from '@/lib/snapshot/selectors';
import type { BadgeTone } from '@/components/ui/misc';
import { NAV_GROUPS, type NavItem } from '@/lib/nav';

export type BriefingCategory = '만기경과' | '만기임박' | '미수' | '인도예정' | '일정어김';
export type BriefingTone = 'danger' | 'warn' | 'brand';

export type HomeBriefingItem = {
  id: string;
  category: BriefingCategory;
  tone: BriefingTone;
  badgeTone: BadgeTone;
  plate: string;
  /** 식별자 보조(계약번호 등) */
  ref: string;
  customer: string;
  /** 기한·D-day 또는 금액 표시 */
  detail: string;
  amount: number;
  dday: number | null;
};

export type HomeBriefing = {
  items: HomeBriefingItem[];
  /** selectReceivables 스냅샷 — 대사·표시용(리스트는 items) */
  receivables: ReturnType<typeof selectReceivables>;
};

const LIMIT = 10;
const CAT_RANK: Record<BriefingCategory, number> = {
  만기경과: 0,
  만기임박: 1,
  미수: 2,
  인도예정: 3,
  일정어김: 4,
};
const TONE: Record<BriefingCategory, { tone: BriefingTone; badgeTone: BadgeTone }> = {
  만기경과: { tone: 'danger', badgeTone: 'red' },
  만기임박: { tone: 'warn', badgeTone: 'amber' },
  미수: { tone: 'danger', badgeTone: 'red' },
  인도예정: { tone: 'brand', badgeTone: 'blue' },
  일정어김: { tone: 'danger', badgeTone: 'orange' },
};

function won(n: number): string {
  return n ? `${n.toLocaleString('ko-KR')}원` : '—';
}

function ddayLabel(d: number | null): string {
  if (d == null) return '—';
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

function fromFleet(
  category: BriefingCategory,
  r: FleetRow,
  detail: string,
): HomeBriefingItem {
  const t = TONE[category];
  return {
    id: `${category}:${r.plate}`,
    category,
    tone: t.tone,
    badgeTone: t.badgeTone,
    plate: r.plate,
    ref: r.plate,
    customer: r.customer || '—',
    detail,
    amount: r.net,
    dday: r.dday,
  };
}

/** 오늘 챙길 것 — 우선순위 병합 상위 LIMIT건. */
export function buildHomeBriefing(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  history: EntityRecord[] = [],
  today: string = TODAY,
): HomeBriefing {
  const receivables = selectReceivables(contracts, today);
  const fleet = linkFleet(vehicles, contracts, today);
  const rows = buildFleetRows(fleet.vehicles, insurances, fleet.contracts, history, today);
  const held = rows.filter((r) => r.ownership !== '처분완료');

  const overdue = held
    .filter((r) => r.dday != null && r.dday < 0)
    .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));
  const soon = held
    .filter((r) => r.dday != null && r.dday >= 0 && r.dday <= 7)
    .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0));
  const delivery = held
    .filter((r) => r.ownership === '구매예정' || r.ownership === '등록예정')
    .sort((a, b) => a.plate.localeCompare(b.plate, 'ko'));

  // 미수 행 = selectReceivables와 동일 net 정의(computeContractView). 운행중(미종료) net>0 상위.
  const misuViews = contracts
    .map((c) => computeContractView(c, today))
    .filter((v) => !v.ended && v.net > 0)
    .sort((a, b) => b.net - a.net);

  const agendaBroken: AgendaItem[] = buildAgenda(contracts, vehicles, insurances, penalties)
    .filter((a) => a.status === '어김')
    .sort((a, b) => a.date.localeCompare(b.date) || a.dday - b.dday);

  const items: HomeBriefingItem[] = [];
  const seen = new Set<string>();
  const overduePlates = new Set(overdue.map((r) => r.plate));

  const push = (item: HomeBriefingItem) => {
    if (items.length >= LIMIT) return;
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  for (const r of overdue) {
    push(fromFleet('만기경과', r, `${ddayLabel(r.dday)} · 만기 ${r.end || '—'}`));
  }
  for (const r of soon) {
    push(fromFleet('만기임박', r, `${ddayLabel(r.dday)} · 만기 ${r.end || '—'}`));
  }
  for (const v of misuViews) {
    if (items.length >= LIMIT) break;
    const plate = String(v.rec.plate || '');
    const contractNo = String(v.rec.contractNo || '');
    const t = TONE.미수;
    push({
      id: `미수:${v.rec._key || contractNo || plate}`,
      category: '미수',
      tone: t.tone,
      badgeTone: t.badgeTone,
      plate,
      ref: contractNo || plate,
      customer: String(v.rec.contractorName || '—'),
      detail: won(v.net),
      amount: v.net,
      dday: v.dday,
    });
  }
  for (const r of delivery) {
    push(fromFleet('인도예정', r, r.status || r.ownership));
  }
  for (const a of agendaBroken) {
    if (items.length >= LIMIT) break;
    // 반납 만기경과와 중복 어김은 스킵
    if (a.kind === '반납·만기' && a.plate && overduePlates.has(a.plate)) continue;
    const t = TONE.일정어김;
    push({
      id: `일정어김:${a.key}`,
      category: '일정어김',
      tone: t.tone,
      badgeTone: t.badgeTone,
      plate: a.plate,
      ref: a.plate || a.kind,
      customer: a.title || '—',
      detail: `${a.kind} · ${a.date} · ${ddayLabel(a.dday)}`,
      amount: 0,
      dday: a.dday,
    });
  }

  items.sort((a, b) => CAT_RANK[a.category] - CAT_RANK[b.category]
    || (a.dday ?? 999) - (b.dday ?? 999)
    || b.amount - a.amount);

  return { items: items.slice(0, LIMIT), receivables };
}

/** 홈 하단 원장 바로가기 — nav 아이콘·href SSOT. */
export function homeLedgerShortcuts(): NavItem[] {
  const byHref = new Map(NAV_GROUPS.flatMap((g) => g.items).map((it) => [it.href, it]));
  const order = ['/status', '/desk', '/cash', '/work'] as const;
  return order.map((href) => byHref.get(href)).filter((it): it is NavItem => !!it);
}
