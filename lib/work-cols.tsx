/**
 * 업무·과태료 엑셀 열 SSOT.
 * 추가/삭제: `업무 · 엑셀기본|엑셀전체 · ±key` / `과태료 · …` @see lib/ledger-ext.ts
 * 회사 열 key = `company` (전 원장 통일).
 * 구분별 원자(사고·상담 등) = CARD_DETAIL 패턴 — 표 basic에 넣지 않고 상세 전용.
 */
'use client';

import React from 'react';
import { Badge, C, money, type SheetCol } from '@/components/ui';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from '@/lib/ledger-ext';
import { LEDGER_EMPTY } from '@/lib/ledger-empty';
import { LEDGER_LABEL } from '@/lib/ledger-labels';
import {
  WORK_SOURCE_LABEL,
  fmtStamp,
  workGroup,
  workDueSignal,
  workStatusTone,
  type WorkLedgerRow,
} from '@/lib/work-ledger';
import { TODAY } from '@/lib/dashboard-consts';

function KindCell({ kind }: { kind: string }) {
  if (!kind || kind === '미분류' || kind === '일반') {
    return <Badge tone="amber">미분류</Badge>;
  }
  return <>{kind}</>;
}

function AssigneeCell({ name }: { name: string }) {
  if (!name) return <Badge tone="amber">미지정</Badge>;
  return <>{name}</>;
}

const rawStr = (r: WorkLedgerRow, key: string) => String(r.raw?.[key] ?? '').trim();
const rawNum = (r: WorkLedgerRow, key: string) => {
  const v = r.raw?.[key];
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 상세 전용 — raw camelCase (work_item). 표 basic에 넣지 않음. */
function detailStr(key: string, label: string): SheetCol<WorkLedgerRow> {
  return {
    key, label,
    render: (r) => rawStr(r, key) || LEDGER_EMPTY.dash,
    text: (r) => rawStr(r, key),
  };
}
function detailMoney(key: string, label: string): SheetCol<WorkLedgerRow> {
  return {
    key, label, align: 'r',
    render: (r) => {
      const n = rawNum(r, key);
      return n == null || n === 0 ? LEDGER_EMPTY.dash : money(n);
    },
    text: (r) => rawNum(r, key) ?? '',
  };
}
function detailNum(key: string, label: string, suffix = ''): SheetCol<WorkLedgerRow> {
  return {
    key, label, align: 'r',
    render: (r) => {
      const n = rawNum(r, key);
      return n == null ? LEDGER_EMPTY.dash : `${n.toLocaleString('ko-KR')}${suffix}`;
    },
    text: (r) => rawNum(r, key) ?? '',
  };
}

const WORK_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'company', label: '회사명', pin: true, priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  {
    key: 'kind', label: LEDGER_LABEL.workCategory, pin: true, priority: 1,
    render: (r) => <KindCell kind={r.kind} />,
    text: (r) => r.kind,
  },
  {
    key: 'status', label: '업무상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  {
    key: 'plate', label: '차량번호', priority: 1, pin: true,
    // 표에서는 2줄 셀 금지 — 차명은 별도 「차명」 컬럼.
    render: (r) => (r.plate
      ? <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.plate}</span>
      : <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>),
    text: (r) => r.plate || '',
  },
  {
    key: 'carName', label: '차명', priority: 2,
    render: (r) => r.carName || LEDGER_EMPTY.dash,
    text: (r) => r.carName || '',
  },
  {
    key: 'contractor', label: '계약자', priority: 1,
    render: (r) => {
      const name = String(r.customerName || '').trim();
      if (!name) return <span style={{ color: C.mute }}>{LEDGER_EMPTY.none}</span>;
      return name;   // 2줄 금지 — 대여형태는 전체뷰 「계약분류」가 담당.
    },
    text: (r) => r.customerName || LEDGER_EMPTY.none,
  },
  { key: 'rentalType', label: LEDGER_LABEL.rentalType, priority: 2, render: (r) => r.rentalType || LEDGER_EMPTY.dash, text: (r) => r.rentalType || '' },
  { key: 'title', label: '업무내용', priority: 1, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  {
    key: 'contractNo', label: '계약번호', priority: 1,
    render: (r) => r.contractNo || LEDGER_EMPTY.dash,
    text: (r) => r.contractNo || '',
  },
  {
    key: 'priority', label: '우선순위', align: 'c', priority: 1,
    render: (r) => {
      const p = String(r.priority || '').trim();
      if (!p) return <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>;
      const tone = /긴급/.test(p) ? 'red' as const : /높음/.test(p) ? 'amber' as const : 'gray' as const;
      return <Badge tone={tone}>{p}</Badge>;
    },
    text: (r) => r.priority || '',
  },
  {
    key: 'workDate', label: '발생일', priority: 1,
    render: (r) => r.workDate || LEDGER_EMPTY.dash,
    text: (r) => r.workDate,
  },
  {
    key: 'assignee', label: '담당자', priority: 1,
    render: (r) => <AssigneeCell name={r.assignee} />,
    text: (r) => r.assignee,
  },
  {
    key: 'created', label: '생성일시', priority: 1,
    render: (r) => fmtStamp(r.createdAt),
    text: (r) => r.createdAt,
  },
  {
    key: 'updated', label: '최종처리', priority: 1,
    render: (r) => fmtStamp(r.updatedAt),
    text: (r) => r.updatedAt,
  },
  {
    key: 'due', label: '기한', priority: 1,
    render: (r) => {
      if (!r.dueDate) return LEDGER_EMPTY.dash;
      const signal = workDueSignal(r.dueDate, r.status, TODAY);
      const color = signal.state === '기한경과' ? C.danger : signal.state === '오늘' || signal.state === '임박' ? C.warn : undefined;
      return <span style={{ color, fontWeight: color ? 700 : undefined }}>{r.dueDate}{signal.label ? ` · ${signal.label}` : ''}</span>;
    },
    text: (r) => r.dueDate,
  },
  { key: 'amount', label: '금액', align: 'r', render: (r) => (r.amount ? money(r.amount) : LEDGER_EMPTY.dash), text: (r) => r.amount || '' },
  { key: 'source', label: '원천', render: (r) => WORK_SOURCE_LABEL[r.source], text: (r) => r.source },
];

