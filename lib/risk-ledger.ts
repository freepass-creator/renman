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
import { collectionInfoForReceivable } from '@/lib/receivables-ledger';
import { selectReceivables } from '@/lib/snapshot/selectors';
import { computeDashboard } from '@/lib/operating-snapshot';
import { buildHomePendingRows } from '@/lib/home-rows';
import { riskUnpaidOpenId } from '@/lib/ledger-open-ids';
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
  /** 신원 — «실제 사람·거래상대» 이름만. 사유·차명·제목을 담지 않는다(칸이 의미를 잃는다). */
  customer: string;
  /** 사유·제목 — 무엇 때문에 걸렸는지. 신원과 절대 섞지 않는다(「리스크내용」 칸). */
  subject: string;
  phone: string;
  carName: string;
  /**
   * ★한 칸에 원자 하나 (사장님 확정 2026-08-07).
   *   「기한」은 **날짜 하나**다. 예전에는 `D+968 · 2023-12-13` 처럼 두 값을 이어 붙이거나
   *   「계약만 있고 차량 원장 없음」 같은 «사유 문장»까지 기한 칸에 들어가 칸이 의미를 잃었다.
   *   D-day·연체일·사유는 각자 제 칸(dday / overdueDays / subject)으로 간다.
   */
  dueDate: string;
  /** D-day 원자 — 음수=경과. 표시는 ddayLabel. */
  dday: number | null;
  /** 연체일 원자 — 미납 행만. 0=연체 아님. */
  overdueDays: number;
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

const GROUP_RANK: Record<RiskSheetGroup, number> = {
  미완료: 0, 미납: 1, 만기: 2, 휴차: 3,
};

export function ddayLabel(d: number | null): string {
  if (d == null) return LEDGER_EMPTY.dash;
  if (d < 0) return `D+${Math.abs(d)}`;
  if (d === 0) return 'D-Day';
  return `D-${d}`;
}

/**
 * 일정 유래 행의 «리스크상태».
 * ★「어김」·「임박」은 buildAgenda 내부 용어다 — 화면에 그대로 내보내면 «무엇이 어떻다는 건지»를
 *   말해주지 않는다(사장님 지적 2026-08-07 «리스크 상태도 어김?? 이런거 말고»).
 *   분류(kind)마다 실제로 어떤 상태인지로 바꾼다. 한 칸 한 값은 유지.
 */
export function agendaStatusLabel(kind: string, over: boolean): string {
  if (kind === '검사만기') return over ? '검사 경과' : '검사 임박';
  if (kind === '보험만기') return over ? '보험 만료' : '보험 임박';
  if (kind === '세금 만기') return over ? '납기 경과' : '납기 임박';
  if (kind === '과태료 기한') return over ? '납기 경과' : '납기 임박';
  if (kind === '반납·만기') return over ? '반납 지연' : '반납 임박';
  return over ? '기한 경과' : '기한 임박';
}

/** 홈 큐가 실어 오는 detail 이 «날짜»면 기한 칸으로, 아니면 기한 칸에 넣지 않는다. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 모바일 카드 보조 한 줄 — 날짜가 있으면 날짜, 없으면 D-day. 둘을 이어 붙이지 않는다. */
export function riskDueSub(r: Pick<RiskSheetRow, 'dueDate' | 'dday'>): string {
  return r.dueDate || ddayLabel(r.dday);
}

function carNameOf(r: FleetRow): string {
  return r.carName || [r.maker, r.subModel].filter(Boolean).join(' ') || LEDGER_EMPTY.dash;
}

function companyOf(fr?: Pick<FleetRow, 'companyId' | 'company'>, rec?: EntityRecord): { companyId: string; company: string } {
  const companyId = String(fr?.companyId || rec?.companyId || '');
  return { companyId, company: fr?.company || companyShort(companyId) };
}

/**
 * 일정 유래 행의 «리스크내용».
 *
 * ★lib/agenda.ts 의 title 은 kind 마다 담는 것이 다르다:
 *   검사만기·세금만기 = 차명 · 보험만기 = 보험사 · 과태료 기한 = 위반내용 · 반납·만기 = 계약자.
 *   차명은 이제 「차량번호」 칸이 2줄로 담으므로, 내용 칸에까지 차명을 넣으면 중복이고
 *   «무엇 때문에 걸렸는지»를 알려주지 못한다 → 차명류는 사유 문장으로 바꾼다.
 */
function agendaSubject(kind: string, title: string): string {
  if (kind === '검사만기') return '정기검사 미필';
  if (kind === '세금 만기') return '자동차세 미납';
  // 보험사명은 «사유»가 아니다 — 신원·부가정보(자산/차량360)에 있다. 여기는 걸린 이유만.
  if (kind === '보험만기') return '보험 만기 도래';
  if (kind === '반납·만기') return '계약 만기·반납 대상';
  return title || LEDGER_EMPTY.dash;   // 과태료 위반내용 등은 그대로 유용
}

function phoneOf(fr?: Pick<FleetRow, 'phone'>, fallback = ''): string {
  return String(fr?.phone || fallback || '').trim();
}

