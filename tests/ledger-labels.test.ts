import { describe, expect, it } from 'vitest';
import { LEDGER_LABEL } from '@/lib/ledger-labels';
import {
  ASSET_MASTER_BASIC_COLS,
  ASSET_MASTER_EXPANDED_COLS,
  ASSET_MAINT_BASIC_COLS,
  ASSET_MAINT_EXPANDED_COLS,
  CONTRACT_MASTER_BASIC_COLS,
  CONTRACT_MASTER_EXPANDED_COLS,
  SCHEDULE_LEDGER_ALL_COLS,
  SCHEDULE_LEDGER_COLS,
  ASSET_DETAIL_SECTIONS,
} from '@/lib/master-ledger-cols';
import { FLEET_EXPANDED_COLS } from '@/lib/sheet-cols';
import { PENALTY_ALL_COLS, PENALTY_BASIC_COLS, WORK_ALL_COLS, WORK_BASIC_COLS } from '@/lib/work-cols';
import { ACCOUNT_ALL_COLS, ACCOUNT_BASIC_COLS } from '@/lib/finance/account-cols';
import { CASH_BASIC_COLS, CASH_EXPANDED_COLS } from '@/lib/finance/cash-cols';
import { CASH_PLAN_BASIC_COLS, CASH_PLAN_EXPANDED_COLS } from '@/lib/finance/cash-plan-cols';
import { RISK_BASIC_COLS, RISK_EXPANDED_COLS } from '@/lib/risk-cols';
import { FLEET_BASIC_COLS } from '@/lib/sheet-cols';
import { RECEIVABLE_BASIC_COLS, RECEIVABLE_EXPANDED_COLS } from '@/lib/receivables-cols';

function labelOf(cols: Array<{ key: string; label: string }>, key: string): string | undefined {
  return cols.find((col) => col.key === key)?.label;
}

const keysOf = (cols: readonly { key: string }[]) => cols.map((col) => col.key);

const PAGE_VIEWS = [
  ['자산', ASSET_MASTER_BASIC_COLS, ASSET_MASTER_EXPANDED_COLS, [
    'company', 'plate', 'carName', 'lifecycle', 'status', 'maker', 'modelLine', 'modelYear', 'usage', 'ownerName',
    'acquisitionDate', 'acquisitionPrice', 'loanCompany', 'loanRemainingPrincipal', 'mileage', 'insuranceExpiryDate', 'inspectionTo',
  ]],
  ['자산 정비비', ASSET_MAINT_BASIC_COLS, ASSET_MAINT_EXPANDED_COLS, [
    'company', 'plate', 'carName', 'lifecycle', 'status', 'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'mileage',
  ]],
  ['계약', CONTRACT_MASTER_BASIC_COLS, CONTRACT_MASTER_EXPANDED_COLS, [
    'company', 'contractNo', 'contractorName', 'rentalType', 'status', 'plate', 'carName', 'contractorPhone', 'startDate', 'endDate',
    'rentalMonths', 'monthlyRent', 'deposit', 'paymentDay', 'paymentTiming', 'unpaidCount', 'overdueDays', 'net', 'riskLabel',
  ]],
  ['계약 회차', SCHEDULE_LEDGER_COLS, SCHEDULE_LEDGER_ALL_COLS, [
    'company', 'contractNo', 'contractorName', 'kind', 'status', 'plate', 'seq', 'dueDate', 'charge', 'paid', 'balance', 'overdueDays',
  ]],
  ['업무', WORK_BASIC_COLS, WORK_ALL_COLS, [
    'company', 'plate', 'contractor', 'kind', 'status', 'priority', 'title', 'carName', 'contractNo', 'workDate', 'due', 'assignee',
  ]],
  ['과태료', PENALTY_BASIC_COLS, PENALTY_ALL_COLS, [
    'company', 'plate', 'driver', 'ptype', 'status', 'title', 'violationDate', 'amount',
  ]],
  ['운영', FLEET_BASIC_COLS, FLEET_EXPANDED_COLS, [
    'company', 'plate', 'car', 'own', 'status', 'contractState', 'cust', 'loc', 'phone', 'rent', 'dep', 'paymentDay', 'round',
    'maintainedNet', 'end', 'inspect', 'insEnd', 'mileage', 'warn',
  ]],
  ['자금', CASH_BASIC_COLS, CASH_EXPANDED_COLS, [
    'company', 'acctName', 'party', 'moneyClass', 'match', 'bundle', 'cat', 'flowNature', 'date', 'content', 'in', 'out',
    'balance', 'matchedContract', 'matchedSchedule', 'alert',
  ]],
  ['자금계획', CASH_PLAN_BASIC_COLS, CASH_PLAN_EXPANDED_COLS, [
    'company', 'dueDate', 'direction', 'source', 'title', 'amount', 'projectedBalance', 'status',
  ]],
  ['계좌', ACCOUNT_BASIC_COLS, ACCOUNT_ALL_COLS, [
    'company', 'bank', 'holder', 'type', 'status', 'account', 'alias', 'totalIn', 'totalOut', 'currentBalance',
  ]],
  ['리스크', RISK_BASIC_COLS, RISK_EXPANDED_COLS, [
    'company', 'plate', 'customer', 'kind', 'status', 'group', 'subject', 'due', 'dday', 'amount', 'carName', 'phone',
  ]],
  ['미수', RECEIVABLE_BASIC_COLS, RECEIVABLE_EXPANDED_COLS, [
    'company', 'contractNo', 'customer', 'contractState', 'stage', 'plate', 'unpaid', 'overdueDays', 'unpaidCount', 'nextAction',
  ]],
] as const;