/** 업무구분별 상세 전용 필드. 표 basic에는 넣지 않고 상세패널에서만 노출한다. */
const WORK_KIND_DETAIL_COLS: SheetCol<WorkLedgerRow>[] = [
  // 사고 14
  detailStr('accRole', '가해/피해'),
  detailNum('faultPct', '내 과실', '%'),
  detailStr('damageArea', '사고부위'),
  detailStr('damageFrame', '골격손상'),
  detailMoney('insuranceAmount', '보험처리금'),
  detailMoney('selfPay', '자기부담금'),
  detailStr('repairInDate', '입고일'),
  detailStr('repairOutDate', '출고예정일'),
  detailStr('rentalCar', '대차'),
  detailStr('insuranceCompany', '보험사'),
  detailStr('insuranceNo', '접수번호'),
  detailStr('otherCar', '상대 차량번호'),
  detailStr('otherInsurance', '상대 보험사'),
  detailStr('otherInsuranceNo', '상대 접수번호'),
  // 상담 4
  detailStr('callChannel', '채널'),
  detailStr('callDirection', '방향'),
  detailStr('callResult', '상담결과'),
  detailStr('nextActionDate', '다음조치일'),
  detailStr('description', '상세내용'),
  detailStr('vendor', '업체/거래처'),
  detailNum('mileage', '주행거리', 'km'),
  // 정비 2
  detailStr('maintType', '정비유형'),
  detailStr('nextMaintDate', '다음정비예정'),
  // 문서 2
  detailStr('docKind', '서류종류'),
  detailStr('docStatus', '서류상태'),
  // 일정 2
  detailStr('endDate', '종료일'),
  detailStr('location', '장소'),
  // 검사·세차·보험·부품
  detailStr('inspectionType', '검사유형'),
  detailStr('inspectionResult', '검사결과'),
  detailStr('nextInspectionDate', '다음검사일'),
  detailStr('washType', '세차유형'),
  detailStr('insuranceAction', '보험업무'),
  detailStr('insuranceExpiryDate', '보험만기일'),
  detailStr('partName', '부품명'),
  detailNum('partQty', '수량'),
  // 계약·고객 업무
  detailStr('paymentIssueType', '수납이슈유형'),
  detailMoney('expectedAmount', '예정금액'),
  detailMoney('receivedAmount', '수납금액'),
  detailStr('disputeType', '분쟁유형'),
  detailStr('counterparty', '상대방'),
  detailStr('claimType', '클레임유형'),
  detailStr('cashFlow', '자금방향'),
];

const WORK_DETAIL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  ...WORK_COL_CATALOG,
  ...WORK_KIND_DETAIL_COLS,
];

const INBOX_TARGET_LABEL: Record<string, string> = {
  vehicle: '차량',
  contract: '계약',
  bank_tx: '자금',
};

function inboxStateCol(key: string, label: string): SheetCol<WorkLedgerRow> {
  return {
    key,
    label,
    render: (r) => rawStr(r, key) || LEDGER_EMPTY.dash,
    text: (r) => rawStr(r, key),
  };
}

