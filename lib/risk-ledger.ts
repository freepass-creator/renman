/**
 * 리스크관리 원장 SSOT — 웹(/risk) · 모바일(/m/risk) 단일.
 * linkFleet/buildFleetRows · selectReceivables · buildAgenda(어김→미완료 · 임박→만기)
 * · buildHomePendingRows(업무 미처리→미완료). 구분: 미완료 · 미납 · 만기 · 휴차.
 * 일정관리(/desk)는 /risk로 흡수.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { TODAY } from '@/lib/dashboard-consts';
import { linkFleet } from '@/lib/domain/model';
import { buildFleetRows, type FleetRow } from '@/lib/sheet-rows';
import { buildAgenda, type AgendaItem } from '@/lib/agenda';
import { computeContractView } from '@/lib/contract-ops';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { computeDashboard } from '@/lib/operating-snapshot';
import { buildHomePendingRows } from '@/lib/home-rows';
import { companyShort } from '@/lib/companies';
import type { BadgeTone } from '@/components/ui/misc';
import { NAV_GROUPS, type NavItem } from '@/lib/nav';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';

/** 만기 칩 경계 — D≤이 값(경과 포함은 미완료, 임박만 만기). buildAgenda 임박과 동일. */
export const RISK_DDAY_BOUND = 7;

export type RiskSheetGroup = '미완료' | '미납' | '만기' | '휴차';
export type RiskTone = 'danger' | 'warn' | 'brand' | 'mute';

export type RiskSheetRow = {
  id: string;
  group: RiskSheetGroup;
  kind: string;
  companyId: string;
  company: string;
  plate: string;
  customer: string;
  carName: string;
  due: string;
  dueDate: string;
  amount: number;
  status: string;
  /** 미납 행 — 내용증명·시동 등 조치용. */
  contractKey?: string;
  tone: RiskTone;
  badgeTone: BadgeTone;
};

export type RiskSheet = {
  rows: RiskSheetRow[];
  receivables: ReturnType<typeof selectReceivables>;
};

const GROUP_TONE: Record<RiskSheetGroup, { tone: RiskTone; badgeTone: BadgeTone }> = {
  미완료: { tone: 'danger', badgeTone: 'red' },
  미납: { tone: 'danger', badgeTone: 'red' },
  만기: { tone: 'warn', badgeTone: 'amber' },
  휴차: { tone: 'mute', badgeTone: 'gray' },
};

const GROUP_RANK: Record<RiskSheetGroup, number> = { 미완료: 0, 미납: 1, 만기: 2, 휴차: 3 };

