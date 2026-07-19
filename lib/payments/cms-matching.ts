/**
 * CMS 집금 ↔ 자동이체 묶음 자동 매칭 (v5 cms-matching 이식).
 *
 *  · CMS 사업자는 N건 자동이체를 1건 통장 입금으로 묶음 (수수료 차감).
 *  · 매칭 후 bank_tx 에 settlementId / role / gross·fee 메타 기록.
 *  · UI는 `/payments` 에서 high만 일괄 적용 · medium/low 는 검토 후 적용.
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

const DATE_TOLERANCE_DAYS = 7;
const MAX_FEE_RATE = 0.035;
const TYPICAL_FEE_LO = 0.005;
const TYPICAL_FEE_HI = 0.035;

function ymd(date: string): string { return (date ?? '').slice(0, 10); }

function dayDiff(a: string, b: string): number {
  const ta = new Date(ymd(a)).getTime();
  const tb = new Date(ymd(b)).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  return Math.abs(ta - tb) / 86400_000;
}

/** 회사 키 — v6 EntityRecord.companyId 를 companyCode 로 넘긴 경우 포함. */
function coKey(t: BankTransaction): string {
  return String(t.companyCode || '').trim();
}

/**
 * 미정산 bank_tx 에서 CMS 묶음 후보 찾기.
 * deposit = 통장 입금(라벨·계좌·CMS집금) · item = method/source CMS|자동이체.
 */
export function findCmsMatchCandidates(bankTx: BankTransaction[]): CmsMatchCandidate[] {
  const depositCandidates: BankTransaction[] = [];
  const itemsByCompany = new Map<string, BankTransaction[]>();

  for (const t of bankTx) {
    if (t.settlementId) continue;
    const labeled = /CMS|집금|cms/i.test(`${t.counterparty ?? ''} ${t.memo ?? ''}`);
    const src = String(t.source || '');
    const method = String(t.method || '');
    // 개별 CMS — 명시 채널만 (계좌 매칭입금을 item 오인 → 수익 과대 방지)
    const isCmsItem = src === '자동이체' || src === 'CMS' || method === 'CMS' || method === '자동이체';
    if (isCmsItem) {
      const co = coKey(t);
      const arr = itemsByCompany.get(co);
      if (arr) arr.push(t);
      else itemsByCompany.set(co, [t]);
      continue; // item ↔ deposit 상호배타
    }
    if ((t.amount ?? 0) > 0 && !t.matchedContractId && (labeled || src === '계좌' || src === 'CMS집금' || method === '계좌')) {
      depositCandidates.push(t);
    }
  }

  const out: CmsMatchCandidate[] = [];
  const claimedItems = new Set<string>();

  for (const dep of depositCandidates) {
    const co = coKey(dep);
    const pool = itemsByCompany.get(co);
    if (!pool?.length) continue;
    const sameWindow = pool.filter((it) => !claimedItems.has(it.id) && dayDiff(it.txDate, dep.txDate) <= DATE_TOLERANCE_DAYS);
    if (sameWindow.length === 0) continue;

    const itemsSum = sameWindow.reduce((s, x) => s + (x.amount ?? 0), 0);
    const fee = itemsSum - (dep.amount ?? 0);
    if (fee < 0) continue;
    const feeRate = itemsSum > 0 ? fee / itemsSum : 1;
    if (feeRate > MAX_FEE_RATE) continue;

    for (const it of sameWindow) claimedItems.add(it.id);

    const depLabeled = /CMS|집금|cms/i.test(`${dep.counterparty ?? ''} ${dep.memo ?? ''}`);
    const strongCmsSignal = depLabeled || dep.source === 'CMS집금';
    const confidence: CmsMatchCandidate['confidence'] =
      (strongCmsSignal && feeRate >= TYPICAL_FEE_LO && feeRate <= TYPICAL_FEE_HI && sameWindow.length >= 3) ? 'high'
      : (sameWindow.length >= 2 || feeRate >= TYPICAL_FEE_LO) ? 'medium'
      : 'low';

    out.push({
      depositId: dep.id,
      depositDate: ymd(dep.txDate),
      depositAmount: dep.amount ?? 0,
      companyCode: co,
      items: sameWindow,
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
 * category/subject 는 v6 ledger-subjects SSOT.
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