const INBOX_DETAIL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  ...WORK_COL_CATALOG,
  {
    key: 'inboxOriginal', label: '원본',
    render: (r) => {
      const url = rawStr(r, 'url');
      return url
        ? <a href={url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700 }}>원본 열기</a>
        : LEDGER_EMPTY.dash;
    },
    text: (r) => rawStr(r, 'url'),
  },
  inboxStateCol('filename', '파일명'),
  inboxStateCol('processingState', '처리상태'),
  inboxStateCol('classificationState', '분류상태'),
  inboxStateCol('intakeState', '실행상태'),
  inboxStateCol('assignmentState', '배정상태'),
  inboxStateCol('classificationReason', '분류근거'),
  {
    key: 'suggestedEntity', label: '연결후보',
    render: (r) => INBOX_TARGET_LABEL[rawStr(r, 'suggestedEntity')] || rawStr(r, 'suggestedEntity') || LEDGER_EMPTY.dash,
    text: (r) => INBOX_TARGET_LABEL[rawStr(r, 'suggestedEntity')] || rawStr(r, 'suggestedEntity'),
  },
  {
    key: 'matchedEntity', label: '연결대상',
    render: (r) => INBOX_TARGET_LABEL[rawStr(r, 'matchedEntity')] || rawStr(r, 'matchedEntity') || LEDGER_EMPTY.dash,
    text: (r) => INBOX_TARGET_LABEL[rawStr(r, 'matchedEntity')] || rawStr(r, 'matchedEntity'),
  },
  inboxStateCol('uploadedBy', '올린이'),
  inboxStateCol('uploadedAt', '업로드시각'),
  inboxStateCol('note', '메모'),
];

const PENALTY_COL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  { key: 'violationDate', label: '위반일', pin: true, priority: 1, render: (r) => r.violationDate || LEDGER_EMPTY.dash, text: (r) => r.violationDate || '' },
  { key: 'plate', label: '차량번호', pin: true, priority: 1, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate || '' },
  {
    key: 'amount', label: '금액', align: 'r', priority: 1,
    render: (r) => (r.amount ? <span style={{ color: C.warn, fontWeight: 700 }}>{money(r.amount)}</span> : LEDGER_EMPTY.dash),
    text: (r) => r.amount || '',
  },
  { key: 'driver', label: '실운전자', priority: 1, render: (r) => r.driverName || LEDGER_EMPTY.unmatched, text: (r) => r.driverName || '' },
  {
    key: 'status', label: '과태료상태', align: 'c', priority: 1,
    render: (r) => <Badge tone={workStatusTone(r.status)}>{r.status}</Badge>,
    text: (r) => r.status,
  },
  { key: 'ptype', label: '과태료분류', priority: 2, render: (r) => r.penaltyKind || LEDGER_EMPTY.dash, text: (r) => r.penaltyKind || '' },
  { key: 'title', label: '위반내용', priority: 2, render: (r) => r.title || LEDGER_EMPTY.dash, text: (r) => r.title },
  { key: 'company', label: '회사명', priority: 2, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  { key: 'due', label: '납기', priority: 2, render: (r) => r.dueDate || LEDGER_EMPTY.dash, text: (r) => r.dueDate },
];

/** 상세 전용 — 시트 basic에 안 넣음. */
const PENALTY_DETAIL_CATALOG: SheetCol<WorkLedgerRow>[] = [
  ...PENALTY_COL_CATALOG,
  {
    key: 'fileUrl', label: '고지서 원본',
    render: (r) => {
      const url = String(r.raw?.fileUrl || '').trim();
      if (!url) return LEDGER_EMPTY.dash;
      return <a href={url} target="_blank" rel="noreferrer" style={{ color: C.accent, fontWeight: 700 }}>원본 열기</a>;
    },
    text: (r) => String(r.raw?.fileUrl || '').trim(),
  },
];

export const WORK_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'contractor', 'kind', 'status', 'priority', 'title', 'carName', 'contractNo', 'workDate', 'due', 'assignee'],
  all: [
    'company', 'plate', 'contractor', 'kind', 'status', 'priority', 'title', 'carName', 'rentalType', 'contractNo', 'workDate',
    'assignee', 'created', 'updated', 'due', 'amount', 'source',
  ],
};

export const PENALTY_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'driver', 'ptype', 'status', 'title', 'violationDate', 'amount'],
  all: ['company', 'plate', 'driver', 'ptype', 'status', 'title', 'violationDate', 'amount', 'due'],
};

const _workViews = buildSheetViews(WORK_COL_CATALOG, WORK_SHEET_KEYS);
export const WORK_BASIC_COLS = _workViews.basic;
export const WORK_ALL_COLS = _workViews.expanded;

const _penViews = buildSheetViews(PENALTY_COL_CATALOG, PENALTY_SHEET_KEYS);
export const PENALTY_BASIC_COLS = _penViews.basic;
export const PENALTY_ALL_COLS = _penViews.expanded;

