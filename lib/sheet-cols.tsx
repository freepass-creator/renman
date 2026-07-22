/**
 * 운영시트 컬럼 SSOT — 자산 열 문법 1벌. /sheet(엑셀 고정)와 /asset(카드↔엑셀 토글)이 같은 cols를 쓴다.
 * 컬럼을 페이지마다 손롤하지 말 것 — 여기서 따다 씀(운영시트·현황 표가 어긋나지 않게).
 */
import React from 'react';
import { Badge, won, C, type SheetCol } from '@/components/ui';
import { type SheetRow, type ContractRow } from './sheet-rows';

const toneBadge = (t: SheetRow['tone']): 'green' | 'amber' | 'red' | 'gray' =>
  t === 'ok' ? 'green' : t === 'warn' ? 'amber' : t === 'danger' ? 'red' : 'gray';

/** 자산(차량 1행) 열 — 무엇(차번·법인·소유·가동·차명·연식) · 누구(계약자) · 돈(대여료·미수) · 시간(시작·만기·D-day) */
export const ASSET_COLS: SheetCol<SheetRow>[] = [
  { key: 'plate', label: '차량번호', render: (r) => r.plate || '—', text: (r) => r.plate },
  { key: 'co', label: '법인', render: (r) => r.company || '—', text: (r) => r.company },
  { key: 'own', label: '소유', render: (r) => <Badge tone="gray">{r.ownership}</Badge>, text: (r) => r.ownership },
  { key: 'util', label: '가동', render: (r) => <Badge tone={toneBadge(r.tone)}>{r.util}</Badge>, text: (r) => r.util },
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
