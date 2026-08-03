import { describe, expect, it } from 'vitest';
import { buildCompanyDocNo, computeNextCompanySeq } from '@/lib/doc-templates';

const when = new Date(2026, 7, 2);

describe('회사별 문서번호', () => {
  it('고정 브랜드가 아닌 관리회사 ID로 채번한다', () => {
    expect(buildCompanyDocNo('prime', 'ERT', 3, when)).toBe('PRIME-ERT-2608-003');
  });

  it('회사별로 일련번호를 독립 계산한다', () => {
    const items = [
      { companyId: 'prime', docNo: 'PRIME-ERT-2608-001' },
      { companyId: 'prime', docNo: 'PRIME-ERT-2608-004' },
      { companyId: 'sonogong', docNo: 'SONOGONG-ERT-2608-009' },
    ];
    expect(computeNextCompanySeq(items, 'prime', 'ERT', when)).toBe(5);
    expect(computeNextCompanySeq(items, 'sonogong', 'ERT', when)).toBe(10);
  });
});
