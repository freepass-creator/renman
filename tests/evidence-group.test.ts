import { describe, expect, it } from 'vitest';
import { relatedExpenseEvidenceRows } from '../lib/finance/evidence-group';
import type { CashRow } from '../lib/finance/cash-ledger';

function row(id: string, patch: Partial<CashRow> = {}): CashRow {
  return {
    id,
    entity: 'bank_tx',
    recKey: id,
    companyId: 'switchplan',
    date: '2026-04-22',
    source: '계좌',
    account: '',
    accountName: '운영계좌',
    party: '8459메리츠상환',
    memo: '',
    inAmt: 0,
    outAmt: 500,
    category: '지급수수료',
    raw: {},
    ...patch,
  };
}

describe('지출 증빙 묶음', () => {
  it('같은 날·계좌·상대방의 원금과 수수료를 한 묶음으로 찾는다', () => {
    const principal = row('principal', { outAmt: 412_438, category: '할부·리스료' });
    const fee = row('fee');
    expect(relatedExpenseEvidenceRows([principal, fee], fee).map((item) => item.id))
      .toEqual(['principal', 'fee']);
  });

  it('계좌나 상대방이 다르면 금액이 같아도 묶지 않는다', () => {
    const target = row('target');
    const otherAccount = row('other-account', { accountName: '영업계좌' });
    const otherParty = row('other-party', { party: '9464메리츠상환' });
    expect(relatedExpenseEvidenceRows([target, otherAccount, otherParty], target).map((item) => item.id))
      .toEqual(['target']);
  });

  it('법인카드·미분류·상대방 없음은 자동 묶음하지 않는다', () => {
    const card = row('card', { entity: 'card_tx' });
    const unclassified = row('unclassified', { category: '' });
    const noParty = row('no-party', { party: '' });
    expect(relatedExpenseEvidenceRows([card, row('card-2', { entity: 'card_tx' })], card)).toEqual([card]);
    expect(relatedExpenseEvidenceRows([unclassified, row('u2', { category: '' })], unclassified)).toEqual([unclassified]);
    expect(relatedExpenseEvidenceRows([noParty, row('n2', { party: '' })], noParty)).toEqual([noParty]);
  });
});
