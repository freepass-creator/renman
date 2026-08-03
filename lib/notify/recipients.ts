/**
 * 알림 수신자 — 화면 공통 빌더. NotifyDialog 타입 SSOT.
 * lib/notify/index.ts barrel 금지 (aligo server-only 오염).
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { computeContractView, computeReturnSettlement } from '@/lib/contract-ops';
import { numOrNull } from '@/lib/master-ledgers';
import type { NotifyRecipient } from '@/lib/notify/types';

export type { NotifyRecipient } from '@/lib/notify/types';

const num = (v: unknown) => Number(v) || 0;

/** 보증금 실수령 — ''·비수치 = 모름(null). 실제 0은 0 유지. */
export function depositReceivedOf(rec: EntityRecord): number | null {
  return numOrNull(rec.depositReceived);
}

export function notifyRecipient(
  rec: EntityRecord,
  money: { net: number; unpaidCount: number; currentSeq: number; monthlyRent: number; refund: number },
): NotifyRecipient {
  const dr = depositReceivedOf(rec);
  return {
    contractKey: String(rec._key || ''),
    companyId: String(rec.companyId || ''),
    name: String(rec.contractorName || ''),
    plate: String(rec.plate || ''),
    phone: String(rec.contractorPhone || ''),
    contractNo: String(rec.contractNo || ''),
    unpaidAmount: money.net,
    unpaidSeqCount: money.unpaidCount,
    currentSeq: money.currentSeq,
    monthlyRent: money.monthlyRent,
    depositDue: num(rec.deposit),
    depositReceived: dr,
    depositUnreceived: dr == null ? null : Math.max(0, num(rec.deposit) - dr),
    depositRefund: dr == null
      ? null
      : money.refund,
  };
}

/** ContractView 없는 화면용 — computeContractView 1회. */
export function notifyRecipients(recs: EntityRecord[], today: string): NotifyRecipient[] {
  return recs.map((rec) => {
    const v = computeContractView(rec, today);
    const dr = depositReceivedOf(rec);
    const refund = dr == null
      ? 0
      : computeReturnSettlement(dr, v, { contract: rec, asOf: today }).refund;
    return notifyRecipient(rec, {
      net: v.net,
      unpaidCount: v.count,
      currentSeq: v.count,
      monthlyRent: v.monthlyRent,
      refund,
    });
  });
}
