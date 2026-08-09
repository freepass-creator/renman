/**
 * 개인정보 보존기간 SSOT — 「보존기간 = 계약기간」(사장님 확정 2026-08-09).
 *
 * ## 무엇을 파기하나
 *   **계약 레코드가 아니라 개인정보 «필드»만** 파기한다.
 *   계약 자체는 미수·손익·세무의 근거라 남겨야 한다(상법상 상업장부).
 *   PIPA 가 요구하는 것도 「개인정보의 파기」지 「거래기록의 삭제」가 아니다.
 *
 * ## 언제
 *   계약 종료일(returnedDate 우선, 없으면 endDate)이 지나면 대상.
 *
 * ## 보류 — 이게 핵심이다
 *   **미수가 남아 있으면 파기하지 않는다.** 이름·연락처를 지우면 회수를 못 한다.
 *   내용증명·시동제어·채권화가 전부 이 정보 위에 선다.
 *   PIPA 도 「다른 법령에 따라 보존해야 하거나 정당한 이익이 있는 경우」는 예외로 둔다 —
 *   채권 회수는 그 정당한 이익이다. 미수가 0이 되면 그때 파기 대상이 된다.
 *
 * ## 쓰는 데 문제 없게
 *   빈 문자열이 아니라 **표식**(`PII_TOMBSTONE`)을 남긴다. 화면이 「—」로 비어 보이면
 *   「데이터가 없는 것」과 「파기한 것」을 구분할 수 없다.
 */

/** 파기 후 자리에 남기는 표식. 빈값과 구분된다. */
export const PII_TOMBSTONE = '파기됨';

/** 파기 시각을 적는 필드 — 이 필드가 있으면 이미 파기된 계약이다. */
export const PII_DISPOSED_AT = '_piiDisposedAt';

/** 계약에서 파기할 개인정보 필드. 추가할 때는 화면·문서 출력도 같이 확인할 것. */
export const CONTRACT_PII_FIELDS = [
  'contractorName',
  'contractorPhone',
  'contractorBirth',
  'contractorLicenseNo',
  'contractorAddress',
  'contractorIdent',
] as const;

export type RetentionVerdict =
  | { state: '보존'; reason: string }
  | { state: '보류'; reason: string }
  | { state: '파기대상'; reason: string; endedAt: string }
  | { state: '파기완료'; reason: string };

type ContractLike = Record<string, unknown>;

const ymd = (v: unknown) => String(v ?? '').slice(0, 10);

/** 이 계약이 아직 미수를 안고 있는가 — 파기 보류의 근거. */
export function hasOutstanding(c: ContractLike): boolean {
  const carry = Number(c._carryUnpaid ?? 0);
  const net = Number(c.net ?? 0);
  return (Number.isFinite(carry) && carry > 0) || (Number.isFinite(net) && net > 0);
}

/** 계약 종료일 — 실제 반납일이 있으면 그것, 없으면 약정 종료일. */
export function contractEndedOn(c: ContractLike): string {
  return ymd(c.returnedDate) || ymd(c.endDate);
}

export function piiRetention(c: ContractLike, today: string): RetentionVerdict {
  if (c[PII_DISPOSED_AT]) return { state: '파기완료', reason: `${ymd(c[PII_DISPOSED_AT])} 파기` };

  const end = contractEndedOn(c);
  if (!end) return { state: '보존', reason: '종료일 없음 — 기간 산정 불가' };
  if (end >= today) return { state: '보존', reason: `계약기간 중(종료 예정 ${end})` };
  if (hasOutstanding(c)) return { state: '보류', reason: '미수 잔액 — 채권 회수에 필요' };

  return { state: '파기대상', reason: `계약 종료 ${end}`, endedAt: end };
}

/** 파기 패치 — 개인정보 필드만 표식으로 덮고, 파기 시각을 남긴다. */
export function piiDisposalPatch(c: ContractLike, today: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { [PII_DISPOSED_AT]: today };
  for (const f of CONTRACT_PII_FIELDS) {
    const v = c[f];
    if (v === undefined || v === null || v === '') continue;
    patch[f] = PII_TOMBSTONE;
  }
  return patch;
}

/** 이미 파기된 값인가 — 화면이 「없음」과 구분해 보여줄 때 쓴다. */
export function isDisposed(v: unknown): boolean {
  return String(v ?? '') === PII_TOMBSTONE;
}
