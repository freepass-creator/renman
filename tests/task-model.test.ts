import { describe, expect, it } from 'vitest';
import {
  safeEvidenceHref,
  taskCategoryOf,
  taskDueLabel,
  taskOwnerOf,
  taskPriorityOf,
} from '@/lib/reborn/task-model';

describe('업무 분류와 우선순위', () => {
  it('미수·반납·검사는 고객 이행, 자료·계약·자금 누락은 우리 처리로 나눈다', () => {
    expect(taskOwnerOf({ kind: '계약유지 미수' })).toBe('customer');
    expect(taskOwnerOf({ kind: '반납지남' })).toBe('customer');
    expect(taskOwnerOf({ title: '자동차검사 요청' })).toBe('customer');
    expect(taskOwnerOf({ kind: '서류미첨부' })).toBe('company');
    expect(taskOwnerOf({ kind: '자금미분류' })).toBe('company');
  });

  it('핵심 예외를 업무 종류와 긴급도로 안정적으로 분류한다', () => {
    expect(taskCategoryOf({ kind: '입금 미매칭' })).toBe('finance');
    expect(taskCategoryOf({ kind: '계약유지 미수' })).toBe('collection');
    expect(taskPriorityOf({ kind: '사고' })).toBe(1);
    expect(taskPriorityOf({ kind: '자금미분류' })).toBe(1);
    expect(taskPriorityOf({ kind: '휴차', detail: '18일째 운행 없음' })).toBe(2);
    expect(taskPriorityOf({ kind: '만기임박', dday: 5 })).toBe(2);
  });

  it('기한과 근거 링크를 사람이 읽을 수 있고 안전한 형태로 만든다', () => {
    expect(taskDueLabel('', -12)).toBe('12일 경과');
    expect(taskDueLabel('2026-08-20', 4)).toBe('기한 2026-08-20');
    expect(safeEvidenceHref('/inbox')).toBe('/inbox');
    expect(safeEvidenceHref('https://drive.google.com/file/d/test')).toContain('drive.google.com');
    expect(safeEvidenceHref('javascript:alert(1)')).toBeUndefined();
  });
});
