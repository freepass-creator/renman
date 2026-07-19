/**
 * 스위치플랜 「자금일보.xlsx」 실파일 → jpkerp6 bank_tx EntityRecord 라이브 파서.
 *
 * jpkerp5 lib/migrate/switchplan-jbo.ts(검증본) 이식. 계정과목(subject)이 시트에 pre-tagged 되어
 * 있으므로 그대로 category 로 매핑한다(자동 재분류 아님 — 원본 존중).
 * 시트: 운영/영업 계좌 4종(신한·농협) + '차량 데이터'(계좌 아님 → skip).
 * 컬럼: 거래월/거래일/거래일시/적요/입금액/출금액/내용/계정과목/차량번호/임차인/세부차종/비고.
 *
 * 출력 = bank_tx 엔티티 필드(entities.ts):
 *   { account, txDate, amount(입금), withdraw(출금), counterparty, memo, method, category } (+ plate 보조).
 */

import * as XLSX from 'xlsx';
import type { EntityRecord } from '@/lib/intake/entities';

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return isFinite(n) ? Math.round(n) : 0;
}

/** "2026.01.01 20:40:02" / "2026-01-01" / Date → YYYY-MM-DD (거래월·거래일 fallback) */
function parseTxDate(dtRaw: string, monthRaw: string, dayRaw: string, fallbackYear: number): string {
  const m = dtRaw.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const mo = cellNum(monthRaw);
  const dy = cellNum(dayRaw);
  if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
    return `${fallbackYear}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
  }
  return '';
}

const SWEEP_SUBJECT = '자금이동';

export type JboAgg = { deposit: number; withdraw: number; count: number };

export type JboParseLive = {
  bank_tx: EntityRecord[];
  byAccount: Array<{ account: string } & JboAgg>;
  bySubject: Array<{ subject: string } & JboAgg>;
  totals: {
    count: number;
    deposit: number;
    withdraw: number;
    sweepDeposit: number;   // 계정과목 '자금이동' (계좌간 sweep — 매출 아님)
    sweepWithdraw: number;
    realDeposit: number;
    realWithdraw: number;
    accounts: number;
    subjects: number;
    dateFrom: string;
    dateTo: string;
  };
  warnings: string[];
};

/** 자금일보.xlsx 버퍼 → bank_tx EntityRecord[] + 진단 집계. */
export function parseSwitchplanJbo(buf: ArrayBuffer, fallbackYear = 2026): JboParseLive {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const warnings: string[] = [];
  const bank_tx: EntityRecord[] = [];

  // 집계
  const accMap = new Map<string, JboAgg>();
  const subMap = new Map<string, JboAgg>();
  let deposit = 0;
  let withdraw = 0;
  let sweepDeposit = 0;
  let sweepWithdraw = 0;
  let dateFrom = '';
  let dateTo = '';

  for (const sn of wb.SheetNames) {
    if (/차량\s*데이터|차량데이터/.test(sn)) continue; // 계좌 시트만
    const sheet = wb.Sheets[sn];
    if (!sheet) continue;
    const G = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    const hRow = G.findIndex((r) => (r as unknown[]).some((v) => cellStr(v) === '계정과목'));
    if (hRow < 0) { warnings.push(`${sn}: '계정과목' 헤더 없음 — skip`); continue; }
    const h = (G[hRow] as unknown[]).map(cellStr);
    const ci = (lbl: string) => h.findIndex((x) => x === lbl);
    const col = {
      month: ci('거래월'), day: ci('거래일'), dt: ci('거래일시'), memo: ci('적요'),
      deposit: ci('입금액'), withdraw: ci('출금액'), detail: ci('내용'),
      subject: ci('계정과목'), plate: ci('차량번호'), tenant: ci('임차인'),
      model: ci('세부차종'), note: ci('비고'), balance: ci('잔액'),
    };
    const gs = (row: unknown[], c: number) => (c >= 0 ? cellStr(row[c]) : '');
    const gn = (row: unknown[], c: number) => (c >= 0 ? cellNum(row[c]) : 0);
    for (let r = hRow + 1; r < G.length; r++) {
      const row = G[r] as unknown[];
      const inAmt = gn(row, col.deposit);
      const outAmt = gn(row, col.withdraw);
      if (inAmt === 0 && outAmt === 0) continue;
      const date = parseTxDate(gs(row, col.dt), gs(row, col.month), gs(row, col.day), fallbackYear);
      const subject = gs(row, col.subject) || '(미분류)';
      const detail = gs(row, col.detail);
      const memoText = gs(row, col.memo);

      const rec: EntityRecord = {
        account: sn,
        txDate: date,
        amount: inAmt,
        withdraw: outAmt,
        // counterparty(거래상대/적요): 입금자명(내용) 우선, 없으면 적요 — 자동매칭 신호.
        counterparty: detail || memoText,
        memo: memoText,
        method: '계좌',
        category: subject,
        balance: gn(row, col.balance),   // 계좌 잔액 원자 — 최신 잔액 = 실제 현금(재무상태표)
      };
      const plate = gs(row, col.plate);
      if (plate) rec.plate = plate;
      const tenant = gs(row, col.tenant);
      if (tenant) rec.renter = tenant;
      bank_tx.push(rec);

      // 집계
      deposit += inAmt; withdraw += outAmt;
      if (subject === SWEEP_SUBJECT) { sweepDeposit += inAmt; sweepWithdraw += outAmt; }
      const a = accMap.get(sn) ?? { deposit: 0, withdraw: 0, count: 0 };
      a.deposit += inAmt; a.withdraw += outAmt; a.count += 1; accMap.set(sn, a);
      const s = subMap.get(subject) ?? { deposit: 0, withdraw: 0, count: 0 };
      s.deposit += inAmt; s.withdraw += outAmt; s.count += 1; subMap.set(subject, s);
      if (date) {
        if (!dateFrom || date < dateFrom) dateFrom = date;
        if (!dateTo || date > dateTo) dateTo = date;
      }
    }
  }

  const byAccount = [...accMap.entries()].map(([account, v]) => ({ account, ...v }));
  const bySubject = [...subMap.entries()].map(([subject, v]) => ({ subject, ...v }))
    .sort((a, b) => (b.deposit + b.withdraw) - (a.deposit + a.withdraw));

  return {
    bank_tx,
    byAccount,
    bySubject,
    totals: {
      count: bank_tx.length,
      deposit, withdraw,
      sweepDeposit, sweepWithdraw,
      realDeposit: deposit - sweepDeposit,
      realWithdraw: withdraw - sweepWithdraw,
      accounts: accMap.size,
      subjects: subMap.size,
      dateFrom, dateTo,
    },
    warnings,
  };
}
