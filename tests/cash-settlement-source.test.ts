import { describe, expect, it } from 'vitest';
import { buildCashLedger, isCardSettlementDeposit, isCmsDepositLabel } from '@/lib/finance/cash-ledger';
import type { EntityRecord } from '@/lib/intake/entities';

const bank = (record: Partial<EntityRecord>): EntityRecord => ({
  _key: String(record._key || 'tx'), companyId: 'switchplan', txDate: '2026-07-31', amount: 1_000_000,
  ...record,
} as EntityRecord);

describe('자금관리 묶음입금 1차 분류', () => {
  it('card_ 정산입금은 CMS가 아니라 카드정산으로 분류한다', () => {
    const record = bank({
      _key: 'card-dep', settlementId: 'card_card-dep', settlementRole: 'deposit',
      category: '카드매출', settlementItemCount: 3,
    });
    const [row] = buildCashLedger([record], []);

    expect(isCardSettlementDeposit(record)).toBe(true);
    expect(isCmsDepositLabel(record)).toBe(false);
    expect(row).toMatchObject({ source: '카드매출', nest: 'card-dep' });
  });

  it('CMS 정산입금은 CMS집금으로 유지한다', () => {
    const record = bank({
      _key: 'cms-dep', settlementId: 'cms_cms-dep', settlementRole: 'deposit', category: 'CMS집금',
    });
    const [row] = buildCashLedger([record], []);

    expect(isCardSettlementDeposit(record)).toBe(false);
    expect(isCmsDepositLabel(record)).toBe(true);
    expect(row).toMatchObject({ source: 'CMS', nest: 'cms-dep' });
  });

  it('아직 구성건이 안 붙은 카드자동집금도 카드 묶음 후보로 드러낸다', () => {
    const [row] = buildCashLedger([bank({ counterparty: '카드자동집금' })], []);
    expect(row).toMatchObject({ source: '카드매출', nest: 'card-dep' });
  });

  it('일반 묶음 입출금은 CMS·카드와 구분되는 원장 행으로 유지한다', () => {
    const [row] = buildCashLedger([bank({
      _key: 'bundle-parent',
      counterparty: '급여 일괄이체',
      amount: -1_000_000,
      bundleType: '급여',
      bundleReviewStatus: '미완료',
      bundleItemCount: 2,
    })], []);

    expect(row).toMatchObject({ source: '계좌', nest: 'bundle-parent' });
    expect(row.raw.bundleType).toBe('급여');
  });
});
