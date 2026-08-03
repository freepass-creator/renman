import { describe, expect, it } from 'vitest';
import { financeHref, paymentsHref } from '@/lib/ui-bus';

describe('자금관리 → 수납매칭 연속 동선', () => {
  it('선택 거래와 회사를 URL에 보존한다', () => {
    expect(paymentsHref({ transactionId: 'tx/한글 1', companyId: 'switch plan' }))
      .toBe('/payments?tx=tx%2F%ED%95%9C%EA%B8%80+1&company=switch+plan');
  });

  it('선택 거래가 없으면 기존 자금일보 진입 경로를 유지한다', () => {
    expect(paymentsHref()).toBe('/payments');
  });

  it('미분류 수집 거래는 자금관리 1차 분류 맥락을 보존한다', () => {
    expect(financeHref({ unclassified: true, transactionId: 'tx 1', companyId: 'switchplan' }))
      .toBe('/cash?facet=%EB%AF%B8%EB%B6%84%EB%A5%98&tx=tx+1&company=switchplan');
  });
});
