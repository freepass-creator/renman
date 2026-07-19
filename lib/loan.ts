// 할부/리스 상환 스케줄 — 원리금균등(차량 매입 부채측). 순수 primitive(다른 렌탈에도 재사용).
export interface LoanRow { seq: number; date: string; principal: number; interest: number; payment: number; balance: number }

function addMonthsStr(startDate: string, n: number): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(startDate)) return '';
  const [y, m, d] = startDate.slice(0, 10).split('-').map(Number);
  let nm = m + n;
  const ny = y + Math.floor((nm - 1) / 12);
  nm = ((nm - 1) % 12) + 1;
  const last = new Date(ny, nm, 0).getDate();
  const nd = Math.min(d, last);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

// 원금·연이율(%)·개월·개시일 → 회차별 상환표(원리금균등). 상환일 = 개시일 + n개월.
export function loanSchedule(principal: number, annualRatePct: number, months: number, startDate: string): LoanRow[] {
  if (!principal || !months || months < 1) return [];
  const r = (annualRatePct || 0) / 100 / 12;
  const pay = r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -months)) : principal / months;
  const rows: LoanRow[] = [];
  let bal = principal;
  for (let i = 0; i < months; i++) {
    const interest = Math.round(bal * r);
    let prin = Math.round(pay - interest);
    if (i === months - 1) prin = bal; // 마지막 회차 = 잔액 정리
    bal = Math.max(0, bal - prin);
    rows.push({ seq: i + 1, date: addMonthsStr(startDate, i + 1), principal: prin, interest, payment: prin + interest, balance: bal });
  }
  return rows;
}

// 오늘 기준 남은 상환(잔여원금·남은 회차·다음 상환일)
export function loanSummary(rows: LoanRow[], today: string): { paidSeq: number; remainSeq: number; nextDate: string; remainPrincipal: number; monthlyPayment: number } {
  const upcoming = rows.filter((r) => r.date && r.date >= today);
  const paidSeq = rows.length - upcoming.length;
  return {
    paidSeq,
    remainSeq: upcoming.length,
    nextDate: upcoming[0]?.date || '',
    remainPrincipal: paidSeq > 0 ? (rows[paidSeq - 1]?.balance ?? 0) : (rows[0] ? rows[0].balance + rows[0].principal : 0),
    monthlyPayment: rows[0]?.payment || 0,
  };
}
