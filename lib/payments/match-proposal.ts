import type { EntityRecord } from '@/lib/intake/entities';
import type { BankTransaction, Contract } from './types';
import { findCandidates, type MatchCandidate } from './receipt-match';
import { autoMatchAll, type AutoMatchResult } from './receipt-match';
import { buildMatchContract } from '@/lib/contract-ops';

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
  } as BankTransaction;
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
