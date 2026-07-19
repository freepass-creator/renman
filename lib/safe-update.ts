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
