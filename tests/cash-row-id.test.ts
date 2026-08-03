import { describe, expect, it } from 'vitest';
import { cashRowId } from '@/lib/finance/cash-ledger';

describe('자금 원장 행 식별자', () => {
  it('같은 원천키라도 회사가 다르면 다른 행으로 식별한다', () => {
    const base = { _key: '영업 신한|2026-07-31|0|120000|정비비' };
    expect(cashRowId('bank', { ...base, companyId: 'prime' }))
      .not.toBe(cashRowId('bank', { ...base, companyId: 'sonogong' }));
  });
});
