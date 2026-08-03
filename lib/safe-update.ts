/**
 * Update mutator 안전 진입 — v5 safe-update 학습.
 *   LockConflict · PeriodClosed · 일반 에러 → toast, null 반환.
 */
'use client';

import { LockConflictError } from '@/lib/lock-conflict';
import { PeriodClosedError } from '@/lib/finance/period-lock';
import { toast } from '@/lib/toast';

export type SafeUpdateOptions = {
  onConflict?: () => void;
  conflictMessage?: string;
  errorPrefix?: string;
};

/**
 * ★값을 돌려주는 작업에만 쓴다. 성공/실패를 «반환값이 null인가»로 판정하기 때문이다.
 *
 * 콜백이 값을 돌려주지 않으면(`async () => { await commitAll(...) }`) 성공 시에도 `undefined`가
 * 반환되고 `undefined != null`은 false다 → **성공이 실패로 판정된다.** 타입도 `void | null`이라
 * tsc가 잡지 못한다(실제로 7개 호출부가 이 함수로 조용히 망가져 있었다).
 * 값이 없는 작업은 반드시 아래 {@link safeRun}을 쓸 것.
 */
export async function safeUpdate<T>(
  fn: () => Promise<T>,
  opts: SafeUpdateOptions = {},
): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof LockConflictError) {
      toast(opts.conflictMessage ?? '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.', 'error');
      opts.onConflict?.();
      return null;
    }
    if (e instanceof PeriodClosedError) {
      toast(e.message, 'error');
      return null;
    }
    toast(`${opts.errorPrefix ?? '저장 실패'} — ${(e as Error).message || String(e)}`, 'error');
    return null;
  }
}

/**
 * 값이 없는 쓰기 작업의 안전 진입 — **성공/실패를 boolean 으로 명확히 돌려준다.**
 *
 * 왜 별도 함수인가: safeUpdate 는 «반환값 null 여부»로 성공을 판정하므로 void 콜백에서 무조건
 * 실패로 읽힌다. 그 결과 이 저장소에서 실제로 다음이 동시에 일어났다 —
 *   · 자금일보 일괄 적용: 누적 방어(appliedPayments)가 작동하지 않아 같은 계약에 입금 2건을 적용하면
 *     앞 수납이 배열째 덮여 **사라졌다**(미수 과대). 토스트는 「적용 0건」이라 조작자는 아무것도
 *     반영 안 된 줄 알았다.
 *   · CMS 집금정산: 첫 patch 만 쓰고 break → 부분 적용 고아.
 *   · 매칭 해제: 성공해도 조기 반환해 «해제» 토스트가 절대 뜨지 않았다.
 *   · classifyTx: 분류가 저장돼도 항상 실패로 보고.
 *
 * 사용법 — 논리적 실패(권한·전제 미충족)는 콜백에서 `return false`, 성공은 그냥 끝내거나 `return true`.
 * 예외는 여기서 잡아 toast 하고 false 를 돌려준다.
 */
export async function safeRun(
  fn: () => Promise<boolean | void>,
  opts: SafeUpdateOptions = {},
): Promise<boolean> {
  try {
    const r = await fn();
    return r !== false;   // void·true = 성공 · false = 콜백이 스스로 판단한 실패
  } catch (e) {
    if (e instanceof LockConflictError) {
      toast(opts.conflictMessage ?? '다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요.', 'error');
      opts.onConflict?.();
      return false;
    }
    if (e instanceof PeriodClosedError) {
      toast(e.message, 'error');
      return false;
    }
    toast(`${opts.errorPrefix ?? '저장 실패'} — ${(e as Error).message || String(e)}`, 'error');
    return false;
  }
}
