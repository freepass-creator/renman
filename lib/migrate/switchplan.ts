/**
 * 스위치플랜 「사업현황.xlsx」 → jpkerp6 엔티티 레코드 어댑터 (샘플/씨앗 데이터).
 *
 * 원본(자산·채권·반납·상환합계·고객)은 jpkerp5 lib/migrate/switchplan.ts 로직으로 1회 파싱해
 * switchplan-data.json 에 엔티티 근접 형태로 고정 저장했다(READ-ONLY 원본 유지). 이 어댑터는:
 *   1) vehicle / insurance / bank_tx → 그대로 통과(이미 entities.ts 키에 매핑됨)
 *   2) contract → jpkerp6 수납엔진(contract-ops.buildContract) 이 재계산하는 순미수(net)가
 *      원본 미수(carry, 직원 running balance)와 같아지도록 `_paidTotal` 을 역산해서 채운다.
 *
 * jpkerp6 미수 모델(lib/contract-ops · payments/payment-schedule):
 *   net = max(0, pastDue − _paidTotal),  pastDue = Σ(회차금액 where dueDate ≤ 기준일)
 *   · 활성계약 기준일 = today,  반납계약 기준일 = returnedDate
 *   · generateSchedules 는 paymentDay=25, 선불 고정(buildContract 와 동일)
 * ⇒ _paidTotal = max(0, pastDue − carry)  →  순미수 = carry(원본 실미수)
 */

import type { EntityRecord } from '@/lib/intake/entities';
import { generateSchedules } from '@/lib/payments/payment-schedule';
import { suggestSubject, type SubjectInput } from '@/lib/finance/classify-subject';
import raw from './switchplan-data.json';
import { todayKST } from '@/lib/contracts/dates'; // KST 기준 오늘(기본 today)

type RawContract = {
  contractNo: string;
  contractorName: string;
  contractorPhone?: string;
  plate: string;
  carName: string;
  startDate: string;
  endDate?: string;
  contractDate: string;
  monthlyRent: number;
  deposit: number;
  paymentDay: number;
  status: string;
  deliveredDate: string;
  returnScheduledDate?: string;
  returnedDate?: string;
  endReason?: string;
  _carry: number;
  _kind: 'current' | 'returned';
  _branch?: string;
};
type RawData = {
  asOf: string;
  vehicles: EntityRecord[];
  contracts: RawContract[];
  bankTx: EntityRecord[];
  insurance: EntityRecord[];
};

const data = raw as unknown as RawData;

const PAYMENT_DAY = 25; // buildContract 고정값과 정합

function ymd(s: unknown): string {
  const t = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return '';
  const md = t.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!md) return '';
  let y = Number(md[1]);
  // 엑셀 오기 1930 → 2030 (라이브 파서와 동일)
  if (y >= 1930 && y <= 1939) y += 100;
  if (y < 2000 || y > 2045) return '';
  return `${String(y).padStart(4, '0')}-${md[2]}-${md[3]}`;
}

function scrubEntityDates(rec: EntityRecord, keys: string[]): EntityRecord {
  const out = { ...rec };
  for (const k of keys) {
    if (out[k] == null || out[k] === '') continue;
    const cleaned = ymd(out[k]);
    if (cleaned) out[k] = cleaned;
    else delete out[k];
  }
  return out;
}

/** start→end 사이 개월 수(월 경계 기준). buildContract 의 회차 도래와 정합하도록 dueDate 로 카운트. */
function monthDiff(start: string, end: string): number {
  if (!start || !end) return 0;
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
}

/**
 * 계약 1건 → jpkerp6 계약 레코드.
 * rentalMonths 는 (실제약정기간, 도래분 커버에 필요한 개월) 중 큰 값으로 잡아
 * pastDue 계산이 잘리지 않게 한다(순미수 정확도 보장).
 */
