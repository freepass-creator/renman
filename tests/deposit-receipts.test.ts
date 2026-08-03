import { describe, expect, it } from 'vitest';
import { appendDepositReceipt, hydrateContractsWithDepositReceipts, removeDepositReceipt } from '@/lib/payments/deposit-receipts';

describe('보증금 입금 원자', () => {
  it('분납 입금 원자를 보존하면서 계약의 실수령 합계와 최근 수령일을 만든다', () => {
    const first = appendDepositReceipt({}, { txId: 'tx-1', date: '2026-07-01', amount: 200_000, source: '계좌' });
    const second = appendDepositReceipt(first, { txId: 'tx-2', date: '2026-07-03', amount: 300_000, source: '계좌' });

    expect(second).toMatchObject({ depositReceived: 500_000, depositReceivedDate: '2026-07-03' });
    expect(second._depositReceipts).toHaveLength(2);
  });

  it('동일 거래를 다시 연결해도 중복 합산하지 않고 해제 시 집계도 원복한다', () => {
    const receipt = { txId: 'tx-1', date: '2026-07-01', amount: 200_000, source: '계좌' };
    const once = appendDepositReceipt({}, receipt);
    const twice = appendDepositReceipt(once, receipt);
    const removed = removeDepositReceipt(twice, 'tx-1');

    expect(twice.depositReceived).toBe(200_000);
    expect(removed).toMatchObject({ depositReceived: null, depositReceivedDate: '', _depositReceipts: [] });
  });

  it('과거 계약 귀속 보증금 여러 건을 실수령 합계로 복원하되 기존 수기 집계는 덮지 않는다', () => {
    const contracts = [
      { _key: 'C1', companyId: 'A' },
      { _key: 'C2', companyId: 'A', depositReceived: 900_000, depositReceivedDate: '2026-06-01' },
    ];
    const bank = [
      { _key: 'D1', companyId: 'A', matchedContractId: 'C1', txDate: '2026-07-01', amount: 200_000, category: '보증금' },
      { _key: 'D2', companyId: 'A', matchedContractId: 'C1', txDate: '2026-07-03', amount: 300_000, category: '보증금(예수)' },
      { _key: 'D3', companyId: 'A', matchedContractId: 'C2', txDate: '2026-07-03', amount: 300_000, category: '보증금' },
      { _key: 'R1', companyId: 'A', matchedContractId: 'C1', txDate: '2026-07-04', withdraw: 100_000, category: '보증금 반환' },
    ];
    const [derived, manual] = hydrateContractsWithDepositReceipts(contracts, bank);

    expect(derived).toMatchObject({ depositReceived: 500_000, depositReceivedDate: '2026-07-03' });
    expect(derived._depositReceipts).toHaveLength(2);
    expect(manual).toMatchObject({ depositReceived: 900_000, depositReceivedDate: '2026-06-01' });
  });

  it('기존 수기 실수령은 새 입금 원자를 추가할 때 기준 원자로 승격해 사라지지 않는다', () => {
    const next = appendDepositReceipt(
      { depositReceived: 400_000, depositReceivedDate: '2026-06-01' },
      { txId: 'tx-new', date: '2026-07-01', amount: 200_000, source: '계좌' },
    );
    expect(next.depositReceived).toBe(600_000);
    expect(next._depositReceipts).toHaveLength(2);
  });
});
