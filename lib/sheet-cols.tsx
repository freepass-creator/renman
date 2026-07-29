/**
 * 원장·현황 표 열 SSOT.
 *   표식(선두·pin): 운영 = 회사명(key `company`) → 차량번호 · 재무 거래 = 회사명(key `company`) → 계좌.
 *   회사 열 key = `company` (전 원장 통일).
 *   회사명(풀)=companyLabel 은 공문·설정용 · 표의 회사열은 companyDisplay/short.
 *   컬럼을 페이지마다 손롤하지 말 것 — 여기서 따다 씀.
 *   자산·계약 마스터 열 = lib/master-ledger-cols.
 */
import React from 'react';
import { Badge, won, C, type SheetCol } from '@/components/ui';
import { type FleetRow } from './sheet-rows';
import { collectionStage } from './domain/status';
import { dday } from './dashboard-consts';
import { AlertTriangle } from 'lucide-react';
import { buildDetailSections, buildSheetViews, type DetailSectionDef, type SheetViewKeys } from './ledger-ext';
import { paymentTimingOf } from './schema/contract';
import { LEDGER_EMPTY } from './ledger-empty';

const toneBadge = (t: FleetRow['tone']): 'green' | 'amber' | 'red' | 'gray' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';

/* ── 통합 마스터 열 (운영시트: 차량 1대 = 1행) ──
 *   기본 = 자산(번호판·법인·상태·차명) + 계약/손님(계약자·기간·월렌트) + 미수.
 *   전체 = 기본 + 자산상세(연식·VIN·취득·검사·GPS) + 할부(할부사·원금·이율·개월) + 보험(보험사·만기·보험료) + 연체.
 *   자리 고정 — 전체는 기본 열 사이에 «끼워넣지» 말고 뒤로 확장(눈이 같은 데를 본다). */