describe('페이지별 공통 원장 용어', () => {
  it('같은 업무 원자는 모든 페이지에서 같은 명칭을 사용한다', () => {
    const allViews = PAGE_VIEWS.map(([, , all]) => all);
    for (const cols of allViews) {
      const company = labelOf([...cols], 'company');
      if (company != null) expect(company).toBe(LEDGER_LABEL.company);
      const plate = labelOf([...cols], 'plate');
      if (plate != null) expect(plate).toBe(LEDGER_LABEL.plate);
      const contractNo = labelOf([...cols], 'contractNo');
      if (contractNo != null) expect(contractNo).toBe(LEDGER_LABEL.contractNo);
    }

    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'carName')).toBe(LEDGER_LABEL.carName);
    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'contractorName')).toBe(LEDGER_LABEL.contractor);
    expect(labelOf(SCHEDULE_LEDGER_ALL_COLS, 'contractorName')).toBe(LEDGER_LABEL.contractor);
    expect(labelOf(WORK_ALL_COLS, 'contractor')).toBe(LEDGER_LABEL.contractor);
    expect(labelOf(RISK_EXPANDED_COLS, 'customer')).toBe(LEDGER_LABEL.contractor);
    expect(labelOf(RECEIVABLE_EXPANDED_COLS, 'customer')).toBe(LEDGER_LABEL.contractor);
    expect(labelOf(FLEET_EXPANDED_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
    expect(labelOf(CONTRACT_MASTER_EXPANDED_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
    expect(labelOf(WORK_ALL_COLS, 'rentalType')).toBe(LEDGER_LABEL.rentalType);
  });

  it('자산 상세패널에 표의 수선 요약이 함께 제공된다', () => {
    const section = ASSET_DETAIL_SECTIONS.find((item) => item.title === '수선·이력');
    expect(section?.cols.map((col) => col.key)).toEqual([
      'maintCost', 'maintVsAvg', 'maintCount', 'maintLastDate', 'vehicle360Link',
    ]);
  });

  it.each(PAGE_VIEWS)('%s 기본보기는 승인된 페이지별 열 순서를 정확히 유지한다', (_name, basic, _all, expectedBasic) => {
    expect(keysOf(basic)).toEqual(expectedBasic);
  });

  it.each(PAGE_VIEWS)('%s 전체보기는 기본보기의 모든 열을 같은 위치에 유지한다', (_name, basic, all) => {
    expect(keysOf(all).slice(0, basic.length)).toEqual(keysOf(basic));
  });

  it.each(PAGE_VIEWS)('%s 기본·전체보기에는 중복 열이 없다', (_name, basic, all) => {
    expect(new Set(keysOf(basic)).size).toBe(basic.length);
    expect(new Set(keysOf(all)).size).toBe(all.length);
  });
});
