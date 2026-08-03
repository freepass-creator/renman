import type { EntityRecord } from '@/lib/intake/entities';
import { isDepositReceiptCategory } from '@/lib/finance/cash-rules';

export type DepositReceipt = {
  txId: string;
  date: string;
  amount: number;
  source: string;
};

export function listDepositReceipts(rec: EntityRecord): DepositReceipt[] {
  if (!Array.isArray(rec._depositReceipts)) {
    const legacyAmount = Number(rec.depositReceived) || 0;
    return legacyAmount > 0 ? [{
      txId: 'legacy:deposit-received',
      date: String(rec.depositReceivedDate || '').slice(0, 10),
      amount: legacyAmount,
      source: '기존기록',
    }] : [];
  }
  return (rec._depositReceipts as Array<Record<string, unknown>>)
    .map((item) => ({
      txId: String(item.txId || ''),
      date: String(item.date || '').slice(0, 10),
      amount: Number(item.amount) || 0,
      source: String(item.source || '계좌'),
    }))
    .filter((item) => item.txId && item.amount > 0);
}

export function depositReceiptPatch(receipts: DepositReceipt[]): EntityRecord {
  const normalized = receipts
    .filter((item) => item.txId && item.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.txId.localeCompare(b.txId));
  const total = normalized.reduce((sum, item) => sum + item.amount, 0);
  return {
    _depositReceipts: normalized,
    depositReceived: normalized.length ? total : null,
    depositReceivedDate: normalized.at(-1)?.date || '',
  };
}

export function appendDepositReceipt(rec: EntityRecord, receipt: DepositReceipt): EntityRecord {
  const current = listDepositReceipts(rec);
  if (current.some((item) => item.txId === receipt.txId)) return depositReceiptPatch(current);
  return depositReceiptPatch([...current, receipt]);
}

export function removeDepositReceipt(rec: EntityRecord, txId: string): EntityRecord {
  return depositReceiptPatch(listDepositReceipts(rec).filter((item) => item.txId !== txId));
}

/**
 * 과거 원장에 계약 귀속만 있고 계약의 실수령 집계가 비어 있는 보증금 입금을 읽기 시 복원한다.
 * 기존 수기 실수령 값은 은행 거래와 중복일 수 있어 덮지 않는다. 새 저장은 appendDepositReceipt가 원자를 남긴다.
 */
export function hydrateContractsWithDepositReceipts(
  contracts: EntityRecord[],
  bankTransactions: EntityRecord[],
): EntityRecord[] {
  const receiptsByContract = new Map<string, DepositReceipt[]>();
  for (const tx of bankTransactions) {
    const amount = Number(tx.amount) || 0;
    const contractId = String(tx.matchedContractId || '');
    const category = String(tx.category || tx.subject || '');
    const txId = String(tx._key || tx.txKey || '');
    if (!contractId || !txId || amount <= 0 || !isDepositReceiptCategory(category)) continue;
    if (String(tx.settlementRole || '') === 'deposit') continue;
    const scopeKey = `${String(tx.companyId || '')}:${contractId}`;
    const item = { txId, date: String(tx.txDate || '').slice(0, 10), amount, source: String(tx.method || '계좌') };
    const group = receiptsByContract.get(scopeKey);
    if (group) group.push(item); else receiptsByContract.set(scopeKey, [item]);
  }

  return contracts.map((contract) => {
    const scopeKey = `${String(contract.companyId || '')}:${String(contract._key || contract.contractNo || '')}`;
    const derived = receiptsByContract.get(scopeKey) || [];
    if (!derived.length) return contract;
    const hasReceiptAtoms = Array.isArray(contract._depositReceipts);
    const hasLegacyAggregate = contract.depositReceived !== null
      && contract.depositReceived !== undefined
      && contract.depositReceived !== '';
    if (!hasReceiptAtoms && hasLegacyAggregate) return contract;
    let next: EntityRecord = contract;
    for (const receipt of derived) next = { ...next, ...appendDepositReceipt(next, receipt) };
    return next;
  });
}
