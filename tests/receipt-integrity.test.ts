/**
 * 수납이력 — 마이그레이션 이력 표식과 반영 정합성(P0-3).
 *
 * 고친 두 가지를 각각 못박는다:
 *  ① 오판정 — carry 에 이미 반영된 과거 수납이 «미매칭 할 일»로 뜨던 것
 *  ② 진짜 유실 — 동일내용 거래가 자연키 dedup 으로 조용히 접히던 것
 */
import { describe, expect, it } from 'vitest';
import { buildSwitchplanPack } from '@/lib/migrate/switchplan';
import { normalizeMigratedBankTx, baselineDateOf } from '@/lib/migrate/acceptance-normalization';
import { auditReceiptIntegrity, assertReceiptIntegrity } from '@/lib/payments/receipt-integrity';
import { moneyStatusOf } from '@/lib/finance/money-status';
import { ENTITIES } from '@/lib/intake/entities';
import type { EntityRecord } from '@/lib/intake/entities';

const rent = (over: Partial<EntityRecord> = {}): EntityRecord => ({
  account: '신한 6616', txDate: '2026-05-10', amount: 390_000, counterparty: '고객175',
  memo: '대여료 86버1166 2026-05', category: '대여료수입', ...over,
} as EntityRecord);

/** store.naturalKey 재현 — idFrom(txKey) 우선, 없으면 keyFields join. */
const keyOf = (t: EntityRecord): string =>
  String(t.txKey || ENTITIES.bank_tx.keyFields!.map((k) => String((t as Record<string, unknown>)[k] ?? '')).filter(Boolean).join('|'));

const saveSim = (rows: EntityRecord[]): EntityRecord[] => {
  const seen = new Map<string, EntityRecord>();
  for (const t of rows) { const k = keyOf(t); if (!seen.has(k)) seen.set(k, { ...t, _key: k }); }
  return [...seen.values()];
};

describe('기준일 = 팩의 최근 거래일', () => {
  it('가장 늦은 거래일을 고른다', () => {
    expect(baselineDateOf([rent({ txDate: '2026-01-02' }), rent({ txDate: '2026-06-04' })])).toBe('2026-06-04');
  });
  it('거래가 없으면 빈 문자열', () => {
    expect(baselineDateOf([])).toBe('');
  });
});

describe('마이그레이션 이력 표식', () => {
  it('기준일 이전 계약성 입금에 history 를 새긴다', () => {
    const { rows, report } = normalizeMigratedBankTx([rent({ txDate: '2026-01-10' })], '2026-06-04');
    expect(rows[0].matchedKind).toBe('history');
    expect(rows[0].historyAsOf).toBe('2026-06-04');
    expect(report.history).toBe(1);
    expect(report.pending).toBe(0);
  });

  it('기준일 이후 입금은 실제 일감 — 표식하지 않는다', () => {
    const { rows, report } = normalizeMigratedBankTx([rent({ txDate: '2026-07-01' })], '2026-06-04');
    expect(rows[0].matchedKind).toBeUndefined();
    expect(report.pending).toBe(1);
  });

  it('이미 계약에 매칭된 건은 건드리지 않는다 — 실 매칭이 이력보다 강하다', () => {
    const { rows } = normalizeMigratedBankTx([rent({ matchedContractId: 'ctr_1', matchedKind: 'receivable' })], '2026-06-04');
    expect(rows[0].matchedKind).toBe('receivable');
  });

  it('출금·비계약성 입금은 대상이 아니다', () => {
    const { rows } = normalizeMigratedBankTx([
      rent({ amount: 0, withdraw: 500_000, category: '할부금' }),
      rent({ category: '운영자금대출' }),
    ], '2026-06-04');
    expect(rows[0].matchedKind).toBeUndefined();
    expect(rows[1].matchedKind).toBeUndefined();
  });

  it('★동일내용 2건이 저장에서 접히지 않는다 — txKey 로 유실 차단', () => {
    const dup = [rent(), rent()];
    expect(saveSim(dup)).toHaveLength(1);                       // 표식 전: 1건이 사라진다
    expect(saveSim(normalizeMigratedBankTx(dup).rows)).toHaveLength(2);
  });
});

