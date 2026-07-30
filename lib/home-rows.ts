/**
 * 홈 엑셀 행 — 미결·리스크·휴차 큐.
 * 집계는 operating-snapshot(D)만. 페이지에서 재집계 금지.
 * open id = 목적지 원장 row id SSOT (`lib/ledger-open-ids`).
 *
 * TODO(2단계): ack/snoozeUntil — 무시·미루기 마킹. 지금은 조건 해소 전 무한 재노출.
 */
import type { Dashboard } from './operating-snapshot';
import { companyDisplay } from './companies';
import {
  penaltyOpenId,
  riskAgendaOverOpenId,
  riskComplianceOpenId,
  riskReturnOverOpenId,
  riskUnpaidOpenId,
} from './ledger-open-ids';

export type HomeQueueRow = {
  id: string;
  company: string;
  kind: string;
  plate: string;
  title: string;
  detail: string;
  dday: number | null;
  amount: number;
};

export type HomeIdleRow = {
  id: string;
  company: string;
  plate: string;
  carName: string;
  status: string;
  customer: string;
};

/** 미결 = 처리하면 큐에서 사라지는 것. */
export function buildHomePendingRows(D: Dashboard): HomeQueueRow[] {
  const rows: HomeQueueRow[] = [];
  for (const v of D.returnFlow) {
    if ((v.dday ?? 0) >= 0) continue;
    const plate = String(v.rec.plate || '');
    rows.push({
      id: riskReturnOverOpenId(plate),
      company: companyDisplay(v.rec.companyId),
      kind: '반납지남',
      plate,
      title: String(v.rec.contractorName || '계약자 미정'),
      detail: `반납예정 ${String(v.rec.endDate || '—')}`,
      dday: v.dday,
      amount: Number(v.net) || 0,
    });
  }
  for (const d of D.doubleBooking) {
    rows.push({
      // risk embeds as 미완료:업무:… — 홈은 배차로 (표 open 없음)
      id: `미완료:업무:overlap:${d.plate}`,
      company: '',
      kind: '배차충돌',
      plate: d.plate,
      title: '기간 겹침',
      detail: d.detail,
      dday: null,
      amount: 0,
    });
  }
  for (const p of D.penaltyPending) {
    rows.push({
      id: penaltyOpenId(p.rec),
      company: companyDisplay(p.rec.companyId),
      kind: '과태료',
      plate: String(p.rec.plate || ''),
      title: String(p.rec.description || p.rec.docType || '과태료'),
      detail: String(p.rec.violationDate || p.rec.dueDate || '—'),
      dday: null,
      amount: Number(p.rec.amount) || 0,
    });
  }
  for (const t of D.todo) {
    rows.push({
      id: `미완료:업무:todo:${t.action}:${t.plate}`,
      company: '',
      kind: t.action,
      plate: t.plate,
      title: t.name,
      detail: t.detail,
      dday: null,
      amount: 0,
    });
  }
  for (const plate of D.ghostPlates) {
    rows.push({
      id: `미완료:업무:ghost:${plate}`,
      company: '',
      kind: '서류미첨부',
      plate,
      title: '등록증 없음',
      detail: '계약만 있고 차량 원장 없음',
      dday: null,
      amount: 0,
    });
  }
  for (const t of D.unmatchedTx) {
    rows.push({
      id: `tx:${t._key || t.id || ''}`,
      company: companyDisplay(t.companyId),
      kind: '자금미분류',
      plate: '',
      title: String(t.memo || t.counterpart || '미분류 거래'),
      detail: String(t.date || t.txDate || '—'),
      dday: null,
      amount: Number(t.amount) || Number(t.withdraw) || 0,
    });
  }
  return rows;
}

