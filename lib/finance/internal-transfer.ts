import type { CashRow } from './cash-ledger';
import { isInternalTransferCategory } from './cash-rules';

export type InternalTransferPair = {
  companyId: string;
  date: string;
  amount: number;
  outRowId: string;
  inRowId: string;
};

export type InternalTransferReview = {
  pairs: InternalTransferPair[];
  pairedRowIds: Set<string>;
  unpairedRows: CashRow[];
};

const transferAmount = (row: CashRow) => Math.max(row.inAmt, row.outAmt);
const transferGroupKey = (row: CashRow) => `${row.companyId}|${row.date.slice(0, 10)}|${transferAmount(row)}`;

/**
 * 내부이체의 양쪽 원장을 금액·회사·일자로 보수적으로 대사한다.
 * 그룹 안에 출금 1건과 입금 1건이 유일할 때만 자동 짝으로 인정한다.
 */
export function reviewInternalTransfers(rows: CashRow[]): InternalTransferReview {
  const transfers = rows.filter((row) =>
    row.entity === 'bank_tx'
    && !row.nest
    && transferAmount(row) > 0
    && isInternalTransferCategory(row.category));
  const groups = new Map<string, CashRow[]>();
  for (const row of transfers) {
    const key = transferGroupKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const pairs: InternalTransferPair[] = [];
  const pairedRowIds = new Set<string>();
  for (const group of groups.values()) {
    const outs = group.filter((row) => row.outAmt > 0 && row.inAmt <= 0);
    const ins = group.filter((row) => row.inAmt > 0 && row.outAmt <= 0);
    if (outs.length !== 1 || ins.length !== 1) continue;
    const outAccount = outs[0].account || outs[0].accountName || '';
    const inAccount = ins[0].account || ins[0].accountName || '';
    if (outAccount && inAccount && outAccount === inAccount) continue;
    pairs.push({
      companyId: outs[0].companyId,
      date: outs[0].date.slice(0, 10),
      amount: outs[0].outAmt,
      outRowId: outs[0].id,
      inRowId: ins[0].id,
    });
    pairedRowIds.add(outs[0].id);
    pairedRowIds.add(ins[0].id);
  }

  return {
    pairs,
    pairedRowIds,
    unpairedRows: transfers.filter((row) => !pairedRowIds.has(row.id)),
  };
}
