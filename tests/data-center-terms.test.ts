import { describe, expect, it } from 'vitest';
import { processingAttentionRank, summarizeProcessingQueue } from '@/lib/data-center-terms';

describe('데이터센터 처리 큐', () => {
  it('사람이 먼저 확인할 오류·확인필요·미분류 순으로 정렬한다', () => {
    expect([
      '처리완료', '분석중', '미분류', '확인필요', '오류',
    ].sort((a, b) => processingAttentionRank(a) - processingAttentionRank(b))).toEqual([
      '오류', '확인필요', '미분류', '분석중', '처리완료',
    ]);
  });

  it('완료 건은 미배정 작업 수에서 제외하고 잔여 작업만 집계한다', () => {
    expect(summarizeProcessingQueue([
      { processingState: '확인필요', classificationState: '분류됨', assignmentState: '미배정' },
      { processingState: '미분류', classificationState: '미분류', assignmentState: '미배정' },
      { processingState: '오류', classificationState: '미분류', assignmentState: '배정됨' },
      { processingState: '처리완료', classificationState: '분류됨', assignmentState: '미배정' },
    ])).toEqual({ needsReview: 1, unclassified: 2, unassigned: 2, errors: 1 });
  });
});
