/**
 * CMS/카드 집금 정산 시 수입과목 유지 — 손익·부가세 before/after 불변.
 * 실행: npx vitest run tests/cms-settle-subject.test.ts
 */
import { describe, it, expect } from 'vitest';
import { buildSettlementPatches, type CmsMatchCandidate } from '@/lib/payments/cms-matching';
import { aggregateBySubject, type CashRow } from '@/lib/finance/cash-ledger';
import { summarizePnlSubjects, summarizeVatSubjects } from '@/lib/finance/subject-summary';
import { operatingProfit } from '@/lib/finance/operating-profit';

function row(over: Partial<CashRow> & Pick<CashRow, 'id' | 'category' | 'inAmt'>): CashRow {
  return {
    entity: 'bank_tx',
    recKey: over.id,
    companyId: 'co',
    date: '2026-07-01',
    source: '계좌',
    account: '1',
    accountName: 'a',
    party: 'CMS',
    memo: '',
    outAmt: 0,
    raw: {},
    ...over,
  };
}

describe('CMS 집금 정산 — 과목·손익 불변', () => {
  it('buildSettlementPatches가 category/subject를 지급수수료로 덮지 않음', () => {
    const cand: CmsMatchCandidate = {
      depositId: 'dep1',
      depositDate: '2026-07-10',
      depositAmount: 4_900_000,
      companyCode: 'co',
      items: [{ id: 'i1', date: '2026-07-05', amount: 5_000_000, customerName: '홍' } as never],
      itemsSum: 5_000_000,
      estimatedFee: 100_000,
      feeRate: 0.02,
      confidence: 'high',
    };
    const patches = buildSettlementPatches(cand);
    const dep = patches.find((p) => p.id === 'dep1')!;
    expect(dep.patch.category).toBeUndefined();
    expect(dep.patch.subject).toBeUndefined();
    expect(dep.patch.settlementRole).toBe('deposit');
    expect(dep.patch.settlementFeeAmount).toBe(100_000);
  });

  it('정산 전/후 영업수입·부가세매출·영업손익 동일 (수입과목 유지)', () => {
    const beforeRows: CashRow[] = [
      row({ id: 'dep', category: 'CMS집금', inAmt: 4_900_000 }),
      row({ id: 'other', category: '대여료수입', inAmt: 1_000_000 }),
    ];
    const afterRows: CashRow[] = [
      row({
        id: 'dep',
        category: 'CMS집금',
        inAmt: 4_900_000,
        raw: { settlementRole: 'deposit', settlementFeeAmount: 100_000 },
      }),
      row({ id: 'other', category: '대여료수입', inAmt: 1_000_000 }),
    ];

    const beforeSub = aggregateBySubject(beforeRows);
    const afterSub = aggregateBySubject(afterRows);
    const pnlB = summarizePnlSubjects(beforeSub);
    const pnlA = summarizePnlSubjects(afterSub);
    const vatB = summarizeVatSubjects(beforeSub);
    const vatA = summarizeVatSubjects(afterSub);
    const opB = operatingProfit(beforeRows);
    const opA = operatingProfit(afterRows);

    expect(pnlA.totalIn).toBe(pnlB.totalIn);
    expect(pnlA.totalOut).toBe(pnlB.totalOut);
    expect(vatA.salesGross).toBe(vatB.salesGross);
    expect(vatA.purchaseGross).toBe(vatB.purchaseGross);
    expect(opA).toBe(opB);
    expect(pnlA.totalIn).toBe(5_900_000);
    expect(opA).toBe(5_900_000);

    // 버그 재현 대조: 지급수수료로 덮으면 totalIn↓ · op 유지 → 불일치
    const buggy = aggregateBySubject([
      row({ id: 'dep', category: '지급수수료', inAmt: 4_900_000, raw: { settlementRole: 'deposit' } }),
      row({ id: 'other', category: '대여료수입', inAmt: 1_000_000 }),
    ]);
    expect(summarizePnlSubjects(buggy).totalIn).toBe(1_000_000);
    expect(operatingProfit([
      row({ id: 'dep', category: '지급수수료', inAmt: 4_900_000 }),
      row({ id: 'other', category: '대여료수입', inAmt: 1_000_000 }),
    ])).toBe(5_900_000);
  });
});
