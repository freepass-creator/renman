/**
 * 담기(saveIntake) 후 자동 정산 — 계좌↔CMS · 계좌↔카드매출.
 *   · CMS: bank method=CMS → 통장 CMS집금 (성공일+1~7일, 보통 3~5일)
 *   · 카드: card_tx → 통장 카드자동집금 (동일 지연 창)
 * high·medium 만 자동 적용(low는 /payments 수동).
 */
import { getStore } from '@/lib/store';
import { lockReason } from '@/lib/finance/period-lock';
import { type EntityRecord } from '@/lib/intake/entities';
import {
  findCmsMatchCandidates, buildSettlementPatches, type CmsMatchCandidate,
} from '@/lib/payments/cms-matching';
import type { BankTransaction, CardTransaction } from '@/lib/payments/types';

const AUTO_CONF = new Set(['high', 'medium'] as const);

function toBankTx(rec: EntityRecord): BankTransaction {
  const method = String(rec.method || '계좌');
  return {
    id: String(rec._key || ''),
    txDate: String(rec.txDate || ''),
    amount: Number(rec.amount) || 0,
    withdraw: Number(rec.withdraw) || 0,
    counterparty: String(rec.counterparty || rec.memo || ''),
    memo: String(rec.memo || ''),
    source: method,
    method,
    companyCode: String(rec.companyId || ''),
    matchedContractId: rec.matchedContractId ? String(rec.matchedContractId) : undefined,
    settlementId: rec.settlementId ? String(rec.settlementId) : undefined,
    settlementRole: rec.settlementRole === 'deposit' || rec.settlementRole === 'item' ? rec.settlementRole : undefined,
  } as BankTransaction;
}

function toCardTx(rec: EntityRecord): CardTransaction {
  return {
    id: String(rec._key || ''),
    txDate: String(rec.txDate || ''),
    amount: Number(rec.amount) || 0,
    approvalNo: String(rec.approvalNo || ''),
    merchant: String(rec.merchant || ''),
    customerName: String(rec.customerName || rec.merchant || ''),
    kind: rec.kind === '매출' ? '매출' : '법인카드',
    companyCode: String(rec.companyId || ''),
    settlementId: rec.settlementId ? String(rec.settlementId) : undefined,
    matchedContractId: rec.matchedContractId ? String(rec.matchedContractId) : undefined,
  };
}

/** CMS 집금 정산 자동 적용 — companyId 확정 스코프에서만. */
export async function applyCmsSettlementsAuto(
  companyId: string,
  opts?: { confidences?: Array<'high' | 'medium' | 'low'> },
): Promise<{ applied: number; skipped: number }> {
  const allow = new Set(opts?.confidences ?? ['high', 'medium']);
  const bank = await getStore().list('bank_tx', companyId);
  const byKey = new Map(bank.map((r) => [String(r._key), r]));
  const cands = findCmsMatchCandidates(bank.map(toBankTx)).filter((c) => allow.has(c.confidence));
  let applied = 0; let skipped = 0;

  for (const cand of cands) {
    if (lockReason(companyId, cand.depositDate)) { skipped++; continue; }
    const patches = buildSettlementPatches(cand);
    const recs = patches.map((p) => byKey.get(p.id));
    if (recs.some((r) => !r || r.settlementId)) { skipped++; continue; }
    try {
      for (const { id, patch } of patches) {
        await getStore().update('bank_tx', companyId, id, patch as EntityRecord);
        const cur = byKey.get(id);
        if (cur) Object.assign(cur, patch);
      }
      applied++;
    } catch {
      skipped++;
    }
  }
  return { applied, skipped };
}

/* ── 카드매출 ↔ 카드자동집금 (CMS와 동일 지연 창) ── */
const LAG_MIN = 1;
const LAG_MAX = 7;
const LAG_TYP_LO = 3;
const LAG_TYP_HI = 5;
const MAX_FEE = 0.035;

function ymd(d: string) { return (d || '').slice(0, 10); }
function daysAfter(earlier: string, later: string): number {
  const ta = new Date(ymd(earlier)).getTime();
  const tb = new Date(ymd(later)).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Infinity;
  const n = (tb - ta) / 86400_000;
  return n < 0 ? Infinity : n;
}

function isCardDepositLabel(t: BankTransaction): boolean {
  return /카드자동집금|카드집금|카드매출/i.test(`${t.counterparty ?? ''} ${t.memo ?? ''}`);
}

export type CardSettleCandidate = {
  depositId: string;
  depositDate: string;
  depositAmount: number;
  items: CardTransaction[];
  itemsSum: number;
  estimatedFee: number;
  feeRate: number;
  confidence: 'high' | 'medium' | 'low';
};

