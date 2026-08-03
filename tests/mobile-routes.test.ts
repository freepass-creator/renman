import { describe, expect, it } from 'vitest';
import { mobileVehicleHref } from '@/lib/mobile-routes';

describe('모바일 차량 이동 경로', () => {
  it('번호판을 경로에 안전하게 인코딩한다', () => {
    expect(mobileVehicleHref('299수 4820')).toBe('/m/vehicle/299%EC%88%98%204820');
  });

  it('관리회사와 집중 대상을 쿼리로 보존한다', () => {
    expect(mobileVehicleHref('299수4820', 'prime rent', 'unpaid'))
      .toBe('/m/vehicle/299%EC%88%984820?company=prime+rent&do=unpaid');
  });
});
