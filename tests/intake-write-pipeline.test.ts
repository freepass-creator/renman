import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  store: {
    backend: 'test',
    save: vi.fn(),
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    listDeleted: vi.fn(),
    restore: vi.fn(),
  },
  autoSettle: vi.fn(),
}));

vi.mock('@/lib/store', () => ({ getStore: () => mocks.store }));
vi.mock('@/lib/payments/auto-settle', () => ({ autoSettleAfterIntake: mocks.autoSettle }));
vi.mock('@/lib/freepass/product-sync', () => ({ syncVehicleToFreepass: vi.fn() }));

import { commitSave, commitUpdate } from '@/lib/commit';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.save.mockResolvedValue({ saved: 1, duplicates: 0, backend: 'test' });
  mocks.store.update.mockResolvedValue(undefined);
  mocks.store.get.mockResolvedValue(null);
  mocks.store.list.mockResolvedValue([]);
  mocks.autoSettle.mockResolvedValue([]);
});

describe('통합 쓰기 퍼널', () => {
  it('보험 수정도 원자 사건을 기록하고 차량 보험 정본을 동기화한다', async () => {
    const insurance = { _key: 'POL-1', companyId: 'co1', plate: '12가3456', insurer: '기존보험', endDate: '2026-01-01' };
    const updatedInsurance = { ...insurance, insurer: '새보험', policyNo: 'POL-1', endDate: '2027-01-01' };
    mocks.store.list.mockImplementation(async (entity: string) => {
      if (entity === 'vehicle') return [{ _key: '12가3456', plate: '12가3456' }];
      if (entity === 'insurance') return [updatedInsurance];
      return [];
    });

    await commitUpdate({
      entity: 'insurance', sessionCompanyId: 'co1', rec: insurance, key: 'POL-1',
      patch: { insurer: '새보험', policyNo: 'POL-1', endDate: '2027-01-01' }, source: 'ocr',
    });

    expect(mocks.store.update).toHaveBeenNthCalledWith(1, 'insurance', 'co1', 'POL-1', expect.objectContaining({ insurer: '새보험' }));
    expect(mocks.store.save).toHaveBeenCalledWith('atomic_event', 'co1', [expect.objectContaining({ source: 'ocr', eventType: 'insurance.recorded' })]);
    expect(mocks.store.update).toHaveBeenNthCalledWith(2, 'vehicle', 'co1', '12가3456', {
      insuranceExpiryDate: '2027-01-01', insuranceCompany: '새보험', insurancePolicyNo: 'POL-1',
    });
  });

  it('계좌 수정은 분류 반복 때 자동대사를 재실행하지 않는다', async () => {
    await commitUpdate({
      entity: 'bank_tx', sessionCompanyId: 'co1',
      rec: { _key: 'TX-1', companyId: 'co1', txDate: '2026-08-03', amount: 100_000 },
      key: 'TX-1', patch: { category: '대여료' },
    });
    expect(mocks.autoSettle).not.toHaveBeenCalled();
    expect(mocks.store.save).toHaveBeenCalledWith('atomic_event', 'co1', expect.any(Array));
  });

  it('계좌 신규 저장은 정규화·원자 사건·자동대사를 한 번씩 실행한다', async () => {
    await commitSave({
      entity: 'bank_tx', sessionCompanyId: 'co1',
      records: [{ _key: 'TX-2', companyId: 'co1', plate: ' 12가 3456 ', txDate: '2026-08-03', amount: 200_000 }],
      source: 'upload',
    });
    expect(mocks.store.save).toHaveBeenNthCalledWith(1, 'bank_tx', 'co1', [expect.objectContaining({ plate: '12가3456' })]);
    expect(mocks.store.save).toHaveBeenNthCalledWith(2, 'atomic_event', 'co1', [expect.objectContaining({ source: 'upload' })]);
    expect(mocks.autoSettle).toHaveBeenCalledTimes(1);
  });
});
