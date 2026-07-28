/**
 * 홈 주의원장 SSOT — 웹(/) LedgerFrame · 모바일(/m) 리스트 공용.
 * linkFleet/buildFleetRows · selectReceivables(동일 net) · buildAgenda 병합.
 * 구분 3종: 미결 · 리스크 · 휴차. 페이지 손롤 집계 금지.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, type FleetRow } from '@/lib/sheet-rows';
import { buildAgenda } from '@/lib/agenda';
import { computeContractView } from '@/lib/contract-ops';
import { selectReceivables } from '@/lib/snapshot/selectors';
import type { BadgeTone } from '@/components/ui/misc';
import { NAV_GROUPS, type NavItem } from '@/lib/nav';

export type HomeSheetGroup = '미결' | '리스크' | '휴차';
export type BriefingTone = 'danger' | 'warn' | 'brand' | 'mute';

export type HomeSheetRow = {
  id: string;
  group: HomeSheetGroup;
  /** 세부 구분(배지 라벨) */
  kind: string;
  plate: string;
  customer: string;
  carName: string;
  /** 표시용 기한 (D-day · 도래일) */
  due: string;
  /** 기간필터용 ISO date */
  dueDate: string;
  amount: number;
  status: string;
  tone: BriefingTone;
  badgeTone: BadgeTone;
};

/** @deprecated 모바일 브리핑 호환 — HomeSheetRow와 동일 축 */
export type HomeBriefingItem = HomeSheetRow & { category: HomeSheetGroup; ref: string; detail: string };

export type HomeBriefing = {
  items: HomeBriefingItem[];
  rows: HomeSheetRow[];
  receivables: ReturnType<typeof selectReceivables>;
};

const GROUP_TONE: Record<HomeSheetGroup, { tone: BriefingTone; badgeTone: BadgeTone }> = {
  미결: { tone: 'danger', badgeTone: 'red' },
  리스크: { tone: 'warn', badgeTone: 'amber' },
  휴차: { tone: 'mute', badgeTone: 'gray' },
};

const GROUP_RANK: Record<HomeSheetGroup, number> = { 미결: 0, 리스크: 1, 휴차: 2 };

