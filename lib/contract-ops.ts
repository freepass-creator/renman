/**
 * 계약 라이프사이클 — 순수 로직(SSOT). 페이지는 여기서 도출/전이만 따다 쓴다.
 * 검증 엔진 위에 올림: generateSchedules/recalcContract(미수) + applyReturnedProration(반납 일할).
 *   상태전이: 대기 →(인도)→ 운행 →(반납/해지)→ 반납/해지. 연장은 기간 증가.
 *   반납 시 마지막 회차 일할정산 자동 → 순미수 자동 차감.
 */
import type { EntityRecord } from './intake/entities';
import type { Contract, PaymentEntry, DiscountEntry } from './payments/types';
import { generateSchedules, recalcContract, addPaymentEntry, addDiscountEntry, distributeUnpaid, applyPayment, computeCurrentSeq, isSyntheticPayment } from './payments/payment-schedule';
import { applyReturnedProration } from './payments/returned-proration';
import { ymd, ddayFrom, addMonthsIso } from './contracts/dates';
import { openChargesTotal } from './contracts/charges';
import {
  isDeliveryPending as statusDeliveryPending,
  isReturnable as statusReturnable,
  isContractEndedStatus,
  type LifeStatus as StatusLife,
} from './domain/status';
import { isPostpaidTiming } from './schema/contract';

export type LifeStatus = StatusLife;

export type ContractView = {
  rec: EntityRecord;
  status: LifeStatus;
  delivered: boolean;
  ended: boolean;
  startDate: string;
  endDate: string;
  monthsLeft: number | null;   // 만기까지 일수→개월 아님, D-day(일)
  dday: number | null;         // endDate까지 일수 (음수=경과)
  gross: number;               // 도래 미수(일할 반영 후) + 미결제 추가청구
  paid: number;                // 실입금 누계(synthetic·보증금충당 제외)
  net: number;                 // 순미수 ≥ 0
  overpay: number;             // 과오납(환불의무) — net은 0 밑으로 안 내려가므로 별도
  count: number;               // 미납 회차수
  refund: number;              // 반납 일할 환불(있으면)
  monthlyRent: number;
  overdueDays: number;         // 가장 오래된 미납 회차 경과일(0=미납없음) — 회수 SLA 단계 판정용
  roundDue: number;            // 도래(경과) 회차 수
  roundTotal: number;          // 총 회차 수(= 대여기간 개월)
};

