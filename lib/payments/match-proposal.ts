import type { EntityRecord } from '@/lib/intake/entities';
import type { BankTransaction, Contract } from './types';
import { findCandidates, type MatchCandidate } from './receipt-match';
import { autoMatchAll, type AutoMatchResult } from './receipt-match';
import { buildMatchContract } from '@/lib/contract-ops';
import { canReviewReceivableMatch, isDepositReceiptCategory } from '@/lib/finance/cash-rules';

export type MatchProposalState = '자동후보' | '복수후보' | '검토후보' | '미매칭' | '해당없음';
export type MatchProposal = {
  state: MatchProposalState;
  candidates: MatchCandidate[];
  preferred?: MatchCandidate;
  reason: string;
};

export function toBankTransaction(rec: EntityRecord): BankTransaction {
  const method = String(rec.method || '계좌');
  return {
    id: String(rec._key || rec.txKey || ''), txDate: String(rec.txDate || ''),
    amount: Number(rec.amount) || 0, withdraw: Number(rec.withdraw) || 0,
    counterparty: String(rec.counterparty || rec.memo || ''), memo: String(rec.memo || ''),
    source: method, method, companyCode: String(rec.companyId || ''),
    matchedContractId: rec.matchedContractId ? String(rec.matchedContractId) : undefined,
    settlementId: rec.settlementId ? String(rec.settlementId) : undefined,
    settlementRole: rec.settlementRole === 'deposit' || rec.settlementRole === 'item' ? rec.settlementRole : undefined,
  } as BankTransaction;
}

export type MatchBacklogScope = 'date' | '30d' | 'all';
export type MatchBacklogRow = {
  tx: BankTransaction;
  proposal: MatchProposal;
  /** 동일 계약·회차 중복까지 제거한 뒤 작업자가 승인할 수 있는 단일 안전후보. */
  automatic?: AutoMatchResult;
};