const won0 = (n: number) => (n ? won(n) : LEDGER_EMPTY.dash);
const n0 = (n: number) => (n ? n.toLocaleString('ko-KR') : LEDGER_EMPTY.dash);   // 콤마 숫자(₩ 없음) — 보증금·대여료용
const ymd = (s: string) => s ? s.slice(0, 10) : LEDGER_EMPTY.dash;
// 만기 셀 — «한 셀 한 값»: 날짜 하나만, 긴급도는 색으로(만료·D-7=빨강 / D-30=주황 / 그 외 기본). 검사·보험 공용.
const ddayCell = (s: string) => {
  if (!s) return LEDGER_EMPTY.dash;
  const t = ymd(s);
  const d = dday(s);
  if (d == null) return t;
  const color = d < 0 ? C.danger : d <= 7 ? C.danger : d <= 30 ? C.warn : undefined;
  return color ? <span style={{ color, fontWeight: 700 }}>{t}</span> : t;
};
// 남은 기간 라벨 — 년/개월/일(0단위 생략). 툴팁용. 지나면 «만기지남 N일».
export function remainSpanLabel(d: number | null): string {
  if (d == null) return '';
  if (d < 0) return `만기지남 ${Math.abs(d)}일`;
  let rem = d;
  const y = Math.floor(rem / 365); rem -= y * 365;
  const m = Math.floor(rem / 30); rem -= m * 30;
  const parts: string[] = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  if (rem) parts.push(`${rem}일`);
  return parts.length ? parts.join(' ') : '0일';
}
const FL = {
  plate: { key: 'plate', label: '차량번호', pin: true, render: (r) => r.plate || LEDGER_EMPTY.dash, text: (r) => r.plate },
  company: { key: 'company', label: '회사명', pin: true, render: (r) => r.company || LEDGER_EMPTY.dash, text: (r) => r.company },
  status: { key: 'status', label: '차량상태', render: (r) => <Badge tone={toneBadge(r.tone)}>{r.status}</Badge>, text: (r) => r.status },
  loc: { key: 'loc', label: '현위치', render: (r) => r.location || LEDGER_EMPTY.dash, text: (r) => r.location },
  car: { key: 'car', label: '차명', render: (r) => r.carName || LEDGER_EMPTY.dash, text: (r) => r.carName },
  maker: { key: 'maker', label: '제조사', render: (r) => r.maker || LEDGER_EMPTY.dash, text: (r) => r.maker },
  sub: { key: 'sub', label: '세부모델', render: (r) => r.subModel || LEDGER_EMPTY.dash, text: (r) => r.subModel },
  year: { key: 'year', label: '연식', render: (r) => r.year || LEDGER_EMPTY.dash, text: (r) => r.year },
  vin: { key: 'vin', label: '차대번호', render: (r) => r.vin || LEDGER_EMPTY.dash, text: (r) => r.vin },
  acqDate: { key: 'acqDate', label: '취득일', render: (r) => ymd(r.acqDate), text: (r) => r.acqDate },
  acqPrice: { key: 'acqPrice', label: '취득가', align: 'r', render: (r) => won0(r.acqPrice), text: (r) => r.acqPrice },
  inspect: { key: 'inspect', label: '검사만기', render: (r) => ddayCell(r.inspectionTo), text: (r) => r.inspectionTo },
  gps: { key: 'gps', label: 'GPS', render: (r) => r.gps || LEDGER_EMPTY.dash, text: (r) => r.gps },
  loanCo: { key: 'loanCo', label: '할부사', render: (r) => r.loanCompany || LEDGER_EMPTY.dash, text: (r) => r.loanCompany },
  loanAmt: { key: 'loanAmt', label: '할부원금', align: 'r', render: (r) => won0(r.loanPrincipal), text: (r) => r.loanPrincipal },
  loanRate: { key: 'loanRate', label: '이율', align: 'r', render: (r) => r.loanRate ? `${(r.loanRate * 100).toFixed(1)}%` : LEDGER_EMPTY.dash, text: (r) => r.loanRate },
  loanMon: { key: 'loanMon', label: '할부개월', align: 'r', render: (r) => r.loanMonths || LEDGER_EMPTY.dash, text: (r) => r.loanMonths },
  cust: { key: 'cust', label: '사용처', render: (r) => r.customer || LEDGER_EMPTY.none, text: (r) => r.customer },
  term: { key: 'term', label: '계약기간', align: 'r', render: (r) => r.termMonths ? `${r.termMonths}개월` : LEDGER_EMPTY.dash, text: (r) => r.termMonths },
  phone: { key: 'phone', label: '연락처', render: (r) => r.phone || LEDGER_EMPTY.dash, text: (r) => r.phone },
  rent: { key: 'rent', label: '대여료', align: 'r', render: (r) => n0(r.rent), text: (r) => r.rent },
  dep: { key: 'dep', label: '보증금', align: 'r', render: (r) => n0(r.deposit), text: (r) => r.deposit },
  start: { key: 'start', label: '시작', render: (r) => ymd(r.start), text: (r) => r.start },
  end: { key: 'end', label: '만기', render: (r) => ymd(r.end), text: (r) => r.end },
  dday: {
    key: 'dday', label: '반납까지', align: 'r',
    render: (r) => {
      if (r.dday == null) return LEDGER_EMPTY.dash;
      const tip = remainSpanLabel(r.dday);
      const color = r.dday < 0 ? C.danger : r.dday <= 7 ? C.warn : undefined;
      const body = r.dday === 0 ? '0' : String(r.dday);
      return color
        ? <span title={tip} style={{ color, fontWeight: 700 }}>{body}</span>
        : <span title={tip}>{body}</span>;
    },
    text: (r) => r.dday ?? '',
  },
  insurer: { key: 'insurer', label: '보험사', render: (r) => r.insurer || LEDGER_EMPTY.dash, text: (r) => r.insurer },
  insEnd: { key: 'insEnd', label: '보험만기', render: (r) => ddayCell(r.insEnd), text: (r) => r.insEnd },
  insPrem: { key: 'insPrem', label: '보험료', align: 'r', render: (r) => won0(r.insPremium), text: (r) => r.insPremium },
  net: {
    key: 'net', label: '미수', align: 'r',
    render: (r) => r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{n0(r.net)}</span> : LEDGER_EMPTY.dash,
    text: (r) => r.net,
  },
  od: {
    key: 'od', label: '미수기간', align: 'r',
    render: (r) => r.overdueDays > 0 ? <span style={{ color: r.overdueDays >= 90 ? C.danger : C.warn, fontWeight: 700 }}>{r.overdueDays}일</span> : LEDGER_EMPTY.dash,
    text: (r) => r.overdueDays,
  },
  own: { key: 'own', label: '소유', render: (r) => r.ownership || LEDGER_EMPTY.dash, text: (r) => r.ownership },
  util: { key: 'util', label: '가동', render: (r) => r.util || LEDGER_EMPTY.dash, text: (r) => r.util },
  loanStart: { key: 'loanStart', label: '할부시작', render: (r) => ymd(r.loanStart), text: (r) => r.loanStart },
  stage: {
    key: 'stage', label: '회수단계',
    render: (r) => {
      if (r.overdueDays <= 0) return LEDGER_EMPTY.dash;
      const cs = collectionStage(r.overdueDays);
      const col = (cs.tone === 'red' || cs.tone === 'purple') ? C.danger : cs.tone === 'orange' ? C.warn : C.mute;
      return <span style={{ color: col, fontWeight: 700 }}>{cs.stage}</span>;
    },
    text: (r) => (r.overdueDays > 0 ? collectionStage(r.overdueDays).stage : ''),
  },
  // 인라인 경고 — 최고심각도 톤(위험 빨강·경고 주황) + 건수. hover(title)=사유 나열. 값=sheet-warnings.
  warn: {
    key: 'warn', label: '경고',
    render: (r) => {
      const ws = r.warnings;
      if (!ws.length) return <span style={{ color: C.faint }}>—</span>;
      const high = ws.some((w) => w.sev === 'high');
      return (
        <span title={ws.map((w) => (w.sev === 'high' ? '⚠ ' : '· ') + w.label).join('\n')} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: high ? C.danger : C.warn, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'help' }}>
          <AlertTriangle size={13} /> {ws.length}
        </span>
      );
    },
    text: (r) => r.warnings.map((w) => w.label).join(' · '),
  },
  // 결제일 · 납부시기 — 한 셀에 합치지 않음(각각 열).
  paymentDay: {
    key: 'paymentDay', label: '결제일', align: 'c',
    render: (r) => (r.paymentDay ? `${r.paymentDay}일` : LEDGER_EMPTY.dash),
    text: (r) => (r.paymentDay ? `${r.paymentDay}일` : ''),
  },
  paymentTiming: {
    key: 'paymentTiming', label: '납부시기', align: 'c',
    render: (r) => {
      if (!r.paymentDay && !r.paymentTiming) return LEDGER_EMPTY.dash;
      const t = paymentTimingOf(r.paymentTiming);
      return <span style={{ color: t === '후납' ? C.warn : C.mute, fontWeight: 700 }}>{t}</span>;
    },
    text: (r) => (r.paymentDay || r.paymentTiming ? paymentTimingOf(r.paymentTiming) : ''),
  },
  // 회차 — 도래/총(예 11/12). 계약 없으면 —.
  round: {
    key: 'round', label: '회차', align: 'c',
    render: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : LEDGER_EMPTY.dash),
    text: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : ''),
  },
  // 비고 — 자유 메모(차량 note/memo). 없으면 —.
  note: { key: 'note', label: '비고', render: (r) => r.note || LEDGER_EMPTY.dash, text: (r) => r.note },
  rentalType: {
    key: 'rentalType', label: '대여형태', align: 'c',
    render: (r) => r.rentalType || LEDGER_EMPTY.dash,
    text: (r) => r.rentalType,
  },
} satisfies Record<string, SheetCol<FleetRow>>;

