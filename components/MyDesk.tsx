'use client';
/**
 * 내 업무(마이데스크) — 담은 섹션만 렌더.
 *   · 고르기/순서 편집 = 설정(`/settings` MyDeskSettings). 여기서 편집 UI 금지.
 *   · 홈 '내 업무' 렌즈와 /ops가 공유.
 */
import { useMemo } from 'react';
import { SECTION_MAP, type SectionCtx } from '@/lib/section-registry';
import { useMyDeskPicked } from '@/lib/my-desk';
import { HiddenSecs, Btn, EmptyState, C } from '@/components/ui';

export function MyDesk({ ctx, facets }: { ctx: SectionCtx; facets?: Set<string> }) {
  const { picked, reorder } = useMyDeskPicked();
  const groups = facets && facets.size ? facets : null;
  const shownIds = useMemo(
    () => picked.filter((id) => SECTION_MAP[id] && (!groups || groups.has(SECTION_MAP[id]!.group))),
    [picked, groups],
  );

  const goSettings = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href: '/settings' } }));
  };

  return (
    <>
      {picked.length === 0 ? (
        <EmptyState>
          아직 담은 섹션이 없습니다.<br />
          <span style={{ color: C.mute }}>설정</span>에서 나에게 필요한 섹션을 골라 담으세요.
          <div style={{ marginTop: 14 }}>
            <Btn variant="ghost" onClick={goSettings}>설정에서 섹션 고르기</Btn>
          </div>
        </EmptyState>
      ) : shownIds.length === 0 ? (
        <EmptyState>선택한 영역에 해당하는 섹션이 없습니다.</EmptyState>
      ) : (
        shownIds.map((id) => SECTION_MAP[id]?.render(ctx, { onReorder: reorder }))
      )}
      <HiddenSecs />
    </>
  );
}
