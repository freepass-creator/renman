'use client';
/**
 * 자금 원장(bank_tx+card_tx) 로드 SSOT — finance·vat·pnl이 공유.
 *   soft-load: listsCached면 스피너 생략(탭 전환 깜빡임 방지).
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import { getStore, listsCached } from './store';
import { useReloadOnSaved } from './use-reload-on-saved';
import { type EntityRecord } from './intake/entities';

const CASH_KEYS = ['bank_tx', 'card_tx'] as const;

export function useCashLedgerLists() {
  const { companyId } = useSession();
  const [bank, setBank] = useState<EntityRecord[]>([]);
  const [card, setCard] = useState<EntityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    const warm = listsCached(CASH_KEYS, companyId);
    if (!silent && !warm) setLoading(true);
    Promise.all([getStore().list('bank_tx', companyId), getStore().list('card_tx', companyId)])
      .then(([b, c]) => { setBank(b); setCard(c); setLoading(false); })
      .catch(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  return { bank, card, loading, reload: load };
}