/** 기본 = 자산기본(차번·법인·상태·차명·연식) + 계약조건 + 수납/리스크. 한 셀 한 값 · 자리 고정.
 *  정렬 배정 — 가운데(짧은값·날짜·배지)=CENTER · 금액은 FL align'r' 유지. */
const CENTER_ALIGN = new Set(['company', 'status', 'year', 'term', 'start', 'end', 'dday', 'od', 'stage', 'warn', 'own', 'util', 'phone', 'gps', 'acqDate', 'loanMon', 'loanStart', 'insurer', 'insEnd', 'loanCo', 'inspect', 'paymentDay', 'paymentTiming', 'round', 'rentalType']);
const alignCols = (cols: SheetCol<FleetRow>[]): SheetCol<FleetRow>[] =>
  cols.map((c) => (CENTER_ALIGN.has(c.key) ? { ...c, align: 'c' as const } : c));

/** 운영 열 카탈로그 — 새 항목은 FL에 정의 후 SHEET_KEYS에 key만. */
const FLEET_COL_CATALOG: SheetCol<FleetRow>[] = alignCols([
  FL.company, FL.plate, FL.status, FL.maker, FL.sub, FL.year,
  FL.cust, FL.phone, FL.rentalType, FL.term, FL.start, FL.end, FL.dep, FL.rent, FL.paymentDay, FL.paymentTiming, FL.round, FL.dday,
  FL.net, FL.od, FL.stage, FL.warn, FL.note,
  FL.car, FL.loc, FL.own, FL.util,
  FL.vin, FL.acqDate, FL.acqPrice, FL.gps,
  FL.loanCo, FL.loanAmt, FL.loanRate, FL.loanMon, FL.loanStart,
  FL.insurer, FL.insEnd, FL.insPrem, FL.inspect,
]);

