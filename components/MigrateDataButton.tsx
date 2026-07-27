'use client';
/**
 * 스위치플랜 실데이터 마이그레이션(반영) 버튼.
 *   reflectCompany('switchplan') — 기존 비우고 frozen/live 팩 적재.
 *   본사 전용. 저장 후 jpk:saved로 원장 자동 갱신.
 */
import { useState } from 'react';
import { Database } from 'lucide-react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { reflectCompany, type ReflectResult } from '@/lib/reflect';
import { companyLabel } from '@/lib/companies';
import { toast } from '@/lib/toast';
import { Btn, LoadingOverlay, useConfirm } from '@/components/ui';

const TARGET = 'switchplan';

export function MigrateDataButton({
  size = 'md',
  label = '스위치플랜 데이터 마이그레이션',
  onDone,
}: {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  onDone?: (result: ReflectResult) => void;
}) {
  const { isOperator } = useSession();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  if (!isOperator) return null;

  async function run() {
    const store = getStore();
    const [vehicles, contracts, bankTx] = await Promise.all([
      store.list('vehicle', TARGET),
      store.list('contract', TARGET),
      store.list('bank_tx', TARGET),
    ]);
    const hasData = vehicles.length + contracts.length + bankTx.length > 0;
    if (hasData && !(await confirm({
      message: `${companyLabel(TARGET)} 기존 데이터를 지우고 최신 실데이터로 다시 넣습니다. 계속할까요?`,
      danger: true,
    }))) return;

    setBusy(true);
    try {
      const result = await reflectCompany(TARGET);
      const p = result.loaded.perEntity;
      toast(
        `마이그레이션 완료 · 차량 ${p.vehicle || 0} · 계약 ${p.contract || 0} · 거래 ${p.bank_tx || 0}`,
        'success',
      );
      onDone?.(result);
    } catch (error) {
      toast(error instanceof Error ? error.message : '마이그레이션 실패', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {busy && <LoadingOverlay label="스위치플랜 데이터 마이그레이션 중…" />}
      <Btn size={size} onClick={run} disabled={busy}>
        <Database size={size === 'sm' ? 14 : 16} /> {label}
      </Btn>
    </>
  );
}
