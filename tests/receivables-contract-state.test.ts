import { describe, expect, it } from 'vitest';
import type { EntityRecord } from '@/lib/intake/entities';
import { buildReceivableRows, collectionInfoForReceivable, countReceivableFacets, summarizeReceivableActions } from '@/lib/receivables-ledger';

const TODAY = '2026-08-02';

function contract(overrides: Partial<EntityRecord>): EntityRecord {
  return {
    _key: 'contract',
    companyId: 'switchplan',
    contractNo: 'C-1',
    contractorName: '테스트 고객',
    plate: '12가3456',
    monthlyRent: 500_000,
    rentalMonths: 12,
    startDate: '2026-01-01',
    endDate: '2027-01-01',
    deliveredDate: '2026-01-01',
    paymentDay: 25,
    paymentTiming: '선불',
    _carryUnpaid: 500_000,
    status: '운행',
    ...overrides,
  } as EntityRecord;
}

describe('미수 계약상태와 시동제어 분리', () => {
  it('같은 3일 연체라도 계약종료 채권에는 시동제어 단계를 쓰지 않는다', () => {
    expect(collectionInfoForReceivable({ overdueDays: 3, ended: false }).stage).toBe('시동제어');
    expect(collectionInfoForReceivable({ overdueDays: 3, ended: true })).toMatchObject({
      stage: '경고',
      nextAction: '보증금 정산·잔존채권 확인',
    });
  });

  it('계약유지와 계약종료 미수를 별도 facet으로 센다', () => {
    const rows = buildReceivableRows([
      contract({ _key: 'active' }),
      contract({ _key: 'ended', status: '반납', returnedDate: '2026-07-01' }),
    ], [], TODAY);

    const counts = countReceivableFacets(rows);
    expect(counts.계약유지).toBe(1);
    expect(counts.계약종료).toBe(1);
  });

  it('종료 계약의 잔존 시동제어는 적용중 건수와 분리해 점검 대상으로 센다', () => {
    const rows = buildReceivableRows([
      contract({ _key: 'active', engineDisabled: true }),
      contract({ _key: 'ended', status: '반납', returnedDate: '2026-07-01', engineDisabled: true }),
    ], [], TODAY);

    expect(summarizeReceivableActions(rows)).toMatchObject({
      immob: 1,
      endedLockReview: 1,
      lockTodo: 0,
    });
  });
});