/** 리스크 = 처리해도 계속 관리. */
export function buildHomeRiskRows(D: Dashboard): HomeQueueRow[] {
  const rows: HomeQueueRow[] = [];
  for (const v of D.overduePay) {
    rows.push({
      id: riskUnpaidOpenId(v.rec),
      company: companyDisplay(v.rec.companyId),
      kind: v.ended ? '종료미수' : '운행중미수',
      plate: String(v.rec.plate || ''),
      title: String(v.rec.contractorName || '계약자 미정'),
      detail: v.overdueDays ? `${v.overdueDays}일 연체` : '미납',
      dday: v.overdueDays ? -v.overdueDays : null,
      amount: Number(v.net) || 0,
    });
  }
  for (const c of D.compliance) {
    const high = c.flags.some((f) => f.severity === 'high');
    rows.push({
      id: riskComplianceOpenId(c.rec),
      company: companyDisplay(c.rec.companyId),
      kind: high ? '컴플라이언스(위험)' : '컴플라이언스',
      plate: String(c.rec.plate || ''),
      title: String(c.rec.contractorName || c.rec.plate || '—'),
      detail: c.flags.map((f) => f.label || f.detail).filter(Boolean).join(' · '),
      dday: null,
      amount: 0,
    });
  }
  for (const r of D.repair) {
    if (r.status !== '사고') continue;
    rows.push({
      id: `acc:${r.v._key || r.v.plate}`,
      company: companyDisplay(r.v.companyId),
      kind: '사고',
      plate: String(r.v.plate || ''),
      title: String(r.v.carName || r.v.plate || '사고'),
      detail: '사고 처리중',
      dday: null,
      amount: 0,
    });
  }
  for (const e of D.expiring) {
    if ((e.dday ?? 0) >= 0) continue;
    const plate = String(e.plate || '');
    const isContract = String(e.sub || '').includes('계약');
    rows.push({
      id: isContract
        ? riskReturnOverOpenId(plate)
        : riskAgendaOverOpenId(e.agendaKey || `insp:${plate}`),
      company: '',
      kind: '만기경과',
      plate,
      title: String(e.main || '만기'),
      detail: String(e.sub || ''),
      dday: e.dday,
      amount: 0,
    });
  }
  return rows;
}

export function buildHomeIdleRows(D: Dashboard): HomeIdleRow[] {
  return D.idleCars.map((r) => ({
    id: String(r.v._key || r.v.plate),
    company: companyDisplay(r.v.companyId),
    plate: String(r.v.plate || ''),
    carName: String(r.v.carName || ''),
    status: r.status,
    customer: String(r.av?.rec?.contractorName || ''),
  }));
}

/** 급한 순: 미납경과·사고·만기경과 우선. */
function todayUrgency(row: HomeQueueRow): number {
  if (row.kind === '사고' || row.kind.includes('컴플라이언스(위험)')) return 0;
  if (row.kind.includes('미수') || row.kind.includes('미납')) return 1;
  if (row.kind === '만기경과' || row.kind === '반납지남' || (row.dday != null && row.dday < 0)) return 2;
  if (row.kind === '배차충돌') return 3;
  return 4;
}

/**
 * 홈 «오늘 할 일» — 미결+리스크 합쳐 급함순 상위 cap건.
 * 전체 지시문 쏟지 않음(요약만).
 */
export function selectTodayFocus(D: Dashboard, cap = 5): { count: number; rows: HomeQueueRow[] } {
  const map = new Map<string, HomeQueueRow>();
  for (const r of [...buildHomePendingRows(D), ...buildHomeRiskRows(D)]) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  const all = [...map.values()].sort((a, b) =>
    todayUrgency(a) - todayUrgency(b)
    || (a.dday ?? 999) - (b.dday ?? 999)
    || (b.amount || 0) - (a.amount || 0));
  return { count: all.length, rows: all.slice(0, cap) };
}

/** 홈 행 → 원장 딥링크 (?open= = 목적지 row id). */
export function hrefForTodayRow(row: HomeQueueRow): string {
  const open = encodeURIComponent(row.id);
  switch (row.kind) {
    case '과태료':
      return `/work?group=과태료&open=${open}`;
    case '자금미분류':
      return '/payments';
    case '서류미첨부':
      return '/ingest';
    case '배차충돌':
      return '/dispatch';
    case '사고':
      return row.plate ? `/repair` : '/repair';
    case '반납지남':
    case '만기경과':
    case '운행중미수':
    case '종료미수':
    case '컴플라이언스':
    case '컴플라이언스(위험)':
      return `/integrity?open=${open}`;
    default:
      return `/risk?open=${open}`;
  }
}
