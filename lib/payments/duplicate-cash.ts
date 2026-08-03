/**
 * 현장수납(현금·카드·수동) ↔ 계좌입금 중복 차감 탐지.
 *
 * 왜 필요한가: 현장에서 현금·카드로 받아 차량360에서 수납을 기록하고(_payments source='현금'|'수동'),
 *   며칠 뒤 그 돈이 통장에 찍혀 자동매칭/수동연결까지 하면 «같은 돈»이 두 번 차감된다.
 *   미수관리·내용증명 청구액·반납정산이 모두 이 net을 쓰므로
 *     ① 실제보다 작은 미수로 독촉·법적문서가 나가고
 *     ② 진짜 미수는 회수 대상에서 탈락한다.
 *   이미 겪은 «미수 유실»(씨앗 carry 이중차감)과 같은 부류다. 되돌리려면 어느 쪽이 중복인지
 *   사람이 전수 대조해야 하므로, 발생 시점에 «막는 대신 물어보는» 게 유일한 실효 대책이다.
 *
 * 판정: 계좌입금 t 에 대해, 같은 계약의 «계좌 아닌 수납» 중
 *   ① 단건 정확일치 — |날짜차| ≤ windowDays 이고 금액이 같다
 *   ② 창 합계 일치 — 창 안의 그런 수납 합계가 t.amount 와 같다(분할 수납을 한 번에 입금)
 *   둘 중 하나면 «중복 의심». 이미 txId가 붙은 수납(계좌 연결분)은 대상에서 제외한다.
 */

/**
 * 이 수납이 «통장 거래에 이미 짝지어졌는가» — 판정은 txId 존재 여부 하나로 한다.
 *
 * ★source 문자열로 판정하면 안 된다(초기 구현의 치명적 오류): 차량360 수납기록 폼의
 *   기본 수단이 '계좌'다(components/vehicle-detail/useVehicleDetail.ts:97 method: '계좌').
 *   즉 «손으로 계좌입금을 기록 → 며칠 뒤 통장 거래를 매칭» 이라는 가장 흔한 이중차감 경로에서
 *   그 수납이 '계좌'로 저장돼 «통장 유래»로 오인되고 가드가 통째로 비활성화됐다.
 *   실제로 통장 거래에서 온 수납은 매칭 시 txId가 붙는다(app/payments/page.tsx manualMatch·apply).
 *   txId가 없는 수납은 수단이 무엇이든 «사람이 손으로 적은 것»이므로 중복 후보다.
 */
function isLinkedToBankTx(p: Record<string, unknown>): boolean {
  return !!p.txId || !!p.cardTxId;
}

/**
 * 시스템이 만들어 넣은 수납인가 — 실제 돈의 이동이 아니라 «계산 결과의 기록»이다.
 *   보증금 충당(lib/deposit.ts:54 source '정산') · 스냅샷 자동정리(lib/payments/payment-schedule.ts)
 *   · 선불 1회차 합성(lib/contract-ops.ts:73). 이들을 현장수납으로 세면 진짜 입금 매칭을 막는다.
 */
function isSynthetic(p: Record<string, unknown>): boolean {
  if (p.synthetic === true) return true;
  if (String(p.source || '') === '정산') return true;
  return !!p.kind;   // deposit-offset 등 kind가 붙은 것은 청구·충당 기록이다
}

export type CashPayment = {
  seq: number;
  date: string;
  amount: number;
  source: string;
};

export type DuplicateCashHit = {
  /** '단건' = 금액·날짜가 맞는 수납 1건 · '합계' = 창 안 여러 건의 합이 입금액과 같음 */
  kind: '단건' | '합계';
  payments: CashPayment[];
  total: number;
  /** 사용자에게 보여줄 한 줄 — 확인 대화·경고 배지에 그대로 쓴다. */
  message: string;
};

function dayDiff(a: string, b: string): number {
  const ta = Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / 86_400_000;
}

