/**
 * 자금 원자 불변 — 「생긴 사실」은 덮어쓰지 않는다.
 *
 * 왜: 통장·카드 거래(bank_tx·card_tx)는 은행이 만든 사실이지 우리가 고치는 값이 아니다.
 * 그런데 서버 임포트 라우트(`/api/entities/[entity]` POST)는 Admin SDK라 firestore.rules를
 * 우회하고, `batch.set`은 같은 문서 ID로 다시 밀면 **금액·일자까지 조용히 갈아엎는다**.
 * 즉 「재투입」 한 번이 결산 원자를 바꾸는 통로였다.
 *
 * 방어는 3중 — 여기(서버 create-only) · rules `moneySourceImmutable()` · 클라 저장 dedup.
 * 이 파일은 그중 서버 판정을 firebase 의존 없이 순수 함수로 떼어 둔 것(테스트 가능).
 *
 * 범위: 매칭·분류 같은 «우리가 붙이는» 필드의 수정은 별도 update 경로(rules 지배)로 간다.
 * 이 경계가 막는 것은 임포트 경로의 **생성 재사용**뿐이다.
 */

/** 덮어쓰기를 금지할 엔티티(자금 원자). 마감월 가드와 같은 축이라 SSOT로 함께 둔다. */
export const MONEY_ENTITIES = new Set(['bank_tx', 'card_tx']);

export function isMoneyEntity(entity: string): boolean {
  return MONEY_ENTITIES.has(entity);
}

/**
 * create-only 위반 목록.
 *
 * 두 가지를 모두 충돌로 본다:
 *  ① 이미 저장돼 있는 문서 ID (= 덮어쓰기 시도)
 *  ② 한 요청 안에서 같은 ID가 두 번 (= batch.create 가 커밋에서 터지는 것을 미리 잡음)
 *
 * @param ids        이번 요청이 쓰려는 문서 ID(요청 순서)
 * @param existingIds 이미 존재하는 문서 ID
 * @returns 충돌 ID — 정렬·중복 제거
 */
export function findCreateOnlyConflicts(ids: string[], existingIds: Iterable<string>): string[] {
  const existing = new Set(existingIds);
  const seen = new Set<string>();
  const conflicts = new Set<string>();
  for (const id of ids) {
    if (existing.has(id) || seen.has(id)) conflicts.add(id);
    seen.add(id);
  }
  return [...conflicts].sort();
}

/** 실무자용 거부 사유 — 어느 거래가 걸렸는지 보여준다(전량은 응답 필드로 따로 준다). */
export function moneyConflictMessage(conflicts: string[]): string {
  const head = conflicts.slice(0, 3).join(', ');
  const rest = conflicts.length > 3 ? ` 외 ${conflicts.length - 3}건` : '';
  return `이미 저장된 자금거래가 포함되어 저장하지 않았습니다 (${head}${rest}) — 자금 원자는 덮어쓸 수 없습니다. 수정이 필요하면 해당 거래를 열어 고치세요`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 원자 필드 불변 (update 경계) — create-only 가 «덮어쓰기»를 막는다면, 이쪽은 «고쳐쓰기»를 막는다.
 *
 * 은행이 찍은 사실(계좌·일자·금액·상대·잔액)은 우리가 고칠 값이 아니다. 고쳐야 할 상황은
 * «잘못 읽었다»(=재수집) 또는 «취소·정정 거래가 따로 있다»이지, 원장의 숫자를 바꾸는 일이 아니다.
 * 이 규약은 firestore.rules `moneySourceImmutable()` 과 **같은 목록**을 쓴다(양쪽이 갈라지면
 * 클라는 통과시키고 서버가 PERMISSION_DENIED 를 내는 «원인 모를 저장 실패»가 된다).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 은행·카드사가 만든 사실. 앱이 붙이는 값(계정과목·매칭·정산·메모·수단)은 여기 없다.
 *
 * ★`memo` 는 일부러 뺐다 — 원문 적요는 `jeokyo` 이고, `memo` 에는 앱이 정산 라벨
 *   (「CMS집금 정산(수동) 수수료 …」 · `lib/payments/auto-settle`)을 써 왔다. 목록에 넣으면
 *   정상 기능인 정산이 규칙에 막힌다. 적요 원문 보존은 `jeokyo` 가 담당한다.
 */
export const MONEY_SOURCE_FIELDS = [
  'account', 'txDate', 'txTime', 'amount', 'withdraw', 'balance', 'counterparty', 'jeokyo',
  'approvalNo', 'cardNo', 'cardLast4', 'merchant',
  'txKey', '_key', 'raw',
] as const;

/**
 * 파일·마이그레이션으로 들어온 거래인가 — `txKey` 유무로 가른다.
 *
 * 손으로 넣은 단건(`/cash` 단건 입력)은 txKey 가 없다. 그건 사람이 친 값이므로 오타 정정을
 * 허용해야 한다(마감 가드·감사로그·소프트삭제는 그대로 적용된다). 반대로 파일에서 온 건은
 * 원천을 다시 담는 것이 정정 방법이다.
 * ★txKey 를 지우고 고치는 2단계 우회는 성립하지 않는다 — txKey 자체가 불변 목록에 있다.
 */
export function isImportedMoneyRecord(before: Record<string, unknown> | null | undefined): boolean {
  return !!before && !!before.txKey;
}

/** 패치가 건드리는 원자 필드 — 값이 «실제로 달라지는» 것만 센다(같은 값 재전송은 수정이 아니다). */
export function changedMoneySourceFields(
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): string[] {
  if (!before || !patch) return [];
  return MONEY_SOURCE_FIELDS.filter((f) => {
    if (!Object.hasOwn(patch, f)) return false;
    return JSON.stringify(patch[f] ?? null) !== JSON.stringify(before[f] ?? null);
  });
}

/**
 * 클라 가드 — 규칙에 막혀 «원인 모를 저장 실패»를 보기 전에, 왜 안 되는지 먼저 말한다.
 * 규칙(서버)이 진짜 경계이고 이건 사용자에게 사유를 주기 위한 앞단이다.
 */
export function assertMoneySourceUnchanged(
  entityKey: string,
  before: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
): void {
  if (!isMoneyEntity(entityKey) || !isImportedMoneyRecord(before)) return;
  const changed = changedMoneySourceFields(before, patch);
  if (changed.length === 0) return;
  throw new Error(
    `수집된 자금거래의 원자 항목(${changed.join(', ')})은 고칠 수 없습니다 — 잘못 읽힌 거래는 원천을 다시 담고, 취소·정정은 별도 거래로 넣으세요`,
  );
}
