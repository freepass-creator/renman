/**
 * 임포트 값 정규화 — 엑셀·CSV 가 준 «문자열»을 엔티티 필드 타입에 맞게 바꾼다.
 *
 * ## 왜 필요한가 (2026-08-07 발견)
 *   `parseSpreadsheet` 는 SheetJS 를 `raw: false` 로 읽는다 = **셀 서식 그대로 문자열**이 온다.
 *   실무 엑셀은 금액에 천단위 콤마 서식이 걸려 있으므로 월대여료 1234000 은 `"1,234,000"` 으로 들어오고,
 *   그대로 저장되면 하위 계산이 전부 `Number("1,234,000") || 0` → **0** 으로 삼킨다.
 *   미수·손익·회차가 조용히 0이 되고 아무 데도 에러가 안 뜬다.
 *   폼(ledger-create-panel)은 콤마를 벗기고 있었는데 임포트 경로만 빠져 있었다.
 *   은행거래(bank_tx)는 parse-tx 의 toNum 을 거쳐서 무사했다 — 나머지 엔티티 전부가 대상.
 *
 * ## 원칙
 *   **못 알아보면 손대지 않는다.** 값을 버리는 것보다 원문을 남기는 게 낫다
 *   (필수값 검증이 뒤에서 잡아 준다). 정규화는 «확실히 알아본 것»만.
 */
import { ENTITIES, type EntityRecord } from './entities';

/** "1,234,000" · "₩1,234,000" · "1 234 000원" → 1234000. 못 읽으면 null. */
export function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = String(raw ?? '').trim();
  if (!s) return null;
  // 숫자가 하나도 없으면 숫자 칸이 아니다(「미정」·「-」 등) → 손대지 않는다.
  if (!/\d/.test(s)) return null;
  // 괄호 표기 음수 (1,234) = -1234 — 회계 엑셀에서 흔하다.
  const negParen = /^\(.*\)$/.test(s);
  const cleaned = s.replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negParen ? -Math.abs(n) : n;
}

/** "2026.8.7" · "2026/08/07" · "2026. 8. 7" · "20260807" → "2026-08-07". 못 읽으면 null. */
export function coerceDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const compact = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  // 이미 ISO(시각 포함 가능)면 날짜부만.
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return null;   // 엑셀 시리얼(46000 같은 순수 숫자)은 «날짜인지 수량인지» 알 수 없어 손대지 않는다.
}

/**
 * 엔티티 필드 타입대로 레코드 값을 정규화한다.
 * 알아보지 못한 값은 원문 그대로 둔다(파괴 금지).
 */
export function coerceRecord(entityKey: string, rec: EntityRecord): EntityRecord {
  const entity = ENTITIES[entityKey];
  if (!entity) return rec;
  const out: EntityRecord = { ...rec };
  for (const field of entity.fields) {
    const value = out[field.key];
    if (value === undefined || value === null || value === '') continue;
    if (field.type === 'number') {
      const n = coerceNumber(value);
      if (n !== null) out[field.key] = n;
    } else if (field.type === 'date') {
      const d = coerceDate(value);
      if (d !== null) out[field.key] = d;
    }
  }
  return out;
}

export function coerceRecords(entityKey: string, records: EntityRecord[]): EntityRecord[] {
  return records.map((rec) => coerceRecord(entityKey, rec));
}
