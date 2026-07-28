/**
 * 홈 엑셀 행 — 미결·리스크·휴차 큐.
 * 집계는 operating-snapshot(D)만. 페이지에서 재집계 금지.
 */
import type { Dashboard } from './operating-snapshot';
import { companyDisplay } from './companies';

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
    rows.push({
      id: `ret:${v.rec.plate}:${v.rec._key || v.rec.contractNo || ''}`,
      company: companyDisplay(v.rec.companyId),
      kind: '반납지남',
      plate: String(v.rec.plate || ''),
      title: String(v.rec.contractorName || '계약자 미정'),
      detail: `반납예정 ${String(v.rec.endDate || '—')}`,
      dday: v.dday,
      amount: Number(v.net) || 0,
    });
  }
  for (const d of D.doubleBooking) {
    rows.push({
      id: `overlap:${d.plate}:${d.detail}`,
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
      id: `pen:${p.rec._key || p.rec.id || p.rec.plate}`,
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
      id: `todo:${t.action}:${t.plate}`,
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
      id: `ghost:${plate}`,
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
      id: `misu:${v.rec._key || v.rec.contractNo || v.rec.plate}`,
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
      id: `comp:${c.rec._key || c.rec.plate}`,
      company: companyDisplay(c.rec.companyId),
      kind: high ? '컴플라이언스(위험)' : '컴플라이언스',
      plate: String(c.rec.plate || ''),
      title: String(c.rec.contractorName || c.rec.plate || '—'),
      detail: c.flags.map((f) => f.label || f.detail).filter(Boolean).join(' · '),
      dday: null,
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
