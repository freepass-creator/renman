// 자금일보 일계표 — 자금관리 원장(CashRow)을 «선택일» 기준으로 가공한다.
//   자금관리는 통장에 찍힌 그대로(통입금 1줄)지만, 자금일보는 그 통입금을 구성건으로 «풀어서» 보여준다.
//     · CMS집금(cms-dep)   → withCmsItemRows가 만든 성공분(cms-item)을 구성건으로
//     · 묶음(bundle-parent) → raw.bundleItems 를 구성건으로
//     · 합산입금(계약매칭)   → raw.matchedScheduleAllocations(회차 배분)를 구성건으로
//   계약연결이 필요한데 아직 미연결인 입금(needsMatch)은 자금일보에서 인라인으로 매칭한다.
//   집계(입금계·출금계·잔액)는 실거래(txn)만 — 구성건(item)은 통입금을 나눈 것이라 합산에서 제외(이중계상 방지).
import type { CashRow } from './cash-ledger';
import { requiresContractLink } from './cash-rules';

export type JournalLineKind = 'txn' | 'item';

export type JournalLine = {
  id: string;
  parentId: string | null;
  kind: JournalLineKind;
  /** 통입금(구성건이 딸린 부모행)인가 */
  hasBreakdown: boolean;
  date: string;
  account: string;
  accountName: string;
  party: string;
  category: string;
  /** 계약·차량 등 귀속 라벨(없으면 '') */
  attribution: string;
  inAmt: number;
  outAmt: number;
  /** 실거래(txn)에만 계좌 잔액. 구성건(item)은 null */
  balance: number | null;
  /** 계약연결이 필요한데 아직 미연결인 입금 */
  needsMatch: boolean;
  row: CashRow;
};

export type CashJournalAccount = {
  key: string;
  account: string;
  accountName: string;
  lines: JournalLine[];
  inflow: number;
  outflow: number;
  /** 그날 마지막 실거래의 계좌 잔액(원장 순서 기준 · 시각 정보 없으면 근사) */
  closingBalance: number | null;
};

