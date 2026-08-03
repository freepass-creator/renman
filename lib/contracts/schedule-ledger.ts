/**
 * 전 계약 회차별 청구 스케줄 원장 — 읽기 전용.
 * 회차 값은 contractSchedules() SSOT만 사용. computeContractView/contractMasterRow 금지.
 */
import { companyShort } from '@/lib/companies';
import { contractSchedules } from '@/lib/contract-ops';
import { ddayFrom } from '@/lib/contracts/dates';
import type { EntityRecord } from '@/lib/intake/entities';
import type { ScheduleStatus } from '@/lib/payments/types/banking';
import { paymentTimingOf } from '@/lib/schema/contract';

export type ScheduleKind = '정기' | '선납개시' | '일할정산' | '이월승계';

export type ScheduleLedgerRow = {
  id: string;
  contractKey: string;
  rec: EntityRecord;
  companyId: string;
  company: string;
  contractNo: string;
  contractorName: string;
  contractorPhone: string;
  plate: string;
  carName: string;
  seq: number;
  seqTotal: number;
  dueDate: string;
  kind: ScheduleKind;
  status: ScheduleStatus;
  charge: number;
  discount: number;
  paid: number;
  balance: number;
  paidAt: string;
  method: string;
  overdueDays: number;
  dday: number | null;
};

function scheduleKind(
  seq: number,
  rec: EntityRecord,
  discountReasons: string[],
  payments: Array<{ source?: string }>,
): ScheduleKind {
  if (seq === 1 && paymentTimingOf(rec.paymentTiming) === '선납') return '선납개시';
  if (discountReasons.some((r) => r.includes('반납 일할'))) return '일할정산';
  const carry = rec._carryUnpaid != null;
  if (carry && payments.length > 0 && payments.every((p) => p.source === '정산')) return '이월승계';
  if (carry && payments.length === 0) return '이월승계';
  return '정기';
}

export function buildScheduleLedger(contracts: EntityRecord[], today: string): ScheduleLedgerRow[] {
  const out: ScheduleLedgerRow[] = [];
  for (const rec of contracts) {
    if (rec.deletedAt) continue;
    const schedules = contractSchedules(rec, today);
    if (!schedules.length) continue;
    const contractKey = String(rec._key || rec.id || '');
    const companyId = String(rec.companyId || '');
    const seqTotal = schedules.length || Number(rec.rentalMonths) || schedules.length;
    for (const s of schedules) {
      const reasons = (s as { discountReasons?: string[] }).discountReasons || [];
      const kind = scheduleKind(s.seq, rec, reasons, s.payments || []);
      const status = s.status as ScheduleStatus;
      let overdueDays = 0;
      let dday: number | null = null;
      if (status === '연체' || status === '부분납') {
        const d = ddayFrom(today, s.dueDate);
        overdueDays = d != null && d < 0 ? -d : 0;
      } else if (status === '예정') {
        dday = ddayFrom(today, s.dueDate);
      }
      out.push({
        id: `${contractKey}#${s.seq}`,
        contractKey,
        rec,
        companyId,
        company: companyShort(companyId),
        contractNo: String(rec.contractNo || ''),
        contractorName: String(rec.contractorName || ''),
        contractorPhone: String(rec.contractorPhone || ''),
        plate: String(rec.plate || ''),
        carName: String(rec.carName || ''),
        seq: s.seq,
        seqTotal,
        dueDate: s.dueDate,
        kind,
        status,
        charge: s.amount,
        discount: s.discount,
        paid: s.paid,
        balance: s.balance,
        paidAt: s.paidAt || '',
        method: s.method || '',
        overdueDays,
        dday,
      });
    }
  }
  out.sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate)
    || a.company.localeCompare(b.company, 'ko')
    || a.contractorName.localeCompare(b.contractorName, 'ko')
    || a.seq - b.seq,
  );
  return out;
}

export function summarizeScheduleLedger(rows: ScheduleLedgerRow[]): {
  charge: number; discount: number; paid: number; balance: number;
  count: number; overdueCount: number; dueSoonCount: number;
} {
  let charge = 0, discount = 0, paid = 0, balance = 0, overdueCount = 0, dueSoonCount = 0;
  for (const r of rows) {
    charge += r.charge;
    discount += r.discount;
    paid += r.paid;
    balance += r.balance;
    if (r.status === '연체' || r.status === '부분납') overdueCount += 1;
    if (r.status === '예정' && r.dday != null && r.dday >= 0 && r.dday <= 7) dueSoonCount += 1;
  }
  return { charge, discount, paid, balance, count: rows.length, overdueCount, dueSoonCount };
}

export function countScheduleStatuses(rows: ScheduleLedgerRow[]): Record<string, number> {
  const out: Record<string, number> = {
    전체: rows.length, 예정: 0, 연체: 0, 부분납: 0, 완료: 0, 면제: 0,
  };
  for (const r of rows) {
    if (r.status in out) out[r.status] += 1;
  }
  return out;
}
