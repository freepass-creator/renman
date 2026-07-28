'use client';

import { useMemo, useState } from 'react';
import type { CashRow } from '@/lib/finance/cash-ledger';
import { calculateCashDaily, validateCashDailyClose } from '@/lib/finance/cash-daily';
import { getStore } from '@/lib/store';
import { buildAtomicEvent } from '@/lib/domain/atomic-event';
import { ALL_COMPANIES } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { Btn, Input, C } from '@/components/ui';

export function CashDailyClose({ rows, date, companyId, actor }: {
  rows: CashRow[]; date: string; companyId: string; actor: string;
}) {
  const [opening, setOpening] = useState('');
  const [actual, setActual] = useState('');
  const [busy, setBusy] = useState(false);
  const daily = useMemo(() => calculateCashDaily(
    rows, date, Number(opening) || 0, actual === '' ? undefined : Number(actual),
  ), [rows, date, opening, actual]);
  const issues = validateCashDailyClose(daily);

  async function save() {
    if (companyId === ALL_COMPANIES) { toast('자금일보를 마감할 회사를 먼저 선택하세요.', 'error'); return; }
    if (issues.length) { toast(issues.join(' '), 'error'); return; }
    setBusy(true);
    try {
      const key = `cash-daily:${date}`;
      const record = { ...daily, id: key, _key: key, status: 'closed', closedAt: new Date().toISOString(), closedBy: actor };
      const existing = await getStore().get('cash_daily', companyId, key);
      if (existing) await getStore().update('cash_daily', companyId, key, record);
      else await getStore().save('cash_daily', companyId, [record]);
      await getStore().save('atomic_event', companyId, [
        buildAtomicEvent({ entityType: 'cash_daily', companyId, record, source: 'manual', status: 'posted' }),
      ]);
      toast(`${date} 자금일보를 마감했습니다.`, 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card }}>
      <b style={{ fontSize: 12.5 }}>{date} 일마감</b>
      <Input size="sm" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d-]/g, ''))} placeholder="기초잔액" style={{ width: 112 }} />
      <span style={{ fontSize: 12, color: C.mute }}>입금 {daily.inflow.toLocaleString()} · 출금 {daily.outflow.toLocaleString()} · 예상 {daily.expectedClosing.toLocaleString()}</span>
      <Input size="sm" inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^\d-]/g, ''))} placeholder="실제잔액" style={{ width: 112 }} />
      <span style={{ fontSize: 12, color: issues.length ? C.warn : C.ok }}>{issues.length ? `확인 ${issues.length}건` : '마감 가능'}</span>
      <Btn size="sm" onClick={() => void save()} disabled={busy}>{busy ? '마감 중…' : '일마감'}</Btn>
    </div>
  );
}

