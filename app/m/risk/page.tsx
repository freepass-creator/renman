'use client';
/** /m 리스크 — 웹 /risk 와 동일 SSOT(lib/risk-ledger). 칩: 전체·미완료·미납·만기·휴차. */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { buildRiskSheetRows, countRiskSheetGroups, riskDueSub, type RiskSheetGroup } from '@/lib/risk-ledger';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { textMatch } from '@/lib/search-match';
import { mobileVehicleHref } from '@/lib/mobile-routes';
import { Rows, ObjRow, EmptyState, ErrorState, PageLoading, FilterChips, Btn, C, Search } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

const GROUPS: RiskSheetGroup[] = ['미완료', '미납', '만기', '휴차'];
type GroupFilter = '전체' | RiskSheetGroup;
const PAGE_SIZE = 30;

export default function MRisk() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = [], pens = [], bt = []], loading, error, reload } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'penalty', 'bank_tx',
  ]);
  const [group, setGroup] = useState<GroupFilter>('전체');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const rows = useMemo(
    () => buildRiskSheetRows(vs, cs, ins, pens, hs, TODAY, bt),
    [vs, cs, ins, pens, hs, bt],
  );
  const shown = useMemo(
    () => (group === '전체' ? rows : rows.filter((r) => r.group === group))
      .filter((row) => textMatch(query, row.plate, row.customer, row.carName, row.subject, row.kind, row.status, row.dueDate)),
    [rows, group, query],
  );
  const visible = shown.slice(0, limit);
  const counts = useMemo(() => countRiskSheetGroups(rows), [rows]);
  useEffect(() => setLimit(PAGE_SIZE), [group, query]);

  return (
    <>
      <MHead title="리스크" sub="미완료 · 미납 · 만기 · 휴차" color={C.danger} />
      {loading ? <PageLoading />
        : error ? <div style={{ padding: 14 }}><ErrorState message={error} onRetry={reload} /></div>
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Search
              size="sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="차번 · 계약자 · 리스크 검색"
              style={{ width: '100%' }}
            />
            <FilterChips
              value={group}
              onChange={(v) => { if (v) setGroup(v); }}
              options={[
                { key: '전체' as const, label: '전체', count: counts.전체 || undefined },
                ...GROUPS.map((key) => ({ key, label: key, count: counts[key] || undefined })),
              ]}
            />
            {shown.length === 0 ? (
              <EmptyState variant={query.trim() || group !== '전체' ? 'sec' : 'ok'}>
                {query.trim() ? '검색 조건에 맞는 리스크가 없습니다'
                  : group !== '전체' ? `${group} 항목이 없습니다`
                    : '지금 챙길 위험이 없습니다'}
              </EmptyState>
            ) : (
              <Rows title={group === '전체' ? '리스크' : group} tone="red" n={shown.length} collapsible id="m-risk-sheet">
                {visible.map((item) => (
                  <ObjRow
                    key={item.id}
                    badge={item.group}
                    badgeTone={item.badgeTone}
                    plate={item.plate || undefined}
                    name={!item.plate ? item.kind : undefined}
                    meta={`${item.customer}${item.carName && item.carName !== LEDGER_EMPTY.dash ? ` · ${item.carName}` : ''}`}
                    sub={riskDueSub(item)}
                    right={item.amount > 0 ? `${item.amount.toLocaleString('ko-KR')}원` : item.status}
                    rightTone={item.amount > 0 ? 'danger' : item.tone === 'warn' ? 'warn' : 'ink'}
                    onClick={item.plate ? () => router.push(mobileVehicleHref(item.plate, item.companyId, item.group === '미납' ? 'unpaid' : '')) : undefined}
                  />
                ))}
              </Rows>
            )}
            {visible.length < shown.length && (
              <Btn block variant="ghost" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                더 보기 · {visible.length}/{shown.length}
              </Btn>
            )}
          </div>
        )}
    </>
  );
}
