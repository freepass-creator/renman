import { describe, expect, it } from 'vitest';
import { buildFleetRows } from '@/lib/sheet-rows';
import type { ContractNode, VehicleNode } from '@/lib/domain/model';
import type { EntityRecord } from '@/lib/intake/entities';

function contract(phase: ContractNode['phase'], net: number, customer: string): ContractNode {
  const rec = {
    companyId: 'switchplan', plate: '72구1062', contractorName: customer,
    monthlyRent: 630_000, paymentDay: 1, rentalMonths: 24,
  } as EntityRecord;
  return {
    phase,
    endReason: phase === '종료' ? '정상종료' : '',
    debt: net > 0 ? '채권잔존' : '청산',
    net,
    label: phase,
    tone: net > 0 ? 'danger' : 'ok',
    plate: '72구1062',
    customer,
    view: { rec, net, overdueDays: net > 0 ? 30 : 0, dday: null, roundDue: 1, roundTotal: 24 } as ContractNode['view'],
  };
}

function vehicle(contracts: ContractNode[], activeContract: ContractNode | null): VehicleNode {
  return {
    veh: { companyId: 'switchplan', plate: '72구1062', carName: '스타렉스' } as EntityRecord,
    plate: '72구1062',
    activeContract,
    contracts,
    ownership: '보유중',
    utilization: activeContract ? '운행' : '휴차',
    label: activeContract ? '운행' : '휴차',
    tone: activeContract ? 'ok' : 'mute',
  };
}

describe('운영현황 차량별 미수 출처', () => {
  it('현재 유지계약 미수와 과거 종료계약 채권을 분리한다', () => {
    const active = contract('운행', 1_890_000, '현재 고객');
    const ended = contract('종료', 2_200_000, '과거 고객');
    const [row] = buildFleetRows([vehicle([ended, active], active)]);

    expect(row).toMatchObject({
      contractState: '계약유지',
      customer: '현재 고객',
      maintainedNet: 1_890_000,
      endedNet: 2_200_000,
      net: 4_090_000,
    });
  });

  it('운행 전 계약도 계약자와 조건을 숨기지 않고 계약예정으로 표시한다', () => {
    const pending = contract('대기', 700_000, '인도 예정 고객');
    const [row] = buildFleetRows([vehicle([pending], null)]);

    expect(row).toMatchObject({
      contractState: '계약예정',
      customer: '인도 예정 고객',
      maintainedNet: 700_000,
      endedNet: 0,
    });
  });
});
