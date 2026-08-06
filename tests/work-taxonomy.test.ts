/**
 * 업무분류 2단 규격 (2026-08-06 사장님 확정) — 대분류 6축 = 대상 축.
 *
 * 지키는 것:
 *  ① 세부 17종이 정확히 한 대분류에 들어간다(중복·누락 0) — 새 세부를 추가하고 매핑을 빠뜨리면 여기서 걸린다
 *  ② 옛 딥링크(`?group=정비·수선`)가 「전체」로 조용히 떨어지지 않는다
 *  ③ 대상별 필수 검증이 대분류를 따라간다
 */
import { describe, expect, it } from 'vitest';
import {
  WORK_CATEGORIES, WORK_CATEGORIES_ACTIVE, WORK_DIVISIONS, WORK_DIVISION_CATEGORIES, WORK_DIVISION_REQUIRED,
  workDivisionOf, isWorkDivision, missingWorkRequirements,
} from '@/lib/work-taxonomy';
import { WORK_GROUPS, parseWorkGroup, workRowInDivision } from '@/lib/work-ledger';

describe('대분류 6축 — 원장과 같은 축', () => {
  it('★축 이름이 원장·메뉴와 같다 — 자산·계약·자금 + 일정·과태료·기타', () => {
    expect([...WORK_DIVISIONS]).toEqual(['자산', '계약', '자금', '일정', '과태료', '기타']);
  });

  it('★세부 17종이 정확히 한 축에 들어간다 — 누락·중복 없음', () => {
    const mapped = Object.values(WORK_DIVISION_CATEGORIES).flat();
    expect([...mapped].sort()).toEqual([...WORK_CATEGORIES].sort());
    expect(new Set(mapped).size).toBe(mapped.length);
  });

  it('세부 → 대분류', () => {
    expect(workDivisionOf('정비·수선')).toBe('자산');
    expect(workDivisionOf('사고')).toBe('자산');
    expect(workDivisionOf('연락기록')).toBe('계약');
    expect(workDivisionOf('수납이슈')).toBe('자금');
    expect(workDivisionOf('일정')).toBe('일정');
    expect(workDivisionOf('과태료')).toBe('과태료');
    expect(workDivisionOf('문서')).toBe('기타');
  });

  it('★목록에서 뺀 옛 값도 대분류가 정상 판정된다 — 과거 업무가 「기타」로 안 떨어진다', () => {
    for (const legacy of ['세차', '부품교체', '연락기록', '클레임', '분쟁'] as const) {
      expect(WORK_CATEGORIES_ACTIVE as readonly string[]).not.toContain(legacy);
      expect(workDivisionOf(legacy)).not.toBe('기타');
    }
    expect(workDivisionOf('세차')).toBe('자산');
    expect(workDivisionOf('클레임')).toBe('계약');
  });

  it('활성 세부는 전부 유효한 세부이고, 각 대분류에 최소 하나씩 있다', () => {
    for (const c of WORK_CATEGORIES_ACTIVE) expect(WORK_CATEGORIES as readonly string[]).toContain(c);
    for (const d of WORK_DIVISIONS) {
      expect(WORK_CATEGORIES_ACTIVE.some((c) => workDivisionOf(c) === d), `${d} 축에 고를 세부가 없다`).toBe(true);
    }
  });

  it('모르는 값·빈 값은 「기타」 — 조용히 사라지지 않는다', () => {
    expect(workDivisionOf('')).toBe('기타');
    expect(workDivisionOf('옛자유입력값')).toBe('기타');
    expect(workDivisionOf(undefined)).toBe('기타');
  });

  it('탭 목록 = 전체 + 6축 (세부 17개를 늘어놓지 않는다)', () => {
    expect(WORK_GROUPS).toEqual(['전체', '자산', '계약', '자금', '일정', '과태료', '기타']);
    expect(WORK_GROUPS).toHaveLength(7);
  });
});

describe('딥링크 하위호환', () => {
  it('대분류는 그대로', () => {
    expect(parseWorkGroup('과태료')).toBe('과태료');
    expect(parseWorkGroup('자산')).toBe('자산');
    expect(parseWorkGroup('전체')).toBe('전체');
  });

  it('★옛 세부 이름은 그 세부가 속한 대분류로 승격 — 「전체」로 떨어지지 않는다', () => {
    expect(parseWorkGroup('정비·수선')).toBe('자산');
    expect(parseWorkGroup('클레임')).toBe('계약');
    expect(parseWorkGroup('자금')).toBe('자금');
  });

  it('없는 값·null 은 전체', () => {
    expect(parseWorkGroup(null)).toBe('전체');
    expect(parseWorkGroup('없는분류')).toBe('전체');
  });
});

describe('행 ↔ 탭 매칭', () => {
  it('전체 탭은 다 통과', () => {
    expect(workRowInDivision('정비·수선', '전체')).toBe(true);
  });
  it('세부 행이 자기 대분류 탭에 들어간다', () => {
    expect(workRowInDivision('사고', '자산')).toBe(true);
    expect(workRowInDivision('사고', '자금')).toBe(false);
  });
});

describe('대상별 필수 검증 — 대분류가 곧 대상이라 그 대상이 비면 업무가 뜬다', () => {
  it('축마다 필수 항목이 정의돼 있다', () => {
    expect(isWorkDivision('자산')).toBe(true);
    for (const d of WORK_DIVISIONS) expect(WORK_DIVISION_REQUIRED[d]).toBeDefined();
  });

  it('차량 업무는 차량번호 필수', () => {
    expect(missingWorkRequirements('정비·수선', { plate: '' })).toEqual(['차량번호']);
    expect(missingWorkRequirements('정비·수선', { plate: '86버1166' })).toEqual([]);
  });

  it('계약 업무는 계약 필수', () => {
    expect(missingWorkRequirements('클레임', {})).toEqual(['계약(계약자)']);
    expect(missingWorkRequirements('클레임', { contractKey: 'ctr_1' })).toEqual([]);
  });

  it('자금 업무는 금액 필수 — 0원은 미입력으로 본다', () => {
    expect(missingWorkRequirements('수납이슈', { amount: 0 })).toEqual(['금액']);
    expect(missingWorkRequirements('수납이슈', { amount: 390000 })).toEqual([]);
  });

  it('일정은 기한 필수 — 대상 없는 일정이라 «언제»가 유일한 실체다', () => {
    expect(missingWorkRequirements('일정', {})).toEqual(['기한']);
    expect(missingWorkRequirements('일정', { dueDate: '2026-08-10' })).toEqual([]);
  });

  it('과태료는 차량번호 필수 · 기타는 필수 없음(자유기록)', () => {
    expect(missingWorkRequirements('과태료', {})).toEqual(['차량번호']);
    expect(missingWorkRequirements('메모', {})).toEqual([]);
  });

  it('레코드가 없으면 검증하지 않는다(생성 전 상태)', () => {
    expect(missingWorkRequirements('정비·수선', null)).toEqual([]);
  });
});
