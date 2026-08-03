'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CashRow } from '@/lib/finance/cash-ledger';
import { calculateCashDaily, cashDailyCloseSnapshotMatches, validateCashDailyCloseInput } from '@/lib/finance/cash-daily';
import { getStore } from '@/lib/store';
import { buildAtomicEvent } from '@/lib/domain/atomic-event';
import { ALL_COMPANIES } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { Btn, Input, C } from '@/components/ui';
import type { EntityRecord } from '@/lib/intake/entities';

export function CashDailyClose({ rows, date, companyId, actor }: {
  rows: CashRow[]; date: string; companyId: string; actor: string;
}) {
  const [opening, setOpening] = useState('');
  const [actual, setActual] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [existing, setExisting] = useState<EntityRecord | null>(null);
  const [existingLoading, setExistingLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const daily = useMemo(() => calculateCashDaily(
    rows, date, Number(opening) || 0, actual === '' ? undefined : Number(actual),
  ), [rows, date, opening, actual]);
  const issues = validateCashDailyCloseInput(daily, { openingProvided: opening !== '' });
  const closedUnchanged = !!existing
    && /closed|corrected/.test(String(existing.status || ''))
    && cashDailyCloseSnapshotMatches(existing, daily);
  const correcting = !!existing && !closedUnchanged;

  useEffect(() => {
    let live = true;
    setExisting(null);
    setOpening('');
    setActual('');
    setCorrectionReason('');
    if (companyId === ALL_COMPANIES) return () => { live = false; };
    setExistingLoading(true);
    const key = `cash-daily:${date}`;
    void getStore().get('cash_daily', companyId, key)
      .then((record) => {
        if (!live) return;
        setExisting(record);
        if (record) {
          setOpening(String(record.opening ?? ''));
          setActual(String(record.actualClosing ?? ''));
        }
      })
      .catch(() => { if (live) toast(`${date} 기존 마감 조회에 실패했습니다.`, 'error'); })
      .finally(() => { if (live) setExistingLoading(false); });
    return () => { live = false; };
  }, [companyId, date]);

  async function save() {
    if (busyRef.current) return;
    if (companyId === ALL_COMPANIES) { toast('자금일보를 마감할 회사를 먼저 선택하세요.', 'error'); return; }
    if (closedUnchanged) { toast(`${date} 자금일보는 이미 마감되었습니다.`, 'info'); return; }
    if (correcting && !correctionReason.trim()) { toast('정정 사유를 입력하세요.', 'error'); return; }
    if (issues.length) { toast(issues.join(' '), 'error'); return; }
    busyRef.current = true;
    setBusy(true);
    try {
      const key = `cash-daily:${date}`;
      const current = existing ?? await getStore().get('cash_daily', companyId, key);
      if (!existing && current) {
        setExisting(current);
        setOpening(String(current.opening ?? ''));
        setActual(String(current.actualClosing ?? ''));
        toast(`${date} 자금일보가 다른 작업에서 이미 마감되었습니다. 내용을 다시 확인하세요.`, 'error');
        return;
      }
      const now = new Date().toISOString();
      const record = {
        ...daily,
        id: key,
        _key: key,
        status: current ? 'corrected' : 'closed',
        closedAt: current?.closedAt || now,
        closedBy: current?.closedBy || actor,
        ...(current ? {
          correctedAt: now,
          correctedBy: actor,
          correctionReason: correctionReason.trim(),
        } : {}),
      };
      if (current) await getStore().update('cash_daily', companyId, key, record);
      else await getStore().save('cash_daily', companyId, [record]);
      await getStore().save('atomic_event', companyId, [
        buildAtomicEvent({ entityType: 'cash_daily', companyId, record, source: 'manual', status: 'posted' }),
      ]);
      setExisting(record);
      setCorrectionReason('');
      toast(`${date} 자금일보를 ${current ? '정정 마감' : '마감'}했습니다.`, 'success');
    } catch (e) { toast((e as Error).message, 'error'); } finally { busyRef.current = false; setBusy(false); }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 10px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card }}>
      <b style={{ fontSize: 12.5 }}>{date} 일마감</b>
      <Input size="sm" inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/[^\d-]/g, ''))} placeholder="기초잔액" style={{ width: 112 }} />
      <span style={{ fontSize: 12, color: C.mute }}>입금 {daily.inflow.toLocaleString()} · 출금 {daily.outflow.toLocaleString()} · 예상 {daily.expectedClosing.toLocaleString()}</span>
      <Input size="sm" inputMode="numeric" value={actual} onChange={(e) => setActual(e.target.value.replace(/[^\d-]/g, ''))} placeholder="실제잔액" style={{ width: 112 }} />
      {correcting ? (
        <Input size="sm" value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} placeholder="정정 사유" style={{ width: 160 }} />
      ) : null}
      <span style={{ fontSize: 12, color: closedUnchanged ? C.ok : issues.length || correcting ? C.warn : C.ok }}>
        {existingLoading ? '마감 확인 중…' : closedUnchanged ? '마감 완료' : correcting ? '정정 확인 필요' : issues.length ? `확인 ${issues.length}건` : '마감 가능'}
      </span>
      <Btn size="sm" onClick={() => void save()} disabled={busy || existingLoading || closedUnchanged || (correcting && !correctionReason.trim())}>
        {busy ? '처리 중…' : correcting ? '정정 마감' : closedUnchanged ? '마감 완료' : '일마감'}
      </Btn>
    </div>
  );
}
