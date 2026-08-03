import type { EntityRecord } from '@/lib/intake/entities';
import { buildScheduleLedger } from '@/lib/contracts/schedule-ledger';
import { isContractEndedStatus } from '@/lib/domain/status';
import { companyShort } from '@/lib/companies';

export type CashPlanDirection = '입금' | '출금' | '미정';
export type CashPlanStatus = '예정' | '기한경과' | '분류필요' | '일정확인';
export type CashPlanCertainty = '확정' | '예상' | '확인필요';
export type CashPlanSource = '계약대여료' | '자금업무' | '보험료' | '과태료' | '임차료' | '보증금반환';

export type CashPlanRow = {
  id: string;
  companyId: string;
  company: string;
  dueDate: string;
  direction: CashPlanDirection;
  source: CashPlanSource;
  title: string;
  counterparty: string;
  amount: number;
  status: CashPlanStatus;
  certainty: CashPlanCertainty;
  reference: string;
  memo: string;
  projectedBalance: number;
  balanceKnown: boolean;
  raw: EntityRecord;
};

export type CashPlanInput = {
  contracts?: EntityRecord[];
  workItems?: EntityRecord[];
  insurances?: EntityRecord[];
  penalties?: EntityRecord[];
  leases?: EntityRecord[];
  today: string;
  horizonDays?: number;
  openingBalance?: number;
  openingBalanceKnown?: boolean;
};

export type CashPlanSummary = {
  openingBalance: number;
  openingBalanceKnown: boolean;
  inflow: number;
  outflow: number;
  closingBalance: number;
  minimumBalance: number;
  minimumBalanceDate: string;
  needsReview: number;
};

const ymd = (v: unknown): string => {
  const s = String(v || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthDate(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, day), last))).toISOString().slice(0, 10);
}

function statusOf(date: string, today: string, direction: CashPlanDirection, amount: number): CashPlanStatus {
  if (direction === '미정' || amount <= 0) return '분류필요';
  if (!date) return '일정확인';
  return date < today ? '기한경과' : '예정';
}

function companyOf(rec: EntityRecord): { companyId: string; company: string } {
  const companyId = String(rec.companyId || '');
  return { companyId, company: companyShort(companyId) };
}

function workDirection(rec: EntityRecord): CashPlanDirection {
  const v = String(rec.cashFlow || rec.flow || '');
  if (v === '입금' || v === '입금예정') return '입금';
  if (v === '출금' || v === '출금예정') return '출금';
  return '미정';
}

function isPaid(rec: EntityRecord): boolean {
  const status = String(rec.status || '');
  return !!rec.paid || !!rec.paidDate || status === '완료' || status.includes('납부완료');
}

function installmentRows(rec: EntityRecord): Array<{ cycle: number; dueDate: string; amount: number; paid: boolean }> {
  const raw = Array.isArray(rec.installments) ? rec.installments : [];
  return raw.map((item, index) => {
    const v = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      cycle: Number(v.cycle) || index + 1,
      dueDate: ymd(v.dueDate || v.due_date || v.date),
      amount: Number(v.amount) || 0,
      paid: !!v.paid || !!v.paidDate || String(v.status || '') === '완료',
    };
  });
}

