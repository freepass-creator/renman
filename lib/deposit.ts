// 보증금 원장/정산 — v5 deposit 이식(v6 flat record에 맞게 단순화).
//   예치 보증금에서 미납 대여료(일할 반영)를 충당 → 반환액 or 추가청구. 종료됐는데 미정산이면 "미반환" 대상.
//   정산 사실은 depositSettledDate 로 표시(반환/충당 완료 도장). SettlementDoc(반납 정산서)과 같은 셈.
import type { EntityRecord } from './intake/entities';
import { computeContractView, computeReturnSettlement } from './contract-ops';

export type DepositView = {
  deposit: number;        // 예치 보증금
  unpaid: number;         // 미납 대여료(순미수, 일할 반영)
  offset: number;         // 보증금 충당액
  refund: number;         // 반환액 = max(0, 보증금 − 미납)
  addCharge: number;      // 추가청구 = max(0, 미납 − 보증금)
  ended: boolean;         // 반납/해지됨
  settled: boolean;       // 정산완료(depositSettledDate 있음)
  pendingRefund: boolean; // 종료 & 보증금>0 & 미정산 → 처리 대상
};

export function depositView(c: EntityRecord, today: string): DepositView {
  const deposit = Number(c.deposit) || 0;
  const v = computeContractView(c, today);
  // 정산 4값 = 공용 SSOT(정산서·현장 반납폼과 동일). 손롤 금지.
  const { unpaid, offset, refund, addCharge } = computeReturnSettlement(deposit, v);
  const ended = !!c.returnedDate;
  const settled = !!c.depositSettledDate;
  return { deposit, unpaid, offset, refund, addCharge, ended, settled, pendingRefund: ended && deposit > 0 && !settled };
}
