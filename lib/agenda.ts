/**
 * 일정 어젠다 SSOT — 흩어진 "기한 있는 일"을 한 줄 시간표로. (D.sched는 미구현/빈 배열이라 여기가 실제 소스)
 *   계약 반납·만기 · 검사만기 · 보험만기 · 과태료 기한 → 날짜 순. 홈 '일정' 렌즈(달력·시간섹션)가 이걸 렌더.
 *   미결=처리대상 관점, 일정=시간축 관점 — 같은 원자, 다른 배열.
 */
import { type EntityRecord } from './intake/entities';
import { dday } from './dashboard-consts';
import { effectiveEndDate } from './contract-ops';
import { normPlate } from './plate';

export type AgendaKind = '반납·만기' | '검사만기' | '보험만기' | '과태료 기한';
export const AGENDA_KINDS: AgendaKind[] = ['반납·만기', '검사만기', '보험만기', '과태료 기한'];
export type AgendaItem = {
  date: string;   // YYYY-MM-DD
  dday: number;   // 오늘 기준 (음수=지남)
  kind: AgendaKind;
  plate: string;
  title: string;  // 계약자/차명/보험사/설명
  tone: 'red' | 'amber' | 'green' | 'gray';
};

const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));
const toneOf = (d: number): AgendaItem['tone'] => (d < 0 ? 'red' : d <= 7 ? 'amber' : d <= 30 ? 'green' : 'gray');

/** 기한 있는 일 전부 모아 날짜순. 처리 끝난 건(반납완료·과태료완료)은 제외. */
export function buildAgenda(
  contracts: EntityRecord[], vehicles: EntityRecord[], insurances: EntityRecord[], penalties: EntityRecord[],
): AgendaItem[] {
  const items: AgendaItem[] = [];
  const push = (date: unknown, kind: AgendaKind, plate: string, title: string) => {
    if (!isDate(date)) return;
    const d = dday(date); if (d == null) return;
    items.push({ date: String(date).slice(0, 10), dday: d, kind, plate, title, tone: toneOf(d) });
  };
  for (const c of contracts) {                    // 계약 반납·만기 — 미반납만
    if (c.returnedDate) continue;
    const end = effectiveEndDate(c);
    if (end) push(end, '반납·만기', String(c.plate || ''), String(c.contractorName || c.contractNo || '계약'));
  }
  for (const v of vehicles) if (v.inspectionTo) push(v.inspectionTo, '검사만기', String(v.plate || ''), String(v.carName || '')); // 검사만기
  const curIns = new Map<string, EntityRecord>();  // 보험만기 — 차량별 현재(최신 만기) 증권만
  for (const ins of insurances) {
    const p = normPlate(ins.plate); if (!p) continue;
    const cur = curIns.get(p);
    if (!cur || String(ins.endDate || '') > String(cur.endDate || '')) curIns.set(p, ins);
  }
  for (const ins of curIns.values()) if (ins.endDate) push(ins.endDate, '보험만기', String(ins.plate || ''), String(ins.insurer || '보험'));
  for (const p of penalties) {                     // 과태료 기한 — 미처리만
    if (String(p.reassignStatus || '') === '변경부과완료') continue;
    if (p.dueDate) push(p.dueDate, '과태료 기한', String(p.plate || ''), String(p.description || p.docType || '과태료'));
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind < b.kind ? -1 : 1));
}

/** 날짜(YYYY-MM-DD) → 그 날 아이템[]. 달력 셀 마킹용. */
export function agendaByDate(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const m = new Map<string, AgendaItem[]>();
  for (const it of items) { const a = m.get(it.date); if (a) a.push(it); else m.set(it.date, [it]); }
  return m;
}
