'use client';
/**
 * 과태료 변경부과 공문 — 전용 라우트(UIUX-SPEC: 풀스크린 오버레이 금지 → 페이지).
 *   매칭된 과태료만 문서 대상. 인쇄·신청 처리는 PenaltyDocs SSOT.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { matchPenalty } from '@/lib/penalty-match';
import { Page, PageLoading, EmptyState, Btn } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { WorkHubBack } from '@/components/WorkHubTabs';
import { PenaltyDocs } from '@/components/PenaltyDocs';
import { companyLabel } from '@/lib/companies';
import { useEntityLists } from '@/lib/use-entity-lists';

export default function PenaltyDocsPage() {
  const { companyId, scopeAll } = useSession();
  const router = useRouter();
  const { data: [pens = [], cons = []], loading, reload } = useEntityLists(['penalty', 'contract']);
  // 실운전자(임차인)가 확인된 매칭만 문서 대상 — /penalty 버튼 카운트(rows.filter(r=>r.renter))와 동일 기준.
  const matched = useMemo(
    () => pens.filter((p) => { const m = matchPenalty(p, cons); return !!(m && m.renter); }),
    [pens, cons],
  );

  return (
    <Page
      title="변경부과 공문"
      meta={`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 매칭 ${matched.length}건`}
      tools={<WorkbenchBar mid={<WorkHubBack />} actions={<Btn variant="ghost" href="/penalty">← 과태료</Btn>} />}
    >
      {loading ? <PageLoading />
        : matched.length === 0 ? (
          <EmptyState>
            매칭된 과태료가 없습니다 — <Btn variant="ghost" href="/penalty">과태료관리</Btn>에서 임차인을 확인하세요
          </EmptyState>
        ) : (
          <PenaltyDocs
            penalties={matched}
            companyId={companyId}
            onClose={() => router.push('/penalty')}
            onSubmitted={() => { reload(); router.push('/penalty'); }}
          />
        )}
    </Page>
  );
}
