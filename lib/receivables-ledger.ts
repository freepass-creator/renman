/**
 * 미수관리 워크벤치 SSOT — 행 조립·조치 건수·Facet 칩 카운트.
 * 금액·미수율 헤드라인은 selectReceivables(selectors) 유지. 페이지 .filter/.reduce 손롤 금지.
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { computeContractView, type ContractView } from '@/lib/contract-ops';
import { collectionStage, type CollectionInfo } from '@/lib/collection';
import { selectReceivables, type ReceivablesSnapshot } from '@/lib/snapshot/selectors';

const CONTACT_KINDS = new Set(['통화', '문자', '방문', '독촉']);

export type ReceivableRow = {
  rec: EntityRecord;
  v: ContractView;
  st: CollectionInfo;
  contact: EntityRecord | null;
};

export type ReceivableActionStats = {
  noticeTodo: number;
  immob: number;
  lockTodo: number;
  endedLockReview: number;
};

/** FacetRail「미수」칩 건수 — lens-filters 라벨과 동일 키. */
export type ReceivableFacetCounts = Record<string, number>;

/** 계약종료 채권에는 신규 시동제어 단계가 없다. 같은 SLA 구간은 정산·회수 경고로 처리한다. */
export function collectionInfoForReceivable(v: Pick<ContractView, 'overdueDays' | 'ended'>): CollectionInfo {
  const base = collectionStage(v.overdueDays);
  if (v.ended && base.stage === '시동제어') {
    return { ...base, stage: '경고', nextAction: '보증금 정산·잔존채권 확인' };
  }
  return base;
}

const EMPTY_FACET_COUNTS = (): ReceivableFacetCounts => ({
  계약유지: 0, 계약종료: 0,
  회수대기: 0, 경고: 0, 시동제어: 0, 내용증명: 0, 채권화: 0,
  '1~29일': 0, '30~89일': 0, '90일+': 0,
  미조치: 0, 내용증명발송: 0, 시동제어중: 0,
});

/** plate → 최근 연락 이력. */
function lastContactByPlate(history: EntityRecord[]): Map<string, EntityRecord> {
  const map = new Map<string, EntityRecord>();
  for (const h of history) {
    if (!CONTACT_KINDS.has(String(h.category || ''))) continue;
    const plate = String(h.plate || '');
    if (!plate) continue;
    const cur = map.get(plate);
    if (!cur || String(h.date || '') > String(cur.date || '')) map.set(plate, h);
  }
  return map;
}

/** 미수 행(net>0) · 금액 큰 순. 보증금 정산 완료(충당 반영 후 net=0)는 제외. */
export function buildReceivableRows(
  contracts: EntityRecord[],
  history: EntityRecord[],
  today: string,
): ReceivableRow[] {
  const lastContact = lastContactByPlate(history);
  return contracts
    .map((c) => {
      const v = computeContractView(c, today);
      return {
        rec: c,
        v,
        st: collectionInfoForReceivable(v),
        contact: lastContact.get(String(c.plate || '')) || null,
      };
    })
    .filter((r) => r.v.net > 0)
    .sort((a, b) => b.v.net - a.v.net);
}

/** 현황 Metric — 내용증명 대상·시동제어 필요/중. */
export function summarizeReceivableActions(rows: ReceivableRow[]): ReceivableActionStats {
  let noticeTodo = 0, immob = 0, lockTodo = 0, endedLockReview = 0;
  for (const r of rows) {
    const stage = r.st.stage;
    if ((stage === '내용증명' || stage === '채권화') && !r.rec.noticeSentDate) noticeTodo++;
    if (r.rec.engineDisabled && r.v.ended) endedLockReview++;
    else if (r.rec.engineDisabled) immob++;
    if (!r.v.ended && !r.rec.engineDisabled && (stage === '시동제어' || stage === '내용증명' || stage === '채권화')) {
      lockTodo++;
    }
  }
  return { noticeTodo, immob, lockTodo, endedLockReview };
}

/** Facet 칩 건수 — 필터 술어와 동일 기준. */
export function countReceivableFacets(rows: ReceivableRow[]): ReceivableFacetCounts {
  const c = EMPTY_FACET_COUNTS();
  for (const r of rows) {
    c[r.v.ended ? '계약종료' : '계약유지']++;
    if (c[r.st.stage] != null) c[r.st.stage]++;
    const d = r.v.overdueDays;
    if (d >= 1 && d <= 29) c['1~29일']++;
    else if (d >= 30 && d <= 89) c['30~89일']++;
    else if (d >= 90) c['90일+']++;
    const notice = !!r.rec.noticeSentDate;
    const engine = !!r.rec.engineDisabled;
    if (!notice && !engine) c['미조치']++;
    if (notice) c['내용증명발송']++;
    if (engine) c['시동제어중']++;
  }
  return c;
}

/** 내용증명 일괄 «대상 선택» — 필터된 목록 기준. */
export function countNoticeTodo(rows: ReceivableRow[]): number {
  return noticeTodoRows(rows).length;
}

export function noticeTodoRows(rows: ReceivableRow[]): ReceivableRow[] {
  return rows.filter((r) => (r.st.stage === '내용증명' || r.st.stage === '채권화') && !r.rec.noticeSentDate);
}

export type ReceivablesWorkbench = ReceivablesSnapshot & ReceivableActionStats & {
  rows: ReceivableRow[];
  count: number;
  totalUnpaid: number;
};

/** 미수관리 페이지 헤드라인+행 1회 조립. */
export function buildReceivablesWorkbench(
  contracts: EntityRecord[],
  history: EntityRecord[],
  today: string,
): ReceivablesWorkbench {
  const rows = buildReceivableRows(contracts, history, today);
  const recv = selectReceivables(contracts, today);
  const actions = summarizeReceivableActions(rows);
  return {
    ...recv,
    ...actions,
    rows,
    count: recv.unpaidCount,
    totalUnpaid: recv.total,
  };
}