/** 계약 레코드 → v5 Contract(스케줄 포함) 빌드. 저장된 수기 입금(_payments)·청구할인(_discounts) 적용. */
function buildContract(rec: EntityRecord, today: string): Contract {
  const rent = Number(rec.monthlyRent) || 0;
  const term = Number(rec.rentalMonths) || 0;
  const start = ymd(rec.startDate || rec.contractDate);
  // 결제일·납부시기 = 계약 캡처값 우선. 없으면 25일·선납 폴백(기존 데이터 무회귀). 스케줄 엔진은 선불/후불 키.
  const pd = Number(rec.paymentDay);
  const payDay = pd >= 1 && pd <= 31 ? pd : 25;
  const timing: '선불' | '후불' = isPostpaidTiming(rec.paymentTiming) ? '후불' : '선불';
  let schedules = (rent && term && start)
    ? generateSchedules({ contractDate: start, termMonths: term, monthlyRent: rent, paymentDay: payDay, paymentTiming: timing })
        .map((s) => ({ ...s, id: 's' + s.seq, contractId: String(rec._key || 'c') }))
    : [];
  const pays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  // chargeKind 수납은 회차표가 아니라 _charges 잔액만 깐다(보증금충당 순서 2·3단계).
  const schedulePays = pays.filter((p) => !p.chargeKind);
  const discs = Array.isArray(rec._discounts) ? (rec._discounts as Array<Record<string, unknown>>) : [];
  // 미수 분배 먼저 — 명시 실미수(_carryUnpaid) 또는 레거시 _paidTotal.
  //   ★앱수납(_payments) 유무와 무관하게 선행(B-1 완화). 예전 `!pays.length` 가드는 첫 앱수납 순간
  //   분배를 건너뛰어 회차표·헤드라인이 어긋나는 스위칭 버그였다.
  const paidTotal = Number(rec._paidTotal) || 0;
  const hasCarry = rec._carryUnpaid !== undefined && rec._carryUnpaid !== null;
  // 선불 = 1회차(인도 시 결제) 완료 고정 → 미수/carry는 «2회차부터» 분배. (후불은 1회차부터 미수 가능 = 무변경.)
  //   1회차 dueDate가 도래(인도 완료)했을 때만 적용. 미래 시작 계약은 아직 인도 전이라 제외.
  const prepaidFirst = timing === '선불' && schedules.length > 0 && String(schedules[0].dueDate || '') <= today;
  if (prepaidFirst) {
    const h = schedules[0];
    // 런타임엔 payments 보유(distributeUnpaid와 동일) — 요소 타입엔 미선언이라 캐스팅.
    schedules[0] = { ...h, status: '완료', paidAmount: h.amount, paidAt: h.dueDate,
      payments: [{ date: h.dueDate, amount: h.amount, source: '정산', synthetic: true, memo: '선불 1회차(인도 시 납부)' }] } as (typeof schedules)[number];
  }
  const distTarget = prepaidFirst ? schedules.slice(1) : schedules;   // 선불이면 2회차부터 분배
  if (distTarget.length && (hasCarry || paidTotal > 0)) {
    const rd = ymd(rec.returnedDate);
    const cutoff = rd && rd < today ? rd : today;
    const pastDue = distTarget.filter((sc) => String(sc.dueDate || '') <= cutoff).reduce((sum, sc) => sum + sc.amount, 0);
    const unpaid = hasCarry ? Math.max(0, Number(rec._carryUnpaid) || 0) : Math.max(0, pastDue - paidTotal);
    const distributed = distributeUnpaid(distTarget, unpaid, cutoff, '');
    schedules = prepaidFirst ? [schedules[0], ...distributed] : distributed;
  }
  if (schedules.length && (schedulePays.length || discs.length)) {
    const bySeq = new Map<number, number>(schedules.map((s, i) => [s.seq, i]));
    for (const dsc of discs) {
      const idx = bySeq.get(Number(dsc.seq));
      if (idx != null) schedules[idx] = addDiscountEntry(schedules[idx], { date: String(dsc.date || ''), amount: Number(dsc.amount) || 0, reason: (dsc.reason || '기타') } as DiscountEntry, today);
    }
    // 씨앗(carry) 계약: 분배 후 실수납은 FIFO(applyPayment). seq 지정 납부는 분배와 어긋나 회차 왜곡.
    // 일반 계약: 회차(seq)에 직접 가산.
    if (hasCarry) {
      for (const p of schedulePays) {
        const amt = Number(p.amount) || 0;
        if (amt <= 0) continue;
        const src = (p.source || '수동') as PaymentEntry['source'];
        schedules = applyPayment(schedules, amt, String(p.date || today), src, p.txId ? { txId: String(p.txId) } : undefined).schedules;
      }
    } else {
      for (const p of schedulePays) {
        const idx = bySeq.get(Number(p.seq));
        if (idx != null) { const r = addPaymentEntry(schedules[idx], { date: String(p.date || ''), amount: Number(p.amount) || 0, source: (p.source || '수동') } as PaymentEntry, today); schedules[idx] = r.schedule; }
      }
    }
  }
  return { id: String(rec._key || 'c'), monthlyRent: rent, termMonths: term, status: '운행', schedules } as unknown as Contract;
}

/** 매칭용 v5 Contract — 신원(임차인·차번·입금별칭)+스케줄. 자동매칭 엔진(receipt-match) 입력용. */
export function buildMatchContract(rec: EntityRecord, today: string): Contract {
  const c = buildContract(rec, today);
  const aliases = Array.isArray(rec.payerAliases) ? (rec.payerAliases as string[]) : [];
  return {
    ...c,
    contractNo: String(rec.contractNo || rec._key || ''),
    customerName: String(rec.contractorName || ''),
    vehiclePlate: String(rec.plate || ''),
    driverName: String(rec.driverName || ''),
    payerAliases: aliases,
    status: deriveStatus(rec),
  } as unknown as Contract;
}

/** 상태 도출 — 명시 status 우선, 없으면 인도/반납 날짜로 추론. */
export function deriveStatus(rec: EntityRecord): LifeStatus {
  const s = String(rec.status || '') as LifeStatus;
  if (s) return s;
  if (rec.returnedDate) return '반납';
  if (rec.deliveredDate) return '운행';
  return '대기';
}