export function findDuplicateCashPayment(
  contract: Record<string, unknown> | null | undefined,
  tx: { txDate?: string; amount?: number },
  opts?: { windowDays?: number },
): DuplicateCashHit | null {
  const amount = Number(tx?.amount) || 0;
  const txDate = String(tx?.txDate || '');
  if (!contract || amount <= 0 || !txDate) return null;
  const windowDays = opts?.windowDays ?? 3;

  const raw = Array.isArray(contract._payments) ? (contract._payments as Array<Record<string, unknown>>) : [];
  const inWindow: CashPayment[] = raw
    .filter((p) => !isLinkedToBankTx(p) && !isSynthetic(p))
    .filter((p) => dayDiff(String(p.date || ''), txDate) <= windowDays)
    .map((p) => ({
      seq: Number(p.seq) || 0,
      date: String(p.date || ''),
      amount: Number(p.amount) || 0,
      source: String(p.source || '수동'),
    }))
    .filter((p) => p.amount > 0);
  if (inWindow.length === 0) return null;

  const exact = inWindow.find((p) => p.amount === amount);
  if (exact) {
    return {
      kind: '단건',
      payments: [exact],
      total: exact.amount,
      message: `${exact.date} ${exact.source} 수납 ${exact.amount.toLocaleString('ko-KR')}원과 금액이 같습니다 — 같은 돈이면 미수가 두 번 차감됩니다`,
    };
  }
  const total = inWindow.reduce((s, p) => s + p.amount, 0);
  if (total === amount) {
    return {
      kind: '합계',
      payments: inWindow,
      total,
      message: `±${windowDays}일 안의 ${inWindow.map((p) => p.source).join('·')} 수납 ${inWindow.length}건 합계(${total.toLocaleString('ko-KR')}원)와 금액이 같습니다 — 같은 돈이면 미수가 두 번 차감됩니다`,
    };
  }
  return null;
}

/**
 * 역방향 — «통장 매칭이 먼저, 손 기록이 나중».
 *
 * 직원이 통장 입금을 계약에 연결해 두었는데, 며칠 뒤 같은 돈을 «현장에서 받았다»고 또 기록하면
 * 역시 두 번 차감된다. 방향만 다르고 피해는 동일하므로 수납기록 화면에서도 물어봐야 한다.
 *
 * 판정 대상이 반대다: 이번에는 «통장에 짝지어진 수납(txId 있음)»을 후보로 본다.
 */
export function findDuplicateBankPayment(
  contract: Record<string, unknown> | null | undefined,
  entry: { date?: string; amount?: number },
  opts?: { windowDays?: number },
): DuplicateCashHit | null {
  const amount = Number(entry?.amount) || 0;
  const date = String(entry?.date || '');
  if (!contract || amount <= 0 || !date) return null;
  const windowDays = opts?.windowDays ?? 3;

  const raw = Array.isArray(contract._payments) ? (contract._payments as Array<Record<string, unknown>>) : [];
  const inWindow: CashPayment[] = raw
    .filter((p) => isLinkedToBankTx(p) && !isSynthetic(p))
    .filter((p) => dayDiff(String(p.date || ''), date) <= windowDays)
    .map((p) => ({
      seq: Number(p.seq) || 0,
      date: String(p.date || ''),
      amount: Number(p.amount) || 0,
      source: String(p.source || '계좌'),
    }))
    .filter((p) => p.amount > 0);
  if (inWindow.length === 0) return null;

  const exact = inWindow.find((p) => p.amount === amount);
  if (exact) {
    return {
      kind: '단건',
      payments: [exact],
      total: exact.amount,
      message: `${exact.date} 통장 매칭분 ${exact.amount.toLocaleString('ko-KR')}원과 금액이 같습니다 — 같은 돈이면 미수가 두 번 차감됩니다`,
    };
  }
  const total = inWindow.reduce((s, p) => s + p.amount, 0);
  if (total === amount) {
    return {
      kind: '합계',
      payments: inWindow,
      total,
      message: `±${windowDays}일 안의 통장 매칭분 ${inWindow.length}건 합계(${total.toLocaleString('ko-KR')}원)와 금액이 같습니다 — 같은 돈이면 미수가 두 번 차감됩니다`,
    };
  }
  return null;
}
