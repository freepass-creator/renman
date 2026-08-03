'use client';
/**
 * 자금 원장(bank_tx+card_tx) 로드 SSOT — finance·vat·pnl이 공유.
 *   soft-load: listsCached면 스피너 생략(탭 전환 깜빡임 방지).
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import { cachedListValues, getStore, listErrorFor, listsCached, subscribeListErrors } from './store';
import { useReloadOnSaved } from './use-reload-on-saved';
import { type EntityRecord } from './intake/entities';

const CASH_KEYS = ['bank_tx', 'card_tx'] as const;

export function useCashLedgerLists() {
  const { companyId } = useSession();
  const initial = cachedListValues(CASH_KEYS, companyId);
  const [bank, setBank] = useState<EntityRecord[]>(() => initial?.[0] ?? []);
  const [card, setCard] = useState<EntityRecord[]>(() => initial?.[1] ?? []);
  const [loading, setLoading] = useState(() => initial == null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((silent = false) => {
    const values = cachedListValues(CASH_KEYS, companyId);
    const warm = listsCached(CASH_KEYS, companyId);
    if (values) {
      setBank(values[0]);
      setCard(values[1]);
      setLoading(false);
    } else if (!silent && !warm) setLoading(true);
    Promise.all([getStore().list('bank_tx', companyId), getStore().list('card_tx', companyId)])
      // store.list는 실패해도 빈 배열로 resolve → 실패 사실은 레지스트리에서 확인(거짓 안심 방지).
      .then(([b, c]) => { setBank(b); setCard(c); setError(listErrorFor(CASH_KEYS, companyId)); setLoading(false); })
      .catch((e) => { setError((e as Error).message || '조회 실패'); setLoading(false); });
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));
  useEffect(() => subscribeListErrors(() => setError(listErrorFor(CASH_KEYS, companyId))), [companyId]);

  return { bank, card, loading, error, reload: load };
}
