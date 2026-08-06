/**
 * 마이그레이션 승인 — 「이 데이터로 오픈한다」를 서버에 남기는 절차.
 *
 * 막으려는 것(P0-1): **로컬/원격 혼합 승인.**
 *   Firebase 키가 없거나 로그인이 안 된 상태에서 `getStore()`는 localStorage 어댑터로 조용히
 *   내려간다(설계된 미리보기 동작). 이때 반영을 돌리면 데이터는 **브라우저에만** 들어가는데,
 *   승인 기록만 서버로 POST 되면 서버에는 「스위치플랜 마이그레이션 승인됨」이 남고 실제 Firestore는
 *   비어 있다. 오픈 판단이 그 승인 기록을 근거로 서게 되므로, 이건 표시 문제가 아니라 게이트가
 *   거짓말을 하는 문제다.
 *
 * 그래서 양쪽에서 막는다:
 *   · 클라 — 저장 백엔드가 firestore 가 아니면 승인 POST 자체를 하지 않는다(`isRemoteBackend`).
 *   · 서버 — 로컬 개발 액터(systemRole 'local')와 본사 아닌 계정의 승인을 거부하고,
 *            **클라가 보낸 숫자를 믿지 않고 Firestore 실물을 다시 세어** 기준선과 대조한다.
 *
 * 기준선(baseline) = 반영에 넣은 것. 승인(acceptance) = 서버가 실제로 가진 것과 대조해 통과한 사실.
 * 이 파일은 순수 로직만 둔다(라우트·클라 양쪽에서 같은 판정을 쓰기 위해).
 */

/** 서버 Admin 전용 컬렉션. firestore.rules 에서 클라이언트 접근을 전면 차단한다. */
export const MIGRATION_COLL = 'migration';

/** 대조 대상 엔티티 — 반영이 넣는 원장 4종. 나머지는 파생이라 세지 않는다. */
export const ACCEPTANCE_ENTITIES = ['vehicle', 'contract', 'insurance', 'bank_tx'] as const;

export type MigrationCounts = {
  perEntity: Record<string, number>;
  /** 계약성 입금(수납) — 건수·합계. 돈은 건수만으로 부족하다. */
  receipts: { count: number; sum: number };
};

export type MigrationBaseline = MigrationCounts & {
  companyId: string;
  runId: string;
  /** 시드 모드(auto·live·frozen·demo) — 무엇을 근거로 넣었는지. frozen 승인은 실데이터 승인이 아니다. */
  packMode: string;
  /** 수납 기준일 — 이 시점 이전 수납은 계약 순미수에 반영돼 있다. */
  baselineDate: string;
  recordedAt: string;
  recordedBy: string;
};

export type AcceptanceMismatch = { what: string; expected: number; actual: number };

export type AcceptanceVerdict = {
  ok: boolean;
  mismatches: AcceptanceMismatch[];
};

export function baselineDocId(companyId: string): string {
  return `${companyId}__baseline`;
}

export function acceptanceDocId(companyId: string, runId: string): string {
  return `${companyId}__${runId}`;
}

/**
 * 승인 판정 — 서버가 실제로 가진 것(actual)이 기준선(baseline)에 미치는가.
 *
 * **모자라면 실패**(넣었다는데 없다 = 유실). 남는 것은 실패로 보지 않는다 —
 * 반영과 승인 사이 몇 초 동안 직원이 정상적으로 한 건 넣었을 수 있고, 그걸로 오픈을 막으면
 * 게이트가 「지나갈 수 없는 문」이 된다. 대신 실제 숫자를 승인 기록에 남겨 나중에 볼 수 있게 한다.
 * 수납 합계는 **정확히 일치**해야 한다 — 금액이 늘어난 것도 설명이 필요한 사건이다.
 */
export function verifyAcceptance(baseline: MigrationCounts, actual: MigrationCounts): AcceptanceVerdict {
  const mismatches: AcceptanceMismatch[] = [];
  for (const key of ACCEPTANCE_ENTITIES) {
    const expected = Number(baseline.perEntity?.[key]) || 0;
    const got = Number(actual.perEntity?.[key]) || 0;
    if (got < expected) mismatches.push({ what: key, expected, actual: got });
  }
  const expectedCount = Number(baseline.receipts?.count) || 0;
  const gotCount = Number(actual.receipts?.count) || 0;
  if (gotCount < expectedCount) mismatches.push({ what: '수납건수', expected: expectedCount, actual: gotCount });

  const expectedSum = Number(baseline.receipts?.sum) || 0;
  const gotSum = Number(actual.receipts?.sum) || 0;
  if (gotSum !== expectedSum) mismatches.push({ what: '수납합계', expected: expectedSum, actual: gotSum });

  return { ok: mismatches.length === 0, mismatches };
}

/** 승인 거부 사유 — 실무자가 «재투입»과 «조사»를 고를 수 있게 어긋난 항목을 그대로 적는다. */
export function acceptanceFailureMessage(verdict: AcceptanceVerdict): string {
  const detail = verdict.mismatches
    .map((m) => `${m.what} 기대 ${m.expected.toLocaleString()} / 실제 ${m.actual.toLocaleString()}`)
    .join(' · ');
  return `마이그레이션 승인 거부 — 서버 데이터가 기준선과 다릅니다. ${detail}`;
}

/**
 * 승인 POST 를 보내도 되는 저장 백엔드인가.
 * localStorage 미리보기에서 나간 승인은 «서버에 없는 데이터»를 승인한 것이 된다.
 */
export function isRemoteBackend(backend: unknown): boolean {
  return String(backend || '') === 'firestore';
}