const WORK_COMMON_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '업무 분류', open: true, keys: ['company', 'kind', 'priority', 'status', 'source'] },
  { title: '신원·내용', keys: ['plate', 'contractor', 'contractNo', 'title', 'description'] },
  { title: '처리정보', keys: ['workDate', 'created', 'updated', 'due', 'assignee', 'amount'] },
];

const WORK_KIND_DETAIL_DEFS: Record<WorkLedgerRow['group'], DetailSectionDef[]> = {
  일정: [{ title: '일정', keys: ['endDate', 'location'] }],
  고객상담: [{ title: '고객상담', keys: ['callChannel', 'callDirection', 'callResult', 'nextActionDate'] }],
  연락기록: [{ title: '연락기록', keys: ['callChannel', 'callDirection', 'callResult', 'nextActionDate'] }],
  '정비·수선': [{ title: '정비·수선', keys: ['maintType', 'vendor', 'partName', 'partQty', 'mileage', 'nextMaintDate'] }],
  사고: [{
    title: '사고',
    keys: [
      'accRole', 'faultPct', 'damageArea', 'damageFrame',
      'insuranceAmount', 'selfPay', 'repairInDate', 'repairOutDate', 'rentalCar',
      'insuranceCompany', 'insuranceNo', 'otherCar', 'otherInsurance', 'otherInsuranceNo',
    ],
  }],
  검사: [{ title: '검사', keys: ['inspectionType', 'inspectionResult', 'vendor', 'mileage', 'nextInspectionDate'] }],
  세차: [{ title: '세차', keys: ['washType', 'vendor'] }],
  보험: [{ title: '보험', keys: ['insuranceAction', 'insuranceCompany', 'insuranceNo', 'insuranceExpiryDate'] }],
  자금: [{ title: '자금예정', keys: ['cashFlow', 'expectedAmount', 'counterparty'] }],
  부품교체: [{ title: '부품교체', keys: ['partName', 'partQty', 'vendor', 'mileage', 'nextMaintDate'] }],
  수납이슈: [{ title: '수납이슈', keys: ['paymentIssueType', 'expectedAmount', 'receivedAmount', 'nextActionDate'] }],
  분쟁: [{ title: '분쟁', keys: ['disputeType', 'counterparty', 'nextActionDate'] }],
  클레임: [{ title: '클레임', keys: ['claimType', 'callChannel', 'nextActionDate'] }],
  입출고: [{ title: '입출고', keys: ['location', 'vendor', 'mileage'] }],
  '매각·처분': [{ title: '매각·처분', keys: ['counterparty', 'vendor', 'mileage'] }],
  문서: [{ title: '문서', keys: ['docKind', 'docStatus'] }],
  메모: [],
  기타: [{ title: '처리정보 보충', keys: ['vendor'] }],
  과태료: [],
};

/** 선택 업무구분에 해당하는 섹션만 구성한다. 공통 필드가 다른 업무 섹션에 잘못 노출되지 않는다. */
export function workDetailSectionsFor(category: unknown) {
  const group = workGroup(category);
  return buildDetailSections(WORK_DETAIL_CATALOG, [
    ...WORK_COMMON_DETAIL_DEFS,
    ...(WORK_KIND_DETAIL_DEFS[group] || []),
  ]);
}

/** 전체 필드 카탈로그 검증·하위호환용. 실제 패널은 workDetailSectionsFor를 사용한다. */
export const WORK_DETAIL_DEFS: DetailSectionDef[] = [
  ...WORK_COMMON_DETAIL_DEFS,
  ...Object.values(WORK_KIND_DETAIL_DEFS).flat(),
];

export const PENALTY_DETAIL_DEFS: DetailSectionDef[] = [
  { title: '고지서', open: true, keys: ['violationDate', 'plate', 'amount', 'driver', 'status'] },
  { title: '부가', keys: ['ptype', 'title', 'company', 'due', 'fileUrl'] },
];

export const WORK_DETAIL_SECTIONS = buildDetailSections(WORK_DETAIL_CATALOG, WORK_DETAIL_DEFS);
export const PENALTY_DETAIL_SECTIONS = buildDetailSections(PENALTY_DETAIL_CATALOG, PENALTY_DETAIL_DEFS);

export const INBOX_DETAIL_SECTIONS = buildDetailSections(INBOX_DETAIL_CATALOG, [
  { title: '문서 분류', open: true, keys: ['company', 'kind', 'status', 'processingState', 'classificationState'] },
  { title: '원본', keys: ['inboxOriginal', 'filename', 'uploadedBy', 'uploadedAt'] },
  { title: '처리정보', keys: ['intakeState', 'assignmentState', 'assignee', 'due', 'note', 'classificationReason'] },
  { title: '연결정보', keys: ['suggestedEntity', 'matchedEntity', 'plate', 'contractNo', 'contractor'] },
]);

export { workStatusTone };
