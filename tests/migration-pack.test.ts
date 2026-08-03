import { describe, expect, it } from 'vitest';
import { buildSwitchplanPack, SWITCHPLAN_META } from '@/lib/migrate/switchplan';
import { buildMatchContract } from '@/lib/contract-ops';

describe('스위치플랜 마이그레이션 팩', () => {
  it('얼린 원본의 차량·계약을 빠짐없이 복원한다', () => {
    const pack = buildSwitchplanPack('2026-07-27');

    expect(pack.vehicle).toHaveLength(SWITCHPLAN_META.vehicleCount);
    expect(pack.contract).toHaveLength(SWITCHPLAN_META.contractCount);
    expect(pack.vehicle).toHaveLength(163);
    expect(pack.contract).toHaveLength(177);
  });

  it('모든 계약에서 수납일정을 계산할 수 있다', () => {
    const pack = buildSwitchplanPack('2026-07-27');
    const schedules = pack.contract.map((contract) => buildMatchContract(contract, '2026-07-27').schedules ?? []);

    expect(schedules.every((rows) => rows.length > 0)).toBe(true);
    expect(schedules.reduce((sum, rows) => sum + rows.length, 0)).toBeGreaterThan(177);
  });
});