function moveDate(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isInScope(txDate: string, anchorDate: string, scope: MatchBacklogScope): boolean {
  const date = txDate.slice(0, 10);
  if (!date) return false;
  if (scope === 'date') return date === anchorDate;
  if (scope === '30d') return date >= moveDate(anchorDate, -29) && date <= anchorDate;
  return true;
}

/**
 * 자금일보의 미수 입금 처리대기열을 만든다.
 * 후보를 계산할 뿐 원장이나 계약을 수정하지 않는다.
 */
export function buildMatchBacklog(
  transactionRecords: EntityRecord[],
  contractRecords: EntityRecord[],
  anchorDate: string,
  scope: MatchBacklogScope,
): MatchBacklogRow[] {
  const scoped = transactionRecords
    .map((record) => ({ record, tx: toBankTransaction(record) }))
    .filter(({ record, tx }) =>
      Boolean(tx.id && tx.companyCode)
      && tx.amount > 0
      && !(tx.withdraw && tx.withdraw > 0)
      && !tx.matchedContractId
      && canReviewReceivableMatch(record.category || record.subject, tx.settlementRole, record.method || record.source)
      && isInScope(tx.txDate, anchorDate, scope));

  const contractsByCompany = new Map<string, Contract[]>();
  for (const record of contractRecords) {
    const companyId = String(record.companyId || '');
    if (!companyId) continue;
    const contract = buildMatchContract(record, anchorDate);
    const group = contractsByCompany.get(companyId);
    if (group) group.push(contract);
    else contractsByCompany.set(companyId, [contract]);
  }

  // 오래된 입금부터 회차를 예약해야 최근 입금이 과거 회차를 먼저 차지하지 않는다.
  const matchingOrder = [...scoped]
    .filter(({ record }) => !isDepositReceiptCategory(record.category || record.subject))
    .sort((a, b) => a.tx.txDate.localeCompare(b.tx.txDate) || a.tx.id.localeCompare(b.tx.id))
    .map(({ tx }) => tx);
  const automaticByTx = new Map(
    autoMatchScoped(matchingOrder, contractRecords, anchorDate)
      .map((result) => [String(result.tx.companyCode || '') + ':' + result.tx.id, result]),
  );

  return scoped.map(({ record, tx }) => {
    // 미분류는 보증금으로 추정하지 않는다. 후보 분석을 먼저 거치고,
    // 명시적인 보증금 과목만 회차 미수와 분리한다.
    const affectsReceivable = !isDepositReceiptCategory(record.category || record.subject);
    const proposal = affectsReceivable
      ? analyzeMatchProposal(tx, contractsByCompany.get(String(tx.companyCode || '')) || [])
      : { state: '미매칭' as const, candidates: [], reason: '계약 귀속 필요 · 대여료 미수 차감 없음' };
    const automatic = automaticByTx.get(String(tx.companyCode || '') + ':' + tx.id);
    const safeProposal = proposal.state === '자동후보' && !automatic
      ? { ...proposal, state: '검토후보' as const, preferred: undefined, reason: '동일 계약 회차에 다른 입금 후보가 있어 확인 필요' }
      : proposal;
    return { tx, proposal: safeProposal, automatic };
  }).sort((a, b) => b.tx.txDate.localeCompare(a.tx.txDate) || b.tx.id.localeCompare(a.tx.id));
}

/** 후보만 산출한다. 계약·거래를 수정하지 않으며 자동 적용은 자금일보 확인 절차가 담당한다. */
export function analyzeMatchProposal(tx: BankTransaction, contracts: Contract[]): MatchProposal {
  if ((tx.withdraw || 0) > 0 || tx.amount <= 0) return { state: '해당없음', candidates: [], reason: '출금 또는 입금액 없음' };
  if (tx.matchedContractId) return { state: '해당없음', candidates: [], reason: '이미 계약에 연결됨' };
  const candidates = findCandidates(tx, contracts);
  const high = candidates.filter((candidate) => candidate.confidence === 'high');
  const highContracts = new Set(high.map((candidate) => candidate.contract.id));
  if (highContracts.size === 1 && high.length) {
    return { state: '자동후보', candidates, preferred: high[0], reason: '입금자·청구금액 일치' };
  }
  if (highContracts.size > 1) return { state: '복수후보', candidates, reason: '고신뢰 계약 ' + highContracts.size + '건 충돌' };
  const medium = candidates.filter((candidate) => candidate.confidence === 'medium');
  if (medium.length) return { state: '검토후보', candidates, preferred: medium[0], reason: '입금자는 일치하지만 금액 확인 필요' };
  if (candidates.length) return { state: '검토후보', candidates, preferred: candidates[0], reason: '금액만 일치 · 계약 확인 필요' };
  return { state: '미매칭', candidates: [], reason: '입금자·금액에 맞는 미납 회차 없음' };
}

export function proposalPatch(proposal: MatchProposal): EntityRecord {
  const preferred = proposal.preferred;
  return {
    matchProposalState: proposal.state, matchProposalCount: proposal.candidates.length,
    matchProposalReason: proposal.reason,
    ...(preferred ? {
      suggestedContractId: preferred.contract.id,
      suggestedContractNo: preferred.contract.contractNo,
      suggestedScheduleSeq: preferred.scheduleSeq,
      matchConfidence: preferred.confidence,
    } : {}),
  };
}

/** 전체 회사 화면에서도 입금과 계약을 같은 companyId 안에서만 비교한다. */
export function autoMatchScoped(
  txs: BankTransaction[],
  contractRecords: EntityRecord[],
  today: string,
): AutoMatchResult[] {
  const contractsByCompany = new Map<string, Contract[]>();
  for (const record of contractRecords) {
    const companyId = String(record.companyId || '');
    if (!companyId) continue;
    const contract = buildMatchContract(record, today) as Contract & { companyCode?: string };
    contract.companyCode = companyId;
    const group = contractsByCompany.get(companyId);
    if (group) group.push(contract);
    else contractsByCompany.set(companyId, [contract]);
  }
  const txByCompany = new Map<string, BankTransaction[]>();
  for (const tx of txs) {
    const companyId = String(tx.companyCode || '');
    if (!companyId) continue;
    const group = txByCompany.get(companyId);
    if (group) group.push(tx);
    else txByCompany.set(companyId, [tx]);
  }
  const out: AutoMatchResult[] = [];
  for (const [companyId, companyTxs] of txByCompany) {
    out.push(...autoMatchAll(companyTxs, contractsByCompany.get(companyId) || []));
  }
  return out;
}
