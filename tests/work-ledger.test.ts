import { describe, expect, it } from 'vitest';
import { inboxWorkStatus, summarizeWorkLedgerRows, workAttentionRank, workDueSignal, workGroup, type WorkLedgerRow } from '@/lib/work-ledger';
import { workDetailSectionsFor } from '@/lib/work-cols';
import { WORK_CATEGORIES } from '@/lib/work-taxonomy';
import { WORK_SECTIONS_BY_KIND } from '@/lib/work-form-sections';

describe('수집함 → 업무 원장 상태', () => {
  it('차량번호 없는 자금 원본도 담당자가 잡으면 진행으로 본다', () => {
    expect(inboxWorkStatus({
      suggestedEntity: 'bank_tx',
      processingState: '확인필요',
      assignmentState: '배정됨',
      assignee: '홍길동',
    })).toBe('진행');
  });

  it('담당자가 없는 미분류 원본은 유실하지 않고 미배정으로 남긴다', () => {
    expect(inboxWorkStatus({
      processingState: '미분류',
      classificationState: '미분류',
      intakeState: '미처리',
      assignmentState: '미배정',
    })).toBe('미배정');
  });

  it('차량번호 유무와 관계없이 실제 매칭 완료 건만 완료로 본다', () => {
    expect(inboxWorkStatus({ status: '매칭', matchedEntity: 'contract', matchedKey: 'c1' })).toBe('완료');
    expect(inboxWorkStatus({ processingState: '처리완료', matchedEntity: 'bank_tx', matchedKey: 'b1' })).toBe('완료');
  });

  it('업무 요약에서 미배정 건을 별도로 집계한다', () => {
    const base = {
      id: '1', company: '', companyId: '', kind: '문서', group: '문서' as const,
      target: '', title: '', workAt: '', workDate: '', createdAt: '', updatedAt: '', dueDate: '',
      assignee: '', amount: 0, source: 'inbox' as const, raw: {},
    };
    const rows = [
      { ...base, status: '미배정' },
      { ...base, id: '2', status: '진행' },
      { ...base, id: '3', status: '완료' },
    ] satisfies WorkLedgerRow[];
    expect(summarizeWorkLedgerRows(rows, '2026-08-03')).toEqual({ total: 3, inProgress: 2, unmatched: 0, unassigned: 1, overdue: 0 });
  });

  it('업무상태를 덮지 않고 기한경과·오늘·임박 신호를 별도로 계산한다', () => {
    expect(workDueSignal('2026-08-01', '진행', '2026-08-03')).toEqual({ state: '기한경과', label: 'D+2', days: -2 });
    expect(workDueSignal('2026-08-03', '대기', '2026-08-03')).toEqual({ state: '오늘', label: '오늘', days: 0 });
    expect(workDueSignal('2026-08-05', '진행', '2026-08-03')).toEqual({ state: '임박', label: 'D-2', days: 2 });
    expect(workDueSignal('2026-08-01', '완료', '2026-08-03').state).toBe('종결');
  });

  it('기한경과 업무를 미배정과 일반 업무보다 먼저 보여준다', () => {
    expect(workAttentionRank({ dueDate: '2026-08-01', status: '진행' }, '2026-08-03')).toBe(0);
    expect(workAttentionRank({ dueDate: '', status: '미배정' }, '2026-08-03')).toBe(1);
    expect(workAttentionRank({ dueDate: '2026-08-10', status: '진행' }, '2026-08-03')).toBe(3);
  });

  it('수납이슈 상세값을 상담이 아닌 수납이슈 섹션에 표시한다', () => {
    const sections = workDetailSectionsFor('수납이슈');
    const receipt = sections.find((section) => section.title === '수납이슈');
    expect(sections.map((section) => section.title)).not.toContain('고객상담');
    expect(receipt?.cols.map((col) => col.key)).toEqual([
      'paymentIssueType', 'expectedAmount', 'receivedAmount', 'nextActionDate',
    ]);
  });

  it('생성 폼의 상세내용·업체·주행거리·자금방향을 상세패널에서 다시 보여준다', () => {
    const repairKeys = workDetailSectionsFor('정비·수선').flatMap((section) => section.cols.map((col) => col.key));
    const cashKeys = workDetailSectionsFor('자금').flatMap((section) => section.cols.map((col) => col.key));
    expect(repairKeys).toEqual(expect.arrayContaining(['description', 'vendor', 'mileage']));
    expect(cashKeys).toEqual(expect.arrayContaining(['description', 'cashFlow', 'expectedAmount', 'counterparty']));
  });

  it('표준 업무구분 17개가 상세 조회에서 다른 구분으로 변하지 않는다', () => {
    for (const category of WORK_CATEGORIES) expect(workGroup(category)).toBe(category);
  });

  it('업무 생성에서 입력한 필드를 업무구분별 상세패널에서 누락하지 않는다', () => {
    const detailAlias: Record<string, string> = {
      date: 'workDate',
      category: 'kind',
      contractKey: 'contractNo',
      dueDate: 'due',
      assigneeName: 'assignee',
    };
    for (const category of WORK_CATEGORIES) {
      const formFields = WORK_SECTIONS_BY_KIND[category].flatMap((section) => section.fields);
      const detailKeys = new Set(workDetailSectionsFor(category).flatMap((section) => section.cols.map((col) => col.key)));
      const missing = formFields.filter((field) => !detailKeys.has(detailAlias[field] || field));
      expect(missing, `${category} 상세 누락`).toEqual([]);
    }
  });
});
