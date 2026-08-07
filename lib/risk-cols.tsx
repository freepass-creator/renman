/**
 * 리스크관리 엑셀 열 — 행 문법: 회사 · 신원(차량번호+계약자) · 리스크분류 · 리스크상태 · 기한·금액.
 *
 * ★라벨 규격(사장님 확정): 분류·상태는 «X분류 / X상태» 쌍이고 «분류 바로 뒤에 상태»가 온다.
 *   「구분」·「세부」·「상태」 같은 모호한 라벨은 규격 위반 → 리스크구분 / 리스크분류 / 리스크상태.
 * ★신원 규격: 「대상」이라는 단일 칸을 두지 않는다 — 실제 식별자(차량번호·계약자)로 쪼갠다.
 *   사유·제목은 신원이 아니므로 「리스크내용」에 담는다(업무관리 「업무내용」과 대칭).
 *   이전에는 customer 한 칸에 차명('기아 스팅어')·거래상대('BZ뱅크')·사유('등록증 없음')가
 *   소스별로 뒤섞여 들어가 칸이 의미를 잃었다.
 */
import React from 'react';
import { Badge, money, C, type SheetCol } from '@/components/ui';
import { ddayLabel, type RiskSheetRow } from './risk-ledger';
import { buildSheetViews, buildDetailSections, type DetailSectionDef, type SheetViewKeys } from './ledger-ext';
import { sectionDefs } from './detail-sections';
import { LEDGER_EMPTY } from './ledger-empty';
import { LEDGER_LABEL } from './ledger-labels';

const toneColor = (tone: RiskSheetRow['tone']) => (
  tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'brand' ? C.brand : C.mute
);

const CATALOG: SheetCol<RiskSheetRow>[] = [
  {
    key: 'company', label: LEDGER_LABEL.company, pin: true, priority: 2,
    render: (r) => r.company || LEDGER_EMPTY.dash,
    text: (r) => r.company,
  },
  {
    // 구분은 «상태»가 아니다 → 배지를 쓰지 않는다(상태 신호는 배지 색으로만).
    key: 'group', label: '리스크구분', priority: 1, align: 'c',
    render: (r) => <span style={{ color: C.mute }}>{r.group}</span>,
    text: (r) => r.group,
  },
  {
    key: 'kind', label: '리스크분류', priority: 1, align: 'c',
    render: (r) => (r.kind ? <Badge tone="gray">{r.kind}</Badge> : LEDGER_EMPTY.dash),
    text: (r) => r.kind,
  },
  {
    // 표에서는 «2줄 셀»을 쓰지 않는다 — 행 높이가 고정(--ledger-row-h)이고 조밀해야 읽힌다.
    //   차명은 별도 「차명」 컬럼이 담당한다(기본뷰 편입).
    key: 'plate', label: LEDGER_LABEL.plate, priority: 1, pin: true,
    render: (r) => (r.plate
      ? <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{r.plate}</span>
      : <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>),
    text: (r) => r.plate,
  },
  {
    key: 'customer', label: LEDGER_LABEL.contractor, priority: 1,
    render: (r) => r.customer || LEDGER_EMPTY.none,
    text: (r) => r.customer,
  },
  {
    // 사유·제목 — 신원이 아니다. 업무관리 「업무내용」과 같은 자리(신원 뒤·분류 앞).
    key: 'subject', label: '리스크내용', priority: 1,
    render: (r) => r.subject || LEDGER_EMPTY.dash,
    text: (r) => r.subject,
  },
  {
    key: 'phone', label: LEDGER_LABEL.phone, priority: 1,
    render: (r) => r.phone || LEDGER_EMPTY.dash,
    text: (r) => r.phone,
  },
  {
    key: 'carName', label: LEDGER_LABEL.carName, priority: 2,
    render: (r) => r.carName || LEDGER_EMPTY.dash,
    text: (r) => r.carName,
  },
  {
    // ★한 칸 한 원자 — 기한은 «날짜»만. D-day·연체일은 각자 칸이 있다.
    key: 'due', label: LEDGER_LABEL.due, priority: 1, align: 'c',
    render: (r) => (r.dueDate
      ? <span style={{ fontFamily: 'var(--font-mono)' }}>{r.dueDate}</span>
      : <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>),
    text: (r) => r.dueDate,
  },
  {
    key: 'dday', label: LEDGER_LABEL.dday, priority: 1, align: 'c', sortNum: true,
    render: (r) => (r.dday == null
      ? <span style={{ color: C.mute }}>{LEDGER_EMPTY.dash}</span>
      : <span style={{ fontWeight: 700, color: toneColor(r.tone) }}>{ddayLabel(r.dday)}</span>),
    text: (r) => (r.dday == null ? '' : r.dday),
  },
  {
    key: 'overdueDays', label: LEDGER_LABEL.overdueDays, priority: 1, align: 'r', sortNum: true, xf: 'int',
    render: (r) => (r.overdueDays > 0
      ? <span style={{ color: C.danger, fontWeight: 700 }}>{r.overdueDays}일</span>
      : LEDGER_EMPTY.dash),
    text: (r) => r.overdueDays,
  },
  {
    key: 'amount', label: LEDGER_LABEL.amount, priority: 1, align: 'r', sortNum: true, xf: 'money',
    render: (r) => (r.amount > 0
      ? <span style={{ color: C.danger, fontWeight: 700 }}>{money(r.amount)}</span>
      : LEDGER_EMPTY.dash),
    text: (r) => r.amount,
  },
  {
    key: 'status', label: '리스크상태', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.badgeTone}>{r.status || LEDGER_EMPTY.dash}</Badge>,
    text: (r) => r.status,
  },
];

