import { describe, expect, it } from 'vitest';
import { reviewInternalTransfers } from '../lib/finance/internal-transfer';
import type { CashRow } from '../lib/finance/cash-ledger';

function row(id: string, patch: Partial<CashRow>): CashRow {
  return {
    id,
    entity: 'bank_tx',
    recKey: id,
    companyId: 'switchplan',
    date: '2026-04-22',
    source: '계좌',
    account: '',
    accountName: '',
    party: '616에서868',
    memo: '',
    inAmt: 0,
    outAmt: 0,
    category: '자금이동',
    raw: {},
    ...patch,
  };
}

describe('내부 계좌이체 대사', () => {
  it('레거시 자금이동도 유일한 반대편 입출금이면 한 쌍으로 인정한다', () => {
    const review = reviewInternalTransfers([
      row('out', { accountName: '영업계좌', outAmt: 880_000 }),
      row('in', { accountName: '운영계좌', inAmt: 880_000 }),
    ]);

    expect(review.pairs).toEqual([expect.objectContaining({ outRowId: 'out', inRowId: 'in', amount: 880_000 })]);
    expect(review.unpairedRows).toHaveLength(0);
  });

  it('한쪽 원장이 없으면 미완료로 남긴다', () => {
    const review = reviewInternalTransfers([
      row('out', { accountName: '영업계좌', outAmt: 880_000 }),
    ]);
    expect(review.pairs).toHaveLength(0);
    expect(review.unpairedRows.map((item) => item.id)).toEqual(['out']);
  });

  it('같은 날 같은 금액 후보가 여러 개면 임의로 짝짓지 않는다', () => {
    const review = reviewInternalTransfers([
      row('out-1', { accountName: '영업계좌', outAmt: 500_000 }),
      row('out-2', { accountName: '운영계좌', outAmt: 500_000 }),
      row('in', { accountName: '정산계좌', inAmt: 500_000 }),
    ]);
    expect(review.pairs).toHaveLength(0);
    expect(review.unpairedRows).toHaveLength(3);
  });
});
