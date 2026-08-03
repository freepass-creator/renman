import { describe, expect, it } from 'vitest';
import type { EntityRecord } from '@/lib/intake/entities';
import { buildReceivableRows, collectionInfoForReceivable, countReceivableFacets, engineLockDue, mostUrgentCollectionInfo, summarizeReceivableActions } from '@/lib/receivables-ledger';
import { collectionStage } from '@/lib/domain/status';

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

describe('미수 계약상태와 계약별 연체조치 조건', () => {
  it('계약조건이 없으면 3일 연체를 시동제어로 임의 판정하지 않는다', () => {
    expect(collectionInfoForReceivable({ overdueDays: 3, ended: false })).toMatchObject({
      stage: '계약조건 확인',
      nextAction: '계약서 연체조항 확인·등록',
    });
    expect(collectionStage(30)).toMatchObject({
      stage: '계약조건 확인',
      nextAction: '계약서 연체조항 확인·등록',
    });
  });

  it('같은 연체일도 각 계약에 저장된 조건에 따라 다르게 판정한다', () => {
    expect(collectionInfoForReceivable(
      { overdueDays: 3, ended: false },
      contract({ engineLockAfterDays: 3 }),
    ).stage).toBe('시동제어');
    expect(collectionInfoForReceivable(
      { overdueDays: 3, ended: false },
      contract({ engineLockAfterDays: 5 }),
    ).stage).toBe('회수대기');
  });

  it('계약조건 D+순서가 비정상이어도 도래한 조치 중 가장 강한 단계를 선택한다', () => {
    expect(collectionInfoForReceivable(
      { overdueDays: 12, ended: false },
      contract({ warningAfterDays: 10, engineLockAfterDays: 3, repossessionAfterDays: 5 }),
    ).stage).toBe('차량회수');
  });

  it('한 차량의 여러 미수 계약은 실제 조치 중 가장 강한 단계를 선택한다', () => {
    expect(mostUrgentCollectionInfo([
      { rec: contract({ warningAfterDays: 1 }), v: { overdueDays: 30, ended: false } },
      { rec: contract({ debtTransferredDate: '2026-07-01' }), v: { overdueDays: 5, ended: true } },
    ])?.stage).toBe('채권화');
  });

  it('계약종료 채권에는 계약서의 시동제어 조건을 신규 적용하지 않는다', () => {
    expect(collectionInfoForReceivable(
      { overdueDays: 30, ended: true },
      contract({ engineLockAfterDays: 3, repossessionAfterDays: 10 }),
    )).toMatchObject({
      stage: '회수대기',
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

  it('시동제어 할 일은 계약조건이 실제 도래한 계약만 센다', () => {
    expect(engineLockDue({
      rec: contract({ engineLockAfterDays: 5 }),
      v: { overdueDays: 3, ended: false },
    })).toBe(false);
    expect(engineLockDue({
      rec: contract({ engineLockAfterDays: 3 }),
      v: { overdueDays: 3, ended: false },
    })).toBe(true);
  });

  it('전체회사 보기에서도 같은 번호판의 연락이력을 회사별로 분리한다', () => {
    const rows = buildReceivableRows([
      contract({ _key: 'prime-contract', companyId: 'prime', plate: '12가3456' }),
      contract({ _key: 'switch-contract', companyId: 'switchplan', plate: '12가3456' }),
    ], [
      { _key: 'prime-call', companyId: 'prime', plate: '12가3456', category: '통화', date: '2026-08-01', memo: '프라임 연락' },
      { _key: 'switch-call', companyId: 'switchplan', plate: '12가3456', category: '통화', date: '2026-08-02', memo: '스위치플랜 연락' },
    ], TODAY);

    expect(rows.find((row) => row.rec._key === 'prime-contract')?.contact?.memo).toBe('프라임 연락');
    expect(rows.find((row) => row.rec._key === 'switch-contract')?.contact?.memo).toBe('스위치플랜 연락');
  });

  it('같은 회사·차량의 재계약에서도 계약별 연락이력을 섞지 않는다', () => {
    const rows = buildReceivableRows([
      contract({ _key: 'old', contractNo: 'C-OLD', companyId: 'switchplan', plate: '12가3456' }),
      contract({ _key: 'new', contractNo: 'C-NEW', companyId: 'switchplan', plate: '12가3456' }),
    ], [
      { _key: 'old-call', companyId: 'switchplan', contractNo: 'C-OLD', plate: '12가3456', category: '통화', date: '2026-08-02', memo: '이전계약 독촉' },
      { _key: 'new-call', companyId: 'switchplan', contractNo: 'C-NEW', plate: '12가3456', category: '문자', date: '2026-08-01', memo: '현재계약 문자' },
    ], TODAY);

    expect(rows.find((row) => row.rec._key === 'old')?.contact?.memo).toBe('이전계약 독촉');
    expect(rows.find((row) => row.rec._key === 'new')?.contact?.memo).toBe('현재계약 문자');
  });

  it('빠른기록의 상담도 최근 고객 연락으로 표시한다', () => {
    const [row] = buildReceivableRows([
      contract({ _key: 'consulted', contractNo: 'C-CONSULT' }),
    ], [
      { _key: 'consult', companyId: 'switchplan', contractNo: 'C-CONSULT', plate: '12가3456', category: '상담', date: '2026-08-02', memo: '분납 일정 협의' },
    ], TODAY);
    expect(row.contact?.memo).toBe('분납 일정 협의');
  });
});
