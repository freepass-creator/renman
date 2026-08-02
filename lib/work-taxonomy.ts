/** 업무 생성·필터·상세패널이 함께 쓰는 업무구분 SSOT. */
export const WORK_CATEGORIES = [
  '일정',
  '고객상담',
  '연락기록',
  '정비·수선',
  '사고',
  '검사',
  '세차',
  '보험',
  '부품교체',
  '수납이슈',
  '분쟁',
  '클레임',
  '문서',
  '메모',
  '기타',
  '과태료',
] as const;

export type WorkCategory = (typeof WORK_CATEGORIES)[number];

export function isWorkCategory(value: unknown): value is WorkCategory {
  return (WORK_CATEGORIES as readonly unknown[]).includes(value);
}