describe('자금상태 — 이력은 할 일이 아니다', () => {
  it('history 는 해당없음', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 390_000, matchedKind: 'history' })).toBe('해당없음');
  });
  it('표식이 없으면 종전대로 미매칭', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 390_000 })).toBe('미매칭');
  });
  it('실제 매칭이 있으면 이력 표식보다 매칭완료가 우선', () => {
    expect(moneyStatusOf({ category: '대여료수입', inAmount: 390_000, matchedKind: 'history', matchedContractId: 'ctr_1' }))
      .toBe('매칭완료');
  });
});

describe('반영 정합성 — fail-closed', () => {
  const source = normalizeMigratedBankTx([rent({ txDate: '2026-01-10' }), rent({ txDate: '2026-02-10' })], '2026-06-04').rows;

  it('전건 적재되면 통과', () => {
    const report = auditReceiptIntegrity({ source, loaded: saveSim(source), baselineDate: '2026-06-04' });
    expect(report.ok).toBe(true);
    expect(report.source.count).toBe(2);
    expect(report.history).toBe(2);
    expect(() => assertReceiptIntegrity(report)).not.toThrow();
  });

  it('한 건이 사라지면 유실로 잡고 승인하지 않는다', () => {
    const report = auditReceiptIntegrity({ source, loaded: saveSim(source).slice(0, 1), baselineDate: '2026-06-04' });
    expect(report.ok).toBe(false);
    expect(report.missingCount).toBe(1);
    expect(report.missingSum).toBe(390_000);
    expect(() => assertReceiptIntegrity(report)).toThrow(/수납이력 정합성 실패/);
  });

  it('수납이 아닌 거래(출금·대출)는 대조 대상이 아니다', () => {
    const mixed = [...source, rent({ amount: 0, withdraw: 1_000, category: '할부금' })];
    const report = auditReceiptIntegrity({ source: mixed, loaded: saveSim(source), baselineDate: '2026-06-04' });
    expect(report.source.count).toBe(2);
    expect(report.ok).toBe(true);
  });
});

describe('★실데이터 회귀 — 스위치플랜 팩', () => {
  const raw = buildSwitchplanPack().bank_tx;
  const { rows, report } = normalizeMigratedBankTx(raw);

  it('적재 직후 「할 일」이 0건 — 종전에는 대여료 입금 1,948건이 미매칭으로 떴다', () => {
    const todo = rows.filter((t) => {
      const s = moneyStatusOf({
        category: t.category, inAmount: Number(t.amount) || 0, outAmount: Number(t.withdraw) || 0,
        matchedContractId: t.matchedContractId, matchedScheduleSeq: t.matchedScheduleSeq, matchedKind: t.matchedKind,
      });
      return s === '미매칭' || s === '미분류' || s === '집금대기' || s === '제안있음';
    });
    expect(report.history).toBe(1948);
    expect(todo).toHaveLength(0);
  });

  it('저장 시 유실 0건 — 종전에는 자연키 충돌로 1건이 조용히 접혔다', () => {
    expect(saveSim(raw).length).toBe(raw.length - 1);   // 표식 전
    expect(saveSim(rows).length).toBe(rows.length);      // 표식 후
  });

  it('원천 ↔ 적재 대조 통과', () => {
    const audit = auditReceiptIntegrity({ source: rows, loaded: saveSim(rows), baselineDate: baselineDateOf(rows) });
    expect(audit.ok).toBe(true);
    expect(audit.loaded.count).toBe(audit.source.count);
    expect(audit.loaded.sum).toBe(audit.source.sum);
  });
});
