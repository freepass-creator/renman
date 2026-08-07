/**
 * 임포트 정규화 — 「1,234,000」이 조용히 0이 되던 버그의 회귀 방지.
 *
 * parseSpreadsheet 는 SheetJS 를 raw:false 로 읽어 «셀 서식 그대로» 문자열을 받는다.
 * 실무 엑셀의 금액은 천단위 콤마가 걸려 있으므로, 정규화가 없으면 저장된 값이 문자열이 되고
 * 하위 계산이 전부 `Number("1,234,000") || 0` → 0 으로 삼킨다(미수·손익·회차가 조용히 0).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { coerceDate, coerceNumber, coerceRecord } from '@/lib/intake/coerce';
import { ENTITIES } from '@/lib/intake/entities';

describe('임포트 숫자 정규화', () => {
  it('천단위 콤마 금액을 숫자로 읽는다 — 이게 안 되면 0으로 삼켜진다', () => {
    expect(coerceNumber('1,234,000')).toBe(1234000);
    expect(coerceNumber('₩1,234,000')).toBe(1234000);
    expect(coerceNumber('1,234,000원')).toBe(1234000);
    expect(coerceNumber(' 1234000 ')).toBe(1234000);
    expect(coerceNumber(1234000)).toBe(1234000);
  });

  it('회계 괄호 표기는 음수다', () => {
    expect(coerceNumber('(1,234)')).toBe(-1234);
  });

  it('숫자가 없는 값은 손대지 않는다(null) — 원문을 지키기 위해', () => {
    expect(coerceNumber('미정')).toBeNull();
    expect(coerceNumber('—')).toBeNull();
    expect(coerceNumber('')).toBeNull();
  });

  it('소수·음수를 보존한다', () => {
    expect(coerceNumber('-1,200')).toBe(-1200);
    expect(coerceNumber('17.5')).toBe(17.5);
  });
});

describe('임포트 날짜 정규화', () => {
  it.each([
    ['2026-08-07', '2026-08-07'],
    ['2026/08/07', '2026-08-07'],
    ['2026.8.7', '2026-08-07'],
    ['2026. 8. 7.', '2026-08-07'],
    ['20260807', '2026-08-07'],
    ['2026-08-07T09:00:00Z', '2026-08-07'],
  ])('%s → %s', (input, want) => {
    expect(coerceDate(input)).toBe(want);
  });

  it('엑셀 시리얼처럼 «날짜인지 수량인지» 모르는 값은 손대지 않는다', () => {
    expect(coerceDate('46000')).toBeNull();
    expect(coerceDate('미정')).toBeNull();
  });
});

describe('레코드 단위 정규화', () => {
  it('계약 금액 칸이 숫자가 된다', () => {
    const out = coerceRecord('contract', {
      monthlyRent: '1,234,000',
      deposit: '3,000,000',
      contractorName: '홍길동',
      startDate: '2026. 8. 7',
    });
    expect(out.monthlyRent).toBe(1234000);
    expect(out.deposit).toBe(3000000);
    expect(out.startDate).toBe('2026-08-07');
    expect(out.contractorName).toBe('홍길동');   // 글자 칸은 그대로
  });

  it('못 읽은 값은 원문을 남긴다 — 지우지 않는다', () => {
    const out = coerceRecord('contract', { monthlyRent: '협의', startDate: '추후' });
    expect(out.monthlyRent).toBe('협의');
    expect(out.startDate).toBe('추후');
  });

  it('알 수 없는 엔티티는 그대로 통과', () => {
    const rec = { a: '1,000' };
    expect(coerceRecord('없는엔티티', rec)).toEqual(rec);
  });
});

describe('임포트 경로가 정규화를 반드시 거친다', () => {
  it.each(['lib/intake/xlsx.ts', 'lib/intake/csv.ts'])('%s', (rel) => {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    expect(src).toContain('coerceRecords');
  });

  it('숫자·날짜 필드를 가진 엔티티가 실제로 있다(테스트가 헛돌지 않게)', () => {
    const withNum = Object.values(ENTITIES).filter((e) => e.fields.some((f) => f.type === 'number'));
    expect(withNum.length).toBeGreaterThan(5);
  });
});