function ddayLabel(d: number | null): string {
  if (d == null) return '—';
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

function carNameOf(r: FleetRow): string {
  return r.carName || [r.maker, r.subModel].filter(Boolean).join(' ') || '—';
}

function rowOf(
  group: HomeSheetGroup,
  partial: Omit<HomeSheetRow, 'group' | 'tone' | 'badgeTone'>,
): HomeSheetRow {
  const t = GROUP_TONE[group];
  return { ...partial, group, tone: t.tone, badgeTone: t.badgeTone };
}

/** 미결·리스크·휴차 주의 행 전부 (엑셀·리스트 공용). */
export function buildHomeSheetRows(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  history: EntityRecord[] = [],
  today: string = TODAY,
): HomeSheetRow[] {
  const fleet = linkFleet(vehicles, contracts, today);
  const rows = buildFleetRows(fleet.vehicles, insurances, fleet.contracts, history, today);
  const held = rows.filter((r) => r.ownership !== '처분완료');
  const byPlate = new Map(held.map((r) => [r.plate, r]));

  const out: HomeSheetRow[] = [];
  const seen = new Set<string>();
  const push = (r: HomeSheetRow) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  };

  // ── 미결: 만기경과 · 인도예정 · 일정 어김 ──
  for (const r of held.filter((x) => x.dday != null && x.dday < 0).sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0))) {
    push(rowOf('미결', {
      id: `미결:만기경과:${r.plate}`,
      kind: '만기경과',
      plate: r.plate,
      customer: r.customer || '—',
      carName: carNameOf(r),
      due: `${ddayLabel(r.dday)} · ${r.end || '—'}`,
      dueDate: (r.end || '').slice(0, 10),
      amount: Math.max(0, r.net),
      status: '만기경과',
    }));
  }
  for (const r of held.filter((x) => x.ownership === '구매예정' || x.ownership === '등록예정')) {
    push(rowOf('미결', {
      id: `미결:인도:${r.plate}`,
      kind: '인도예정',
      plate: r.plate,
      customer: r.customer || '—',
      carName: carNameOf(r),
      due: r.status || r.ownership,
      dueDate: (r.acqDate || r.start || '').slice(0, 10),
      amount: 0,
      status: r.ownership,
    }));
  }
  const overduePlates = new Set(held.filter((x) => x.dday != null && x.dday < 0).map((x) => x.plate));
  for (const a of buildAgenda(contracts, vehicles, insurances, penalties).filter((x) => x.status === '어김')) {
    if (a.kind === '반납·만기' && a.plate && overduePlates.has(a.plate)) continue;
    const fr = a.plate ? byPlate.get(a.plate) : undefined;
    push(rowOf('미결', {
      id: `미결:일정:${a.key}`,
      kind: a.kind,
      plate: a.plate,
      customer: a.title || '—',
      carName: fr ? carNameOf(fr) : '—',
      due: `${ddayLabel(a.dday)} · ${a.date}`,
      dueDate: a.date,
      amount: 0,
      status: '어김',
    }));
  }

  // 미수 — selectReceivables와 동일 net (computeContractView)
  for (const v of contracts
    .map((c) => computeContractView(c, today))
    .filter((x) => !x.ended && x.net > 0)
    .sort((a, b) => b.net - a.net)) {
    const plate = String(v.rec.plate || '');
    const fr = plate ? byPlate.get(plate) : undefined;
    push(rowOf('리스크', {
      id: `리스크:미수:${v.rec._key || v.rec.contractNo || plate}`,
      kind: '미수',
      plate,
      customer: String(v.rec.contractorName || '—'),
      carName: fr ? carNameOf(fr) : String(v.rec.carName || '—'),
      due: v.overdueDays ? `${v.overdueDays}일 연체` : ddayLabel(v.dday),
      dueDate: String(v.rec.endDate || '').slice(0, 10),
      amount: v.net,
      status: '미수',
    }));
  }
  for (const r of held.filter((x) => x.dday != null && x.dday >= 0 && x.dday <= 7).sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0))) {
    push(rowOf('리스크', {
      id: `리스크:임박:${r.plate}`,
      kind: '만기임박',
      plate: r.plate,
      customer: r.customer || '—',
      carName: carNameOf(r),
      due: `${ddayLabel(r.dday)} · ${r.end || '—'}`,
      dueDate: (r.end || '').slice(0, 10),
      amount: Math.max(0, r.net),
      status: '만기임박',
    }));
  }

  // ── 휴차: 보유중 · util 휴차 ──
  for (const r of held.filter((x) => x.ownership === '보유중' && x.util === '휴차').sort((a, b) => a.plate.localeCompare(b.plate, 'ko'))) {
    push(rowOf('휴차', {
      id: `휴차:${r.plate}`,
      kind: '휴차',
      plate: r.plate,
      customer: r.customer || '—',
      carName: carNameOf(r),
      due: '—',
      dueDate: '',
      amount: Math.max(0, r.net),
      status: r.status || '휴차',
    }));
  }

  return out.sort((a, b) => GROUP_RANK[a.group] - GROUP_RANK[b.group]
    || a.dueDate.localeCompare(b.dueDate)
    || b.amount - a.amount
    || a.plate.localeCompare(b.plate, 'ko'));
}

/** 모바일 리스트용 — 시트와 동일 데이터, BriefingItem 형태로. */
export function buildHomeBriefing(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  history: EntityRecord[] = [],
  today: string = TODAY,
): HomeBriefing {
  const receivables = selectReceivables(contracts, today);
  const rows = buildHomeSheetRows(vehicles, contracts, insurances, penalties, history, today);
  const items: HomeBriefingItem[] = rows.map((r) => ({
    ...r,
    category: r.group,
    ref: r.plate || r.kind,
    detail: r.amount > 0 ? `${r.due} · ${r.amount.toLocaleString('ko-KR')}원` : r.due,
  }));
  return { items, rows, receivables };
}

export function homeLedgerShortcuts(): NavItem[] {
  const byHref = new Map(NAV_GROUPS.flatMap((g) => g.items).map((it) => [it.href, it]));
  const order = ['/status', '/desk', '/cash', '/work'] as const;
  return order.map((href) => byHref.get(href)).filter((it): it is NavItem => !!it);
}
