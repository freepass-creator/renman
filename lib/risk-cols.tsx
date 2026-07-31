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
import type { RiskSheetRow } from './risk-ledger';
import { buildSheetViews, buildDetailSections, type DetailSectionDef, type SheetViewKeys } from './ledger-ext';
import { LEDGER_EMPTY } from './ledger-empty';

const toneColor = (tone: RiskSheetRow['tone']) => (
  tone === 'danger' ? C.danger : tone === 'warn' ? C.warn : tone === 'brand' ? C.brand : C.mute
);

const CATALOG: SheetCol<RiskSheetRow>[] = [
  {
    key: 'company', label: '회사명', pin: true, priority: 2,
    render: (r) => r.company || LEDGER_EMPTY.dash,
    text: (r) => r.company,
  },
  {
    key: 'group', label: '리스크구분', priority: 1, align: 'c',
    render: (r) => <Badge tone={r.badgeTone}>{r.group}</Badge>,
    text: (r) => r.group,
  },
  {
    key: 'kind', label: '리스크분류', priority: 1, align: 'c',
    render: (r) => r.kind || LEDGER_EMPTY.dash,
    text: (r) => r.kind,
  },
  {
    key: 'plate', label: '차량번호', priority: 1, pin: true,
    render: (r) => (
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
        {r.plate || LEDGER_EMPTY.dash}
      </span>
    ),
    text: (r) => r.plate,
  },
  {
    key: 'customer', label: '계약자', priority: 1,
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
    key: 'phone', label: '연락처', priority: 1,
    render: (r) => r.phone || LEDGER_EMPTY.dash,
    text: (r) => r.phone,
  },
  {
    key: 'carName', label: '차명', priority: 2,
    render: (r) => r.carName || LEDGER_EMPTY.dash,
    text: (r) => r.carName,
  },
  {
    key: 'due', label: '기한', priority: 1, align: 'c',
    render: (r) => <span style={{ fontWeight: 700, color: toneColor(r.tone) }}>{r.due || LEDGER_EMPTY.dash}</span>,
    text: (r) => r.due,
  },
  {
    key: 'amount', label: '금액', priority: 1, align: 'r', sortNum: true, xf: 'money',
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
 * 회사 → 신원(차번·계약자·연락처) → 리스크내용 → 리스크구분 → 리스크분류 → 리스크상태 → 수치·기한
 *
 * ★「리스크구분」(미완료·미납·만기·휴차)을 기본뷰에 넣는다. 여러 구분이 한 표에 섞여 나열되므로
 *   행에 없으면 «이 행이 어느 그룹인지» 알 수 없다(상단 칩은 건수만 보여준다).
 *   구분→분류→상태를 «연속 블록»으로 둬서 분류 바로 뒤에 상태가 오는 규격을 지킨다.
 */
export const RISK_SHEET_KEYS: SheetViewKeys = {
  basic: ['company', 'plate', 'customer', 'phone', 'subject', 'group', 'kind', 'status', 'due', 'amount'],
  all: ['company', 'plate', 'customer', 'phone', 'carName', 'subject', 'group', 'kind', 'status', 'due', 'amount'],
};

const views = buildSheetViews(CATALOG, RISK_SHEET_KEYS);
export const RISK_BASIC_COLS = views.basic;
export const RISK_EXPANDED_COLS = views.expanded;

/** 리스크 상세 — `리스크 · {섹션} · ±key` */
export const RISK_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '신원·분류',
    open: true,
    keys: ['company', 'plate', 'customer', 'phone', 'subject', 'group', 'kind', 'status'],
  },
  {
    title: '기한·금액',
    keys: ['carName', 'due', 'amount'],
  },
];

export const RISK_DETAIL_SECTIONS = buildDetailSections(RISK_EXPANDED_COLS, RISK_DETAIL_DEFS);
