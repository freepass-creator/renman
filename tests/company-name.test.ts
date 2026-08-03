import { describe, expect, it } from 'vitest';
import { companyRegisteredName, companyShort } from '@/lib/companies';

describe('회사명 표시 규칙', () => {
  it('사업자등록 상호에서 법인격 표기만 제거한다', () => {
    expect(companyRegisteredName('주식회사 한국렌터카')).toBe('한국렌터카');
    expect(companyRegisteredName('한국렌터카 주식회사')).toBe('한국렌터카');
    expect(companyRegisteredName('(주) 한국렌터카')).toBe('한국렌터카');
    expect(companyRegisteredName('㈜한국렌터카')).toBe('한국렌터카');
  });

  it('등록된 상호를 임의 약칭하지 않는다', () => {
    expect(companyShort('switchplan')).toBe('스위치플랜');
    expect(companyShort('prime')).toBe('프라임구독');
    expect(companyShort('sonogong')).toBe('손오공렌터카');
  });
});
