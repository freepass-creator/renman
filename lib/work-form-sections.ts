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
    /* ★dueDate 필수 — 계약 축에서 새로 만들 수 있는 세부가 이것뿐이다(클레임·분쟁은 목록에서 뺐다).
       기한이 없으면 「기한경과」 판정(work-ledger workDueSignal)·최상단 정렬·기한경과 배지·위험 레일에서
       영구 이탈한다. 고객 클레임이 «어제까지였는데 안 닫힘»으로 튀어오르지 못하고 상담더미에 묻힌다. */
    fields: ['callChannel', 'callDirection', 'callResult', 'dueDate', 'nextActionDate', 'assigneeName', 'description'],
  }),
  /* 반납·정산 — 반납 만기가 자동으로 낳는 일(lib/directives.ts).
     ★여기서 «반납 처리»를 하지 않는다. 실제 상태 전이(반납 확정·정산)는 계약화면 버튼이 유일한 경로다
       — 두 곳에서 전이하면 어느 쪽이 진실인지 알 수 없게 된다. 여기 담는 것은 회수 준비: 언제·누가·어디서. */
  '반납·정산': secs({
    title: '반납 준비', open: true,
    fields: ['dueDate', 'location', 'vendor', 'mileage', 'assigneeName', 'description'],
  }),
  /* 증차·감차 — 대상이 법인이라 차량 피커가 비어 있는 게 정상이다(TARGET 섹션은 그대로 두되 강제하지 않음).
     상태는 업무 상태가 담는다: 준비=대기 · 접수=진행 · 승인/반려=완료(결과는 regResult). */
  '증차·감차': secs({
    title: '증차·감차 신청', open: true,
    fields: ['regKind', 'regCount', 'regOffice', 'dueDate', 'regResult', 'regResultDate', 'assigneeName', 'description'],
  }),
  '연락기록': secs({
    title: '연락기록', open: true,
    fields: ['callChannel', 'callDirection', 'callResult', 'nextActionDate', 'assigneeName', 'description'],
  }),
  '정비·수선': secs({
    title: '정비', open: true,
    // 부품교체를 목록에서 뺐으므로 품목·수량을 여기서 받는다 — 안 그러면 «무슨 부품 몇 개»가 기록될 자리가 없다.
    fields: ['maintType', 'vendor', 'amount', 'partName', 'partQty', 'mileage', 'nextMaintDate', 'description'],
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
