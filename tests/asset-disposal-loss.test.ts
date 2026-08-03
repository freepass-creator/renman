/**
 * 처분손익 — 말소·폐차 차량의 장부가가 «조용히 사라지지» 않는지.
 *
 * 교차검수에서 확정된 회계 결함: 처분 차량은 자산 총계에서 빠지는데,
 * 매각대금이 없으면(말소·폐차) disposalGainLoss 가 undefined 였고 합계가 그것을 0 으로 더했다.
 * → 자기자본만 줄고 손익계산서에는 흔적이 없다. 회계적으로 유형자산처분손실로 잡아야 한다.
 *
 * 「매각인데 매각가 미입력」은 다르다 — 입력 누락이므로 손실로 단정하지 않고 «불완전»으로 센다.
 */
import { describe, it, expect } from 'vitest';
import { computeAssetLedgerEntry, summarizeLedger } from '@/lib/payments/asset-ledger';
import type { Vehicle } from '@/lib/payments/types';

const ASOF = '2026-08-03';
/** 취득 1,000만 · 5년 정액 · 잔존 10% → 정확한 장부가는 엔진이 계산한다. */
const V = (extra: Partial<Vehicle>): Vehicle => ({
  id: 'v1', plate: '123가4567', model: '그랜저', company: 'switchplan' as Vehicle['company'],
  status: '운행' as Vehicle['status'], createdAt: '2024-01-01',
  purchasePrice: 10_000_000, purchasedDate: '2024-01-01',
  ...extra,
} as Vehicle);

describe('말소·폐차 — 장부가 전액이 손실로 잡힌다', () => {
  it('★말소: 매각대금이 없으면 −장부가가 처분손익이다', () => {
    const e = computeAssetLedgerEntry(V({ status: '말소' as Vehicle['status'], saleDate: '2026-06-30' }), ASOF);
    expect(e.disposed).toBe(true);
    expect(e.scrapped).toBe(true);
    expect(e.disposalGainLoss).toBeDefined();
    expect(e.disposalGainLoss).toBe(-e.bookValue);
    expect(e.disposalGainLoss).toBeLessThan(0);
    expect(e.salePriceMissing).toBeFalsy();
  });

  it('폐차도 같다', () => {
    const e = computeAssetLedgerEntry(V({ status: '폐차' as Vehicle['status'], saleDate: '2026-06-30' }), ASOF);
    expect(e.scrapped).toBe(true);
    expect(e.disposalGainLoss).toBe(-e.bookValue);
  });

  it('합계에 손실이 실제로 반영된다 — 이전에는 0 이었다', () => {
    const e = computeAssetLedgerEntry(V({ status: '말소' as Vehicle['status'], saleDate: '2026-06-30' }), ASOF);
    const s = summarizeLedger([e]);
    expect(s.disposedCount).toBe(1);
    expect(s.totalDisposalGainLoss).toBe(-e.bookValue);
    expect(s.totalDisposalGainLoss).toBeLessThan(0);
    // 처분 차량이므로 자산 총계에서는 빠진다 — 그 장부가가 손실로 나타나야 짝이 맞는다.
    expect(s.totalBookValue).toBe(0);
    expect(s.salePriceMissingCount).toBe(0);
  });
});

describe('매각 — 매각가가 있으면 손익, 없으면 «불완전»', () => {
  it('매각가가 있으면 매각가 − 장부가', () => {
    const e = computeAssetLedgerEntry(
      V({ status: '매각' as Vehicle['status'], saleDate: '2026-06-30', salePrice: 7_000_000 }), ASOF,
    );
    expect(e.disposalGainLoss).toBe(7_000_000 - e.bookValue);
    expect(e.scrapped).toBeFalsy();
    expect(e.salePriceMissing).toBeFalsy();
  });

  it('★매각인데 매각가가 비어 있으면 손실로 단정하지 않는다(입력 누락)', () => {
    const e = computeAssetLedgerEntry(V({ status: '매각' as Vehicle['status'], saleDate: '2026-06-30' }), ASOF);
    expect(e.salePriceMissing).toBe(true);
    expect(e.scrapped).toBeFalsy();
    expect(e.disposalGainLoss).toBeUndefined();
  });

  it('매각가 미입력은 합계에 0 으로 섞이지 않고 건수로 드러난다', () => {
    const missing = computeAssetLedgerEntry(V({ status: '매각' as Vehicle['status'], saleDate: '2026-06-30' }), ASOF);
    const sold = computeAssetLedgerEntry(
      V({ id: 'v2', status: '매각' as Vehicle['status'], saleDate: '2026-06-30', salePrice: 7_000_000 }), ASOF,
    );
    const s = summarizeLedger([missing, sold]);
    expect(s.disposedCount).toBe(2);
    expect(s.salePriceMissingCount).toBe(1);
    // 미입력 건은 손익에 섞이지 않는다 — 매각된 1건만 반영
    expect(s.totalDisposalGainLoss).toBe(sold.disposalGainLoss);
  });

  it('매각가 0원은 «미입력»이 아니다 — 0원 매각도 사실이다', () => {
    const e = computeAssetLedgerEntry(
      V({ status: '매각' as Vehicle['status'], saleDate: '2026-06-30', salePrice: 0 }), ASOF,
    );
    expect(e.salePriceMissing).toBeFalsy();
    expect(e.disposalGainLoss).toBe(-e.bookValue);
  });
});

describe('보유 차량은 처분손익이 없다', () => {
  it('운행 중이면 disposed=false · 손익 없음', () => {
    const e = computeAssetLedgerEntry(V({}), ASOF);
    expect(e.disposed).toBe(false);
    expect(e.disposalGainLoss).toBeUndefined();
    expect(e.scrapped).toBeFalsy();
    const s = summarizeLedger([e]);
    expect(s.activeCount).toBe(1);
    expect(s.totalBookValue).toBe(e.bookValue);
    expect(s.totalDisposalGainLoss).toBe(0);
  });
});
