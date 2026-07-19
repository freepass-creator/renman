/**
 * 일자 피드 SSOT — "이 날 무슨 일 했나"를 차·계약·돈·이력 축으로 한 줄에.
 *   일정(agenda)=앞으로 할 기한. 일자피드=이미 일어난 일(기간 축의 세계관).
 *   말해도 이미 붙어 있어야 함: 출고·반납·입금·매칭·과태료·활동기록이 같은 날짜로 모임.
 */
import { type EntityRecord } from '@/lib/intake/entities';
import { normPlate } from '@/lib/plate';
import { customerKey } from '@/lib/customers';

export type DayFeedKind =
  | '출고'
  | '반납'
  | '입금'
  | '수납매칭'
  | '과태료'
  | '활동'
  | '수선'
  | '수집매칭';

export type DayFeedItem = {
  date: string;           // YYYY-MM-DD
  kind: DayFeedKind;
  plate: string;
  customer: string;       // 계약자 표시
  customerKey: string;    // openCustomer용
  title: string;
  amount?: number;
  tone: 'ok' | 'warn' | 'danger' | 'mute' | 'ink';
};

const dayOf = (s: unknown) => {
  const t = String(s || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
};

/**
 * asOf(하루)에 일어난 일을 전 엔티티에서 모아 시간·종류순.
 * history·contract·bank_tx·penalty·inbox 를 같은 날짜 키로 잇는다.
 */
export function buildDayFeed(
  asOf: string,
  input: {
    contracts?: EntityRecord[];
    bankTx?: EntityRecord[];
    history?: EntityRecord[];
    penalties?: EntityRecord[];
    inbox?: EntityRecord[];
  },
): DayFeedItem[] {
  const day = dayOf(asOf);
  if (!day) return [];
  const items: DayFeedItem[] = [];
  const push = (it: Omit<DayFeedItem, 'date'> & { date?: string }) => {
    items.push({ date: day, ...it });
  };

  for (const c of input.contracts || []) {
    const plate = normPlate(c.plate) || String(c.plate || '');
    const name = String(c.contractorName || '');
    const ck = customerKey(name, c.contractorPhone);
    if (dayOf(c.deliveredDate) === day || dayOf(c.deliveryDate) === day) {
      push({ kind: '출고', plate, customer: name, customerKey: ck, title: `${name || '계약'} 출고`, tone: 'ok' });
    }
    if (dayOf(c.returnedDate) === day) {
      push({ kind: '반납', plate, customer: name, customerKey: ck, title: `${name || '계약'} 반납`, tone: 'warn' });
    }
    const pays = Array.isArray(c._payments) ? (c._payments as Array<Record<string, unknown>>) : [];
    for (const p of pays) {
      if (dayOf(p.date) !== day) continue;
      push({
        kind: '수납매칭',
        plate,
        customer: name,
        customerKey: ck,
        title: `${name || plate} · ${p.seq != null ? `${p.seq}회차` : '수납'}`,
        amount: Number(p.amount) || 0,
        tone: 'ok',
      });
    }
  }

  for (const t of input.bankTx || []) {
    if (dayOf(t.txDate) !== day) continue;
    const amt = Number(t.amount) || 0;
    const wd = Number(t.withdraw) || 0;
    if (amt <= 0 && wd <= 0) continue;
    const matched = Boolean(t.matchedContractId);
    push({
      kind: matched ? '수납매칭' : '입금',
      plate: String(t.plate || ''),
      customer: String(t.counterparty || ''),
      customerKey: '',
      title: String(t.counterparty || t.memo || (matched ? '매칭 입금' : '통장')),
      amount: amt > 0 ? amt : wd,
      tone: matched ? 'ok' : (amt > 0 ? 'warn' : 'mute'),
    });
  }

  for (const p of input.penalties || []) {
    const when = dayOf(p.reassignDate) || dayOf(p.violationDate);
    if (when !== day) continue;
    push({
      kind: '과태료',
      plate: normPlate(p.plate) || String(p.plate || ''),
      customer: String(p.driverName || ''),
      customerKey: customerKey(p.driverName, p.driverPhone),
      title: String(p.description || p.docType || '과태료'),
      amount: Number(p.amount) || undefined,
      tone: 'warn',
    });
  }

  for (const h of input.history || []) {
    if (dayOf(h.date) !== day) continue;
    const cat = String(h.category || '이력');
    const work = String(h._kind || '') === 'work' || ['정비', '사고', '사고수리', '상품화', '세차'].includes(cat);
    push({
      kind: work ? '수선' : '활동',
      plate: normPlate(h.plate) || String(h.plate || ''),
      customer: String(h.customer || ''),
      customerKey: customerKey(h.customer, ''),
      title: String(h.title || cat),
      amount: Number(h.amount || h.cost) || undefined,
      tone: cat === '사고' || cat === '사고수리' ? 'danger' : work ? 'warn' : 'ink',
    });
  }

  for (const i of input.inbox || []) {
    if (String(i.status) !== '매칭') continue;
    if (dayOf(i.matchedAt) !== day && dayOf(i.uploadedAt) !== day) continue;
    push({
      kind: '수집매칭',
      plate: String(i.plate || ''),
      customer: '',
      customerKey: '',
      title: `${String(i.kind || '서류')} → ${String(i.matchedEntity || '')}`,
      tone: 'mute',
    });
  }

  const order: DayFeedKind[] = ['출고', '반납', '수납매칭', '입금', '과태료', '수선', '활동', '수집매칭'];
  return items.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.plate.localeCompare(b.plate));
}

/** 달력 마킹용 — 그날 피드 건수·톤. */
export function dayFeedMarks(items: DayFeedItem[]): { date: string; tone: 'red' | 'amber' | 'green' | 'gray'; label: string }[] {
  const by = new Map<string, DayFeedItem[]>();
  for (const it of items) {
    const a = by.get(it.date); if (a) a.push(it); else by.set(it.date, [it]);
  }
  return [...by.entries()].map(([date, arr]) => {
    const tone = arr.some((x) => x.tone === 'danger') ? 'red'
      : arr.some((x) => x.tone === 'warn') ? 'amber'
        : arr.some((x) => x.tone === 'ok') ? 'green' : 'gray';
    return { date, tone, label: `${arr.length}건` };
  });
}
