'use client';
/**
 * 홈 — «오늘 브리핑».
 * LedgerFrame/렌즈 탭 폐기. Page + 트리아지 리스트 + 원장 바로가기.
 * 데이터 = lib/home-briefing SSOT (웹·/m 공용).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import {
  Page, Sec, Btn, Badge, EmptyState, PageLoading, C, SPACE_M, SPACE_GROUP_M,
} from '@/components/ui';
import { useDashboardData } from '@/lib/use-dashboard-data';
import { openCar, openIngest } from '@/lib/ui-bus';
import { buildHomeBriefing, homeLedgerShortcuts, type HomeBriefingItem } from '@/lib/home-briefing';

function BriefingRow({ item, onOpen }: { item: HomeBriefingItem; onOpen: (plate: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => item.plate && onOpen(item.plate)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '10px 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
        background: C.card, cursor: item.plate ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <Badge tone={item.badgeTone}>{item.category}</Badge>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: C.ink, flexShrink: 0 }}>{item.ref || item.plate || '—'}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.customer}</span>
      <span style={{
        fontSize: 12.5, fontWeight: 700, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
        color: item.tone === 'danger' ? C.danger : item.tone === 'warn' ? C.warn : item.tone === 'brand' ? C.brand : C.ink,
      }}>{item.detail}</span>
    </button>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { contracts, vehicles, insurances, penalties, history, loading } = useDashboardData();
  const briefing = useMemo(
    () => buildHomeBriefing(vehicles, contracts, insurances, penalties, history),
    [vehicles, contracts, insurances, penalties, history],
  );
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);

  return (
    <Page
      title="홈"
      tools={(
        <Btn size="sm" variant="ghost" iconOnly tip="데이터센터 — OCR·엑셀 투입" onClick={() => openIngest()}>
          <UploadCloud size={14} />
        </Btn>
      )}
      loading={loading}
    >
      <Sec title="오늘 챙길 것" desc="만기경과 → 임박 → 미수 → 인도예정 → 일정 어김 · 상위 10">
        {briefing.items.length === 0 ? (
          <EmptyState variant="ok">오늘 급한 것 없음</EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_M }}>
            {briefing.items.map((item) => (
              <BriefingRow key={item.id} item={item} onOpen={(plate) => openCar(plate)} />
            ))}
          </div>
        )}
      </Sec>

      <div style={{ marginTop: SPACE_GROUP_M }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.ink, marginBottom: SPACE_M }}>원장 바로가기</div>
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
    </Page>
  );
}
