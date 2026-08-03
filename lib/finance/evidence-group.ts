import type { CashRow } from './cash-ledger';
import { requiresExpenseEvidence } from './cash-rules';

const normalizedParty = (value: unknown) => String(value || '').replace(/\s+/g, '').trim();
const accountIdentity = (row: CashRow) => String(row.account || row.accountName || '').replace(/\s+/g, '').trim();

/**
 * 한 증빙으로 함께 처리할 수 있는 은행 출금 원자.
 * 날짜·회사·계좌·상대방이 모두 같을 때만 묶고 카드·상대방 없음·미분류는 단건으로 둔다.
 */
export function relatedExpenseEvidenceRows(rows: CashRow[], target: CashRow): CashRow[] {
  const party = normalizedParty(target.party);
  if (target.entity !== 'bank_tx' || target.outAmt <= 0 || !party || !requiresExpenseEvidence(target.category)) {
    return [target];
  }
  const account = accountIdentity(target);
  return rows.filter((row) =>
    row.entity === 'bank_tx'
    && row.outAmt > 0
    && requiresExpenseEvidence(row.category)
    && !row.raw.documentId
    && !row.raw.evidenceUrl
    && row.companyId === target.companyId
    && row.date.slice(0, 10) === target.date.slice(0, 10)
    && accountIdentity(row) === account
    && normalizedParty(row.party) === party);
}