function rowOf(
  group: RiskSheetGroup,
  partial: Omit<RiskSheetRow, 'group' | 'tone' | 'badgeTone' | 'phone'> & { phone?: string },
): RiskSheetRow {
  const t = GROUP_TONE[group];
  return { ...partial, phone: partial.phone || '', group, tone: t.tone, badgeTone: t.badgeTone };
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
      subject: '계약 만기 경과',
      phone: r.phone,
      carName: carNameOf(r),
      dueDate: (r.end || '').slice(0, 10),
      dday: r.dday ?? null,
      overdueDays: 0,
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
      subject: '차량 인도 대기',
      phone: r.phone,
      carName: carNameOf(r),
      dueDate: (r.acqDate || r.start || '').slice(0, 10),
      dday: null,
      overdueDays: 0,
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
      // 차량이 안 붙은 일정도 회사는 반드시 채운다 — 일정 자체가 companyId 를 갖고 있다.
      ...companyOf(fr, { companyId: a.companyId } as EntityRecord),
      plate: a.plate,
      // ★신원은 차량으로 찾은 «실제 계약자»만. a.title(차명·사유)을 여기 넣으면 칸이 의미를 잃는다.
      customer: fr?.customer || LEDGER_EMPTY.none,
      subject: agendaSubject(a.kind, a.title),
      phone: phoneOf(fr),
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      dueDate: a.date,
      dday: a.dday,
      overdueDays: 0,
      amount: 0,
      status: agendaStatusLabel(a.kind, true),
    }));
  }

  // ── 미납: selectReceivables와 동일 net>0 (계약유지·계약종료 포함) — views 1패스 ──
  const views = contracts.map((c) => computeContractView(c, today));
  for (const v of views.filter((x) => x.net > 0).sort((a, b) => b.net - a.net)) {
    const plate = String(v.rec.plate || '');
    const fr = plate ? byPlate.get(plate) : undefined;
    const collection = collectionInfoForReceivable(v, v.rec);
    push(rowOf('미납', {
      id: riskUnpaidOpenId(v.rec),
      kind: v.ended ? '계약종료 미수' : '계약유지 미수',
      ...companyOf(fr, v.rec),
      plate,
      customer: String(v.rec.contractorName || LEDGER_EMPTY.none),
      // 연체일수는 「연체일」 칸이 담는다 — 사유 칸에 이어 붙이지 않는다.
      subject: v.ended ? `계약종료 후 미수 ${v.count}건` : `대여료 ${v.count}회 미납`,
      phone: phoneOf(fr, String(v.rec.contractorPhone || '')),
      carName: fr ? carNameOf(fr) : String(v.rec.carName || LEDGER_EMPTY.dash),
      dueDate: String(v.rec.endDate || '').slice(0, 10),
      dday: v.dday ?? null,
      overdueDays: Number(v.overdueDays) || 0,
      amount: v.net,
      // 상태는 계약 종료 여부를 반복하지 않고 실제 회수 단계를 보여준다.
      status: collection.stage,
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
      subject: '계약 만기 임박',
      phone: r.phone,
      carName: carNameOf(r),
      dueDate: (r.end || '').slice(0, 10),
      dday: r.dday ?? null,
      overdueDays: 0,
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
      ...companyOf(fr, { companyId: a.companyId } as EntityRecord),
      plate: a.plate,
      customer: fr?.customer || LEDGER_EMPTY.none,
      subject: agendaSubject(a.kind, a.title),
      phone: phoneOf(fr),
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      dueDate: a.date,
      dday: a.dday,
      overdueDays: 0,
      amount: 0,
      status: agendaStatusLabel(a.kind, false),
    }));
  }

  // ── 업무 미처리 → 미완료 (buildHomePendingRows SSOT · 반납지남은 만기경과와 중복 스킵) ──
  const dash = computeDashboard({ contracts, vehicles, insurances, penalties, bankTx }, today);
  for (const p of buildHomePendingRows(dash)) {
    if (p.kind === '반납지남') continue;
    // 홈이 이미 목적지 id(미완료:…)를 쓰면 그대로, 아니면 업무 접두.
    const id = p.id.startsWith('미완료:') ? p.id : `미완료:업무:${p.id}`;
    const fr = p.plate ? byPlate.get(p.plate) : undefined;
    // ★큐의 detail 은 «날짜»이기도 하고 «사유 문장»이기도 하다 — 섞인 채로 기한 칸에 넣으면
    //   「계약만 있고 차량 원장 없음」이 기한으로 보인다. 날짜면 기한, 문장이면 리스크내용.
    const isDate = ISO_DATE.test(p.detail || '');
    push(rowOf('미완료', {
      id,
      kind: p.kind,
      // ★자금미분류(통장거래)·서류미첨부는 차량이 없어 회사가 비었다 → 큐가 나르는 companyId 로 채운다.
      ...companyOf(fr, { companyId: p.companyId } as EntityRecord),
      plate: p.plate,
      // ★자금미분류의 p.title은 «거래상대»이고 서류미첨부의 p.title은 «사유»다 — 둘 다 신원 칸이 아니다.
      //   차량으로 계약자를 찾을 수 있으면 그것만 신원에 넣고, 제목은 리스크내용으로 보낸다.
      customer: fr?.customer || LEDGER_EMPTY.none,
      subject: (!isDate && p.detail) || p.title || LEDGER_EMPTY.dash,
      phone: phoneOf(fr),
      carName: fr ? carNameOf(fr) : LEDGER_EMPTY.dash,
      dueDate: isDate ? p.detail : '',
      dday: p.dday ?? null,
      overdueDays: 0,
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
      subject: '가동 없음',
      phone: r.phone,
      carName: carNameOf(r),
      dueDate: '',
      dday: null,
      overdueDays: 0,
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
  const counts: RiskGroupCounts = {
    전체: rows.length, 미완료: 0, 미납: 0, 만기: 0, 휴차: 0,
  };
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

/** 홈 랜딩 원장 바로가기 — 하단·홈 제외, NAV_GROUPS 순서. */
export function homeLedgerShortcuts(): NavItem[] {
  return NAV_GROUPS
    .filter((g) => g.title !== '하단' && g.title !== '')
    .flatMap((g) => g.items)
    .filter((it) => it.href !== '/');
}
