import { describe, expect, it } from 'vitest';
import { contractMasterRow } from '@/lib/master-ledgers';
import { CONTRACT_DETAIL_SECTIONS, CONTRACT_MASTER_EXPANDED_COLS } from '@/lib/master-ledger-cols';

describe('계약 보증금 표시 규격', () => {
  it('계약서상 금액과 실제 수령 집계를 서로 다른 원자로 보존한다', () => {
    const row = contractMasterRow({
      companyId: 'switchplan', contractNo: 'SP-1', startDate: '2026-07-01', rentalMonths: 12,
      deposit: 1_500_000, depositReceived: 1_150_000, depositReceivedDate: '2026-07-03',
    }, '2026-08-03');

    expect(row).toMatchObject({ deposit: 1_500_000, depositReceived: 1_150_000, depositReceivedDate: '2026-07-03' });
    expect(CONTRACT_MASTER_EXPANDED_COLS.map((col) => col.key)).toEqual(expect.arrayContaining(['deposit', 'depositReceived', 'depositReceivedDate']));
    expect(CONTRACT_DETAIL_SECTIONS.find((section) => section.title === '요금·납부')?.cols.map((col) => col.key))
      .toEqual(expect.arrayContaining(['deposit', 'depositReceived', 'depositReceivedDate']));
  });
});
