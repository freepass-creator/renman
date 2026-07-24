/**
 * 운영시트 컬럼 SSOT — 자산 열 문법 1벌. /sheet(엑셀 고정)와 /asset(카드↔엑셀 토글)이 같은 cols를 쓴다.
 * 컬럼을 페이지마다 손롤하지 말 것 — 여기서 따다 씀(운영시트·현황 표가 어긋나지 않게).
 */
import React from 'react';
import { Badge, won, C, type SheetCol } from '@/components/ui';
import { type SheetRow, type ContractRow, type FleetRow } from './sheet-rows';
import { collectionStage } from './domain/status';
import { dday } from './dashboard-consts';
import { AlertTriangle } from 'lucide-react';

const toneBadge = (t: SheetRow['tone']): 'green' | 'amber' | 'red' | 'gray' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';

/** 자산(차량 1행) 열 — 무엇(차번·법인·소유·가동·차명·연식) · 누구(계약자) · 돈(대여료·미수) · 시간(시작·만기·D-day) */
export const ASSET_COLS: SheetCol<SheetRow>[] = [
  { key: 'plate', label: '차량번호', render: (r) => r.plate || '—', text: (r) => r.plate },
  { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  // 생애단계 = 카드뷰 섹션(구매예정·등록예정·보유중·처분예정·처분완료)이 엑셀에선 이 분류 열로. align center.
  { key: 'own', label: '생애단계', align: 'c', render: (r) => <Badge tone={r.ownership === '보유중' ? 'green' : r.ownership === '처분완료' ? 'gray' : 'amber'}>{r.ownership}</Badge>, text: (r) => r.ownership },
  { key: 'util', label: '가동', align: 'c', render: (r) => <Badge tone={toneBadge(r.tone)}>{r.util}</Badge>, text: (r) => r.util },
  { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  { key: 'year', label: '연식', render: (r) => r.year || '—', text: (r) => r.year },
  { key: 'cust', label: '계약자', render: (r) => r.customer || '—', text: (r) => r.customer },
  { key: 'rent', label: '대여료', align: 'r', render: (r) => r.rent ? won(r.rent) : '—', text: (r) => r.rent },
  {
    key: 'net', label: '미수', align: 'r',
    render: (r) => r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—',
    text: (r) => r.net,
  },
  { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  {
    key: 'dday', label: 'D-day', align: 'r',
    render: (r) => r.dday == null ? '—' : r.dday < 0 ? <span style={{ color: C.danger }}>{r.dday}</span> : `D-${r.dday}`,
    text: (r) => r.dday ?? '',
  },
];

/* ── 계약 열 문법(계약·채권·반납·미수 공용) ──
 *   무엇(차번·법인·차명) · 누구(계약자) · 돈(대여료·보증금·미수) · 시간(시작·만기·D-day) · 상태 · 연락처(끝)
 *   탭/화면마다 «빼기»만 · 자리 고정 — 눈이 같은 데를 본다. */
const misu = (r: ContractRow) =>
  r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{won(r.net)}</span> : '—';

const CT = {
  plate: { key: 'plate', label: '차량번호', render: (r) => r.plate || '—', text: (r) => r.plate },
  co: { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  car: { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  cust: { key: 'cust', label: '계약자', render: (r) => r.customer || '—', text: (r) => r.customer },
  rent: { key: 'rent', label: '대여료', align: 'r', render: (r) => r.rent ? won(r.rent) : '—', text: (r) => r.rent },
  dep: { key: 'dep', label: '보증금', align: 'r', render: (r) => r.deposit ? won(r.deposit) : '—', text: (r) => r.deposit },
  net: { key: 'net', label: '미수', align: 'r', render: misu, text: (r) => r.net },
  start: { key: 'start', label: '시작', render: (r) => r.start || '—', text: (r) => r.start },
  end: { key: 'end', label: '만기', render: (r) => r.end || '—', text: (r) => r.end },
  dday: {
    key: 'dday', label: 'D-day', align: 'r',
    render: (r) => r.dday == null ? '—' : r.dday < 0 ? <span style={{ color: C.danger }}>{r.dday}</span> : `D-${r.dday}`,
    text: (r) => r.dday ?? '',
  },
  ret: { key: 'ret', label: '반납일', render: (r) => r.returned || '—', text: (r) => r.returned },
  st: { key: 'st', label: '상태', render: (r) => <Badge tone={r.ended ? 'gray' : 'green'}>{r.status}</Badge>, text: (r) => r.status },
  od: {
    key: 'od', label: '연체일', align: 'r',
    render: (r) => r.overdueDays > 0
      ? <span style={{ color: r.overdueDays >= 90 ? C.danger : C.warn, fontWeight: 700 }}>{r.overdueDays}일</span>
      : '—',
    text: (r) => r.overdueDays,
  },
  cnt: { key: 'cnt', label: '미납회차', align: 'r', render: (r) => r.count || '—', text: (r) => r.count },
  phone: { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
} satisfies Record<string, SheetCol<ContractRow>>;

/** 계약 기준 열. */
export const CONTRACT_COLS: SheetCol<ContractRow>[] = [
  CT.plate, CT.co, CT.car, CT.cust,
  CT.rent, CT.dep, CT.net,
  CT.start, CT.end, CT.dday,
  CT.st,
  CT.phone,
];

/** 미수/채권 열 = 계약 열 + 회수 판단(연체일·미납회차)을 ⑤ 자리에 추가(앞으로 당기지 않음). */
export const DEBT_COLS: SheetCol<ContractRow>[] = [
  CT.plate, CT.co, CT.car, CT.cust,
  CT.rent, CT.dep, CT.net,
  CT.start, CT.end, CT.dday,
  CT.st, CT.od, CT.cnt,
  CT.phone,
];

/* ── 통합 마스터 열 (운영시트: 차량 1대 = 1행) ──
 *   기본 = 자산(번호판·법인·상태·차명) + 계약/손님(계약자·기간·월렌트) + 미수.
 *   전체 = 기본 + 자산상세(연식·VIN·취득·검사·GPS) + 할부(할부사·원금·이율·개월) + 보험(보험사·만기·보험료) + 연체.
 *   자리 고정 — 전체는 기본 열 사이에 «끼워넣지» 말고 뒤로 확장(눈이 같은 데를 본다). */
const won0 = (n: number) => (n ? won(n) : '—');
const n0 = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');   // 콤마 숫자(₩ 없음) — 보증금·대여료용
const ymd = (s: string) => s ? s.slice(0, 10) : '—';
// 만기 셀 — «한 셀 한 값»: 날짜 하나만, 긴급도는 색으로(만료·D-7=빨강 / D-30=주황 / 그 외 기본). 검사·보험 공용.
const ddayCell = (s: string) => {
  if (!s) return '—';
  const t = ymd(s);
  const d = dday(s);
  if (d == null) return t;
  const color = d < 0 ? C.danger : d <= 7 ? C.danger : d <= 30 ? C.warn : undefined;
  return color ? <span style={{ color, fontWeight: 700 }}>{t}</span> : t;
};
// 남은 기간 — D-day(일수) → 년/개월/일. 0인 단위는 생략(0년 2개월 19일 → 2개월 19일). 지나면 빨강 '만기지남'. (근사: 365일=년·30일=월)
const remainSpan = (d: number | null) => {
  if (d == null) return '—';
  if (d < 0) return <span style={{ color: C.danger, fontWeight: 700 }}>만기지남</span>;
  let rem = d;
  const y = Math.floor(rem / 365); rem -= y * 365;
  const m = Math.floor(rem / 30); rem -= m * 30;
  const parts: string[] = [];
  if (y) parts.push(`${y}년`);
  if (m) parts.push(`${m}개월`);
  if (rem) parts.push(`${rem}일`);
  return parts.length ? parts.join(' ') : '0일';
};
const FL = {
  plate: { key: 'plate', label: '차량번호', render: (r) => r.plate || '—', text: (r) => r.plate },
  co: { key: 'co', label: '회사', render: (r) => r.company || '—', text: (r) => r.company },
  status: { key: 'status', label: '차량상태', render: (r) => <Badge tone={toneBadge(r.tone)}>{r.status}</Badge>, text: (r) => r.status },
  loc: { key: 'loc', label: '현위치', render: (r) => r.location || '—', text: (r) => r.location },
  car: { key: 'car', label: '차명', render: (r) => r.carName || '—', text: (r) => r.carName },
  maker: { key: 'maker', label: '제조사', render: (r) => r.maker || '—', text: (r) => r.maker },
  sub: { key: 'sub', label: '세부모델', render: (r) => r.subModel || '—', text: (r) => r.subModel },
  year: { key: 'year', label: '연식', render: (r) => r.year || '—', text: (r) => r.year },
  vin: { key: 'vin', label: '차대번호', render: (r) => r.vin || '—', text: (r) => r.vin },
  acqDate: { key: 'acqDate', label: '취득일', render: (r) => ymd(r.acqDate), text: (r) => r.acqDate },
  acqPrice: { key: 'acqPrice', label: '취득가', align: 'r', render: (r) => won0(r.acqPrice), text: (r) => r.acqPrice },
  inspect: { key: 'inspect', label: '검사만기', render: (r) => ddayCell(r.inspectionTo), text: (r) => r.inspectionTo },
  gps: { key: 'gps', label: 'GPS', render: (r) => r.gps || '—', text: (r) => r.gps },
  loanCo: { key: 'loanCo', label: '할부사', render: (r) => r.loanCompany || '—', text: (r) => r.loanCompany },
  loanAmt: { key: 'loanAmt', label: '할부원금', align: 'r', render: (r) => won0(r.loanPrincipal), text: (r) => r.loanPrincipal },
  loanRate: { key: 'loanRate', label: '이율', align: 'r', render: (r) => r.loanRate ? `${(r.loanRate * 100).toFixed(1)}%` : '—', text: (r) => r.loanRate },
  loanMon: { key: 'loanMon', label: '할부개월', align: 'r', render: (r) => r.loanMonths || '—', text: (r) => r.loanMonths },
  cust: { key: 'cust', label: '사용처', render: (r) => r.customer || '—', text: (r) => r.customer },
  term: { key: 'term', label: '계약기간', align: 'r', render: (r) => r.termMonths ? `${r.termMonths}개월` : '—', text: (r) => r.termMonths },
  phone: { key: 'phone', label: '연락처', render: (r) => r.phone || '—', text: (r) => r.phone },
  rent: { key: 'rent', label: '대여료', align: 'r', render: (r) => n0(r.rent), text: (r) => r.rent },
  dep: { key: 'dep', label: '보증금', align: 'r', render: (r) => n0(r.deposit), text: (r) => r.deposit },
  start: { key: 'start', label: '시작', render: (r) => ymd(r.start), text: (r) => r.start },
  end: { key: 'end', label: '만기', render: (r) => ymd(r.end), text: (r) => r.end },
  dday: {
    key: 'dday', label: '반납까지', align: 'r',
    render: (r) => remainSpan(r.dday),
    text: (r) => r.dday ?? '',
  },
  insurer: { key: 'insurer', label: '보험사', render: (r) => r.insurer || '—', text: (r) => r.insurer },
  insEnd: { key: 'insEnd', label: '보험만기', render: (r) => ddayCell(r.insEnd), text: (r) => r.insEnd },
  insPrem: { key: 'insPrem', label: '보험료', align: 'r', render: (r) => won0(r.insPremium), text: (r) => r.insPremium },
  net: {
    key: 'net', label: '미수', align: 'r',
    render: (r) => r.net > 0 ? <span style={{ color: C.danger, fontWeight: 700 }}>{n0(r.net)}</span> : '—',
    text: (r) => r.net,
  },
  od: {
    key: 'od', label: '미수기간', align: 'r',
    render: (r) => r.overdueDays > 0 ? <span style={{ color: r.overdueDays >= 90 ? C.danger : C.warn, fontWeight: 700 }}>{r.overdueDays}일</span> : '—',
    text: (r) => r.overdueDays,
  },
  own: { key: 'own', label: '소유', render: (r) => r.ownership || '—', text: (r) => r.ownership },
  util: { key: 'util', label: '가동', render: (r) => r.util || '—', text: (r) => r.util },
  loanStart: { key: 'loanStart', label: '할부시작', render: (r) => ymd(r.loanStart), text: (r) => r.loanStart },
  stage: {
    key: 'stage', label: '회수단계',
    render: (r) => {
      if (r.overdueDays <= 0) return '—';
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
  // 결제일 + 선/후불 — 자동이체일 + 선불/후불(후=주황·선=회색). 계약 없으면 —.
  pay: {
    key: 'pay', label: '결제일', align: 'c',
    render: (r) => r.paymentDay
      ? <span style={{ whiteSpace: 'nowrap' }}>{r.paymentDay}일 <span style={{ color: r.paymentTiming === '후불' ? C.warn : C.mute, fontWeight: 700 }}>{r.paymentTiming === '후불' ? '후' : '선'}</span></span>
      : '—',
    text: (r) => (r.paymentDay ? `${r.paymentDay}일 ${r.paymentTiming}` : ''),
  },
  // 회차 — 도래/총(예 11/12). 계약 없으면 —.
  round: {
    key: 'round', label: '회차', align: 'c',
    render: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : '—'),
    text: (r) => (r.roundTotal ? `${r.roundDue}/${r.roundTotal}` : ''),
  },
  // 비고 — 자유 메모(차량 note/memo). 없으면 —.
  note: { key: 'note', label: '비고', render: (r) => r.note || '—', text: (r) => r.note },
} satisfies Record<string, SheetCol<FleetRow>>;

/** 기본 = 자산식별 + 계약자·연락처 + 기간·D-day + 월렌트 + 미수 (운영현황 스캔 필수, erp5 운영현황 준거). */
/** 기본 = 자산기본(차번·법인·상태·차명·연식) + 계약조건(계약자·기간·보증금·대여료·잔여D-day) + 수납/리스크(미수·회수단계·⚠).
 *  한 셀 한 값 · 자리 고정. 세부(현위치·연락처·VIN·취득·GPS·할부상세·보험·검사만기)는 전체뷰로. */
// 정렬 배정 — 좌(식별자·이름·VIN)=기본 · 우(금액·율)=각 FL의 align'r' 유지 · 가운데(짧은값·날짜·배지·코드)=아래 집합으로 일괄.
const CENTER_ALIGN = new Set(['co', 'status', 'year', 'term', 'start', 'end', 'dday', 'od', 'stage', 'warn', 'own', 'util', 'phone', 'gps', 'acqDate', 'loanMon', 'loanStart', 'insurer', 'insEnd', 'loanCo', 'inspect', 'pay', 'round']);
const alignCols = (cols: SheetCol<FleetRow>[]): SheetCol<FleetRow>[] =>
  cols.map((c) => (CENTER_ALIGN.has(c.key) ? { ...c, align: 'c' as const } : c));

export const FLEET_BASIC_COLS: SheetCol<FleetRow>[] = alignCols([
  FL.co, FL.status, FL.plate, FL.maker, FL.sub, FL.year,                                    // 자산(회사·차량상태·차번·제조사·세부모델·연식) — erp5 운영현황 순서
  FL.cust, FL.phone, FL.term, FL.start, FL.end, FL.dep, FL.rent, FL.pay, FL.round, FL.dday, // 계약(사용처·연락처·기간·시작·만기·보증금·대여료·결제일·회차·반납까지)
  FL.net, FL.od, FL.stage, FL.warn, FL.note,                                                // 수납/리스크·비고
]);

/** 전체 = 기본 열 «그대로» + 부가 열이 우측에 쭉 붙음(연식·VIN·취득·검사·GPS·할부·보험·연체).
 *  기본 열 순서·자리는 고정(눈이 같은 데를 본다) — 확장은 앞에 끼워넣지 않고 뒤로만. */
/** 전체 = 기본 열 그대로 + 나머지 정보 전부(현위치·연락처·소유·가동·자산스펙·할부·보험·검사·연체). 자리 고정 — 뒤로만 확장. */
export const FLEET_EXPANDED_COLS: SheetCol<FleetRow>[] = alignCols([
  ...FLEET_BASIC_COLS,
  FL.car, FL.loc, FL.own, FL.util,
  FL.vin, FL.acqDate, FL.acqPrice, FL.gps,
  FL.loanCo, FL.loanAmt, FL.loanRate, FL.loanMon, FL.loanStart,
  FL.insurer, FL.insEnd, FL.insPrem, FL.inspect,
]);

/** 사이드필터 칩 → 기본뷰에서 «필터 걸면 자동 노출»할 대응 컬럼. 값을 보며 거른다.
 *  (상태·미수·가동은 이미 기본 컬럼이라 생략 — 없는 것만.) */
export const FLEET_REVEAL_COLS: Record<string, SheetCol<FleetRow>[]> = {
  '검사임박': alignCols([FL.inspect]),
  '보험임박': alignCols([FL.insEnd]),
  '할부있음': alignCols([FL.loanCo, FL.loanAmt, FL.loanStart]),
  '보험없음': alignCols([FL.insurer]),
  '연체90일+': alignCols([FL.od, FL.stage]),
};
