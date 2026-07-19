/**
 * 출고·반납 큐 SSOT — /dispatch(입출고관리)가 소비. (옛 /m·/field 흡수)
 *   오늘 인도·오늘 반납·반납 지남 + 전체 인도대기/반납대상. 페이지에서 filter 손롤 금지.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { isDeliveryPending, isReturnable, effectiveEndDate } from '@/lib/contract-ops';
import { TODAY } from '@/lib/dashboard-consts';
import { textMatch } from '@/lib/search-match';

export type FieldTab = '오늘' | '인도' | '반납';

export type FieldQueues = {
  /** 오늘 인도 예정(또는 계약시작=오늘) · 아직 미인도 */
  deliverToday: EntityRecord[];
  /** 오늘 반납 예정 · 운행중 */
  returnToday: EntityRecord[];
  /** 반납/만기 지남 · 운행중 */
  returnOverdue: EntityRecord[];
  /** 인도 대기 전체 */
  deliverAll: EntityRecord[];
  /** 반납 대상 전체(임박순) */
  returnAll: EntityRecord[];
};

function ymd(v: unknown): string {
  const s = String(v || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function deliverScheduleDate(c: EntityRecord): string {
  return ymd(c.deliveryScheduledDate) || ymd(c.startDate) || ymd(c.contractDate);
}

function endKey(c: EntityRecord): string {
  return effectiveEndDate(c) || '9999-12-31';
}

/** 계약 목록 → 현장 큐. asOf 기본 TODAY. */
export function buildFieldQueues(contracts: EntityRecord[], asOf: string = TODAY): FieldQueues {
  const deliverAll = contracts.filter(isDeliveryPending);
  const returnAll = contracts.filter(isReturnable).sort((a, b) => endKey(a).localeCompare(endKey(b)));

  const deliverToday = deliverAll.filter((c) => deliverScheduleDate(c) === asOf);
  const returnToday = returnAll.filter((c) => {
    const end = ymd(c.returnScheduledDate) || ymd(effectiveEndDate(c));
    return end === asOf;
  });
  const returnOverdue = returnAll.filter((c) => {
    const end = ymd(effectiveEndDate(c));
    return !!end && end < asOf;
  });

  return { deliverToday, returnToday, returnOverdue, deliverAll, returnAll };
}

/** 탭별 카드 목록 — 오늘은 인도오늘+반납오늘+지남(중복 plate는 반납 우선). */
export function fieldListForTab(q: FieldQueues, tab: FieldTab): { kind: '인도' | '반납'; contract: EntityRecord }[] {
  if (tab === '인도') return q.deliverAll.map((c) => ({ kind: '인도' as const, contract: c }));
  if (tab === '반납') return q.returnAll.map((c) => ({ kind: '반납' as const, contract: c }));

  const seen = new Set<string>();
  const out: { kind: '인도' | '반납'; contract: EntityRecord }[] = [];
  const push = (kind: '인도' | '반납', c: EntityRecord) => {
    const k = String(c._key || c.plate || '');
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ kind, contract: c });
  };
  for (const c of q.returnOverdue) push('반납', c);
  for (const c of q.returnToday) push('반납', c);
  for (const c of q.deliverToday) push('인도', c);
  return out;
}

export function filterFieldRows(
  rows: { kind: '인도' | '반납'; contract: EntityRecord }[],
  q: string,
): { kind: '인도' | '반납'; contract: EntityRecord }[] {
  if (!q.trim()) return rows;
  return rows.filter(({ contract: c }) =>
    textMatch(q, c.plate, c.contractorName, c.contractNo, c.carName, c.contractorPhone));
}

export function fieldTodayCount(q: FieldQueues): number {
  return q.deliverToday.length + q.returnToday.length + q.returnOverdue.length;
}