/** 운영 엑셀 열 — `운영 · 엑셀기본|엑셀전체 · +|-key` @see lib/ledger-ext.ts */
export const FLEET_SHEET_KEYS: SheetViewKeys = {
  // 기본=스캔 핵심만 · 제조/납부조건/비고는 전체
  basic: [
    'company', 'plate', 'cust', 'status', 'rentalType', 'end', 'dday', 'rent', 'net', 'od', 'warn',
  ],
  all: [
    'company', 'plate', 'cust', 'status', 'maker', 'sub', 'year',
    'phone', 'rentalType', 'term', 'start', 'end', 'dep', 'rent', 'paymentDay', 'paymentTiming', 'round', 'dday',
    'net', 'od', 'stage', 'warn', 'note',
    'car', 'loc', 'own', 'util',
    'vin', 'acqDate', 'acqPrice', 'gps',
    'loanCo', 'loanAmt', 'loanRate', 'loanMon', 'loanStart',
    'insurer', 'insEnd', 'insPrem', 'inspect',
  ],
};

const _fleetViews = buildSheetViews(FLEET_COL_CATALOG, FLEET_SHEET_KEYS);
export const FLEET_BASIC_COLS = _fleetViews.basic;
export const FLEET_EXPANDED_COLS = _fleetViews.expanded;

export const FLEET_DETAIL_DEFS: DetailSectionDef[] = [
  {
    title: '차량·상태',
    open: true,
    keys: ['company', 'plate', 'status', 'maker', 'sub', 'year', 'car', 'loc', 'own', 'util'],
  },
  {
    title: '계약',
    keys: ['cust', 'phone', 'rentalType', 'term', 'start', 'end', 'dep', 'rent', 'paymentDay', 'paymentTiming', 'round', 'dday'],
  },
  {
    title: '수납·리스크',
    keys: ['net', 'od', 'stage', 'warn', 'note'],
  },
  {
    title: '자산·취득',
    keys: ['vin', 'acqDate', 'acqPrice', 'gps', 'inspect'],
  },
  {
    title: '금융·보험',
    keys: ['loanCo', 'loanAmt', 'loanRate', 'loanMon', 'loanStart', 'insurer', 'insEnd', 'insPrem'],
  },
];

export const FLEET_DETAIL_SECTIONS = buildDetailSections(FLEET_EXPANDED_COLS, FLEET_DETAIL_DEFS);

/** 사이드필터 칩 → 기본뷰에서 «필터 걸면 자동 노출»할 대응 컬럼. 값을 보며 거른다.
 *  (상태·미수·가동은 이미 기본 컬럼이라 생략 — 없는 것만.) */
export const FLEET_REVEAL_COLS: Record<string, SheetCol<FleetRow>[]> = {
  '검사임박': alignCols([FL.inspect]),
  '보험임박': alignCols([FL.insEnd]),
  '할부있음': alignCols([FL.loanCo, FL.loanAmt, FL.loanStart]),
  '보험없음': alignCols([FL.insurer]),
  '연체90일+': alignCols([FL.od, FL.stage]),
};