/** 표시용 유효 만기일 — startDate 이전(1930 등 소스손상 값)이면 무효('')로 처리해 계산·표시에서 배제.
 *  재수입 안 된 라이브 데이터에도 1930이 안 보이게 하는 방어(migration 가드와 동일 규칙). */
export function effectiveEndDate(rec: EntityRecord): string {
  const start = ymd(rec.startDate || rec.contractDate);
  const rawEnd = ymd(rec.endDate);
  return rawEnd && start && rawEnd >= start ? rawEnd : '';
}

/** 계약 1건의 운영 뷰(상태·미수·일할·D-day) 산출. */
export function computeContractView(rec: EntityRecord, today: string): ContractView {
  const status = deriveStatus(rec);
  const ended = isContractEndedStatus(status);
  const delivered = !!rec.deliveredDate || status === '운행' || ended;
  const start = ymd(rec.startDate || rec.contractDate);
  // 1930 등 startDate 이전 만기는 무효 → start+rentalMonths로 폴백(소스손상 방어, 재수입 전에도 안전)
  const end = effectiveEndDate(rec) || (start && Number(rec.rentalMonths) ? addMonthsIso(start, Number(rec.rentalMonths)) : '');
  const returnedDate = ymd(rec.returnedDate);

  let c = buildContract(rec, today);
  let refund = 0;
  // 마이그레이션 씨앗(_carryUnpaid = 직원 확정 실미수)은 이미 정산(보증금상계·과오납 등)이 반영된 값 →
  //   일할 재정산을 다시 걸면 carry가 이중차감돼 회수 대상 금액을 놓친다 → 씨앗 계약은 일할 skip.
  const seedCarry = rec._carryUnpaid !== undefined && rec._carryUnpaid !== null;
  if (returnedDate && c.schedules?.length && !seedCarry) {
    const before = recalcContract(c, today).unpaidAmount || 0;
    c = applyReturnedProration(c, returnedDate);   // 반납 일할 entry 삽입
    const after = recalcContract(c, today).unpaidAmount || 0;
    refund = Math.max(0, before - after);
  }
  // 미수 기준일: 반납했으면 반납일까지만 도래
  const asOf = returnedDate && returnedDate < today ? returnedDate : today;
  const rc = recalcContract(c, asOf);
  const overdueDue = (rc.schedules || []).filter((s) => s.status === '연체' || s.status === '부분납').map((s) => s.dueDate).filter(Boolean).sort();
  const overdueDays = overdueDue.length ? Math.max(0, Math.round((new Date(asOf).getTime() - new Date(overdueDue[0]).getTime()) / 86400000)) : 0;
  const schedGross = rc.unpaidAmount || 0;
  const allPays = Array.isArray(rec._payments) ? (rec._payments as Array<Record<string, unknown>>) : [];
  const isSynth = (p: Record<string, unknown>) => isSyntheticPayment(p as { synthetic?: boolean; source?: string; kind?: string });
  const realPays = allPays.filter((p) => !isSynth(p));
  const synthPays = allPays.filter((p) => isSynth(p));
  const realPaidAmt = realPays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const seedPaidTotal = Number(rec._paidTotal) || 0;
  // 입금누계 = 실입금만(보증금충당·synthetic 제외). 씨앗은 개시분(_paidTotal)+오픈후 실수납.
  const paid = seedCarry ? seedPaidTotal + realPaidAmt : realPaidAmt;
  const carrySeed = Math.max(0, Number(rec._carryUnpaid) || 0);
  const hasAnyPay = allPays.length > 0;
  const seedNet = seedCarry ? (hasAnyPay ? schedGross : carrySeed) : null;
  const schedPart = seedNet != null ? seedNet : schedGross;
  // 과오납: synthetic만 적용한 잔여채권 − 실입금. net은 0 하한 · overpay 별도.
  const owedAfterSynth = (() => {
    if (!realPays.length && !synthPays.length) return schedPart + openChargesTotal(rec);
    const synthOnly = { ...rec, _payments: synthPays } as EntityRecord;
    let c2 = buildContract(synthOnly, today);
    if (returnedDate && c2.schedules?.length && !seedCarry) {
      c2 = applyReturnedProration(c2, returnedDate);
    }
    const asOf2 = returnedDate && returnedDate < today ? returnedDate : today;
    const sched2 = recalcContract(c2, asOf2).unpaidAmount || 0;
    const seed2 = seedCarry ? (synthPays.length ? sched2 : carrySeed) : sched2;
    return Math.max(0, seed2) + openChargesTotal(synthOnly);
  })();
  const overpay = Math.max(0, realPaidAmt - owedAfterSynth);
  const net = Math.max(0, owedAfterSynth - realPaidAmt);
  const gross = owedAfterSynth;
  // ★레거시 view-time 차감 폐기 — 원장(_payments/_charges) 기록만 인정.
  const rent0 = Number(rec.monthlyRent) || 0;
  const count = seedNet != null && !hasAnyPay
    ? (seedNet > 0 ? Math.max(1, rent0 > 0 ? Math.ceil(seedNet / rent0) : 1) : 0)
    : (rc.unpaidSeqCount || 0);
  const scheds = rc.schedules || [];
  const roundTotal = scheds.length || Number(rec.rentalMonths) || 0;
  const roundDue = scheds.length ? computeCurrentSeq(scheds, asOf) : 0;

  return {
    rec, status, delivered, ended, startDate: start, endDate: end,
    monthsLeft: null, dday: ended ? null : ddayFrom(today, end),
    gross, paid, net, overpay, count, refund,
    monthlyRent: Number(rec.monthlyRent) || 0,
    overdueDays,
    roundDue, roundTotal,
  };
}

