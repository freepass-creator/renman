'use client';
/** /m 홈 — 주의 리스트. 데이터 = lib/home-briefing SSOT (웹 엑셀과 동일). */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { buildHomeSheetRows, homeLedgerShortcuts, type HomeSheetGroup } from '@/lib/home-briefing';
import { Rows, ObjRow, EmptyState, PageLoading, Btn, FilterChips, C, SPACE_M } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

const GROUPS: HomeSheetGroup[] = ['미결', '리스크', '휴차'];
type GroupFilter = '전체' | HomeSheetGroup;

export default function MHome() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = [], pens = []], loading } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'penalty',
  ]);
  const [group, setGroup] = useState<GroupFilter>('전체');
  const rows = useMemo(
    () => buildHomeSheetRows(vs, cs, ins, pens, hs, TODAY),
    [vs, cs, ins, pens, hs],
  );
  const shown = useMemo(
    () => (group === '전체' ? rows : rows.filter((r) => r.group === group)),
    [rows, group],
  );
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);
  const counts = useMemo(() => ({
    전체: rows.length,
    미결: rows.filter((r) => r.group === '미결').length,
    리스크: rows.filter((r) => r.group === '리스크').length,
    휴차: rows.filter((r) => r.group === '휴차').length,
  }), [rows]);

  return (
    <>
      <MHead title="홈" sub="미결 · 리스크 · 휴차" color={C.ok} />
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
              <EmptyState variant="ok">오늘 급한 것 없음</EmptyState>
            ) : (
              <Rows title={group === '전체' ? '주의' : group} tone="red" n={shown.length} collapsible id="m-home-sheet">
                {shown.map((item) => (
                  <ObjRow
                    key={item.id}
                    rail={item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : item.tone === 'brand' ? 'brand' : 'mute'}
                    badge={item.group}
                    badgeTone={item.badgeTone}
                    plate={item.plate || undefined}
                    name={!item.plate ? item.kind : undefined}
                    meta={`${item.customer}${item.carName && item.carName !== '—' ? ` · ${item.carName}` : ''}`}
                    sub={item.due}
                    right={item.amount > 0 ? `${item.amount.toLocaleString('ko-KR')}원` : item.status}
                    rightTone={item.amount > 0 ? 'danger' : item.tone === 'warn' ? 'warn' : 'ink'}
                    onClick={() => item.plate && router.push(`/m/vehicle/${encodeURIComponent(item.plate)}`)}
                  />
                ))}
              </Rows>
            )}
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.mute, marginBottom: SPACE_M }}>원장 바로가기</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {shortcuts.map((it) => {
                  const Icon = it.icon;
                  return (
                    <Btn key={it.href} size="sm" variant="ghost" onClick={() => router.push(it.href)}>
                      <Icon size={14} strokeWidth={2.2} aria-hidden /> {it.label}
                    </Btn>
                  );
                })}
              </div>
            </div>
          </div>
        )}
    </>
  );
}
