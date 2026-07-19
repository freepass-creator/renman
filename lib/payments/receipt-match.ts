/**
 * 자금일보 자동 매칭 — 은행 입금 → 계약 미납 회차.
 *
 * v4 lib/receipt-match.ts 포팅. jpkerp5의 인라인 schedule 모델에 맞게 단순화.
 *
 * 알고리즘:
 *   1) 입금 거래 (withdraw 없고 amount > 0)
 *   2) counterparty(입금자명) ≈ customerName 일치 계약 찾기
 *   3) 그 계약의 미납 회차 중 amount 일치하는 회차 검색
 *   4) 단일 후보면 자동 매칭, 여러 개면 가장 오래된 미납
 *
 * 결과:
 *   - BankTransaction.matchedContractId / matchedScheduleSeq / matchedAt 갱신
 *   - Contract.schedules 의 해당 회차 status='완료', paidAmount=amount, paidAt 갱신
 *   - Contract.unpaidAmount / unpaidSeqCount 캐시 재계산
 */

import type { BankTransaction, CardTransaction, Contract, PaymentEntry, PaymentScheduleInline } from './types';
import { applyPayment, totalUnpaid, totalUnpaidCount, computeCurrentSeq, addPaymentEntry } from './payment-schedule';

/** 이름 정규화 — 공백 제거, 소문자 */
function normName(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toLowerCase();
}

/** 차량번호 끝 4자리 추출 — '12가1234'/'서울12가1234'/'1234' 모두 '1234' 반환. */
function plateSuffix4(plate: string): string {
  const digits = (plate ?? '').replace(/[^0-9]/g, '');
  return digits.slice(-4);
}

/** 입금자명에서 끝 4자리 숫자 추출 — '박영협8309' → '8309'.
 *  렌터카 손님이 차량번호 끝자리를 입금자명에 붙이는 관행 매칭용. */
function counterpartySuffix4(name: string): string {
  const m = (name ?? '').match(/(\d{4})\s*$/);
  return m ? m[1] : '';
}

export type MatchCandidate = {
  contract: Contract;
  scheduleSeq: number;
  scheduleAmount: number;
  scheduleDueDate: string;
  /** 매칭 신뢰도 — 'high'(이름+금액 정확), 'medium'(이름만), 'low'(금액만) */
  confidence: 'high' | 'medium' | 'low';
};

/* 색인 — autoMatchAll/autoMatchCardAll 에서 1회 사전구축 (O(N+M)) */
type ScheduleRef = { c: Contract; s: PaymentScheduleInline };
export type MatchIndex = {
  byName: Map<string, Contract[]>;
  byAmount: Map<number, ScheduleRef[]>;
  /** 차량번호 끝 4자리 → 계약 N개. '박영협8309' 같은 입금자명 매칭. */
  byPlateSuffix: Map<string, Contract[]>;
};

export function buildMatchIndex(contracts: Contract[]): MatchIndex {
  const byName = new Map<string, Contract[]>();
  const byAmount = new Map<number, ScheduleRef[]>();
  const byPlateSuffix = new Map<string, Contract[]>();
  for (const c of contracts) {
    if (c.status === '해지') continue;
    const names = new Set<string>();
    const cName = normName(c.customerName);
    if (cName) names.add(cName);
    if (c.driverName) {
      const dn = normName(c.driverName);
      if (dn) names.add(dn);
    }
    // 입금자명 별칭 (가족·법인 계좌 등 customerName 과 다른 이름으로 입금되는 케이스)
    for (const alias of c.payerAliases ?? []) {
      const a = normName(alias);
      if (a) names.add(a);
    }
    for (const n of names) {
      const arr = byName.get(n);
      if (arr) arr.push(c);
      else byName.set(n, [c]);
    }
    // 차량번호 끝 4자리 색인 — '박영협8309' 입금자명 매칭용
    const suffix = plateSuffix4(c.vehiclePlate ?? '');
    if (suffix.length === 4) {
      const arr = byPlateSuffix.get(suffix);
      if (arr) arr.push(c);
      else byPlateSuffix.set(suffix, [c]);
    }
    for (const s of c.schedules ?? []) {
      if (s.status === '완료') continue;
      const remaining = s.status === '부분납' ? (s.amount - s.paidAmount) : s.amount;
      const amounts = new Set<number>([s.amount]);
      if (remaining !== s.amount && remaining > 0) amounts.add(remaining);
      for (const a of amounts) {
        const arr = byAmount.get(a);
        if (arr) arr.push({ c, s });
        else byAmount.set(a, [{ c, s }]);
      }
    }
  }
  return { byName, byAmount, byPlateSuffix };
}

/**
 * 색인 기반 후보 검색 (autoMatchAll 내부 — N개 tx 반복 시 색인 1회 빌드).
 * 외부에서 단발 호출은 findCandidates(tx, contracts) 사용 (편의 래퍼).
 */