/** 수납 스케줄(회차표) — 상세에서 사용. */
export function contractSchedules(rec: EntityRecord, today: string) {
  const c = buildContract(rec, today);
  if (!c.schedules?.length) return [];
  const rd = ymd(rec.returnedDate);
  const seedCarry = rec._carryUnpaid !== undefined && rec._carryUnpaid !== null;
  const prorated = rd && !seedCarry ? applyReturnedProration(c, rd) : c; // 씨앗 미수는 일할 재정산 금지(carry 유지)
  const rc = recalcContract(prorated, rd && rd < today ? rd : today);
  return (rc.schedules || []).map((s) => {
    const discount = (s.discounts || []).reduce((t, d) => t + (d.amount || 0), 0);
    const paid = s.paidAmount || 0;
    const lastPay = s.payments && s.payments.length ? s.payments[s.payments.length - 1] : null;
    const lastKind = lastPay && (lastPay as { kind?: string; memo?: string }).kind;
    const lastMemo = lastPay ? String((lastPay as { memo?: string }).memo || '') : '';
    const methodLabel = lastKind === 'deposit-offset' || lastMemo.includes('보증금충당')
      ? '보증금충당'
      : lastPay
        ? String(lastPay.source || '')
        : '';
    return {
      seq: s.seq, dueDate: s.dueDate, amount: s.amount, discount, paid,
      balance: Math.max(0, s.amount - discount - paid),
      paidAt: s.paidAt || '',
      discountReasons: [...new Set((s.discounts || []).map((d) => String(d.reason || '')).filter(Boolean))],
      payments: (s.payments || []).map((p) => ({
        date: p.date,
        amount: p.amount,
        source: (p as { kind?: string }).kind === 'deposit-offset' || String(p.memo || '').includes('보증금충당')
          ? '보증금충당'
          : p.source,
        txId: (p as { txId?: string }).txId,
      })),
      method: methodLabel,
      status: s.status,
    };
  });
}

/** 인도(출고) 대기 계약 술어 — SSOT → domain/status.
 *  대기 상태 + 번호판 있음 + 아직 인도/반납 안 함. 손롤 필터 금지, 이 헬퍼로 통일. */
export function isDeliveryPending(c: EntityRecord): boolean {
  return statusDeliveryPending(c);
}

/** 반납 대상 계약 술어 — SSOT → domain/status. 인도 완료 + 아직 반납 안 함 + 종료 아님(=운행중). */
export function isReturnable(c: EntityRecord): boolean {
  return statusReturnable(c);
}

/* ── 책임 분리(barrel) — 아래 그룹은 lib/contracts/* 로 이동, 여기서 re-export (호출부 '@/lib/contract-ops' import 무변경) ── */
export { computeReturnSettlement, type ReturnSettlement, earlyTerminationFee, type EarlyTermCalc } from './contracts/settlement';
export { patchDeliver, patchReturn, patchTerminate, patchExtend, patchEngineLock } from './contracts/patches';
export { passesFilter, type ContractFilter } from './contracts/filters';
export {
  buildScheduleLedger, summarizeScheduleLedger, countScheduleStatuses,
  type ScheduleLedgerRow, type ScheduleKind,
} from './contracts/schedule-ledger';
