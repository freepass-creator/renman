/**
 * 식별코드 SSOT — 모든 opaque 시스템 ID는 오직 여기서만 발급. (freepasserp4 lib/domain/ids.ts 방식)
 *   형식: Stripe식 `접두사_토큰`  예) veh_8f3k2p9qm4x1 · ctr_p2m9x0ab · cus_7q1w…
 *   · 시스템 ID(PK) = 불변 랜덤 토큰. 순번 아님 → 카운터 불필요, 충돌 사실상 0.
 *   · 자연키(번호판·계약번호·면허번호)는 "속성"으로 내려앉힘(검색·소프트 유니크). PK로 쓰지 않음
 *     — 번호판 재발급·계약서 재발행·병합 시 참조가 안 깨지게.
 *   · 사람이 부르는 순번 업무코드(계약번호 C-YYMM-#### 등)는 별도 발번기(원자 카운터)로. 여기선 시스템 ID만.
 */

const ALPHABET = '0123456789abcdefghijkmnpqrstuvwxyz'; // 헷갈리는 l/o 제외(사람 눈 오독 방지)

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256); // 폴백(암호화 크립토 없을 때)
  return out;
}

/** 랜덤 토큰(기본 12자, base33). */
export function token(len = 12): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/** 엔티티 → 접두사 (단일 출처). 관계 필드명은 그대로 두고 "값 형식"만 이 토큰으로 교체. */
export const ID_PREFIX: Record<string, string> = {
  vehicle: 'veh',
  customer: 'cus',
  contract: 'ctr',
  insurance: 'ins',
  penalty: 'pen',
  bank_tx: 'btx',
  card_tx: 'ctx',
  history: 'evt',
  company: 'co',
  staff: 'usr',
  supplier: 'sup',
};

/** 엔티티 표준 opaque ID 발급. 예 newId('contract') → 'ctr_8f3k2p9qm4x1'. */
export function newId(entityKey: string): string {
  const p = ID_PREFIX[entityKey] || (entityKey.replace(/[^a-z]/gi, '').slice(0, 3).toLowerCase() || 'id');
  return `${p}_${token()}`;
}

/** opaque ID 형식인가(접두사_토큰). 자연키(번호판 등)와 구분용. */
export function isId(s: unknown): boolean {
  return typeof s === 'string' && /^[a-z]{2,4}_[0-9a-z]{8,}$/.test(s);
}

/** ID 접두사(엔티티 종류) 추출. 없으면 ''. */
export function prefixOf(id: unknown): string {
  const s = String(id ?? '');
  const i = s.indexOf('_');
  return i > 0 && /^[a-z]{2,4}$/.test(s.slice(0, i)) ? s.slice(0, i) : '';
}