/** 통장 카드자동집금 1건 ↔ card_tx N건 (승인일+1~7일 후 입금). */
export function findCardSettlementCandidates(
  bank: BankTransaction[],
  cards: CardTransaction[],
): CardSettleCandidate[] {
  const deposits = bank
    .filter((t) => !t.settlementId && (t.amount ?? 0) > 0 && isCardDepositLabel(t))
    .sort((a, b) => ymd(a.txDate).localeCompare(ymd(b.txDate)) || a.id.localeCompare(b.id));

  const pool = cards.filter((c) => !c.settlementId && (c.amount ?? 0) > 0);
  const claimed = new Set<string>();
  const out: CardSettleCandidate[] = [];

  for (const dep of deposits) {
    const window = pool.filter((it) => {
      if (claimed.has(it.id)) return false;
      const lag = daysAfter(it.txDate, dep.txDate);
      return lag >= LAG_MIN && lag <= LAG_MAX;
    });
    if (!window.length) continue;
    const itemsSum = window.reduce((s, x) => s + (x.amount ?? 0), 0);
    const fee = itemsSum - (dep.amount ?? 0);
    if (fee < 0) continue;
    const feeRate = itemsSum > 0 ? fee / itemsSum : 1;
    if (feeRate > MAX_FEE) continue;

    for (const it of window) claimed.add(it.id);
    const avgLag = window.reduce((s, it) => s + daysAfter(it.txDate, dep.txDate), 0) / window.length;
    const typicalLag = avgLag >= LAG_TYP_LO && avgLag <= LAG_TYP_HI;
    const confidence: CardSettleCandidate['confidence'] =
      (typicalLag && feeRate <= MAX_FEE && window.length >= 2) ? 'high'
      : (window.length >= 2 || feeRate <= MAX_FEE) ? 'medium'
      : 'low';

    out.push({
      depositId: dep.id,
      depositDate: ymd(dep.txDate),
      depositAmount: dep.amount ?? 0,
      items: window,
      itemsSum,
      estimatedFee: fee,
      feeRate,
      confidence,
    });
  }
  return out;
}

export async function applyCardSettlementsAuto(
  companyId: string,
  opts?: { confidences?: Array<'high' | 'medium' | 'low'> },
): Promise<{ applied: number; skipped: number }> {
  const allow = new Set(opts?.confidences ?? ['high', 'medium']);
  const [bank, card] = await Promise.all([
    getStore().list('bank_tx', companyId),
    getStore().list('card_tx', companyId),
  ]);
  const bankByKey = new Map(bank.map((r) => [String(r._key), r]));
  const cardByKey = new Map(card.map((r) => [String(r._key), r]));
  const cands = findCardSettlementCandidates(bank.map(toBankTx), card.map(toCardTx))
    .filter((c) => allow.has(c.confidence));

  let applied = 0; let skipped = 0;
  for (const cand of cands) {
    if (lockReason(companyId, cand.depositDate)) { skipped++; continue; }
    const dep = bankByKey.get(cand.depositId);
    if (!dep || dep.settlementId) { skipped++; continue; }
    const itemRecs = cand.items.map((it) => cardByKey.get(it.id));
    if (itemRecs.some((r) => !r || r.settlementId)) { skipped++; continue; }

    const sid = `card_${cand.depositId}`;
    const feeLabel = cand.estimatedFee > 0
      ? ` (수수료 ${cand.estimatedFee.toLocaleString('ko-KR')}원)`
      : '';
    try {
      await getStore().update('bank_tx', companyId, cand.depositId, {
        settlementId: sid,
        settlementRole: 'deposit',
        settlementGrossAmount: cand.itemsSum,
        settlementFeeAmount: cand.estimatedFee,
        settlementItemCount: cand.items.length,
        memo: `카드집금 정산${feeLabel}`,
      });
      Object.assign(dep, { settlementId: sid });
      for (const it of cand.items) {
        await getStore().update('card_tx', companyId, it.id, {
          settlementId: sid,
        });
        const cur = cardByKey.get(it.id);
        if (cur) cur.settlementId = sid;
      }
      applied++;
    } catch {
      skipped++;
    }
  }
  return { applied, skipped };
}

/** 담기 부수효과용 — CMS·카드 집금 자동 붙이기 + 잘못 덮인 집금과목 복구. */
export async function autoSettleAfterIntake(companyId: string): Promise<string[]> {
  const labels: string[] = [];
  const repaired = await repairSettlementDepositSubjects(companyId);
  if (repaired) labels.push(`settle-subject-repair:${repaired}`);
  const cms = await applyCmsSettlementsAuto(companyId, { confidences: [...AUTO_CONF] });
  if (cms.applied) labels.push(`cms-settle:${cms.applied}`);
  const card = await applyCardSettlementsAuto(companyId, { confidences: [...AUTO_CONF] });
  if (card.applied) labels.push(`card-settle:${card.applied}`);
  return labels;
}

