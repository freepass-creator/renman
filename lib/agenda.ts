/**
 * 일정 어젠다 SSOT — 기한 있는 일 1건=1행.
 *   반납·만기 · 검사 · 보험 · 과태료 → 날짜순.
 *   status: 어김(지남) | 임박(D≤7) | 예정 — 리스크관리·대시보드 공용(SSOT).
 */
import { type EntityRecord } from './intake/entities';
import { dday } from './dashboard-consts';
import { effectiveEndDate } from './contract-ops';
import { normPlate } from './plate';
import { companyShort } from './companies';

export type AgendaKind = '반납·만기' | '검사만기' | '보험만기' | '과태료 기한' | '세금 만기';
export const AGENDA_KINDS: AgendaKind[] = ['반납·만기', '검사만기', '보험만기', '과태료 기한', '세금 만기'];

export type AgendaStatus = '어김' | '임박' | '예정';

export type AgendaItem = {
  key: string;
  date: string;
  dday: number;
  kind: AgendaKind;
  status: AgendaStatus;
  plate: string;
  title: string;
  companyId: string;
  company: string;
  tone: 'red' | 'amber' | 'green' | 'gray';
};

const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));

export function agendaStatusOf(d: number): AgendaStatus {
  if (d < 0) return '어김';
  if (d <= 7) return '임박';
  return '예정';
}

function toneFor(d: number): AgendaItem['tone'] {
  if (d < 0) return 'red';
  if (d <= 7) return 'amber';
  if (d <= 30) return 'green';
  return 'gray';
}

/** 기한 있는 일 전부 모아 날짜순. 처리 끝난 건(반납완료·과태료완료)은 제외. */
export function buildAgenda(
  contracts: EntityRecord[],
  vehicles: EntityRecord[],
  insurances: EntityRecord[],
  penalties: EntityRecord[],
): AgendaItem[] {
  const items: AgendaItem[] = [];
  const push = (date: unknown, kind: AgendaKind, plate: string, title: string, companyId: string, key: string) => {
    if (!isDate(date)) return;
    const d = dday(date);
    if (d == null) return;
    const status = agendaStatusOf(d);
    items.push({
      key,
      date: String(date).slice(0, 10),
      dday: d,
      kind,
      status,
      plate,
      title,
      companyId,
      company: companyShort(companyId),
      tone: toneFor(d),
    });
  };

  for (const c of contracts) {
    if (c.returnedDate) continue;
    const end = effectiveEndDate(c);
    if (end) {
      push(
        end,
        '반납·만기',
        String(c.plate || ''),
        String(c.contractorName || c.contractNo || '계약'),
        String(c.companyId || ''),
        `cx:${c._key || c.contractNo || c.plate}:${end}`,
      );
    }
  }
  for (const v of vehicles) {
    if (!v.inspectionTo) continue;
    push(
      v.inspectionTo,
      '검사만기',
      String(v.plate || ''),
      String(v.carName || ''),
      String(v.companyId || ''),
      `insp:${v._key || v.plate}:${v.inspectionTo}`,
    );
  }
  for (const v of vehicles) {
    const due = String(v.vehicleTaxDueDate || '');
    if (!due) continue;
    const paid = String(v.vehicleTaxPaidDate || '');
    if (paid && paid >= due) continue;
    push(
      due,
      '세금 만기',
      String(v.plate || ''),
      String(v.carName || '자동차세'),
      String(v.companyId || ''),
      `tax:${v._key || v.plate}:${due}`,
    );
  }
  const curIns = new Map<string, EntityRecord>();
  for (const ins of insurances) {
    const p = normPlate(ins.plate);
    if (!p) continue;
    const cur = curIns.get(p);
    if (!cur || String(ins.endDate || '') > String(cur.endDate || '')) curIns.set(p, ins);
  }
  for (const ins of curIns.values()) {
    if (!ins.endDate) continue;
    push(
      ins.endDate,
      '보험만기',
      String(ins.plate || ''),
      String(ins.insurer || '보험'),
      String(ins.companyId || ''),
      `ins:${ins._key || ins.plate}:${ins.endDate}`,
    );
  }
  for (const p of penalties) {
    if (String(p.reassignStatus || '') === '변경부과완료') continue;
    if (!p.dueDate) continue;
    push(
      p.dueDate,
      '과태료 기한',
      String(p.plate || ''),
      String(p.description || p.docType || '과태료'),
      String(p.companyId || ''),
      `pen:${p._key || p.plate}:${p.dueDate}`,
    );
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind < b.kind ? -1 : 1));
}

export function agendaByDate(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const m = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const a = m.get(it.date);
    if (a) a.push(it);
    else m.set(it.date, [it]);
  }
  return m;
}