function findCandidatesIndexed(
  txAmount: number,
  txCounterparty: string,
  index: MatchIndex,
): MatchCandidate[] {
  const out: MatchCandidate[] = [];
  const cpName = normName(txCounterparty);
  const cpSuffix = counterpartySuffix4(txCounterparty);
  // 입금자명에서 4자리 숫자 추출했으면, 그 4자리 제거한 prefix 도 이름 매칭에 사용
  // 예: '박영협8309' → cpName='박영협8309', cpNamePrefix='박영협'
  const cpNamePrefix = cpSuffix ? normName(txCounterparty.replace(/\d{4}\s*$/, '')) : '';

  // 이름 매칭 후보 — exact + substring 양방향 (prefix 도 시도)
  const nameMatched = new Set<Contract>();
  const tryName = (q: string) => {
    if (!q) return;
    const exact = index.byName.get(q);
    if (exact) for (const c of exact) nameMatched.add(c);
    for (const [k, arr] of index.byName) {
      if (k.includes(q) || q.includes(k)) {
        for (const c of arr) nameMatched.add(c);
      }
    }
  };
  tryName(cpName);
  if (cpNamePrefix && cpNamePrefix !== cpName) tryName(cpNamePrefix);

  // 차량번호 끝 4자리 매칭 — '박영협8309' suffix='8309' → 그 plate 의 계약
  const plateMatched = new Set<Contract>();
  if (cpSuffix.length === 4) {
    const arr = index.byPlateSuffix.get(cpSuffix);
    if (arr) for (const c of arr) plateMatched.add(c);
  }

  // 금액 일치 schedule
  const amountSchedules = index.byAmount.get(txAmount) ?? [];

  const seen = new Set<string>();
  // 금액 매칭 schedule × (이름 또는 plate 매칭? high : low)
  for (const ref of amountSchedules) {
    const key = `${ref.c.id}:${ref.s.seq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const strong = nameMatched.has(ref.c) || plateMatched.has(ref.c);
    out.push({
      contract: ref.c,
      scheduleSeq: ref.s.seq,
      scheduleAmount: ref.s.amount,
      scheduleDueDate: ref.s.dueDate,
      confidence: strong ? 'high' : 'low',
    });
  }
  // 이름 또는 plate 매칭 contract × 미납 회차 (금액 무관) → medium
  const strongCandidates = new Set<Contract>([...nameMatched, ...plateMatched]);
  for (const c of strongCandidates) {
    for (const s of c.schedules ?? []) {
      if (s.status === '완료') continue;
      const key = `${c.id}:${s.seq}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        contract: c,
        scheduleSeq: s.seq,
        scheduleAmount: s.amount,
        scheduleDueDate: s.dueDate,
        confidence: 'medium',
      });
    }
  }

  return out.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    if (rank[a.confidence] !== rank[b.confidence]) return rank[a.confidence] - rank[b.confidence];
    return a.scheduleDueDate.localeCompare(b.scheduleDueDate);
  });
}

/**
 * 한 BankTransaction에 대해 매칭 후보 검색.
 *  - withdraw 행은 매칭 X (출금은 계약과 무관)
 *  - 이미 매칭된 트랜잭션은 빈 배열
 *
 * 단발 호출용 — 일괄 매칭은 autoMatchAll 사용.
 */
export function findCandidates(tx: BankTransaction, contracts: Contract[]): MatchCandidate[] {
  if (tx.withdraw && tx.withdraw > 0) return [];
  if (tx.amount <= 0) return [];
  if (tx.matchedContractId) return [];
  const index = buildMatchIndex(contracts);
  return findCandidatesIndexed(tx.amount, tx.counterparty, index);
}

/** 매칭 한 건 적용 — BankTransaction patch + Contract patch 반환 */
export function applyMatch(
  tx: BankTransaction,
  contract: Contract,
  scheduleSeq: number,
  actorEmail?: string,
): {
  txPatch: Partial<BankTransaction>;
  contractPatch: Partial<Contract> & { schedules: PaymentScheduleInline[] };
} {
  const schedules = (contract.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] }));
  const idx = schedules.findIndex((s) => s.seq === scheduleSeq);
  if (idx < 0) {
    throw new Error(`회차 ${scheduleSeq} 를 찾을 수 없습니다 (계약 ${contract.contractNo})`);
  }
  const entry: PaymentEntry = {
    date: tx.txDate,
    amount: tx.amount,
    source: '계좌',
    txId: tx.id,
    by: actorEmail,
    at: new Date().toISOString(),
  };
  const { schedule: nextTarget } = addPaymentEntry(schedules[idx], entry, tx.txDate);
  schedules[idx] = nextTarget;

  const newUnpaid = totalUnpaid(schedules);
  const newUnpaidCount = totalUnpaidCount(schedules);
  const newCurrentSeq = computeCurrentSeq(schedules, tx.txDate);

  return {
    txPatch: {
      matchedContractId: contract.id,
      matchedScheduleSeq: scheduleSeq,
      matchedAt: new Date().toISOString(),
      matchedBy: actorEmail,
      subject: tx.subject ?? '대여료수입',
    },
    contractPatch: {
      schedules,
      unpaidAmount: newUnpaid,
      unpaidSeqCount: newUnpaidCount,
      currentSeq: newCurrentSeq,
      lastPaidDate: tx.txDate,
      lastPaidAmount: tx.amount,
    },
  };
}

