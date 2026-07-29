'use client';
/** /m 리스크 — 웹 /risk 와 동일 SSOT(lib/risk-ledger). 칩: 전체·미완료·미납·만기·휴차. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { buildRiskSheetRows, type RiskSheetGroup } from '@/lib/risk-ledger';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { Rows, ObjRow, EmptyState, PageLoading, FilterChips, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

const GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];
type GroupFilter = '전체' | RiskSheetGroup;

export default function MRisk() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = [], pens = [], bt = []], loading } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'penalty', 'bank_tx',
  ]);
  const [group, setGroup] = useState<GroupFilter>('전체');
  const rows = useMemo(
    () => buildRiskSheetRows(vs, cs, ins, pens, hs, TODAY, bt),
    [vs, cs, ins, pens, hs, bt],
  );
  const shown = useMemo(
    () => (group === '전체' ? rows : rows.filter((r) => r.group === group)),
    [rows, group],
  );
  const counts = useMemo(() => ({
    전체: rows.length,
    미완료: rows.filter((r) => r.group === '미완료').length,
    미납: rows.filter((r) => r.group === '미납').length,
    만기: rows.filter((r) => r.group === '만기').length,
    휴차: rows.filter((r) => r.group === '휴차').length,
  }), [rows]);

  return (
    <>
      <MHead title="리스크" sub="미완료 · 미납 · 만기 · 휴차" color={C.danger} />
      {loading ? <PageLoading />
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FilterChips
              value={group}
              onChange={(v) => { if (v) setGroup(v); }}
              options={[
                { key: '전체' as const, label: '전체', count: counts.전체 || undefined },
                ...GROUPS.map((key) => ({ key, label: key, count: counts[key] || undefined })),
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState variant="ok">지금 챙길 위험이 없습니다</EmptyState>
            ) : (
              <Rows title={group === '전체' ? '리스크' : group} tone="red" n={shown.length} collapsible id="m-risk-sheet">
                {shown.map((item) => (
                  <ObjRow
                    key={item.id}
                    rail={item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : item.tone === 'brand' ? 'brand' : 'mute'}
                    badge={item.group}
                    badgeTone={item.badgeTone}
                    plate={item.plate || undefined}
                    name={!item.plate ? item.kind : undefined}
                    meta={`${item.customer}${item.carName && item.carName !== LEDGER_EMPTY.dash ? ` · ${item.carName}` : ''}`}
                    sub={item.due}
                    right={item.amount > 0 ? `${item.amount.toLocaleString('ko-KR')}원` : item.status}
                    rightTone={item.amount > 0 ? 'danger' : item.tone === 'warn' ? 'warn' : 'ink'}
                    onClick={() => item.plate && router.push(`/m/vehicle/${encodeURIComponent(item.plate)}${item.group === '미납' ? '?do=unpaid' : ''}`)}
                  />
                ))}
              </Rows>
            )}
          </div>
        )}
    </>
  );
}
