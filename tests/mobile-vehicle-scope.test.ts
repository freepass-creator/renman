import { describe, expect, it } from 'vitest';
import { buildMobileVehicleScope, scopeMobileVehicleRecords } from '@/lib/mobile-vehicle-scope';

const vehicles = [
  { companyId: 'a', plate: '123가4567', plateHistory: ['01가1234'], carName: 'A차' },
  { companyId: 'b', plate: '123가4567', carName: 'B차' },
];
const contracts = [
  { companyId: 'a', plate: '01가1234', contractNo: 'A-OLD' },
  { companyId: 'b', plate: '123가4567', contractNo: 'B-NOW' },
];

describe('모바일 차량 테넌트·번호변경 범위', () => {
  it('URL 회사가 지정되면 다른 회사의 같은 번호판으로 폴백하지 않는다', () => {
    const scope = buildMobileVehicleScope(vehicles, contracts, '123가4567', 'missing');
    expect(scope.vehicle).toBeUndefined();
    expect(scope.vehicles).toEqual([]);
    expect(scopeMobileVehicleRecords(scope, contracts)).toEqual([]);
  });

  it('같은 번호판도 지정 회사의 차량과 레코드만 선택한다', () => {
    const scope = buildMobileVehicleScope(vehicles, contracts, '123가4567', 'b');
    expect(scope.vehicle?.carName).toBe('B차');
    expect(scopeMobileVehicleRecords(scope, contracts).map((row) => row.contractNo)).toEqual(['B-NOW']);
  });

  it('옛 번호 URL과 옛 번호 레코드를 현재 번호로 이어 붙인다', () => {
    const scope = buildMobileVehicleScope(vehicles, contracts, '01가1234', 'a');
    expect(scope.canonicalPlate).toBe('123가4567');
    expect(scopeMobileVehicleRecords(scope, contracts)).toEqual([
      { companyId: 'a', plate: '123가4567', contractNo: 'A-OLD' },
    ]);
  });
});