export function buildCashPlan(input: CashPlanInput): { rows: CashPlanRow[]; summary: CashPlanSummary } {
  const {
    contracts = [], workItems = [], insurances = [], penalties = [], leases = [], today,
    horizonDays = 90, openingBalance = 0, openingBalanceKnown = false,
  } = input;
  const horizonEnd = addDays(today, horizonDays);
  const rows: CashPlanRow[] = [];
  const push = (partial: Omit<CashPlanRow, 'projectedBalance' | 'balanceKnown'>) => {
    if (partial.dueDate && horizonEnd && partial.dueDate > horizonEnd) return;
    rows.push({ ...partial, projectedBalance: openingBalance, balanceKnown: openingBalanceKnown });
  };

  for (const schedule of buildScheduleLedger(contracts, today)) {
    if (schedule.status !== '예정' || !schedule.dueDate || schedule.dueDate < today || schedule.balance <= 0) continue;
    if (isContractEndedStatus(schedule.rec.status) || schedule.rec.returnedDate) continue;
    push({
      id: `contract:${schedule.id}`,
      ...companyOf(schedule.rec),
      dueDate: schedule.dueDate,
      direction: '입금', source: '계약대여료',
      title: `${schedule.contractorName || '계약자 미등록'} · ${schedule.seq}/${schedule.seqTotal}회차`,
      counterparty: schedule.contractorName,
      amount: schedule.balance,
      status: '예정', certainty: '확정',
      reference: schedule.contractNo || schedule.plate,
      memo: schedule.plate,
      raw: schedule.rec,
    });
  }

  for (const rec of workItems) {
    if (rec.deletedAt || String(rec.status || '') === '완료') continue;
    if (String(rec.category || '') !== '자금' && String(rec.targetType || '') !== '자금' && !rec.cashFlow) continue;
    const direction = workDirection(rec);
    const dueDate = ymd(rec.dueDate || rec.date);
    const amount = Number(rec.expectedAmount || rec.amount) || 0;
    push({
      id: `work:${String(rec._key || rec.workId || rows.length)}`,
      ...companyOf(rec), dueDate, direction, source: '자금업무',
      title: String(rec.title || '미분류 자금업무'),
      counterparty: String(rec.counterparty || rec.vendor || ''),
      amount, status: statusOf(dueDate, today, direction, amount), certainty: '예상',
      reference: String(rec.workId || rec.contractNo || ''),
      memo: String(rec.description || ''), raw: rec,
    });
  }

  for (const rec of insurances) {
    if (rec.deletedAt) continue;
    const installments = installmentRows(rec).filter((item) => !item.paid && item.amount > 0);
    if (installments.length) {
      for (const item of installments) {
        push({
          id: `insurance:${String(rec._key || rec.policyNo || '')}:${item.cycle}`,
          ...companyOf(rec), dueDate: item.dueDate, direction: '출금', source: '보험료',
          title: `${String(rec.insurer || '보험사 미등록')} · ${item.cycle}회차`,
          counterparty: String(rec.insurer || ''), amount: item.amount,
          status: statusOf(item.dueDate, today, '출금', item.amount), certainty: '확정',
          reference: String(rec.policyNo || rec.plate || ''), memo: String(rec.plate || ''), raw: rec,
        });
      }
    } else {
      const remainder = Math.max(0, (Number(rec.totalPremium) || 0) - (Number(rec.paidPremium) || 0));
      if (remainder > 0) push({
        id: `insurance:${String(rec._key || rec.policyNo || '')}:unplanned`,
        ...companyOf(rec), dueDate: '', direction: '출금', source: '보험료',
        title: `${String(rec.insurer || '보험사 미등록')} · 잔여보험료 일정 확인`,
        counterparty: String(rec.insurer || ''), amount: remainder,
        status: '일정확인', certainty: '확인필요',
        reference: String(rec.policyNo || rec.plate || ''), memo: String(rec.plate || ''), raw: rec,
      });
    }
  }

  for (const rec of penalties) {
    if (rec.deletedAt || isPaid(rec)) continue;
    const amount = Number(rec.amount) || 0;
    if (amount <= 0) continue;
    const dueDate = ymd(rec.dueDate);
    push({
      id: `penalty:${String(rec._key || rec.noticeNo || rows.length)}`,
      ...companyOf(rec), dueDate, direction: '출금', source: '과태료',
      title: String(rec.description || rec.docType || '과태료 납부'),
      counterparty: String(rec.issuer || ''), amount,
      status: statusOf(dueDate, today, '출금', amount), certainty: '확정',
      reference: String(rec.noticeNo || rec.plate || ''), memo: String(rec.plate || ''), raw: rec,
    });
  }

  for (const rec of leases) {
    if (rec.deletedAt) continue;
    const rent = Number(rec.monthlyRent) || 0;
    if (rent <= 0) continue;
    const payDay = Number(rec.paymentDay);
    if (!Number.isFinite(payDay) || payDay < 1) {
      push({
        id: `lease:${String(rec._key || rec.leaseNo || rows.length)}:unplanned`,
        ...companyOf(rec), dueDate: '', direction: '출금', source: '임차료',
        title: `${String(rec.address || rec.landlord || '임대차')} · 납부일 확인`,
        counterparty: String(rec.landlord || ''), amount: rent,
        status: '일정확인', certainty: '확인필요',
        reference: String(rec.leaseNo || ''), memo: String(rec.address || ''), raw: rec,
      });
      continue;
    }
    const start = ymd(rec.startDate) || today;
    const end = ymd(rec.endDate) || horizonEnd;
    const cursor = new Date(`${today}T00:00:00Z`);
    const horizon = new Date(`${horizonEnd}T00:00:00Z`);
    let monthOffset = 0;
    while (monthOffset <= 24) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + monthOffset;
      const dueDate = monthDate(year + Math.floor(month / 12), ((month % 12) + 12) % 12, payDay);
      if (dueDate > horizonEnd || new Date(`${dueDate}T00:00:00Z`) > horizon) break;
      if (dueDate >= today && dueDate >= start && dueDate <= end) push({
        id: `lease:${String(rec._key || rec.leaseNo || '')}:${dueDate}`,
        ...companyOf(rec), dueDate, direction: '출금', source: '임차료',
        title: String(rec.address || '사업장 임차료'), counterparty: String(rec.landlord || ''),
        amount: rent, status: '예정', certainty: '확정',
        reference: String(rec.leaseNo || ''), memo: String(rec.address || ''), raw: rec,
      });
      monthOffset += 1;
    }
  }

  for (const rec of contracts) {
    if (rec.deletedAt || !isContractEndedStatus(rec.status) || rec.depositSettledDate) continue;
    const amount = Number(rec.depositReceived);
    if (!(amount > 0)) continue;
    const dueDate = ymd(rec.returnedDate || rec.endDate);
    push({
      id: `deposit:${String(rec._key || rec.contractNo || rows.length)}`,
      ...companyOf(rec), dueDate, direction: '출금', source: '보증금반환',
      title: `${String(rec.contractorName || '계약자 미등록')} · 반환정산 상한`,
      counterparty: String(rec.contractorName || ''), amount,
      status: statusOf(dueDate, today, '출금', amount), certainty: '확인필요',
      reference: String(rec.contractNo || rec.plate || ''), memo: '차감항목 확정 전 실수령 보증금 상한', raw: rec,
    });
  }

  rows.sort((a, b) =>
    (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31')
    || a.company.localeCompare(b.company, 'ko')
    || a.id.localeCompare(b.id));

  let running = openingBalance;
  let inflow = 0, outflow = 0, minimumBalance = openingBalance, minimumBalanceDate = today, needsReview = 0;
  for (const row of rows) {
    // 날짜·방향·금액이 모두 확정된 행만 잔액 예측에 반영한다.
    // 미분류/일정 미확정 행은 누락시키지 않고 목록에 남겨 후속 작업으로 연결한다.
    const calculable = Boolean(row.dueDate) && row.amount > 0 && row.direction !== '미정';
    if (calculable && row.direction === '입금') { running += row.amount; inflow += row.amount; }
    if (calculable && row.direction === '출금') { running -= row.amount; outflow += row.amount; }
    row.projectedBalance = running;
    if (running < minimumBalance) { minimumBalance = running; minimumBalanceDate = row.dueDate || minimumBalanceDate; }
    if (row.status === '분류필요' || row.status === '일정확인' || row.certainty === '확인필요') needsReview += 1;
  }
  return {
    rows,
    summary: {
      openingBalance, openingBalanceKnown, inflow, outflow, closingBalance: running,
      minimumBalance, minimumBalanceDate, needsReview,
    },
  };
}
