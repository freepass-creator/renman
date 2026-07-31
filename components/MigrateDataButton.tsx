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
import { Btn, LoadingOverlay, useConfirm, usePrompt } from '@/components/ui';

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
  const prompt = usePrompt();
  const [busy, setBusy] = useState(false);

  if (!isOperator) return null;
  // ★프로덕션에서는 버튼 자체를 렌더하지 않는다.
  //   reflectCompany → wipeCompany 가 전 엔티티를 하드삭제하고, 프로덕션에선 live 소스가 403이라
  //   «가명(frozen) 시드»로 대체된다 = 실데이터 전멸. /dev/data는 가드했는데 이 버튼은 운영 원장
  //   3곳(계약·자금·자산)의 빈 상태에 노출돼 있었다(자금은 필터 결과가 비어도 뜸) — QA 적대검증 B2.
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_ALLOW_HARD_WIPE !== '1') return null;

  async function run() {
    const store = getStore();
    const [vehicles, contracts, bankTx] = await Promise.all([
      store.list('vehicle', TARGET),
      store.list('contract', TARGET),
      store.list('bank_tx', TARGET),
    ]);
    const hasData = vehicles.length + contracts.length + bankTx.length > 0;
    if (hasData) {
      if (!(await confirm({
        message: `${companyLabel(TARGET)}의 기존 데이터(차량 ${vehicles.length}·계약 ${contracts.length}·거래 ${bankTx.length})를 모두 지우고 다시 넣습니다. 되돌릴 수 없습니다. 계속할까요?`,
        danger: true,
      }))) return;
      const typed = await prompt({ message: `확인: 법인 코드 "${TARGET}" 를 그대로 입력하세요.`, required: true });
      if (typed !== TARGET) { toast('마이그레이션 취소 — 법인 코드 불일치', 'info'); return; }
    }

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
