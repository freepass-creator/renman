import { describe, expect, it } from 'vitest';
import { LENS_FILTERS, riskKindMatch } from '@/lib/lens-filters';

const CROSSCHECK_KINDS = [
  '번호오기입', '정체불명', '무보험', '서류미비', '차종불일치', '대여료불일치', '연령구간상승',
] as const;

describe('정합성 서류 교차검증 필터', () => {
  it('교차검증 7종을 종류 칩으로 모두 노출한다', () => {
    const labels = (LENS_FILTERS.정합성 || [])
      .find((group) => group.dim === '종류')?.chips.map((chip) => chip.label) || [];
    for (const kind of CROSSCHECK_KINDS) expect(labels).toContain(kind);
  });

  it('각 칩은 같은 종류만 선택하고 다른 교차검증 결과와 섞이지 않는다', () => {
    for (const selected of CROSSCHECK_KINDS) {
      for (const actual of CROSSCHECK_KINDS) {
        expect(riskKindMatch(new Set([selected]), actual)).toBe(selected === actual);
      }
    }
  });
});