/**
 * ★열 순서는 «자산관리»가 기준이다(사장님 확정 — 전 화면 통일):
 *     회사(1) · 식별자(2) · 이름(3) · 분류(4) · 상태(5) · 나머지
 *   자산관리 = company · plate · carName · 자산분류 · 자산상태 · …
 *   리스크   = company · plate · 계약자 · 리스크분류 · 리스크상태 · 리스크구분 · 내용 · 기한 · 금액 · 연락처
 *   어느 페이지를 가도 같은 위치에 같은 성격의 칸이 있어야 한다(안정감).
 *   내용·연락처·차명 같은 부가 정보는 분류·상태 뒤로 밀어낸다.
 *
 * ★「리스크구분」(미완료·미납·만기·휴차)을 기본뷰에 넣는다. 여러 구분이 한 표에 섞여 나열되므로
 *   행에 없으면 «이 행이 어느 그룹인지» 알 수 없다(상단 칩은 건수만 보여준다).
 *   구분→분류→상태를 «연속 블록»으로 둬서 분류 바로 뒤에 상태가 오는 규격을 지킨다.
 */
export const RISK_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'customer', 'kind', 'status', 'group', 'subject', 'due', 'dday', 'amount', 'carName', 'phone'],
  all: ['company', 'plate', 'customer', 'kind', 'status', 'group', 'subject', 'due', 'dday', 'overdueDays', 'amount', 'carName', 'phone'],
};

const views = buildSheetViews(CATALOG, RISK_SHEET_KEYS);
export const RISK_BASIC_COLS = views.basic;
export const RISK_EXPANDED_COLS = views.expanded;

/** 리스크 상세 — `리스크 · {섹션} · ±key` */
export const RISK_DETAIL_DEFS: DetailSectionDef[] = sectionDefs({
  '신원·분류': ['company', 'plate', 'customer', 'phone', 'subject', 'group', 'kind', 'status'],
  '기한·금액': ['carName', 'due', 'dday', 'overdueDays', 'amount'],
});

export const RISK_DETAIL_SECTIONS = buildDetailSections(RISK_EXPANDED_COLS, RISK_DETAIL_DEFS);
