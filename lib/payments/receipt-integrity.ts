/**
 * 수납이력 정합성 — 마이그레이션 「반영」이 조용히 돈을 흘리지 않았는지 대조한다.
 *
 * 이 검사가 없어서 생긴 일: 적재 결과를 눈으로 보면 대여료 입금이 전부 «미매칭»이라
 * 1,948건이 누락된 것처럼 보였고(실은 carry 에 반영된 이력), 정작 **자연키 충돌로 실제 접힌
 * 1건**은 그 소음에 묻혔다. 오판정과 진짜 유실이 같은 화면에 같은 색으로 있었던 것이다.
 *
 * 그래서 판정을 셋으로 쪼갠다:
 *   ① 유실(missing)   — 원천에 있는데 적재본에 없다. **정당한 사유가 없다** → 승인 거부.
 *   ② 이력(history)   — 기준일 이전 수납. carry 에 반영됨(acceptance-normalization 표식).
 *   ③ 대기(pending)   — 기준일 이후 수납. 앱이 매칭해야 할 실제 일감. 정상이다.
 *
 * fail-closed 원칙: 대조를 못 하면(기준·적재본을 못 읽으면) 통과가 아니라 실패다.
 * 「반영은 됐는데 뭐가 들어갔는지 모른다」는 상태로 운영에 넘기지 않는다.
 */
import type { EntityRecord } from '@/lib/intake/entities';
import { requiresContractLink } from '@/lib/finance/cash-rules';

export type ReceiptIntegrityReport = {
  baselineDate: string;
  source: { count: number; sum: number };
  loaded: { count: number; sum: number };
  history: number;
  pending: number;
  /** 원천에 있는데 적재본에 없는 거래의 식별키(최대 20건 표본). */
  missingKeys: string[];
  missingCount: number;
  missingSum: number;
  ok: boolean;
};

/** 대조 식별자 — 저장 후에는 `_key`(store 자연키), 저장 전 원천에는 txKey 가 붙어 있다. */
export function receiptKeyOf(r: EntityRecord): string {
  return String(r._key || r.txKey || '');
}

const isReceipt = (r: EntityRecord): boolean =>
  (Number(r.amount) || 0) > 0 && requiresContractLink(r.category);

const sumOf = (rows: EntityRecord[]): number =>
  rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

/**
 * 원천 팩 ↔ 적재본 대조.
 *
 * @param source 반영에 넣은 bank_tx (정규화 후 — txKey 부여된 상태)
 * @param loaded 반영 직후 다시 읽은 bank_tx
 */
export function auditReceiptIntegrity({
  source,
  loaded,
  baselineDate,
}: {
  source: EntityRecord[];
  loaded: EntityRecord[];
  baselineDate: string;
}): ReceiptIntegrityReport {
  const srcReceipts = source.filter(isReceipt);
  const loadedReceipts = loaded.filter(isReceipt);

  /* 적재본의 _key 는 store 가 자연키로 다시 만든 값이라 원천 txKey 와 문자열이 다를 수 있다.
     그래서 «키 하나»로만 보지 않고 txKey·_key 를 모두 색인에 넣는다 — 대조가 키 규약 변경에
     깨지면 그것 자체가 오탐(있는데 없다고 판정)을 만든다. */
  const loadedIndex = new Set<string>();
  for (const r of loadedReceipts) {
    if (r._key) loadedIndex.add(String(r._key));
    if (r.txKey) loadedIndex.add(String(r.txKey));
  }

  const missing = srcReceipts.filter((r) => {
    const key = receiptKeyOf(r);
    return key ? !loadedIndex.has(key) : false;
  });

  let history = 0;
  let pending = 0;
  for (const r of loadedReceipts) {
    if (String(r.matchedKind || '') === 'history') history++;
    else if (!r.matchedContractId && !r.matchedScheduleSeq) pending++;
  }

  return {
    baselineDate,
    source: { count: srcReceipts.length, sum: sumOf(srcReceipts) },
    loaded: { count: loadedReceipts.length, sum: sumOf(loadedReceipts) },
    history,
    pending,
    missingKeys: missing.slice(0, 20).map(receiptKeyOf),
    missingCount: missing.length,
    missingSum: sumOf(missing),
    ok: missing.length === 0 && loadedReceipts.length >= srcReceipts.length,
  };
}

/**
 * 승인 게이트 — 정합하지 않으면 던진다(fail-closed).
 * 「몇 건이 왜 비었는지」를 메시지에 담아 실무자가 재투입/조사를 고를 수 있게 한다.
 */
export function assertReceiptIntegrity(report: ReceiptIntegrityReport): void {
  if (report.ok) return;
  const shortfall = report.source.count - report.loaded.count;
  const detail = report.missingCount > 0
    ? `유실 ${report.missingCount}건(${report.missingSum.toLocaleString()}원) — 예: ${report.missingKeys.slice(0, 3).join(' / ')}`
    : `원천 ${report.source.count}건 대비 적재 ${report.loaded.count}건 (${shortfall}건 부족)`;
  throw new Error(`수납이력 정합성 실패 — 반영을 승인하지 않았습니다. ${detail}`);
}
