/**
 * 업무생성 폼 섹션 — erp4 field-group 패턴.
 *   공통(업무분류·대상연결) + 구분(category)별 전용 섹션.
 *   과태료 = 분류 유지 + kindGateways「고지서 업로드」섹션(폼 필드 없음).
 */

import { WORK_CATEGORIES_ACTIVE, isWorkCategory, type WorkCategory } from '@/lib/work-taxonomy';

export type WorkGroup = WorkCategory;
/** 업무생성 Select 값 — 과태료 포함(선택 시 업로드 섹션으로 분기). */
export type WorkCreateKind = WorkGroup;

/** LedgerFormSection과 동일 형태(lib→components 순환 import 방지). */
export type WorkFormSection = { title: string; fields: string[]; open?: boolean };

/** 생성 폼에서 고를 수 있는 업무 종류 = 활성 세부(필수 최소). 옛 값은 목록에서만 빠지고 데이터는 유지된다. */
export const WORK_CREATE_KINDS: WorkCreateKind[] = [...WORK_CATEGORIES_ACTIVE];

const CLASSIFY: WorkFormSection = {
  title: '업무 분류', open: true,
  // title은 quick 상단「업무 내용」에서만 — 섹션 중복 금지
  fields: ['date', 'category', 'status', 'priority'],
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
 * 과태료 = 분류만(대상·처리 없음) · 업로드는 kindGateways 섹션.
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
  '연락기록': secs({
    title: '연락기록', open: true,
    fields: ['callChannel', 'callDirection', 'callResult', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '정비·수선': secs({
    title: '정비', open: true,
    fields: ['maintType', 'vendor', 'amount', 'mileage', 'nextMaintDate', 'description'],
  }),
  // 배차·인수인계 — 어디서 주고받는지(장소)·누가(탁송사)·그때 주행거리가 실무 기록이다.
  '입출고': secs({
    title: '입출고', open: true,
    fields: ['dueDate', 'location', 'vendor', 'mileage', 'assigneeName', 'description'],
  }),
  // 매각·처분 — 매수인(거래처)·금액·주행거리. 처분손익은 자산관리가 계산한다(여기서 손롤 금지).
  '매각·처분': secs({
    title: '매각·처분', open: true,
    fields: ['dueDate', 'counterparty', 'vendor', 'amount', 'mileage', 'assigneeName', 'description'],
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
  '검사': secs({
    title: '검사', open: true,
    fields: ['inspectionType', 'inspectionResult', 'vendor', 'amount', 'mileage', 'nextInspectionDate', 'description'],
  }),
  '세차': secs({
    title: '세차', open: true,
    fields: ['washType', 'vendor', 'amount', 'assigneeName', 'description'],
  }),
  '보험': secs({
    title: '보험', open: true,
    fields: ['insuranceAction', 'insuranceCompany', 'insuranceNo', 'insuranceExpiryDate', 'amount', 'assigneeName', 'description'],
  }),
  '자금': secs({
    title: '자금예정', open: true,
    fields: ['cashFlow', 'expectedAmount', 'dueDate', 'counterparty', 'assigneeName', 'description'],
  }),
  '부품교체': secs({
    title: '부품교체', open: true,
    fields: ['partName', 'partQty', 'vendor', 'amount', 'mileage', 'nextMaintDate', 'description'],
  }),
  '수납이슈': secs({
    title: '수납이슈', open: true,
    fields: ['paymentIssueType', 'expectedAmount', 'receivedAmount', 'dueDate', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '분쟁': secs({
    title: '분쟁', open: true,
    fields: ['disputeType', 'counterparty', 'dueDate', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '클레임': secs({
    title: '클레임', open: true,
    fields: ['claimType', 'callChannel', 'dueDate', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '문서': secs({
    title: '문서', open: true,
    fields: ['docKind', 'docStatus', 'assigneeName', 'dueDate', 'description'],
  }),
  '메모': secs({
    title: '메모', open: true,
    fields: ['assigneeName', 'description'],
  }),
  '기타': secs({
    title: '처리정보', open: true,
    fields: ['dueDate', 'assigneeName', 'vendor', 'amount', 'description'],
  }),
  // 업무구분 전환용 분류만. 고지서 업로드는 kindGateways 섹션이 이어서 펼침.
  '과태료': [CLASSIFY],
};

/** category 문자열 → 생성용 kind (미지정·레거시 → 기타). */
export function workCreateKindOf(category: unknown): WorkCreateKind {
  const v = String(category || '');
  if (isWorkCategory(v)) return v;
  return '기타';
}

export function workSectionsFor(category: unknown): WorkFormSection[] {
  return WORK_SECTIONS_BY_KIND[workCreateKindOf(category)];
}
