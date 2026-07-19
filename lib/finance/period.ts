// 기간(달력 정렬) 헬퍼 SSOT — 홈 돈 렌즈 · 자금일보 페이지 공용.
// 은행식 달력 정렬: ref가 속한 달/분기/해 '전체'를 잡는다. 이전/다음으로 주기 이동.
export type Period = '당일' | '주간' | '월간' | '분기' | '반기' | '연간' | '전체';
export const PERIODS: Period[] = ['당일', '주간', '월간', '분기', '반기', '연간', '전체'];

const zp = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${zp(d.getMonth() + 1)}-${zp(d.getDate())}`;

export function periodRange(ref: string, p: Period): { from: string; to: string } {
  const d = new Date(ref + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth();
  if (p === '전체') return { from: '', to: '' };
  if (p === '당일') return { from: ref, to: ref };
  if (p === '주간') { const wd = (d.getDay() + 6) % 7; const s = new Date(y, m, d.getDate() - wd); const e = new Date(s); e.setDate(s.getDate() + 6); return { from: ymd(s), to: ymd(e) }; }
  if (p === '월간') return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
  if (p === '분기') { const q = Math.floor(m / 3); return { from: ymd(new Date(y, q * 3, 1)), to: ymd(new Date(y, q * 3 + 3, 0)) }; }
  if (p === '반기') { const h = m < 6 ? 0 : 6; return { from: ymd(new Date(y, h, 1)), to: ymd(new Date(y, h + 6, 0)) }; }
  return { from: ymd(new Date(y, 0, 1)), to: ymd(new Date(y, 12, 0)) }; // 연간
}

export function shiftPeriod(ref: string, p: Period, dir: -1 | 1): string {
  if (p === '전체') return ref;
  const d = new Date(ref + 'T00:00:00');
  if (p === '당일') d.setDate(d.getDate() + dir);
  else if (p === '주간') d.setDate(d.getDate() + dir * 7);
  else if (p === '월간') d.setMonth(d.getMonth() + dir);
  else if (p === '분기') d.setMonth(d.getMonth() + dir * 3);
  else if (p === '반기') d.setMonth(d.getMonth() + dir * 6);
  else if (p === '연간') d.setFullYear(d.getFullYear() + dir);
  return ymd(d);
}

// 사람이 읽는 달력 표기 (2026-06 · 2026 2분기 · 2026 상반기 · 2026년)
export function periodTitle(ref: string, p: Period): string {
  const d = new Date(ref + 'T00:00:00');
  const y = d.getFullYear(), m = d.getMonth();
  if (p === '당일') return ref;
  if (p === '주간') { const r = periodRange(ref, '주간'); return `${r.from} ~ ${r.to}`; }
  if (p === '월간') return `${y}-${zp(m + 1)}`;
  if (p === '분기') return `${y} ${Math.floor(m / 3) + 1}분기`;
  if (p === '반기') return `${y} ${m < 6 ? '상' : '하'}반기`;
  if (p === '연간') return `${y}년`;
  return '전체';
}