function ddayLabel(d: number | null): string {
  if (d == null) return LEDGER_EMPTY.dash;
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

function carNameOf(r: FleetRow): string {
  return r.carName || [r.maker, r.subModel].filter(Boolean).join(' ') || LEDGER_EMPTY.dash;
}

function companyOf(fr?: Pick<FleetRow, 'companyId' | 'company'>, rec?: EntityRecord): { companyId: string; company: string } {
  const companyId = String(fr?.companyId || rec?.companyId || '');
  return { companyId, company: fr?.company || companyShort(companyId) };
}

function rowOf(
  group: RiskSheetGroup,
  partial: Omit<RiskSheetRow, 'group' | 'tone' | 'badgeTone'>,
): RiskSheetRow {
  const t = GROUP_TONE[group];
  return { ...partial, group, tone: t.tone, badgeTone: t.badgeTone };
}

/** 대시보드「오늘 집중」·리스크 일정 합류 공용 — buildAgenda 어김·임박만. cap 없으면 전체. */
export function riskAgendaFocus(
  contracts: EntityRecord[],
  vehicles: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  cap?: number,
): AgendaItem[] {
  const rank = (s: AgendaItem['status']) => (s === '어김' ? 0 : s === '임박' ? 1 : 2);
  const items = buildAgenda(contracts, vehicles, insurances, penalties)
    .filter((a) => a.status === '어김' || a.status === '임박')
    .sort((a, b) => rank(a.status) - rank(b.status) || a.dday - b.dday || a.date.localeCompare(b.date));
  return cap != null ? items.slice(0, cap) : items;
}

/** 미완료·미납·만기·휴차 주의 행 (엑셀·리스트 공용). */
export function buildRiskSheetRows(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  history: EntityRecord[] = [],
  today: string = TODAY,
  bankTx: EntityRecord[] = [],
): RiskSheetRow[] {
  const fleet = linkFleet(vehicles, contracts, today);
  const rows = buildFleetRows(fleet.vehicles, insurances, fleet.contracts, history, today);
  const held = rows.filter((r) => r.ownership !== '처분완료');
  const byPlate = new Map(held.map((r) => [r.plate, r]));

  const out: RiskSheetRow[] = [];
  const seen = new Set<string>();
  const push = (r: RiskSheetRow) => {
    if (seen.has(r.id)) return;
    seen.add(r.id);
    out.push(r);
  };

  // 일정 SSOT 1회 — 어김→미완료 · 임박→만기 (검사·보험·과태료·반납)
  const agenda = buildAgenda(contracts, vehicles, insurances, penalties);

  // ── 미완료: 만기경과 · 인도예정 · 일정 어김 ──
  for (const r of held.filter((x) => x.dday != null && x.dday < 0).sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0))) {
    push(rowOf('미완료', {
      id: `미완료:만기경과:${r.plate}`,
      kind: '만기경과',
      ...companyOf(r),
      plate: r.plate,
      customer: r.customer || LEDGER_EMPTY.none,
      carName: carNameOf(r),
      due: `${ddayLabel(r.dday)} · ${r.end || LEDGER_EMPTY.dash}`,
      dueDate: (r.end || '').slice(0, 10),
      amount: Math.max(0, r.net),
      status: '만기경과',
    }));
  }
  for (const r of held.filter((x) => x.ownership === '구매예정' || x.ownership === '등록예정')) {
    push(rowOf('미완료', {
      id: `미완료:인도:${r.plate}`,
      kind: '인도예정',
      ...companyOf(r),
      plate: r.plate,
      customer: r.customer || LEDGER_EMPTY.none,
      carName: carNameOf(r),
      due: r.status || r.ownership,
      dueDate: (r.acqDate || r.start || '').slice(0, 10),
      amount: 0,
      status: r.ownership,
    }));
  }
  const overduePlates = new Set(held.filter((x) => x.dday != null && x.dday < 0).map((x) => x.plate));
  for (const a of agenda.filter((x) => x.status === '어김')) {
    if (a.kind === '반납·만기' && a.plate && overduePlates.has(a.plate)) continue;
    const fr = a.plate ? byPlate.get(a.plate) : undefined;
    push(rowOf('미완료', {
      id: `미완료:일정:${a.key}`,
      kind: a.kind,
      ...companyOf(fr),
      plate: a.plate,
      customer: a.title || LEDGER_EMPTY.none,
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      due: `${ddayLabel(a.dday)} · ${a.date}`,
      dueDate: a.date,
      amount: 0,
      status: '어김',
    }));
  }

  // ── 미납: selectReceivables와 동일 net>0 (진행·반환 포함) ──
  for (const v of contracts
    .map((c) => computeContractView(c, today))
    .filter((x) => x.net > 0)
    .sort((a, b) => b.net - a.net)) {
    const plate = String(v.rec.plate || '');
    const fr = plate ? byPlate.get(plate) : undefined;
    push(rowOf('미납', {
      id: `미납:${v.rec._key || v.rec.contractNo || plate}`,
      kind: v.ended ? '반환미수' : '미납',
      ...companyOf(fr, v.rec),
      plate,
      customer: String(v.rec.contractorName || LEDGER_EMPTY.none),
      carName: fr ? carNameOf(fr) : String(v.rec.carName || LEDGER_EMPTY.dash),
      due: v.overdueDays ? `${v.overdueDays}일 연체` : ddayLabel(v.dday),
      dueDate: String(v.rec.endDate || '').slice(0, 10),
      amount: v.net,
      status: v.ended ? '반환미수' : '미납',
      contractKey: String(v.rec._key || ''),
    }));
  }

  // ── 만기: 계약 임박 + 일정 임박(검사·보험·과태료·반납) ──
  for (const r of held
    .filter((x) => x.dday != null && x.dday >= 0 && x.dday <= RISK_DDAY_BOUND)
    .sort((a, b) => (a.dday ?? 0) - (b.dday ?? 0))) {
    push(rowOf('만기', {
      id: `만기:임박:${r.plate}`,
      kind: '만기임박',
      ...companyOf(r),
      plate: r.plate,
      customer: r.customer || LEDGER_EMPTY.none,
      carName: carNameOf(r),
      due: `${ddayLabel(r.dday)} · ${r.end || LEDGER_EMPTY.dash}`,
      dueDate: (r.end || '').slice(0, 10),
      amount: Math.max(0, r.net),
      status: '만기임박',
    }));
  }
  const soonPlates = new Set(
    held.filter((x) => x.dday != null && x.dday >= 0 && x.dday <= RISK_DDAY_BOUND).map((x) => x.plate),
  );
  for (const a of agenda.filter((x) => x.status === '임박')) {
    if (a.kind === '반납·만기' && a.plate && soonPlates.has(a.plate)) continue;
    const fr = a.plate ? byPlate.get(a.plate) : undefined;
    push(rowOf('만기', {
      id: `만기:일정:${a.key}`,
      kind: a.kind,
      ...companyOf(fr),
      plate: a.plate,
      customer: a.title || LEDGER_EMPTY.none,
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      due: `${ddayLabel(a.dday)} · ${a.date}`,
      dueDate: a.date,
      amount: 0,
      status: '임박',
    }));
  }

  // ── 업무 미처리 → 미완료 (buildHomePendingRows SSOT · 반납지남은 만기경과와 중복 스킵) ──
  const dash = computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, today);
  for (const p of buildHomePendingRows(dash)) {
    if (p.kind === '반납지남') continue;
    const fr = p.plate ? byPlate.get(p.plate) : undefined;
    push(rowOf('미완료', {
      id: `미완료:업무:${p.id}`,
      kind: p.kind,
      ...companyOf(fr),
      plate: p.plate,
      customer: p.title || LEDGER_EMPTY.none,
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      due: p.detail || LEDGER_EMPTY.dash,
      dueDate: '',
      amount: Math.max(0, p.amount),
      status: '미처리',
    }));
  }

  // ── 휴차 ──
  for (const r of held.filter((x) => x.ownership === '보유중' && x.util === '휴차').sort((a, b) => a.plate.localeCompare(b.plate, 'ko'))) {
    push(rowOf('휴차', {
      id: `휴차:${r.plate}`,
      kind: '휴차',
      ...companyOf(r),
      plate: r.plate,
      customer: r.customer || LEDGER_EMPTY.none,
      carName: carNameOf(r),
      due: LEDGER_EMPTY.dash,
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

/** 칩·배지용 그룹 건수 — 페이지 `.filter().length` 손롤 금지. */
export type RiskGroupCounts = Record<'전체' | RiskSheetGroup, number>;

export function countRiskSheetGroups(rows: RiskSheetRow[]): RiskGroupCounts {
  const counts: RiskGroupCounts = { 전체: rows.length, 미완료: 0, 미납: 0, 만기: 0, 휴차: 0 };
  for (const r of rows) counts[r.group]++;
  return counts;
}

export function buildRiskSheet(
  vehicles: EntityRecord[],
  contracts: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
  history: EntityRecord[] = [],
  today: string = TODAY,
  bankTx: EntityRecord[] = [],
): RiskSheet {
  return {
    rows: buildRiskSheetRows(vehicles, contracts, insurances, penalties, history, today, bankTx),
    receivables: selectReceivables(contracts, today),
  };
}

/** 홈 랜딩 원장 바로가기 — 시스템·홈 제외, NAV_GROUPS 순서. */
export function homeLedgerShortcuts(): NavItem[] {
  return NAV_GROUPS
    .filter((g) => g.title !== '시스템')
    .flatMap((g) => g.items)
    .filter((it) => it.href !== '/');
}
