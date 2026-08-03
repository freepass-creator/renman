/**
 * safeUpdate / safeRun 계약 — «성공을 실패로 읽던» 출시차단 결함의 회귀 방지.
 *
 * 교차검수에서 확정: safeUpdate 는 «반환값이 null 인가»로 성공을 판정한다.
 * 그런데 자금 경로 콜백은 전부 `async () => { await commitAll(...) }` (값 없음)이었다
 * → 성공 시 undefined → `undefined != null` === false → **성공이 실패로 판정**.
 * 타입도 `void | null` 이라 tsc 가 못 잡았고 게이트 350건도 이 경로를 덮지 않았다.
 *
 * 실제 피해:
 *   · 자금일보 일괄 적용 — 누적 방어(appliedPayments)가 갱신되지 않아 같은 계약에 입금 2건을
 *     적용하면 앞 수납이 배열째 덮여 사라졌다(미수 과대). 토스트는 「적용 0건」.
 *   · CMS 집금정산 — 첫 patch 만 쓰고 break → 부분 적용 고아.
 *   · 매칭 해제 — 성공해도 조기 반환해 «해제» 토스트가 안 떴다.
 *   · classifyTx — 저장돼도 항상 실패 보고.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

const { safeUpdate, safeRun } = await import('@/lib/safe-update');
const { LockConflictError } = await import('@/lib/lock-conflict');

describe('safeRun — 값이 없는 쓰기의 성공/실패를 boolean 으로', () => {
  it('★값을 돌려주지 않는 콜백도 성공이면 true (safeUpdate 는 여기서 undefined 였다)', async () => {
    const ok = await safeRun(async () => { /* commitAll 처럼 값 없음 */ });
    expect(ok).toBe(true);
  });

  it('true 를 돌려줘도 성공', async () => {
    expect(await safeRun(async () => true)).toBe(true);
  });

  it('콜백이 스스로 false 를 돌려주면 실패 — 권한·전제 미충족 표현용', async () => {
    expect(await safeRun(async () => false)).toBe(false);
  });

  it('예외는 잡아서 false — 호출부가 성공 토스트를 띄우지 않게', async () => {
    expect(await safeRun(async () => { throw new Error('boom'); })).toBe(false);
  });

  it('LockConflict 는 onConflict 를 부르고 false', async () => {
    const onConflict = vi.fn();
    const ok = await safeRun(async () => { throw new LockConflictError('충돌'); }, { onConflict });
    expect(ok).toBe(false);
    expect(onConflict).toHaveBeenCalledOnce();
  });
});

describe('safeUpdate — 값을 돌려주는 작업 전용', () => {
  it('값을 그대로 돌려준다', async () => {
    expect(await safeUpdate(async () => ({ id: 'x' }))).toEqual({ id: 'x' });
  });

  it('실패는 null', async () => {
    expect(await safeUpdate(async () => { throw new Error('boom'); })).toBeNull();
  });

  it('★void 콜백에서는 성공도 undefined 다 — 그래서 성공 판정에 쓸 수 없다', async () => {
    const r = await safeUpdate(async () => { /* 값 없음 */ });
    expect(r).toBeUndefined();
    // 이 저장소가 쓰던 판정식이 실제로 거짓이 된다는 사실을 박아둔다.
    expect(r != null).toBe(false);
    // 같은 상황에서 safeRun 은 올바르게 성공을 보고한다.
    expect(await safeRun(async () => { /* 값 없음 */ })).toBe(true);
  });
});

describe('누적 방어 — 같은 계약에 입금 2건을 적용해도 앞 수납이 살아있다', () => {
  /** app/payments/page.tsx apply() 의 누적 규약을 재현. 성공 판정이 틀리면 앞 수납이 사라진다. */
  async function applyTwo(judge: (ok: boolean) => boolean) {
    const loaded: Array<Record<string, unknown>> = [];   // 페이지 로드 시점 _payments 스냅샷
    const applied = new Map<string, Array<Record<string, unknown>>>();
    const written: Array<Array<Record<string, unknown>>> = [];
    for (const [i, amount] of [500_000, 500_000].entries()) {
      const existing = applied.get('C1') ?? loaded;
      const next = [...existing, { seq: i + 1, amount, txId: `t${i + 1}` }];
      const ok = await safeRun(async () => { written.push(next); });
      if (judge(ok)) applied.set('C1', next);
    }
    return written[written.length - 1];
  }

  it('safeRun + boolean 판정 → 두 수납이 누적된다', async () => {
    const last = await applyTwo((ok) => ok);
    expect(last).toHaveLength(2);
    expect(last.map((p) => p.txId)).toEqual(['t1', 't2']);
  });

  it('★옛 판정식(ok != null)을 쓰면 앞 수납이 사라진다 — 이게 실제 사고였다', async () => {
    // safeRun 은 boolean 을 주므로 `!= null` 은 항상 true 지만,
    // safeUpdate 시절의 undefined 를 흉내내면 누적이 끊긴다.
    const last = await applyTwo(() => (undefined as unknown) != null);
    expect(last).toHaveLength(1);
    expect(last[0].txId).toBe('t2');   // t1(50만) 소멸
  });
});