function buildContractRecord(c: RawContract, today: string): EntityRecord {
  const start = ymd(c.startDate);
  const returned = c._kind === 'returned';
  const cutoff = returned ? (ymd(c.returnedDate) || today) : today;

  // 소스 손상 방어: startDate 이전의 만기/반납예정일(예 1930-…)은 불가능 → 무효(만기 미정)로 취급.
  const rawEnd = ymd(c.endDate);
  const validEnd = rawEnd && start && rawEnd >= start ? rawEnd : '';
  const rawRetSched = ymd(c.returnScheduledDate);
  const validRetSched = rawRetSched && start && rawRetSched >= start ? rawRetSched : '';

  // 약정기간(표시용): end 있으면 그로, 없으면 반납/기본 12
  let realTerm = validEnd ? monthDiff(start, validEnd) : (returned ? monthDiff(start, cutoff) : 12);
  if (realTerm < 1) realTerm = returned ? Math.max(1, monthDiff(start, cutoff) + 1) : 12;
  // 도래분 커버 보장: cutoff 까지의 회차 수 이상
  const elapsed = start ? monthDiff(start, cutoff) + 1 : 0;
  const rentalMonths = Math.max(realTerm, elapsed, 1);

  // 결제일 = 채권/반납 시트 실 결제일(c.paymentDay) 우선 → 없으면 시작일의 일자 → 그것도 없으면 25.
  const sheetPayDay = Number(c.paymentDay);
  const payDay = (sheetPayDay >= 1 && sheetPayDay <= 31) ? sheetPayDay
    : (/^\d{4}-\d{2}-(\d{2})/.test(start) ? Math.min(31, Math.max(1, Number(start.slice(8, 10)))) : PAYMENT_DAY);
  const carry = Math.max(0, c._carry || 0);
  // pastDue = Σ(회차금액 where dueDate ≤ cutoff) — buildContract 와 동일 엔진
  let paidTotal = 0;
  if (start && c.monthlyRent > 0) {
    const schedules = generateSchedules({ contractDate: start, termMonths: rentalMonths, monthlyRent: c.monthlyRent, paymentDay: payDay, paymentTiming: '선불' });
    const pastDue = schedules.filter((s) => s.dueDate && s.dueDate <= cutoff).reduce((sum, s) => sum + s.amount, 0);
    paidTotal = Math.max(0, pastDue - carry); // 납부 표시(도래분−실미수)
  }

  const rec: EntityRecord = {
    contractNo: c.contractNo,
    contractorName: c.contractorName,
    plate: c.plate,
    carName: c.carName,
    rentalMonths,
    startDate: start,
    endDate: validEnd || undefined,
    contractDate: ymd(c.contractDate) || start,
    monthlyRent: c.monthlyRent,
    deposit: c.deposit,
    paymentDay: payDay,
    paymentTiming: '선불',   // 소스에 선/후불 없음 — 기본 선불(계약 편집에서 후불로 변경)
    paymentMethod: '이체',
    status: c.status,
    deliveredDate: ymd(c.deliveredDate) || start,
    _paidTotal: paidTotal,
    _carryUnpaid: carry,   // net 앵커 — 실미수=carry 보장(스케줄 경계·반납일 이상치 무관)
  };
  if (c.contractorPhone) rec.contractorPhone = c.contractorPhone;
  if (returned) {
    rec.returnedDate = ymd(c.returnedDate);
    rec.endReason = c.endReason;
  } else if (validRetSched) {
    rec.returnScheduledDate = validRetSched;
  }
  for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
  return rec;
}

export type SwitchplanPack = {
  vehicle: EntityRecord[];
  contract: EntityRecord[];
  insurance: EntityRecord[];
  bank_tx: EntityRecord[];
};

// 계좌 거래 자동 계정과목 — suggestSubject(SSOT) 재사용. 명확한 신호(high/medium)만 확정,
// 저확신 입금이라도 입금자명이 계약자명과 일치하면 대여료수입으로 확정(손님 월납). 나머지는 미분류(사람 확인).
function classifyBankTx(tx: EntityRecord, contractorNames: Set<string>): string {
  const existing = String(tx.category || '');
  if (existing && existing !== '(미분류)') return existing; // 이미 분류된 건 보존
  const method = String(tx.method || '');
  const source: SubjectInput['source'] = method === 'CMS' ? 'CMS' : method === '카드' ? '카드매출' : '계좌';
  const inAmt = Number(tx.amount) || 0;
  const party = String(tx.counterparty || '');
  const s = suggestSubject({ party, memo: String(tx.memo || ''), inAmt, outAmt: Number(tx.withdraw) || 0, source });
  if (s && (s.confidence === 'high' || s.confidence === 'medium')) return s.label;
  if (inAmt > 0) { const nm = party.replace(/[\s\d]/g, ''); if (nm && contractorNames.has(nm)) return '대여료수입'; }
  return '';
}

/** 스위치플랜 전체 샘플 팩. today 기준으로 순미수(net)=원본 carry 가 되도록 계약을 역산. */
export function buildSwitchplanPack(today: string = todayKST()): SwitchplanPack {
  const contractorNames = new Set(data.contracts.map((c) => String(c.contractorName || '').replace(/[\s\d]/g, '')).filter(Boolean));
  const vehDateKeys = ['firstReg', 'inspectionTo', 'acquisitionDate', 'saleDate', 'loanStartDate'];
  const insDateKeys = ['startDate', 'endDate'];
  return {
    vehicle: data.vehicles.map((v) => scrubEntityDates(v, vehDateKeys)),
    contract: data.contracts.map((c) => buildContractRecord(c, today)),
    insurance: data.insurance.map((i) => scrubEntityDates(i, insDateKeys)),
    bank_tx: data.bankTx.map((t) => { const cat = classifyBankTx(t, contractorNames); return cat ? { ...t, category: cat } : t; }),
  };
}

/** 진단용 메타(원본 미수 합계·건수). 씨앗 검증/리포트에 사용. */
export const SWITCHPLAN_META = {
  asOf: data.asOf,
  vehicleCount: data.vehicles.length,
  runningCount: data.vehicles.filter((v) => v.status === '운행').length,
  idleCount: data.vehicles.filter((v) => v.status !== '운행').length,
  contractCount: data.contracts.length,
  delinquentCount: data.contracts.filter((c) => (c._carry || 0) > 0).length,
  totalCarry: data.contracts.reduce((s, c) => s + (c._carry || 0), 0),
  insuranceCount: data.insurance.length,
  bankTxCount: data.bankTx.length,
};
