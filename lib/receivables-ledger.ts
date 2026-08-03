/**
 * 미수관리 워크벤치 SSOT — 행 조립·조치 건수·Facet 칩 카운트.
 * 금액·미수율 헤드라인은 selectReceivables(selectors) 유지. 페이지 .filter/.reduce 손롤 금지.
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { computeContractView, type ContractView } from '@/lib/contract-ops';
import type { CollectionInfo } from '@/lib/collection';
import { selectReceivables, type ReceivablesSnapshot } from '@/lib/snapshot/selectors';

const CONTACT_KINDS = new Set(['통화', '문자', '방문', '상담', '독촉']);

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

export type ContractCollectionTerms = {
  warning?: number;
  engineLock?: number;
  repossession?: number;
  legalNotice?: number;
  debtTransfer?: number;
  clause: string;
};

function contractDay(rec: EntityRecord | undefined, key: string): number | undefined {
  const raw = rec?.[key];
  if (raw == null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

/** 계약서에 저장된 조건만 읽는다. 회사 공통값이나 업계 관행은 대입하지 않는다. */
export function collectionTermsOf(rec?: EntityRecord): ContractCollectionTerms {
  return {
    warning: contractDay(rec, 'warningAfterDays'),
    engineLock: contractDay(rec, 'engineLockAfterDays'),
    repossession: contractDay(rec, 'repossessionAfterDays'),
    legalNotice: contractDay(rec, 'legalNoticeAfterDays'),
    debtTransfer: contractDay(rec, 'debtTransferAfterDays'),
    clause: String(rec?.arrearsClause || '').trim(),
  };
}

