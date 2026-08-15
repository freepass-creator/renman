import { describe, expect, it } from 'vitest';
import { linkFleet } from '@/lib/domain/model';
import { computeDashboard } from '@/lib/operating-snapshot';
import { matchDriver } from '@/lib/penalty-reassign';
import { scopedPlateKey } from '@/lib/plate';

const today = '2026-08-15';

describe('전체 법인 차량 연결 격리', () => {
  const vehicles = [
    { _key: 'vehicle-a', companyId: 'A', plate: '12가3456', carName: 'A차' },
    { _key: 'vehicle-b', companyId: 'B', plate: '12가3456', carName: 'B차' },
  ];

  it('같은 차량번호라도 자기 법인의 활성 계약만 연결한다', () => {
    const contracts = [{ _key: 'contract-a', companyId: 'A', plate: '12가3456', status: '운행', contractorName: 'A고객' }];
    const fleet = linkFleet(vehicles, contracts, today);

    expect(fleet.byCompanyPlate.get(scopedPlateKey('A', '12가3456'))?.activeContract?.customer).toBe('A고객');
    expect(fleet.byCompanyPlate.get(scopedPlateKey('B', '12가3456'))?.activeContract).toBeNull();
  });

  it('가동률·휴차·유령차량·중복배차를 법인별로 계산한다', () => {
    const contracts = [
      { _key: 'contract-a', companyId: 'A', plate: '12가3456', status: '운행', contractorName: 'A고객', startDate: '2026-01-01', endDate: '2026-12-31' },
      { _key: 'contract-b', companyId: 'B', plate: '12가3456', status: '운행', contractorName: 'B고객', startDate: '2026-01-01', endDate: '2026-12-31' },
      { _key: 'contract-b-ghost', companyId: 'B', plate: '99나9999', status: '대기', contractorName: 'B대기' },
    ];
    const dashboard = computeDashboard({ contracts, vehicles: [vehicles[0]], insurances: [], penalties: [], bankTx: [] }, today);

    expect(dashboard.summary.running).toBe(1);
    expect(dashboard.doubleBooking).toHaveLength(0);
    expect(dashboard.ghostPlates).toContainEqual({ companyId: 'B', plate: '12가3456' });
    expect(dashboard.ghostPlates).toContainEqual({ companyId: 'B', plate: '99나9999' });
  });

  it('과태료 위반일 운전자도 같은 법인 계약에서만 찾는다', () => {
    const contracts = [
      { _key: 'contract-a', companyId: 'A', plate: '12가3456', contractorName: 'A고객', startDate: '2026-01-01', endDate: '2026-12-31' },
      { _key: 'contract-b', companyId: 'B', plate: '12가3456', contractorName: 'B고객', startDate: '2026-01-01', endDate: '2026-12-31' },
    ];
    const driver = matchDriver({ companyId: 'B', plate: '12가3456', violationDate: '2026-08-01' }, contracts, vehicles);
    expect(driver?._key).toBe('contract-b');
  });
});
