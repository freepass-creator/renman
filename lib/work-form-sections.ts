/**
 * 업무생성 폼 섹션 — erp4 field-group 패턴.
 *   공통(업무분류·대상연결) + 구분(category)별 전용 섹션.
 *   과태료는 CMS 뷰 담당 → 생성 구분에서 제외.
 */

export type WorkGroup = '일정' | '고객상담' | '정비·수선' | '사고' | '과태료' | '문서' | '기타';
/** 업무생성 Select 값 — 과태료 제외. */
export type WorkCreateKind = Exclude<WorkGroup, '과태료'>;

/** LedgerFormSection과 동일 형태(lib→components 순환 import 방지). */
export type WorkFormSection = { title: string; fields: string[]; open?: boolean };

export const WORK_CREATE_KINDS: WorkCreateKind[] = [
  '일정', '고객상담', '정비·수선', '사고', '문서', '기타',
];

const CLASSIFY: WorkFormSection = {
  title: '업무 분류', open: true,
  fields: ['date', 'category', 'status', 'priority', 'title'],
};

const TARGET: WorkFormSection = {
  title: '대상·연결정보',
  // 차량피커·계약피커 둘 다 상시(목록에서만 선택·순수 텍스트 금지)
  fields: ['plate', 'contractKey'],
};

function secs(...extra: WorkFormSection[]): WorkFormSection[] {
  return [CLASSIFY, TARGET, ...extra];
}

/**
 * 구분 → 섹션 목록. LedgerCreatePanel이 category 값으로 고른다.
 * 전용 필드는 WorkForm(수선)·상담·일정 실무 필드 additive.
 */
export const WORK_SECTIONS_BY_KIND: Record<WorkCreateKind, WorkFormSection[]> = {
  '일정': secs({
    title: '일정', open: true,
    fields: ['dueDate', 'endDate', 'location', 'assigneeName', 'description'],
  }),
  '고객상담': secs({
    title: '상담', open: true,
    fields: ['callChannel', 'callDirection', 'callResult', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '정비·수선': secs({
    title: '정비', open: true,
    fields: ['maintType', 'vendor', 'amount', 'mileage', 'nextMaintDate', 'description'],
  }),
  '사고': secs(
    {
      title: '사고', open: true,
      fields: [
        'accRole', 'faultPct', 'damageArea', 'damageFrame',
        'amount', 'insuranceAmount', 'selfPay',
        'repairInDate', 'repairOutDate', 'rentalCar', 'description',
      ],
    },
    {
      title: '보험·상대',
      fields: [
        'insuranceCompany', 'insuranceNo',
        'otherCar', 'otherInsurance', 'otherInsuranceNo',
      ],
    },
  ),
  '문서': secs({
    title: '문서', open: true,
    fields: ['docKind', 'docStatus', 'assigneeName', 'dueDate', 'description'],
  }),
  '기타': secs({
    title: '처리정보', open: true,
    fields: ['dueDate', 'assigneeName', 'vendor', 'amount', 'description'],
  }),
};

/** category 문자열 → 생성용 kind (미지정·레거시 → 기타). */
export function workCreateKindOf(category: unknown): WorkCreateKind {
  const v = String(category || '');
  if ((WORK_CREATE_KINDS as string[]).includes(v)) return v as WorkCreateKind;
  return '기타';
}

export function workSectionsFor(category: unknown): WorkFormSection[] {
  return WORK_SECTIONS_BY_KIND[workCreateKindOf(category)];
}
