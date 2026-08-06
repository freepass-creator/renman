import { describe, expect, it } from 'vitest';
import { buildCashJournal, isUnmatchedDeposit } from '@/lib/finance/cash-journal';
import type { CashRow } from '@/lib/finance/cash-ledger';

function row(patch: Partial<CashRow>): CashRow {
  return {
    id: '1',
    entity: 'bank_tx',
    recKey: '1',
    companyId: 'prime',
    date: '2026-07-26',
    source: '계좌',
    account: '신한(1234)',
    accountName: '신한(1234)',
    party: '상대',
    memo: '',
    inAmt: 0,
    outAmt: 0,
    category: '기타수입',
    raw: {},
    ...patch,
  };
}

describe('자금일보 일계표(buildCashJournal)', () => {
  it('선택일 실거래만 스파인으로, 입금계·출금계·순증감을 집계한다', () => {
    const j = buildCashJournal(
      [
        row({ id: 'a', inAmt: 100_000, raw: { balance: 1_100_000 } }),
        row({ id: 'b', outAmt: 30_000, category: '수선비', raw: { balance: 1_070_000 } }),
        row({ id: 'c', date: '2026-07-25', inAmt: 999 }), // 다른 날 → 제외
      ],
      '2026-07-26',
    );
    expect(j.txnCount).toBe(2);
    expect(j.inflow).toBe(100_000);
    expect(j.outflow).toBe(30_000);
    expect(j.net).toBe(70_000);
    expect(j.accounts[0].closingBalance).toBe(1_070_000);
  });

  it('통장 CMS집금(cms-dep)을 성공분(cms-item)으로 풀어서 보여주되 합산은 이중계상하지 않는다', () => {
    const j = buildCashJournal(
      [
        row({ id: 'dep', nest: 'cms-dep', inAmt: 500_000, category: 'CMS집금', raw: { balance: 500_000 } }),
        row({ id: 'it1', nest: 'cms-item', parentId: 'dep', inAmt: 300_000, party: '홍길동' }),
        row({ id: 'it2', nest: 'cms-item', parentId: 'dep', inAmt: 200_000, party: '김철수' }),
      ],
      '2026-07-26',
    );
    // 실거래(통장 집금) 1건만 집계 — 구성건 2건은 전개만
    expect(j.txnCount).toBe(1);
    expect(j.itemCount).toBe(2);
    expect(j.inflow).toBe(500_000);
    const lines = j.accounts[0].lines;
    expect(lines[0].kind).toBe('txn');
    expect(lines[0].hasBreakdown).toBe(true);
    expect(lines.filter((l) => l.kind === 'item')).toHaveLength(2);
  });

  it('묶음 입금(bundle-parent)을 raw.bundleItems 구성건으로 전개한다', () => {
    const j = buildCashJournal(
      [
        row({
          id: 'bp', nest: 'bundle-parent', inAmt: 250_000, category: '대여료수입',
          raw: {
            balance: 250_000,
            bundleItems: [
              { party: 'A렌트', amount: 150_000, category: '대여료수입' },
              { party: 'B렌트', amount: 100_000, category: '대여료수입' },
            ],
          },
        }),
      ],
      '2026-07-26',
    );
    expect(j.txnCount).toBe(1);
    expect(j.itemCount).toBe(2);
    expect(j.inflow).toBe(250_000); // 구성건 합산 안 함
    const items = j.accounts[0].lines.filter((l) => l.kind === 'item');
    expect(items.map((i) => i.inAmt)).toEqual([150_000, 100_000]);
  });

  it('계약연결이 필요한 미연결 입금을 매칭 대상으로 센다', () => {
    const matched = row({ id: 'm', inAmt: 50_000, category: '대여료수입', raw: { matchedContractId: 'c1', matchedScheduleSeq: 1 } });
    const unmatched = row({ id: 'u', inAmt: 50_000, category: '대여료수입', raw: {} });
    const irrelevant = row({ id: 'x', inAmt: 50_000, category: '기타수입', raw: {} });
    expect(isUnmatchedDeposit(matched)).toBe(false);
    expect(isUnmatchedDeposit(unmatched)).toBe(true);
    expect(isUnmatchedDeposit(irrelevant)).toBe(false);
    const j = buildCashJournal([matched, unmatched, irrelevant], '2026-07-26');
    expect(j.unmatchedCount).toBe(1);
  });
});