export type CashJournal = {
  date: string;
  accounts: CashJournalAccount[];
  inflow: number;
  outflow: number;
  net: number;
  txnCount: number;
  itemCount: number;
  unmatchedCount: number;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 계약연결이 필요한데 아직 미연결인 입금(자금일보에서 매칭 대상). cash-daily의 unmatchedContractCount와 동일 축. */
export function isUnmatchedDeposit(row: CashRow): boolean {
  if (!(row.inAmt > 0)) return false;
  if (row.nest === 'cms-dep' || row.nest === 'card-dep' || row.nest === 'cms-item') return false;
  if (!requiresContractLink(row.category)) return false;
  return !row.raw.matchedContractId && !row.raw.matchedScheduleSeq;
}

export function buildCashJournal(
  cashRows: CashRow[],
  date: string,
  resolveAttribution?: (row: CashRow) => string,
): CashJournal {
  const attr = (row: CashRow) => (resolveAttribution ? resolveAttribution(row) : '');
  const day = date.slice(0, 10);

  // CMS 성공분(cms-item)을 부모 집금행 id로 모은다.
  const childrenByParent = new Map<string, CashRow[]>();
  for (const r of cashRows) {
    if (r.nest === 'cms-item' && r.parentId) {
      const arr = childrenByParent.get(r.parentId) || [];
      arr.push(r);
      childrenByParent.set(r.parentId, arr);
    }
  }

  /* 스파인 = 그날 자금 전부. 통장에 찍힌 실거래 + **아직 집금과 연결 안 된 CMS 명세**.
     ★`cms-item`(집금에 이미 묶인 성공분)만 뺀다 — 그건 부모 집금행 밑에 구성건으로 전개되므로
       여기서도 세면 이중계상이다.
     ★`cms-pending`은 뺄 수 없다(2026-08-06 사장님 확정: 「자금일보에는 입력된 모든 자금 정보가
       다 있어야 한다」). 통장 집금을 아직 못 찾은 CMS 명세야말로 일보에서 손대야 할 돈인데,
       빼 버리면 실무자 눈에는 «올렸는데 사라진 돈»이 된다. */
  const inDay = cashRows.filter(
    (r) => r.date.slice(0, 10) === day && r.nest !== 'cms-item',
  );

  const accounts = new Map<string, CashJournalAccount>();
  let inflow = 0;
  let outflow = 0;
  let txnCount = 0;
  let itemCount = 0;
  let unmatchedCount = 0;

  for (const row of inDay) {
    const accountName = row.accountName || row.account || '(계좌 미상)';
    const key = `${row.companyId}:${accountName}`;
    let group = accounts.get(key);
    if (!group) {
      group = { key, account: row.account, accountName, lines: [], inflow: 0, outflow: 0, closingBalance: null };
      accounts.set(key, group);
    }

    const items: JournalLine[] = [];

    // ① CMS집금 → 성공분 구성건
    if (row.nest === 'cms-dep') {
      for (const c of childrenByParent.get(row.id) || []) {
        items.push({
          id: c.id, parentId: row.id, kind: 'item', hasBreakdown: false,
          date: c.date || row.date, account: row.account, accountName,
          party: c.party || '(적요없음)', category: c.category || 'CMS성공',
          attribution: attr(c), inAmt: c.inAmt, outAmt: c.outAmt, balance: null,
          needsMatch: false, row: c,
        });
      }
    }

    // ② 묶음 입출금 → 분해 구성건
    if (row.nest === 'bundle-parent' && Array.isArray(row.raw.bundleItems)) {
      const isIn = row.inAmt > 0;
      const bundleItems = row.raw.bundleItems as Array<Record<string, unknown>>;
      bundleItems.forEach((it, i) => {
        const amt = num(it.amount);
        items.push({
          id: `${row.id}#b${i}`, parentId: row.id, kind: 'item', hasBreakdown: false,
          date: row.date, account: row.account, accountName,
          party: String(it.party || it.memo || '구성'), category: String(it.category || ''),
          attribution: String(it.referenceId || ''), inAmt: isIn ? amt : 0, outAmt: isIn ? 0 : amt,
          balance: null, needsMatch: false, row,
        });
      });
    }

    // ③ 합산입금(계약매칭) → 회차 배분. ①②가 없을 때만(중복 전개 방지).
    if (!items.length && Array.isArray(row.raw.matchedScheduleAllocations)) {
      const allocations = row.raw.matchedScheduleAllocations as Array<Record<string, unknown>>;
      if (allocations.length > 1) {
        const base = attr(row);
        allocations.forEach((a, i) => {
          items.push({
            id: `${row.id}#a${i}`, parentId: row.id, kind: 'item', hasBreakdown: false,
            date: row.date, account: row.account, accountName,
            party: `${num(a.seq)}회차`, category: row.category,
            attribution: base, inAmt: num(a.amount), outAmt: 0, balance: null,
            needsMatch: false, row,
          });
        });
      }
    }

    const needsMatch = isUnmatchedDeposit(row);
    const balance = row.raw.balance === '' || row.raw.balance == null ? null : num(row.raw.balance);
    const txn: JournalLine = {
      id: row.id, parentId: null, kind: 'txn', hasBreakdown: items.length > 0,
      date: row.date, account: row.account, accountName,
      party: row.party || '(적요없음)', category: row.category || '',
      attribution: attr(row), inAmt: row.inAmt, outAmt: row.outAmt, balance,
      needsMatch, row,
    };

    group.lines.push(txn, ...items);
    group.inflow += row.inAmt;
    group.outflow += row.outAmt;
    if (balance != null) group.closingBalance = balance;

    inflow += row.inAmt;
    outflow += row.outAmt;
    txnCount += 1;
    itemCount += items.length;
    if (needsMatch) unmatchedCount += 1;
  }

  const list = [...accounts.values()].sort(
    (a, b) => b.inflow + b.outflow - (a.inflow + a.outflow) || a.accountName.localeCompare(b.accountName, 'ko'),
  );

  return {
    date: day,
    accounts: list,
    inflow,
    outflow,
    net: inflow - outflow,
    txnCount,
    itemCount,
    unmatchedCount,
  };
}
