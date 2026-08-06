/**
 * 마이그레이션 적재 정규화 — 「이건 이력이다」를 데이터에 새긴다.
 *
 * 왜 필요한가 (실측):
 *   스위치플랜 팩을 그대로 넣으면 대여료 입금 **1,948건이 「미매칭」** 으로 뜬다.
 *   그런데 그 돈은 이미 계약의 `_carryUnpaid`(순미수 1.42억)에 반영돼 있다 —
 *   switchplan-parse 가 «과거 납부를 _payments 로 재이관하지 않는다»(carry 이중차감 방지)고
 *   정한 결과다. 즉 **할 일이 아닌데 할 일 1,948건**으로 보였고, 마이그레이션 승인 검사도
 *   같은 눈으로 봐서 「수납이력 누락」으로 오판정했다.
 *
 *   → 기준일 이전 계약성 입금에 `matchedKind: 'history'` 를 새긴다.
 *     이력이라는 사실이 레코드에 남으므로 화면(자금상태)·승인 검사가 같은 근거로 판단한다.
 *
 * 또 하나 (실측): 팩의 bank_tx 3,639건 중 **1건이 자연키 충돌로 저장 때 조용히 접힌다**
 *   (`ENTITIES.bank_tx.keyFields` join = 계좌|일자|금액|입금자|적요… 가 완전히 같은 두 건).
 *   `assignBankTxKeys` 가 2건째에 `#2` 를 붙여 txKey 를 부여하면 유실이 사라진다.
 *   이것이 «오판정»과 «진짜 유실»의 경계다 — 앞은 표시를 고치고, 뒤는 데이터를 살린다.
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { assignBankTxKeys } from '@/lib/intake/parse-tx';
import { requiresContractLink } from '@/lib/finance/cash-rules';

export type MigrationNormalizeReport = {
  /** 기준일 = 팩에 담긴 거래 중 가장 최근 거래일. 계약 carry 가 이 시점 기준으로 계산돼 있다. */
  baselineDate: string;
  total: number;
  /** 이력으로 표식한 건수 — 화면에서 «할 일»로 뜨지 않는다. */
  history: number;
  /** 기준일 이후 계약성 입금 = 앱이 실제로 매칭해야 할 일감. */
  pending: number;
};

/** 팩의 거래 중 가장 최근 거래일 = 이 마이그레이션의 기준일. */
export function baselineDateOf(rows: EntityRecord[]): string {
  let max = '';
  for (const r of rows) {
    const d = String(r.txDate || '');
    if (d > max) max = d;
  }
  return max;
}

/**
 * 마이그레이션 bank_tx 정규화.
 *  ① txKey 부여 — 동일내용 N건이 저장에서 접히지 않게(유실 차단)
 *  ② 기준일 이전 계약성 입금에 `matchedKind:'history'` — 이미 carry 에 반영된 이력 표식
 *
 * 이미 계약에 매칭된 건은 건드리지 않는다(실 매칭이 이력 표식보다 강하다).
 * 미분류 입금은 표식하지 않는다 — 무슨 돈인지 정하는 일은 이력 여부와 별개로 남아 있다.
 */
export function normalizeMigratedBankTx(rows: EntityRecord[], baselineDate = baselineDateOf(rows)): {
  rows: EntityRecord[];
  report: MigrationNormalizeReport;
} {
  let history = 0;
  let pending = 0;
  const out = rows.map((r) => {
    const inAmt = Number(r.amount) || 0;
    const contractual = inAmt > 0 && requiresContractLink(r.category);
    if (!contractual || r.matchedContractId || r.matchedScheduleSeq) return { ...r };
    const txDate = String(r.txDate || '');
    if (baselineDate && txDate && txDate > baselineDate) { pending++; return { ...r }; }
    history++;
    return { ...r, matchedKind: 'history', historyAsOf: baselineDate };
  });
  return {
    rows: assignBankTxKeys(out),
    report: { baselineDate, total: rows.length, history, pending },
  };
}
