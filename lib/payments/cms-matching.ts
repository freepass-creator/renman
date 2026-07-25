/**
 * CMS 집금 ↔ 자동이체 묶음 자동 매칭 (v5 cms-matching 이식).
 *
 *  · CMS 성공(결제일) → 통장 집금은 보통 **3~5일 후** (창: 입금이 성공일 이후 1~7일).
 *  · 창 안 **전량**이 아니라 deposit 금액에 맞는 **부분합**을 고른다 (수수료 0~3.5%).
 *  · 매칭 후 bank_tx 에 settlementId / role / gross·fee 메타 기록.
 */
import type { BankTransaction } from './types';

export type CmsMatchCandidate = {
  depositId: string;
  depositDate: string;
  depositAmount: number;
  companyCode: string;
  items: BankTransaction[];
  itemsSum: number;
  estimatedFee: number;
  feeRate: number;
  confidence: 'high' | 'medium' | 'low';
};

const LAG_MIN_DAYS = 1;
const LAG_MAX_DAYS = 7;
const LAG_TYPICAL_LO = 3;
const LAG_TYPICAL_HI = 5;
const MAX_FEE_RATE = 0.035;

function ymd(date: string): string { return (date ?? '').slice(0, 10); }

/** later − earlier (일). later가 이전이면 Infinity. */
function daysAfter(earlier: string, later: string): number {
  const ta = new Date(ymd(earlier)).getTime();
  const tb = new Date(ymd(later)).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  const d = (tb - ta) / 86400_000;
  return d < 0 ? Infinity : d;
}

function coKey(t: BankTransaction): string {
  return String(t.companyCode || (t as { companyId?: string }).companyId || '').trim();
}

export function isCmsDepositLabel(t: BankTransaction): boolean {
  const blob = `${t.counterparty ?? ''} ${t.memo ?? ''}`;
  const cat = String((t as { category?: string }).category || '');
  return /CMS집금|카드자동집금/i.test(blob)
    || /CMS집금|카드자동집금/i.test(cat)
    || String(t.source || '') === 'CMS집금';
}

/**
 * deposit 금액에 맞는 item 부분합.
 *   목표: deposit ≤ sum ≤ deposit/(1−MAX_FEE)  (수수료 0~3.5%)
 *   우선: 지연 3~5일 · 큰 금액부터 담기.
 */
function pickItemsForDeposit(
  pool: BankTransaction[],
  depositAmount: number,
  depositDate: string,
): BankTransaction[] {
  if (depositAmount <= 0 || !pool.length) return [];
  const maxSum = depositAmount / (1 - MAX_FEE_RATE);
  const scored = pool.map((it) => {
    const lag = daysAfter(it.txDate, depositDate);
    const typical = lag >= LAG_TYPICAL_LO && lag <= LAG_TYPICAL_HI ? 0 : 1;
    return { it, lag, typical, amt: it.amount ?? 0 };
  }).filter((x) => x.lag >= LAG_MIN_DAYS && x.lag <= LAG_MAX_DAYS && x.amt > 0);

  scored.sort((a, b) => a.typical - b.typical || b.amt - a.amt || a.lag - b.lag);

  const selected: BankTransaction[] = [];
  let sum = 0;
  for (const { it, amt } of scored) {
    if (sum + amt > maxSum) continue;
    selected.push(it);
    sum += amt;
    if (sum >= depositAmount) break;
  }
  if (sum < depositAmount) return [];
  const fee = sum - depositAmount;
  const feeRate = sum > 0 ? fee / sum : 1;
  if (feeRate > MAX_FEE_RATE) return [];
  return selected;
}

/**
 * 미정산 bank_tx 에서 CMS 묶음 후보 찾기.
 * deposit = 통장 CMS집금 라벨 · item = method/source CMS|자동이체 (결제일=성공일).
 */
export function findCmsMatchCandidates(bankTx: BankTransaction[]): CmsMatchCandidate[] {
  const depositCandidates: BankTransaction[] = [];
  const itemsByCompany = new Map<string, BankTransaction[]>();

  for (const t of bankTx) {
    if (t.settlementId) continue;
    const src = String(t.source || '');
    const method = String(t.method || '');
    const isCmsItem = src === '자동이체' || src === 'CMS' || method === 'CMS' || method === '자동이체';
    if (isCmsItem) {
      const co = coKey(t);
      const arr = itemsByCompany.get(co);
      if (arr) arr.push(t);
      else itemsByCompany.set(co, [t]);
      continue;
    }
    if ((t.amount ?? 0) > 0 && !t.matchedContractId && isCmsDepositLabel(t)) {
      depositCandidates.push(t);
    }
  }

  depositCandidates.sort((a, b) => ymd(a.txDate).localeCompare(ymd(b.txDate)) || a.id.localeCompare(b.id));

  const out: CmsMatchCandidate[] = [];
  const claimedItems = new Set<string>();

  for (const dep of depositCandidates) {
    const co = coKey(dep);
    const pool = (itemsByCompany.get(co) || []).filter((it) => !claimedItems.has(it.id));
    if (!pool.length) continue;

    const picked = pickItemsForDeposit(pool, dep.amount ?? 0, dep.txDate);
    if (!picked.length) continue;

    const itemsSum = picked.reduce((s, x) => s + (x.amount ?? 0), 0);
    const fee = itemsSum - (dep.amount ?? 0);
    const feeRate = itemsSum > 0 ? fee / itemsSum : 1;

    for (const it of picked) claimedItems.add(it.id);

    const lags = picked.map((it) => daysAfter(it.txDate, dep.txDate));
    const avgLag = lags.reduce((s, n) => s + n, 0) / lags.length;
    const typicalLag = avgLag >= LAG_TYPICAL_LO && avgLag <= LAG_TYPICAL_HI;
    const confidence: CmsMatchCandidate['confidence'] =
      (typicalLag && feeRate <= MAX_FEE_RATE && picked.length >= 2) ? 'high'
      : (picked.length >= 2 || feeRate <= MAX_FEE_RATE) ? 'medium'
      : 'low';

    out.push({
      depositId: dep.id,
      depositDate: ymd(dep.txDate),
      depositAmount: dep.amount ?? 0,
      companyCode: co,
      items: picked,
      itemsSum,
      estimatedFee: fee,
      feeRate,
      confidence,
    });
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => order[a.confidence] - order[b.confidence]);
}

/**
 * 매칭 확정 패치 — deposit=지급수수료(이중수익 방지) · items=settlement 링크만.
 */
export function buildSettlementPatches(
  candidate: CmsMatchCandidate,
): { id: string; patch: Record<string, unknown> }[] {
  const settlementId = `cms_${candidate.depositId}`;
  const feeLabel = candidate.estimatedFee > 0
    ? ` (수수료 ${candidate.estimatedFee.toLocaleString('ko-KR')}원 = 총액 ${candidate.itemsSum.toLocaleString('ko-KR')} - 집금액 ${candidate.depositAmount.toLocaleString('ko-KR')})`
    : '';
  const patches: { id: string; patch: Record<string, unknown> }[] = [{
    id: candidate.depositId,
    patch: {
      settlementId,
      settlementRole: 'deposit',
      settlementGrossAmount: candidate.itemsSum,
      settlementFeeAmount: candidate.estimatedFee,
      settlementItemCount: candidate.items.length,
      subject: '지급수수료',
      category: '지급수수료',
      memo: `CMS집금 정산${feeLabel}`,
    },
  }];
  for (const item of candidate.items) {
    patches.push({
      id: item.id,
      patch: {
        settlementId,
        settlementRole: 'item',
      },
    });
  }
  return patches;
}
