'use client';
/** /m 홈 — 오늘 브리핑. 데이터 = lib/home-briefing SSOT (웹과 동일). */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TODAY } from '@/lib/dashboard-consts';
import { useEntityLists } from '@/lib/use-entity-lists';
import { buildHomeBriefing, homeLedgerShortcuts } from '@/lib/home-briefing';
import { Rows, ObjRow, EmptyState, PageLoading, Btn, C, SPACE_M } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MHome() {
  const router = useRouter();
  const { data: [vs = [], cs = [], ins = [], hs = [], pens = []], loading } = useEntityLists([
    'vehicle', 'contract', 'insurance', 'history', 'penalty',
  ]);
  const briefing = useMemo(
    () => buildHomeBriefing(vs, cs, ins, pens, hs, TODAY),
    [vs, cs, ins, pens, hs],
  );
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);

  return (
    <>
      <MHead title="홈" sub="오늘 브리핑" color={C.ok} />
      {loading ? <PageLoading />
        : (
          <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {briefing.items.length === 0 ? (
              <EmptyState variant="ok">오늘 급한 것 없음</EmptyState>
            ) : (
              <Rows title="오늘 챙길 것" tone="red" n={briefing.items.length} collapsible id="m-briefing">
                {briefing.items.map((item) => (
                  <ObjRow
                    key={item.id}
                    rail={item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : item.tone === 'brand' ? 'brand' : 'none'}
                    badge={item.category}
                    badgeTone={item.badgeTone}
                    plate={item.plate || undefined}
                    name={!item.plate ? item.ref : undefined}
                    meta={item.customer}
                    right={item.detail}
                    rightTone={item.tone === 'danger' ? 'danger' : item.tone === 'warn' ? 'warn' : 'ink'}
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