/**
 * 매칭 해제 — BankTransaction과 Contract 모두 원복.
 * 회차는 '연체' (또는 부분납이었으면 부분납으로) 복귀.
 */
export function reverseMatch(
  tx: BankTransaction,
  contract: Contract,
  today: string,
): {
  txPatch: Partial<BankTransaction>;
  contractPatch: Partial<Contract> & { schedules: PaymentScheduleInline[] };
} {
  // tx.id로 연결된 모든 payment entry 제거 (분할매칭도 포함)
  const schedules = (contract.schedules ?? []).map((s) => {
    const filtered = (s.payments ?? []).filter((p) => p.txId !== tx.id);
    if (filtered.length === (s.payments ?? []).length) return { ...s };
    const paid = filtered.reduce((sum, p) => sum + p.amount, 0);
    const lastDate = filtered.reduce<string>((mx, p) => p.date > mx ? p.date : mx, '');
    let status = s.status;
    if (s.status !== '면제') {
      if (paid >= s.amount) status = '완료';
      else if (paid > 0) status = '부분납';
      else status = s.dueDate < today ? '연체' : '예정';
    }
    return { ...s, payments: filtered, paidAmount: paid, paidAt: lastDate || undefined, status };
  });

  return {
    txPatch: {
      matchedContractId: undefined,
      matchedScheduleSeq: undefined,
      matchedAt: undefined,
      matchedBy: undefined,
    },
    contractPatch: {
      schedules,
      unpaidAmount: totalUnpaid(schedules),
      unpaidSeqCount: totalUnpaidCount(schedules),
      currentSeq: computeCurrentSeq(schedules, today),
    },
  };
}

/**
 * 일괄 자동매칭 — 미매칭 입금 거래 중 high confidence (이름+금액 모두 일치) 만 자동 적용.
 * 사용자 확인 후 일괄 commit 용도. medium/low 는 수동 다이얼로그로.
 */
export type AutoMatchResult = {
  tx: BankTransaction;
  candidate: MatchCandidate;
};

export function autoMatchAll(
  txs: BankTransaction[],
  contracts: Contract[],
): AutoMatchResult[] {
  const results: AutoMatchResult[] = [];
  const index = buildMatchIndex(contracts);
  // 같은 회차에 중복 매칭 방지 — 이미 매칭한 (contractId, seq) 기록
  const used = new Set<string>();
  for (const c of contracts) {
    for (const s of c.schedules ?? []) {
      if (s.status === '완료') used.add(`${c.id}:${s.seq}`);
    }
  }
  for (const t of txs) {
    if (t.withdraw && t.withdraw > 0) continue;
    if (t.amount <= 0) continue;
    if (t.matchedContractId) continue;
    if (t.settlementRole === 'deposit') continue; // CMS 집금 대표건 — 계약 매칭 제외
    const candidates = findCandidatesIndexed(t.amount, t.counterparty, index);
    const high = candidates.filter((c) => c.confidence === 'high' && !used.has(`${c.contract.id}:${c.scheduleSeq}`));
    if (high.length === 0) continue;
    // 동명이인·금액 충돌 안전장치 — high 후보가 여러 계약을 가리키면 자동매칭 격하 (수동 검토 유도).
    const uniqueContracts = new Set(high.map((h) => h.contract.id));
    if (uniqueContracts.size > 1) continue;
    // CMS·자동이체 는 회차 dueDate 근처에 출금 → dueDate proximity 우선 매칭 (의도된 회차 자동 식별).
    // 일반 입금은 기본 정렬 (오래된 미납 우선 = FIFO 회계 표준).
    const isAutopay = t.source === 'CMS' || t.source === '자동이체' || t.method === 'CMS';
    let pick: MatchCandidate;
    if (isAutopay && high.length > 1) {
      const txTime = new Date(t.txDate).getTime();
      pick = [...high].sort((a, b) => {
        const da = Math.abs(new Date(a.scheduleDueDate).getTime() - txTime);
        const db = Math.abs(new Date(b.scheduleDueDate).getTime() - txTime);
        return da - db;
      })[0];
    } else {
      pick = high[0];
    }
    used.add(`${pick.contract.id}:${pick.scheduleSeq}`);
    results.push({ tx: t, candidate: pick });
  }
  return results;
}

