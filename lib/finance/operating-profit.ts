/**
 * 영업손익 SSOT — 대시보드·손익분석이 같은 셀렉터만 소비.
 * 영업 = ledger-subjects groupOfLabel === '영업'. CMS 하위·미연결은 이중계상 제외.
 */
import { type CashRow } from './cash-ledger';
import { groupOfLabel } from '@/lib/payments/ledger-subjects';

function isOperatingCash(r: CashRow): boolean {
  if (r.nest === 'cms-item' || r.nest === 'cms-pending') return false;
  return groupOfLabel(r.category) === '영업';
}

/** 영업수입 − 영업비용. */
export function operatingProfit(rows: CashRow[]): number {
  let inc = 0;
  let exp = 0;
  for (const r of rows) {
    if (!isOperatingCash(r)) continue;
    inc += r.inAmt;
    exp += r.outAmt;
  }
  return inc - exp;
}

/** 법인별 영업손익. */
export function operatingProfitByCompany(rows: CashRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (!isOperatingCash(r)) continue;
    const id = String(r.companyId || '');
    map.set(id, (map.get(id) || 0) + r.inAmt - r.outAmt);
  }
  return map;
}

export type OpTrendMonth = { m: string; inc: number; exp: number; profit: number };

/**
 * 최근 N개월 영업손익 추이.
 * @param asOf YYYY-MM-DD — 기준일(대시보드 TODAY). 없으면 로컬 오늘.
 */
export function operatingProfitTrend(
  rows: CashRow[],
  months: number,
  asOf?: string,
): { list: OpTrendMonth[]; max: number; maxAbs: number } {
  const base = asOf && /^\d{4}-\d{2}-\d{2}/.test(asOf)
    ? new Date(`${asOf.slice(0, 10)}T12:00:00`)
    : new Date();
  const keys = Array.from({ length: months }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() - (months - 1) + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const by = new Map(keys.map((m) => [m, { inc: 0, exp: 0 }]));
  for (const r of rows) {
    if (!isOperatingCash(r)) continue;
    const b = by.get(String(r.date || '').slice(0, 7));
    if (!b) continue;
    b.inc += r.inAmt;
    b.exp += r.outAmt;
  }
  const list = keys.map((m) => {
    const b = by.get(m)!;
    return { m, inc: b.inc, exp: b.exp, profit: b.inc - b.exp };
  });
  const max = Math.max(1, ...list.map((x) => Math.max(x.inc, x.exp)));
  const maxAbs = Math.max(1, ...list.map((x) => Math.abs(x.profit)));
  return { list, max, maxAbs };
}
