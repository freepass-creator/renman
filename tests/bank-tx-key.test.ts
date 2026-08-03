/**
 * bank_tx txKey — 동일일·동일금액·동일입금자도 잔액/순번으로 구분 · 재임포트 비폭증.
 */
import { describe, it, expect } from 'vitest';
import { assignBankTxKeys, bankTxFingerprint, extractTxTime } from '@/lib/intake/parse-tx';
import type { EntityRecord } from '@/lib/intake/entities';

describe('bank_tx 유일 txKey', () => {
  it('같은 날·금액·입금자라도 잔액이 다르면 키가 다름', () => {
    const rows = assignBankTxKeys([
      { txDate: '2026-07-01', amount: 500_000, counterparty: '김철수', balance: 1_000_000, account: '111' },
      { txDate: '2026-07-01', amount: 500_000, counterparty: '김철수', balance: 1_500_000, account: '111' },
    ] as EntityRecord[]);
    expect(rows[0].txKey).not.toBe(rows[1].txKey);
    expect(String(rows[0].txKey)).toContain('1000000');
    expect(String(rows[1].txKey)).toContain('1500000');
  });

  it('완전 동일 행은 #2 접미사 · 재부여해도 같은 키(재임포트 비폭증)', () => {
    const twin = [
      { txDate: '2026-07-01', amount: 100_000, counterparty: '홍길동', account: 'A', memo: 'x' },
      { txDate: '2026-07-01', amount: 100_000, counterparty: '홍길동', account: 'A', memo: 'x' },
    ] as EntityRecord[];
    const a = assignBankTxKeys(twin.map((r) => ({ ...r })));
    const b = assignBankTxKeys(twin.map((r) => ({ ...r })));
    expect(a[0].txKey).toBe(bankTxFingerprint(twin[0]));
    expect(a[1].txKey).toBe(`${bankTxFingerprint(twin[0])}#2`);
    expect(a[0].txKey).toBe(b[0].txKey);
    expect(a[1].txKey).toBe(b[1].txKey);
  });

  it('extractTxTime', () => {
    expect(extractTxTime('2026-07-01 14:30:05')).toBe('14:30:05');
    expect(extractTxTime('2026-07-01')).toBe('');
  });
});
