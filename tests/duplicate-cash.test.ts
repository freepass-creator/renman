/**
 * 현장수납 ↔ 계좌입금 중복 차감 탐지 — 미수 유실 계열 가드.
 * 같은 돈이 «현금 수납 기록»과 «통장 입금 매칭»으로 두 번 차감되는 것을 발생 시점에 잡아낸다.
 */
import { describe, test, expect } from 'vitest';
import { findDuplicateCashPayment } from '@/lib/payments/duplicate-cash';

const tx = (txDate: string, amount: number) => ({ txDate, amount });

describe('중복 입금 의심 — 단건 정확일치', () => {
  test('같은 금액의 현금 수납이 ±3일 안에 있으면 의심', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-20', amount: 500_000, source: '현금' }] };
    const hit = findDuplicateCashPayment(c, tx('2026-07-22', 500_000));
    expect(hit?.kind).toBe('단건');
    expect(hit?.total).toBe(500_000);
    expect(hit?.message).toContain('두 번 차감');
  });

  test('창을 벗어나면(4일) 의심하지 않는다', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-20', amount: 500_000, source: '현금' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-24', 500_000))).toBeNull();
  });

  test('금액이 다르면 의심하지 않는다', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-21', amount: 400_000, source: '현금' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
  });
});

describe('중복 입금 의심 — 창 합계 일치(분할 수납을 한 번에 입금)', () => {
  test('현금 200,000 + 카드 300,000 = 입금 500,000 → 의심', () => {
    const c = {
      _payments: [
        { seq: 1, date: '2026-07-21', amount: 200_000, source: '현금' },
        { seq: 2, date: '2026-07-22', amount: 300_000, source: '카드' },
      ],
    };
    const hit = findDuplicateCashPayment(c, tx('2026-07-22', 500_000));
    expect(hit?.kind).toBe('합계');
    expect(hit?.payments).toHaveLength(2);
  });

  test('합계가 다르면 의심하지 않는다', () => {
    const c = {
      _payments: [
        { seq: 1, date: '2026-07-21', amount: 200_000, source: '현금' },
        { seq: 2, date: '2026-07-22', amount: 200_000, source: '카드' },
      ],
    };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
  });
});

describe('통장 거래에 «이미 짝지어진» 수납만 제외 — 판정은 txId 하나로', () => {
  test('txId가 붙은 수납(실제 통장 매칭분)은 무시', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '계좌', txId: 'tx-1' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
    const card = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '카드', cardTxId: 'ctx-1' }] };
    expect(findDuplicateCashPayment(card, tx('2026-07-22', 500_000))).toBeNull();
  });

  test("★txId 없는 source '계좌'는 반드시 대상이다 — 수납기록 폼의 기본 수단이 '계좌'이므로", () => {
    // 손으로 «계좌입금 받았다»고 적어둔 것 → 며칠 뒤 통장 거래를 매칭하면 이중차감.
    // 이것이 가장 흔한 경로이고, source로 판정했을 때 가드가 완전히 죽었던 지점이다.
    const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '계좌' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))?.kind).toBe('단건');
  });

  test('현금·수동·카드·CMS 모두 txId가 없으면 대상이다', () => {
    for (const source of ['현금', '수동', '카드', 'CMS']) {
      const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source }] };
      expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))?.kind).toBe('단건');
    }
  });
});

describe('시스템이 만든 수납(synthetic)은 대상이 아니다 — 정상 입금을 막지 않기', () => {
  test("보증금 충당·스냅샷 자동정리(source '정산')는 무시", () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '정산', synthetic: true }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
    const noFlag = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '정산' }] };
    expect(findDuplicateCashPayment(noFlag, tx('2026-07-22', 500_000))).toBeNull();
  });

  test('kind가 붙은 청구·충당 기록(deposit-offset 등)은 무시', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '수동', kind: 'deposit-offset' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
  });

  test('synthetic 이 섞여 있으면 창 합계 계산에서도 빠진다', () => {
    const c = {
      _payments: [
        { seq: 1, date: '2026-07-21', amount: 200_000, source: '현금' },
        { seq: 2, date: '2026-07-21', amount: 300_000, source: '정산', synthetic: true },
      ],
    };
    // 현금 200,000 만 남으므로 500,000 입금과는 합계가 맞지 않는다 → 오탐 없음
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 200_000))?.kind).toBe('단건');
  });
});

describe('경계·불량 입력', () => {
  test('수납 없음·계약 없음·금액 0·날짜 없음 → null', () => {
    expect(findDuplicateCashPayment(null, tx('2026-07-22', 500_000))).toBeNull();
    expect(findDuplicateCashPayment({}, tx('2026-07-22', 500_000))).toBeNull();
    expect(findDuplicateCashPayment({ _payments: [] }, tx('2026-07-22', 500_000))).toBeNull();
    const c = { _payments: [{ seq: 1, date: '2026-07-22', amount: 500_000, source: '현금' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 0))).toBeNull();
    expect(findDuplicateCashPayment(c, tx('', 500_000))).toBeNull();
  });

  test('수납 날짜가 깨져 있으면 그 건은 창에서 제외', () => {
    const c = { _payments: [{ seq: 1, date: '알수없음', amount: 500_000, source: '현금' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
  });

  test('windowDays를 넓히면 잡힌다(정책 조정 가능)', () => {
    const c = { _payments: [{ seq: 1, date: '2026-07-15', amount: 500_000, source: '현금' }] };
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000))).toBeNull();
    expect(findDuplicateCashPayment(c, tx('2026-07-22', 500_000), { windowDays: 7 })?.kind).toBe('단건');
  });
});
