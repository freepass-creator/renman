import { describe, expect, it } from 'vitest';
import { buildFleetRows } from '@/lib/sheet-rows';
import type { ContractNode, VehicleNode } from '@/lib/domain/model';
import type { EntityRecord } from '@/lib/intake/entities';

function contract(phase: ContractNode['phase'], net: number, customer: string, overrides: Partial<EntityRecord> = {}): ContractNode {
  const rec = {
    companyId: 'switchplan', plate: '72구1062', contractorName: customer,
    monthlyRent: 630_000, paymentDay: 1, rentalMonths: 24,
    ...overrides,
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
    view: { rec, net, ended: phase === '종료', overdueDays: net > 0 ? 30 : 0, dday: null, roundDue: 1, roundTotal: 24 } as ContractNode['view'],
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
      collectionInfo: { stage: '계약조건 확인' },
    });
  });

  it('여러 계약 미수는 연체일 고정정책이 아니라 실제 계약별 조치 중 가장 강한 단계를 표시한다', () => {
    const active = contract('운행', 1_890_000, '현재 고객', { warningAfterDays: 1 });
    const ended = contract('종료', 2_200_000, '과거 고객', { debtTransferredDate: '2026-07-01' });
    const [row] = buildFleetRows([vehicle([ended, active], active)]);

    expect(row.collectionInfo?.stage).toBe('채권화');
    expect(row.warnings.find((warning) => warning.code === 'collection')?.label).toBe('미수·채권화');
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