export function collectionTermsLabel(rec?: EntityRecord): string {
  const t = collectionTermsOf(rec);
  const parts = [
    t.warning == null ? '' : `경고 D+${t.warning}`,
    t.engineLock == null ? '' : `시동제어 D+${t.engineLock}`,
    t.repossession == null ? '' : `차량회수 D+${t.repossession}`,
    t.legalNotice == null ? '' : `내용증명 D+${t.legalNotice}`,
    t.debtTransfer == null ? '' : `채권전환 D+${t.debtTransfer}`,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '계약조건 미등록';
}

export function engineLockDue(row: { rec: EntityRecord; v: Pick<ContractView, 'ended' | 'overdueDays'> }): boolean {
  const day = collectionTermsOf(row.rec).engineLock;
  return !row.v.ended && day != null && row.v.overdueDays >= day;
}

/** 미수 단계는 계약별 조항의 이행 상태다. 조건이 없으면 자동 추정하지 않고 확인 업무로 남긴다. */
export function collectionInfoForReceivable(
  v: Pick<ContractView, 'overdueDays' | 'ended'>,
  rec?: EntityRecord,
): CollectionInfo {
  const d = Math.max(0, Math.round(v.overdueDays));
  const t = collectionTermsOf(rec);

  // 실행 사실은 계약조건 도래 계산보다 우선한다.
  if (rec?.debtTransferredDate || String(rec?.status || '') === '채권') {
    return { stage: '채권화', tone: 'purple', nextAction: '법적조치·채권관리', overdueDays: d };
  }
  if (rec?.noticeSentDate) {
    return { stage: '내용증명', tone: 'red', nextAction: '송달·납부기한 확인', overdueDays: d };
  }
  if (!v.ended && rec?.engineDisabled) {
    return { stage: '시동제어', tone: 'orange', nextAction: '입금 확인·해제 판단', overdueDays: d };
  }

  const candidates: Array<{ day: number | undefined; info: CollectionInfo }> = v.ended
    ? [
        { day: t.legalNotice, info: { stage: '내용증명', tone: 'red', nextAction: '내용증명 발송', overdueDays: d } },
        { day: t.debtTransfer, info: { stage: '채권화', tone: 'purple', nextAction: '법적조치·채권전환', overdueDays: d } },
      ]
    : [
        { day: t.warning, info: { stage: '경고', tone: 'amber', nextAction: '계약상 경고 이행', overdueDays: d } },
        { day: t.engineLock, info: { stage: '시동제어', tone: 'orange', nextAction: '계약조건 확인 후 시동제어', overdueDays: d } },
        { day: t.repossession, info: { stage: '차량회수', tone: 'red', nextAction: '계약조건 확인 후 차량회수', overdueDays: d } },
        { day: t.legalNotice, info: { stage: '내용증명', tone: 'red', nextAction: '내용증명 발송', overdueDays: d } },
        { day: t.debtTransfer, info: { stage: '채권화', tone: 'purple', nextAction: '법적조치·채권전환', overdueDays: d } },
      ];
  // 계약서의 D+숫자가 비정상 순서여도 이미 도래한 조치 중 가장 강한 단계를 선택한다.
  // 숫자가 큰 조건을 고르면 차량회수보다 늦게 적힌 경고가 현재 단계로 역행할 수 있다.
  const due = [...candidates].reverse()
    .find((x): x is { day: number; info: CollectionInfo } => x.day != null && d >= x.day);
  if (due) return due.info;

  const hasApplicableTerm = candidates.some((x) => x.day != null);
  if (!hasApplicableTerm) {
    if (v.ended) return { stage: '회수대기', tone: 'gray', nextAction: '보증금 정산·잔존채권 확인', overdueDays: d };
    return { stage: '계약조건 확인', tone: 'amber', nextAction: '계약서 연체조항 확인·등록', overdueDays: d };
  }
  return {
    stage: '회수대기', tone: 'gray',
    nextAction: v.ended ? '보증금 정산·잔존채권 확인' : '계약조건 도래 대기',
    overdueDays: d,
  };
}

const COLLECTION_PRIORITY: Record<CollectionInfo['stage'], number> = {
  '회수대기': 0,
  '계약조건 확인': 1,
  '경고': 2,
  '시동제어': 3,
  '차량회수': 4,
  '내용증명': 5,
  '채권화': 6,
};

/** 차량처럼 여러 계약을 한 행에 합칠 때 가장 강한 실제 조치 단계를 고른다. */
export function mostUrgentCollectionInfo(
  items: Array<{ rec: EntityRecord; v: Pick<ContractView, 'overdueDays' | 'ended'> }>,
): CollectionInfo | null {
  const infos = items.map(({ rec, v }) => collectionInfoForReceivable(v, rec));
  return infos.sort((a, b) =>
    COLLECTION_PRIORITY[b.stage] - COLLECTION_PRIORITY[a.stage]
    || b.overdueDays - a.overdueDays,
  )[0] ?? null;
}

const EMPTY_FACET_COUNTS = (): ReceivableFacetCounts => ({
  계약유지: 0, 계약종료: 0,
  '계약조건 확인': 0, 회수대기: 0, 경고: 0, 시동제어: 0, 차량회수: 0, 내용증명: 0, 채권화: 0,
  '1~29일': 0, '30~89일': 0, '90일+': 0,
  미조치: 0, 내용증명발송: 0, 시동제어중: 0,
});

const contactKey = (companyId: unknown, plate: unknown) => `${String(companyId || '')}::${String(plate || '').replace(/\s/g, '')}`;
const contractContactKey = (companyId: unknown, contractNo: unknown) => `${String(companyId || '')}::${String(contractNo || '').trim()}`;

/** 계약번호가 있으면 해당 계약 전용, 없으면 회사+차량 공통 연락 이력으로 취급한다. */
function lastContacts(history: EntityRecord[]): {
  byContract: Map<string, EntityRecord>;
  byPlate: Map<string, EntityRecord>;
} {
  const byContract = new Map<string, EntityRecord>();
  const byPlate = new Map<string, EntityRecord>();
  for (const h of history) {
    if (!CONTACT_KINDS.has(String(h.category || ''))) continue;
    const plate = String(h.plate || '');
    if (!plate) continue;
    const contractNo = String(h.contractNo || '').trim();
    const map = contractNo ? byContract : byPlate;
    const key = contractNo ? contractContactKey(h.companyId, contractNo) : contactKey(h.companyId, plate);
    const cur = map.get(key);
    if (!cur || String(h.date || '') > String(cur.date || '')) map.set(key, h);
  }
  return { byContract, byPlate };
}

/** 미수 행(net>0) · 금액 큰 순. 보증금 정산 완료(충당 반영 후 net=0)는 제외. */
export function buildReceivableRows(
  contracts: EntityRecord[],
  history: EntityRecord[],
  today: string,
): ReceivableRow[] {
  const contacts = lastContacts(history);
  return contracts
    .map((c) => {
      const v = computeContractView(c, today);
      return {
        rec: c,
        v,
        st: collectionInfoForReceivable(v, c),
        contact: contacts.byContract.get(contractContactKey(c.companyId, c.contractNo))
          || contacts.byPlate.get(contactKey(c.companyId, c.plate)) || null,
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
    if (!r.rec.engineDisabled && engineLockDue(r)) {
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