/**
 * 과거에 집금 category를 지급수수료로 덮어쓴 행 복구.
 * cms_* → CMS집금 · card_* → 카드매출. 수입과목 복구 후 totalIn만 회복(영업손익 inAmt는 원래 포함).
 */
export async function repairSettlementDepositSubjects(companyId: string): Promise<number> {
  const bank = await getStore().list('bank_tx', companyId);
  let n = 0;
  for (const r of bank) {
    if (String(r.settlementRole || '') !== 'deposit') continue;
    const cat = String(r.category || '');
    const sub = String(r.subject || '');
    if (cat !== '지급수수료' && sub !== '지급수수료') continue;
    const sid = String(r.settlementId || '');
    const income = sid.startsWith('card_') ? '카드매출' : 'CMS집금';
    await getStore().update('bank_tx', companyId, String(r._key), {
      category: income,
      subject: income,
    });
    n++;
  }
  return n;
}

/** 미정산 CMS 성공분(method=CMS) — 수동 매칭 후보. */
export function listUnmatchedCmsItems(bank: EntityRecord[]): EntityRecord[] {
  return bank
    .filter((b) => {
      const method = String(b.method || '');
      const src = String(b.source || '');
      const isCms = method === 'CMS' || method === '자동이체' || src === 'CMS' || src === '자동이체';
      if (!isCms) return false;
      if (b.settlementId) return false;
      return (Number(b.amount) || 0) > 0;
    })
    .slice()
    .sort((a, b) => String(b.txDate || '').localeCompare(String(a.txDate || '')));
}

/** 수동: CMS집금 1행에 성공분 N건 연결(기존 정산 덮어씀). */
export async function manualLinkCmsSettlement(
  companyId: string,
  depositKey: string,
  itemKeys: string[],
): Promise<{ ok: boolean; error?: string }> {
  const bank = await getStore().list('bank_tx', companyId);
  const byKey = new Map(bank.map((r) => [String(r._key), r]));
  const dep = byKey.get(depositKey);
  if (!dep) return { ok: false, error: '집금 행을 찾을 수 없습니다' };
  if (lockReason(companyId, dep.txDate)) return { ok: false, error: '마감된 기간입니다' };

  const items = itemKeys.map((k) => byKey.get(k)).filter(Boolean) as EntityRecord[];
  if (items.length !== itemKeys.length) return { ok: false, error: '구성건 일부 없음' };

  // 기존 이 집금에 묶인 item 해제
  const oldSid = String(dep.settlementId || '');
  if (oldSid) {
    for (const r of bank) {
      if (String(r.settlementId || '') === oldSid && String(r.settlementRole || '') === 'item') {
        await getStore().update('bank_tx', companyId, String(r._key), {
          settlementId: null, settlementRole: null,
        });
      }
    }
  }

  const itemsSum = items.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const depositAmount = Number(dep.amount) || 0;
  const fee = Math.max(0, itemsSum - depositAmount);
  const sid = `cms_${depositKey}`;

  await getStore().update('bank_tx', companyId, depositKey, {
    settlementId: sid,
    settlementRole: 'deposit',
    settlementGrossAmount: itemsSum,
    settlementFeeAmount: fee,
    settlementItemCount: items.length,
    memo: `CMS집금 정산(수동) 수수료 ${fee.toLocaleString('ko-KR')}원`,
  });
  for (const it of items) {
    await getStore().update('bank_tx', companyId, String(it._key), {
      settlementId: sid,
      settlementRole: 'item',
    });
  }
  return { ok: true };
}

/** 수동: CMS집금 정산 전체 해제. */
export async function manualUnlinkCmsSettlement(
  companyId: string,
  depositKey: string,
): Promise<{ ok: boolean; error?: string }> {
  const bank = await getStore().list('bank_tx', companyId);
  const dep = bank.find((r) => String(r._key) === depositKey);
  if (!dep) return { ok: false, error: '집금 행 없음' };
  if (lockReason(companyId, dep.txDate)) return { ok: false, error: '마감된 기간입니다' };
  const sid = String(dep.settlementId || '');
  if (!sid) return { ok: true };

  for (const r of bank) {
    if (String(r.settlementId || '') !== sid) continue;
    await getStore().update('bank_tx', companyId, String(r._key), {
      settlementId: null,
      settlementRole: null,
      settlementGrossAmount: null,
      settlementFeeAmount: null,
      settlementItemCount: null,
    });
  }
  // 집금 라벨 과목 복구
  await getStore().update('bank_tx', companyId, depositKey, {
    category: 'CMS집금',
    subject: 'CMS집금',
  });
  return { ok: true };
}

/** 테스트·UI용 re-export */
export type { CmsMatchCandidate };
