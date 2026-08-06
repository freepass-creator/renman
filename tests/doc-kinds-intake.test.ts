/**
 * 문서 종류 → 원장·OCR 해소 — `lib/doc-kinds.ts`.
 * 규격 = `docs/VEHICLE360-SPEC.md` §3-1·§3-2.
 * 「실무자가 손에 든 것은 종이다. 어느 엔티티·어느 OCR 로 갈지는 시스템이 정한다.」
 */
import { describe, it, expect } from 'vitest';
import {
  DOC_KINDS, decodeIntakePick, docKindLabel, docVersionType,
  encodeIntakePick, entitiesWithoutDocKind,
} from '@/lib/doc-kinds';
import { ENTITIES, ENTITY_LIST } from '@/lib/intake/entities';

/** 화면이 넘기는 폴백과 같은 함수 — 엔티티 선택일 때만 쓰인다. */
const entityOcr = (e: string) => ENTITIES[e]?.ocrType;

describe('투입 선택 — 종이가 원장·OCR을 정한다', () => {
  it('종류를 고르면 엔티티와 OCR 스키마가 따라온다', () => {
    const p = decodeIntakePick(encodeIntakePick('kind', '자동차등록증'), entityOcr);
    expect(p).toEqual({ by: 'kind', kind: '자동차등록증', entity: 'vehicle', ocrType: 'vehicle_reg' });
  });

  it('OCR 스키마가 없는 종이는 OCR이 없는 것이다 — 엔티티 폴백을 쓰지 않는다', () => {
    // 견적서는 vehicle 이지만 자동차등록증 OCR 을 돌리면 엉뚱한 값이 들어온다.
    const p = decodeIntakePick(encodeIntakePick('kind', '견적서'), entityOcr);
    expect(p.entity).toBe('vehicle');
    expect(p.ocrType).toBeUndefined();
    expect(entityOcr('vehicle')).toBe('vehicle_reg');   // 폴백이 있었어도 쓰지 않았다
  });

  it('목록에 없는 종류도 살아서 들어온다 — 「기타」로 죽지 않는다', () => {
    const p = decodeIntakePick(encodeIntakePick('kind', '인수인계 확인서'), entityOcr);
    expect(p.kind).toBe('인수인계 확인서');
    expect(p.entity).toBe('inbox');      // 원본 보관 경로
    expect(p.ocrType).toBeUndefined();
  });

  it('엔티티 선택(`?type=` 딥링크)은 그대로 존중한다', () => {
    const p = decodeIntakePick('entity:lease', entityOcr);
    expect(p).toMatchObject({ by: 'entity', entity: 'lease' });
  });

  it('종이 목록의 OCR 스키마는 엔티티 정의와 어긋나지 않는다', () => {
    // 두 벌이 갈라지면 「종류로 고른 OCR」과 「엔티티가 아는 OCR」이 달라져 조용히 오추출된다.
    for (const d of DOC_KINDS.filter((x) => x.ocrType)) {
      expect(ENTITIES[d.entity]?.ocrType).toBe(d.ocrType);
    }
  });

  it('모든 종이는 실재하는 엔티티를 가리킨다', () => {
    for (const d of DOC_KINDS) expect(ENTITIES[d.entity], d.kind).toBeTruthy();
  });
});

describe('종이 없는 원장', () => {
  it('어떤 종이도 안 가리키는 원장만 골라낸다 — 화면에서 사라지면 안 된다', () => {
    const orphans = entitiesWithoutDocKind(ENTITY_LIST.map((e) => e.key));
    const covered = new Set(DOC_KINDS.map((d) => d.entity));
    for (const k of orphans) expect(covered.has(k)).toBe(false);
    // 임대차·계좌처럼 종이가 없는 원장이 실제로 있어야 이 그룹이 의미가 있다
    expect(orphans.length).toBeGreaterThan(0);
    expect(orphans).not.toContain('vehicle');
  });
});

describe('DocVersion.type — 슬롯 규약', () => {
  it('슬롯 있는 종류는 슬롯 키로 저장한다 — 안 그러면 올려도 서류미비로 남는다', () => {
    // doc-crosscheck 가 type === 'vehicle'|'insurance' 로 서류미비를 판정한다(오픈 조건 ①).
    expect(docVersionType('자동차등록증')).toBe('vehicle');
    expect(docVersionType('자동차보험증권')).toBe('insurance');
  });

  it('슬롯 없는 종류는 종류명 그대로 저장한다', () => {
    expect(docVersionType('매매계약서')).toBe('매매계약서');
    expect(docVersionType('인수인계 확인서')).toBe('인수인계 확인서');
    expect(docVersionType('  ')).toBe('기타');
  });

  it('표시할 때는 슬롯 키를 사람 말로 되돌린다', () => {
    expect(docKindLabel('vehicle')).toBe('자동차등록증');
    expect(docKindLabel('insurance')).toBe('자동차보험증권');
    expect(docKindLabel('매매계약서')).toBe('매매계약서');
    expect(docKindLabel('')).toBe('분류 없음');
  });

  it('저장 → 표시 왕복이 종류를 잃지 않는다', () => {
    for (const d of DOC_KINDS) expect(docKindLabel(docVersionType(d.kind))).toBe(d.kind);
  });
});
