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
    // expiring dday<0 = 보험·검사만(계약 만기경과 dday≤7은 returnFlow). agendaKey SSOT.
    rows.push({
      id: riskAgendaOverOpenId(e.agendaKey || `insp:${plate}`),
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

/** 다가오는 만기·반납 — D.expiring(계약 D8~30·보험/검사 ≤30)·returnFlow(D0~7)의 미래분.
 *  경과분은 pending/risk 빌더가 담당(중복 없음). 레코드 딥링크 대신 /risk?group=만기 페이지 링크. */
export function buildHomeUpcomingRows(D: Dashboard): HomeQueueRow[] {
  const rows: HomeQueueRow[] = [];
  for (const v of D.returnFlow) {
    const dd = v.dday ?? null;
    if (dd == null || dd < 0) continue;
    const plate = String(v.rec.plate || '');
    rows.push({
      id: `up:ret:${plate}:${String(v.rec.endDate || '')}`,
      company: companyDisplay(v.rec.companyId),
      kind: '반납임박',
      plate,
      title: String(v.rec.contractorName || '계약자 미정'),
      detail: `반납예정 ${String(v.rec.endDate || '—')} · D-${dd}`,
      dday: dd,
      amount: Number(v.net) || 0,
    });
  }
  for (const e of D.expiring) {
    const dd = e.dday ?? null;
    if (dd == null || dd < 0) continue;
    rows.push({
      id: `up:${e.agendaKey || `exp:${e.plate}`}`,
      company: '',
      kind: '만기임박',
      plate: String(e.plate || ''),
      title: String(e.main || '만기'),
      detail: String(e.sub || ''),
      dday: dd,
      amount: 0,
    });
  }
  return rows;
}

/** 시점 버킷 — 홈 패널·추후 리스크/업무 공용. 손롤 분기 금지, 이 함수만. */
export type DueBucket = '경과' | '오늘' | '이번 주' | '이번 달' | '상시';
export const DUE_BUCKETS: DueBucket[] = ['경과', '오늘', '이번 주', '이번 달', '상시'];
export function dueBucketOf(dday: number | null): DueBucket {
  if (dday == null) return '상시';
  if (dday < 0) return '경과';
  if (dday === 0) return '오늘';
  if (dday <= 7) return '이번 주';
  return '이번 달';
}

export type TodayBucketGroup = { bucket: DueBucket; rows: HomeQueueRow[] };

/**
 * 홈 우측 패널 «할 일·미점검» — 미결+리스크+다가오는 만기를 시점별로.
 * 경과 → 오늘 → 이번 주 → 이번 달 → 상시 미점검. 빈 버킷은 제외.
 */
export function selectTodayPanel(D: Dashboard): { count: number; groups: TodayBucketGroup[] } {
  const map = new Map<string, HomeQueueRow>();
  for (const r of [...buildHomePendingRows(D), ...buildHomeRiskRows(D), ...buildHomeUpcomingRows(D)]) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  const byBucket = new Map<DueBucket, HomeQueueRow[]>();
  for (const r of map.values()) {
    const b = dueBucketOf(r.dday);
    const list = byBucket.get(b) || [];
    list.push(r);
    byBucket.set(b, list);
  }
  let count = 0;
  const groups: TodayBucketGroup[] = [];
  for (const b of DUE_BUCKETS) {
    const list = byBucket.get(b);
    if (!list?.length) continue;
    list.sort((a, x) =>
      todayUrgency(a) - todayUrgency(x)
      || (a.dday ?? 999) - (x.dday ?? 999)
      || (x.amount || 0) - (a.amount || 0));
    count += list.length;
    groups.push({ bucket: b, rows: list });
  }
  return { count, groups };
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
    case '컴플라이언스':
    case '컴플라이언스(위험)':
      // 컴플라이언스는 리스크 표에 없음(4그룹 원복) → 정합성 페이지가 담당.
      return `/integrity?open=${open}`;
    case '반납임박':
    case '만기임박':
      // 미래분(D8~30 포함)은 개별 레코드가 리스크 표에 없을 수 있어 페이지 링크.
      return '/risk?group=만기';
    case '반납지남':
    case '만기경과':
    case '운행중미수':
    case '종료미수':
    default:
      // 리스크 표 row id SSOT와 일치 — 그 건이 바로 열림.
      return `/risk?open=${open}`;
  }
}
