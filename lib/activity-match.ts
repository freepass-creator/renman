/**
 * 활동 로그(통화·문자·방문·상담·메모) ↔ 계약 매칭 SSOT.
 *
 * 왜 있나: 활동은 «계약»에 붙는다. 같은 차가 손바뀜하면(288수6402는 계약 5건)
 *   번호판만으로 묶을 때 앞 임차인에게 건 전화가 다음 임차인 화면에 뜬다.
 *   저장(QuickLogForm)은 이미 contractNo 를 넣는데 조회가 번호판이었던 게 버그였다.
 *
 * 매칭 우선순위:
 *   1) contractNo 일치            — 확정. 이후 판정 안 함
 *   2) 번호판 + 계약기간 안의 날짜 — contractNo 없는 옛 기록 폴백
 *   3) (2)에서 기간을 모르면 계약자명 일치까지 확인 — 그래도 애매하면 제외
 *
 * 폴백이 틀릴 수 있으므로 «넓게 잡지 않는다». 남의 계약에 붙는 것보다 안 뜨는 게 낫다.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';

/** 사람과 주고받은 기록 = 고객관리 대상. 정비·검사 등 차량 이벤트는 제외. */
export const COMM_KINDS = new Set(['통화', '문자', '방문', '메모', '상담']);

export function isComm(h: EntityRecord): boolean {
  return COMM_KINDS.has(String(h.category || ''));
}

function ymd(v: unknown): string {
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

function contractKeys(c: EntityRecord): string[] {
  return [String(c.contractNo || ''), String(c._key || '')].filter(Boolean);
}

/** 계약의 유효 구간 — 시작=인도일|시작일, 끝=반납일|만기일(없으면 열림). */
function span(c: EntityRecord): { from: string; to: string } {
  return {
    from: ymd(c.deliveredDate) || ymd(c.startDate),
    to: ymd(c.returnedDate) || ymd(c.endDate),
  };
}

/** 활동 1건이 계약 1건에 속하는가. */
export function matchesContract(h: EntityRecord, c: EntityRecord): boolean {
  const hNo = String(h.contractNo || '');
  const keys = contractKeys(c);
  if (hNo) return keys.includes(hNo);          // ① 확정 — 다른 계약 것이면 여기서 끝

  const hp = normPlate(String(h.plate || ''));
  if (!hp || hp !== normPlate(String(c.plate || ''))) return false;

  const d = ymd(h.date);
  const { from, to } = span(c);
  if (d && from) {                              // ② 번호판 + 기간
    if (d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  // ③ 기간을 모르면 이름이 같을 때만 인정(그래도 애매하면 버린다)
  const hc = String(h.customer || '').trim();
  const cc = String(c.contractorName || '').trim();
  return !!hc && hc === cc;
}

/** 계약 1건의 소통 이력 — 최신순. 계약 상세·미수 조치 화면 공용. */
export function selectContractComms(history: EntityRecord[], contract: EntityRecord): EntityRecord[] {
  return history
    .filter((h) => isComm(h) && matchesContract(h, contract))
    .sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
}

/** 고객(계약 여러 건)의 소통 이력 — 계약 어느 하나에 붙으면 포함. Customer360용. */
export function selectCustomerComms(history: EntityRecord[], contracts: EntityRecord[]): EntityRecord[] {
  return history
    .filter((h) => isComm(h) && contracts.some((c) => matchesContract(h, c)))
    .sort((a, b) => (String(a.date) < String(b.date) ? 1 : -1));
}

/** 계약별 최근 접촉일 — 목록에서 "얼마나 연락 안 했나" 표시용. */
export function lastCommByContract(history: EntityRecord[], contracts: EntityRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  const comms = history.filter(isComm);
  for (const c of contracts) {
    const key = contractKeys(c)[0];
    if (!key) continue;
    let latest = '';
    for (const h of comms) {
      if (!matchesContract(h, c)) continue;
      const d = ymd(h.date);
      if (d > latest) latest = d;
    }
    if (latest) out.set(key, latest);
  }
  return out;
}
