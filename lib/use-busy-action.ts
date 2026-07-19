/**
 * 멱등성 — 더블탭·중복 실행 차단. v5 use-busy-action 이식 (W1 보강).
 */
'use client';

import { useRef, useState, useCallback } from 'react';

export type BusyAction = readonly [
  busy: boolean,
  run: <T>(fn: () => Promise<T>) => Promise<T | void>,
];

export function useBusyAction(): BusyAction {
  const [busy, setBusy] = useState(false);
  const inflight = useRef(false);

  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | void> => {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, run] as const;
}
