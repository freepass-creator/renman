'use client';
/**
 * 정합성(계약서·입금 대조) 섹션 — migrate JSON을 동적 import로만 끌어와
 * section-registry → 홈/ops 메인 청크에 contract-doc-audit.json이 안 실리게 함.
 */
import { useEffect, useMemo, useState } from 'react';
import { Sec, ObjCard, Cards } from '@/components/ui';
import { openCar } from '@/lib/ui-bus';
import type { DocAuditItem } from '@/lib/integrity/doc-audit';

type Props = { plates: string[]; onReorder?: (fromId: string, toId: string) => void };

export function DocAuditSec({ plates, ...p }: Props) {
  const plateKey = useMemo(() => plates.join('\0'), [plates]);
  const [items, setItems] = useState<DocAuditItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/integrity/doc-audit').then(({ docAuditForPlates }) => {
      if (!cancelled) setItems(docAuditForPlates(plates));
    }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
    // plateKey로 내용 동일성 판단 — plates 배열 참조 변동만으로 재로드 방지
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plateKey]);

  if (!items?.length) return null;
  return (
    <Sec key="r-integrity" id="r-integrity" title="정합성 확인 (계약서·입금·보험 대조)" n={items.length} tone="warn" desc="계약서·자금원장·보험증권과 안 맞는 계약 · 실무자 확인 필요" {...p}>
      <Cards min={300}>{items.slice(0, 60).map((a, i) => (
        <ObjCard key={i} onClick={() => openCar(a.plate, 'unpaid')} rail={a.sev === 'high' ? 'danger' : a.sev === 'med' ? 'warn' : undefined} co={a.companyId}
          badge={a.kind} badgeTone={a.sev === 'high' ? 'red' : a.sev === 'med' ? 'amber' : 'gray'}
          plate={String(a.plate)} carType={String(a.name || '')}
          fields={[['계약자', String(a.name || '—')], ['종류', a.kind], ['확인사항', a.detail]]}
          sub={a.detail} />
      ))}</Cards>
    </Sec>
  );
}
