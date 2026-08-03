'use client';
/** 모바일 업무 상세·보완 — 생성한 동일 work_item을 이어서 수정한다. */
import { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { EmptyState, ErrorState, LedgerEditPanel, PageLoading } from '@/components/ui';
import { useEntityList } from '@/lib/use-entity-lists';
import { WORK_SECTIONS_BY_KIND, workSectionsFor } from '@/lib/work-form-sections';

export default function MWorkDetail() {
  const router = useRouter();
  const key = decodeURIComponent(String(useParams().id || ''));
  const { rows, loading, error, reload } = useEntityList('work_item');
  const record = useMemo(() => rows.find((row) => String(row._key || row.id || '') === key), [key, rows]);
  const close = () => router.replace('/m/work');

  if (loading) return <PageLoading />;
  if (error) return <div style={{ padding: 14 }}><ErrorState message={error} onRetry={reload} /></div>;
  if (!record) return <div style={{ padding: 14 }}><EmptyState>업무를 찾을 수 없습니다</EmptyState></div>;

  const title = String(record.title || record.description || record.memo || '업무');
  return (
    <div style={{ height: 'calc(100dvh - var(--fp-bar-h) - env(safe-area-inset-bottom))', background: 'var(--bg-card)' }}>
      <LedgerEditPanel
        entityKey="work_item"
        title={title}
        sections={workSectionsFor(record.category || record.workType)}
        sectionsByKind={WORK_SECTIONS_BY_KIND}
        kindField="category"
        fallbackKind="기타"
        record={record}
        onClose={close}
        onSaved={close}
      />
    </div>
  );
}
