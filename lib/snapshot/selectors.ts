/** 운영 스냅샷 셀렉터 — 미수 집계 SSOT. 페이지 reduce/filter 손롤 금지. */
import { type EntityRecord } from '../intake/entities';
import { computeContractView } from '../contract-ops';

export type ReceivablesSnapshot = {
  /** 운행중+반납 미수 합(max(0,net)) */
  total: number;
  misuActive: number;
  misuReturned: number;
  misuActiveCount: number;
  misuReturnedCount: number;
  /** net>0 계약 건수 */
  unpaidCount: number;
  /** 미수율 분모 — returnedDate 없는 계약 */
  activeContractCount: number;
  /** 운행중 미수 건 / activeContractCount % */
  rate: number;
  over30: number;
  over90: number;
  /** 과오납 합(−net) */
  overpayTotal: number;
};

/** 미수 집계 1곳 — 홈·미수·리스크·재무·KPI가 동일 숫자. 음수 net=과오납(합산 제외). */
export function selectReceivables(contracts: EntityRecord[], today: string): ReceivablesSnapshot {
  const views = contracts.map((c) => computeContractView(c, today));
  let misuActive = 0, misuReturned = 0, overpayTotal = 0;
  let misuActiveCount = 0, misuReturnedCount = 0, unpaidCount = 0;
  let over30 = 0, over90 = 0;

  for (const v of views) {
    const net = v.net;
    if (net < 0) { overpayTotal += -net; continue; }
    if (net <= 0) continue;
    unpaidCount++;
    if (v.ended) {
      misuReturned += net;
      misuReturnedCount++;
    } else {
      misuActive += net;
      misuActiveCount++;
      if (v.overdueDays >= 30) over30++;
      if (v.overdueDays >= 90) over90++;
    }
  }

  const activeContractCount = contracts.filter((c) => !c.returnedDate).length;
  const total = misuActive + misuReturned;
  const rate = activeContractCount ? Math.round((misuActiveCount / activeContractCount) * 100) : 0;

  return {
    total, misuActive, misuReturned, misuActiveCount, misuReturnedCount, unpaidCount,
    activeContractCount, rate, over30, over90, overpayTotal,
  };
}