/* ──────────────── 카드 매출 매칭 ──────────────── */

export type CardMatchCandidate = {
  contract: Contract;
  scheduleSeq: number;
  scheduleAmount: number;
  scheduleDueDate: string;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * 카드 매출 매칭 후보 — customerName + amount 기준.
 * BankTransaction의 findCandidates와 동일 로직, 다른 필드명.
 */
export function findCardCandidates(tx: CardTransaction, contracts: Contract[]): CardMatchCandidate[] {
  if (tx.amount <= 0) return [];
  if (tx.matchedContractId) return [];
  const index = buildMatchIndex(contracts);
  return findCandidatesIndexed(tx.amount, tx.customerName ?? '', index);
}

/** 카드 매칭 적용 — Bank와 동일 패턴 */
export function applyCardMatch(
  tx: CardTransaction,
  contract: Contract,
  scheduleSeq: number,
  actorEmail?: string,
): {
  txPatch: Partial<CardTransaction>;
  contractPatch: Partial<Contract> & { schedules: PaymentScheduleInline[] };
} {
  const schedules = (contract.schedules ?? []).map((s) => ({ ...s, payments: [...(s.payments ?? [])] }));
  const idx = schedules.findIndex((s) => s.seq === scheduleSeq);
  if (idx < 0) throw new Error(`회차 ${scheduleSeq} 를 찾을 수 없습니다`);
  const entry: PaymentEntry = {
    date: tx.txDate,
    amount: tx.amount,
    source: '카드',
    cardTxId: tx.id,
    by: actorEmail,
    at: new Date().toISOString(),
  };
  const { schedule: nextTarget } = addPaymentEntry(schedules[idx], entry, tx.txDate);
  schedules[idx] = nextTarget;

  return {
    txPatch: {
      matchedContractId: contract.id,
      matchedScheduleId: String(scheduleSeq),
    },
    contractPatch: {
      schedules,
      unpaidAmount: totalUnpaid(schedules),
      unpaidSeqCount: totalUnpaidCount(schedules),
      currentSeq: computeCurrentSeq(schedules, tx.txDate),
      lastPaidDate: tx.txDate,
      lastPaidAmount: tx.amount,
    },
  };
}

/** 카드 매출 일괄 자동매칭 — high confidence만 */
export type CardAutoMatchResult = {
  tx: CardTransaction;
  candidate: CardMatchCandidate;
};

export function autoMatchCardAll(
  txs: CardTransaction[],
  contracts: Contract[],
): CardAutoMatchResult[] {
  const results: CardAutoMatchResult[] = [];
  const index = buildMatchIndex(contracts);
  const used = new Set<string>();
  for (const c of contracts) {
    for (const s of c.schedules ?? []) {
      if (s.status === '완료') used.add(`${c.id}:${s.seq}`);
    }
  }
  for (const t of txs) {
    if (t.amount <= 0) continue;
    if (t.matchedContractId) continue;
    const candidates = findCandidatesIndexed(t.amount, t.customerName ?? '', index);
    const high = candidates.filter((c) => c.confidence === 'high' && !used.has(`${c.contract.id}:${c.scheduleSeq}`));
    if (high.length === 0) continue;
    // 동명이인·금액 충돌 안전장치
    const uniqueContracts = new Set(high.map((h) => h.contract.id));
    if (uniqueContracts.size > 1) continue;
    const pick = high[0];
    used.add(`${pick.contract.id}:${pick.scheduleSeq}`);
    results.push({ tx: t, candidate: pick });
  }
  return results;
}

/**
 * 선입선출 결제 — 매칭 후보가 없거나 금액 안 맞을 때.
 * 가장 오래된 미납·부분납 회차부터 차감.
 */
export function applyFifoPayment(
  tx: BankTransaction,
  contract: Contract,
): {
  txPatch: Partial<BankTransaction>;
  contractPatch: Partial<Contract> & { schedules: PaymentScheduleInline[] };
  leftover: number;
} {
  const schedules = contract.schedules ?? [];
  const { schedules: newSched, leftover } = applyPayment(schedules, tx.amount, tx.txDate, '계좌', { txId: tx.id });

  return {
    txPatch: {
      matchedContractId: contract.id,
      matchedAt: new Date().toISOString(),
      subject: tx.subject ?? '대여료수입',
    },
    contractPatch: {
      schedules: newSched,
      unpaidAmount: totalUnpaid(newSched),
      unpaidSeqCount: totalUnpaidCount(newSched),
      currentSeq: computeCurrentSeq(newSched, tx.txDate),
      lastPaidDate: tx.txDate,
      lastPaidAmount: tx.amount,
    },
    leftover,
  };
}
