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
