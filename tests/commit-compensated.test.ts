/**
 * 되돌리기 붙은 다중 커밋(P0-4) — 반쪽 상태 방지.
 *
 * commitAll 은 트랜잭션이 아니다. 입금매칭은 bank_tx 와 계약을 함께 고치는데,
 * 두 번째에서 실패하면 「입금은 매칭됐는데 수납은 안 들어간」 반쪽이 남는다.
 * 여기서 고정하는 것: 실패 시 **역순 되돌리기** · 되돌리기 실패는 삼키지 않기 ·
 * undo 없는 op 은 건드리지 않기.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const update = vi.fn();
const list = vi.fn(async () => []);

vi.mock('@/lib/store', () => ({
  getStore: () => ({ update, list, save: vi.fn(), remove: vi.fn() }),
}));
vi.mock('@/lib/intake', () => ({
  saveIntake: vi.fn(async () => ({ save: { saved: 0 }, records: [], sideEffects: [] })),
  normalizeRecord: (r: unknown) => r,
  runIntakePostWrite: vi.fn(async () => []),
}));

const { commitAllCompensated } = await import('@/lib/commit');

const CO = 'switchplan';
const tx = { _key: 'tx1', companyId: CO };
const contract = { _key: 'c1', companyId: CO };

function ops(failSecond: boolean) {
  return [
    {
      entity: 'bank_tx', sessionCompanyId: CO, rec: tx, key: 'tx1',
      patch: { matchedContractId: 'c1' },
      undo: { matchedContractId: '', matchedAt: '', matchedKind: '' },
    },
    {
      entity: 'contract', sessionCompanyId: CO, rec: contract, key: 'c1',
      patch: { _payments: [{ seq: 1 }] },
      ...(failSecond ? {} : {}),
    },
  ];
}

describe('commitAllCompensated', () => {
  beforeEach(() => { update.mockReset(); update.mockResolvedValue(undefined); });

  it('전부 성공하면 되돌리지 않는다', async () => {
    await commitAllCompensated(ops(false));
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls.map((c) => c[0])).toEqual(['bank_tx', 'contract']);
  });

  it('두 번째가 실패하면 첫 번째를 되돌린다 — 반쪽이 남지 않는다', async () => {
    update.mockImplementation(async (entity: string) => {
      if (entity === 'contract') throw new Error('쓰기 실패');
    });
    await expect(commitAllCompensated(ops(true))).rejects.toThrow('쓰기 실패');
    // bank_tx 쓰기 → contract 실패 → bank_tx 되돌리기
    const seq = update.mock.calls.map((c) => [c[0], c[3]]);
    expect(seq).toHaveLength(3);
    expect(seq[2][0]).toBe('bank_tx');
    expect(seq[2][1]).toMatchObject({ matchedContractId: '', matchedKind: '' });
  });

  it('되돌리기는 역순이다', async () => {
    const three = [
      { entity: 'a', sessionCompanyId: CO, rec: { _key: 'a', companyId: CO }, key: 'a', patch: { v: 1 }, undo: { v: 0 } },
      { entity: 'b', sessionCompanyId: CO, rec: { _key: 'b', companyId: CO }, key: 'b', patch: { v: 1 }, undo: { v: 0 } },
      { entity: 'c', sessionCompanyId: CO, rec: { _key: 'c', companyId: CO }, key: 'c', patch: { v: 1 } },
    ];
    update.mockImplementation(async (entity: string) => {
      if (entity === 'c') throw new Error('실패');
    });
    await expect(commitAllCompensated(three)).rejects.toThrow('실패');
    const order = update.mock.calls.map((c) => c[0]);
    expect(order).toEqual(['a', 'b', 'c', 'b', 'a']);   // ← 역순
  });

  it('undo 가 없는 op 은 되돌리지 않는다', async () => {
    const noUndo = [
      { entity: 'a', sessionCompanyId: CO, rec: { _key: 'a', companyId: CO }, key: 'a', patch: { v: 1 } },
      { entity: 'b', sessionCompanyId: CO, rec: { _key: 'b', companyId: CO }, key: 'b', patch: { v: 1 } },
    ];
    update.mockImplementation(async (entity: string) => {
      if (entity === 'b') throw new Error('실패');
    });
    await expect(commitAllCompensated(noUndo)).rejects.toThrow('실패');
    expect(update).toHaveBeenCalledTimes(2);   // 되돌리기 없음
  });

  it('되돌리기까지 실패하면 삼키지 않고 반쪽이 남았다고 알린다', async () => {
    let first = true;
    update.mockImplementation(async (entity: string) => {
      if (entity === 'contract') throw new Error('쓰기 실패');
      if (entity === 'bank_tx' && !first) throw new Error('되돌리기 실패');
      first = false;
    });
    await expect(commitAllCompensated(ops(true))).rejects.toThrow(/반쪽 상태가 남았습니다/);
  });
});

describe('입금매칭이 되돌리기를 쓴다', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');

  it('자금 페이지의 짝 쓰기에 undo 가 붙어 있다', () => {
    const src = readFileSync(join(process.cwd(), 'app/payments/page.tsx'), 'utf8');
    expect(src).toContain('commitAllCompensated');
    const undo = src.match(/undo: \{([^}]*)\}/)?.[1] ?? '';
    expect(undo, 'undo 블록을 못 찾았다').not.toBe('');
    expect(undo).toContain("matchedContractId: ''");
    // 되돌리기 = 해제와 같은 규칙 — 귀속만 되돌리고 1차 분류(계정과목)는 보존한다.
    expect(undo).not.toContain('category');
    expect(undo).not.toContain('subject');
  });
});
