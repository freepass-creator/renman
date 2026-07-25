// 자금일보 통합 원장 — 데이터센터로 수집된 계좌(bank_tx)·CMS·카드매출·법인카드(card_tx)를
// 단일 자금 스트림(CashRow)으로 합친다. 각 건은 계정과목(category)으로 분류. 분류 저장은 원본 엔티티로.
import { type EntityRecord } from '@/lib/intake/entities';
import { type LedgerKind, kindOfLabel, isUnclassified, UNCLASSIFIED } from '@/lib/payments/ledger-subjects';

export type CashSource = '계좌' | 'CMS' | '카드매출' | '법인카드';
/**
 * nest
 *   cms-dep     — 통장 CMS집금(입금)
 *   cms-item    — 집금에 붙은 성공분(상시 하위행, 집계 제외)
 *   cms-pending — 업로드된 CMS 성공·아직 집금 미연결(원장에 반영, 매칭 대기)
 */
export type CashNest = 'cms-dep' | 'cms-item' | 'cms-pending';
export type CashRow = {
  id: string;
  entity: 'bank_tx' | 'card_tx';
  recKey: string;
  companyId: string;
  date: string;
  source: CashSource;
  account: string;
  party: string;
  memo: string;
  inAmt: number;
  outAmt: number;
  category: string;
  raw: EntityRecord;
  nest?: CashNest;
  parentId?: string;
};

export function isCmsMethod(b: EntityRecord): boolean {
  const method = String(b.method || '');
  const src = String(b.source || '');
  return method === 'CMS' || method === '자동이체' || src === 'CMS' || src === '자동이체';
}

export function isCmsDepositLabel(b: EntityRecord): boolean {
  if (String(b.settlementRole || '') === 'deposit') return true;
  const blob = `${b.counterparty || ''} ${b.memo || ''} ${b.category || ''}`;
  return /CMS집금|카드자동집금/.test(blob) || String(b.category || '') === 'CMS집금';
}

function bankSource(b: EntityRecord): CashSource {
  if (isCmsDepositLabel(b) || isCmsMethod(b)) return 'CMS';
  if (String(b.method || '') === '카드') return '카드매출';
  return '계좌';
}

function rowFromBank(b: EntityRecord, nest?: CashNest, parentId?: string): CashRow {
  return {
    id: `bank:${String(b._key || b.txKey || '')}`, entity: 'bank_tx', recKey: String(b._key || ''),
    companyId: String(b.companyId || ''), date: String(b.txDate || ''), source: bankSource(b),
    account: String(b.account || ''), party: String(b.counterparty || ''), memo: String(b.memo || ''),
    inAmt: Number(b.amount) || 0, outAmt: Number(b.withdraw) || 0, category: String(b.category || ''), raw: b,
    nest, parentId,
  };
}

export function buildCashLedger(bank: EntityRecord[], card: EntityRecord[]): CashRow[] {
  const rows: CashRow[] = [];
  for (const b of bank) {
    // 집금에 이미 붙은 성공분 → 하위행으로만 (withCmsItemRows)
    if (String(b.settlementRole || '') === 'item') continue;

    if (isCmsMethod(b)) {
      // 업로드된 CMS 성공 — 매칭 전에도 원장에 반영(미연결)
      if (!b.settlementId) {
        const r = rowFromBank(b, 'cms-pending');
        r.category = 'CMS미연결';
        rows.push(r);
      }
      continue;
    }

    rows.push(rowFromBank(b, isCmsDepositLabel(b) ? 'cms-dep' : undefined));
  }
  for (const c of card) {
    rows.push({
      id: `card:${String(c._key || c.txKey || '')}`, entity: 'card_tx', recKey: String(c._key || ''),
      companyId: String(c.companyId || ''), date: String(c.txDate || ''), source: '법인카드',
      account: `법인카드${c.cardLast4 ? ' ' + String(c.cardLast4) : ''}`, party: String(c.merchant || ''), memo: String(c.approvalNo || ''),
      inAmt: 0, outAmt: Number(c.amount) || 0, category: String(c.category || ''), raw: c,
    });
  }
  return rows;
}

/** CMS집금 행 바로 아래에 정산된 성공분(item)을 상시 끼워 넣는다. */
export function withCmsItemRows(ledger: CashRow[], bank: EntityRecord[]): CashRow[] {
  const itemsBySid = new Map<string, EntityRecord[]>();
  for (const b of bank) {
    if (String(b.settlementRole || '') !== 'item') continue;
    const sid = String(b.settlementId || '');
    if (!sid) continue;
    const arr = itemsBySid.get(sid) || [];
    arr.push(b);
    itemsBySid.set(sid, arr);
  }
  for (const arr of itemsBySid.values()) {
    arr.sort((a, b) => String(a.txDate || '').localeCompare(String(b.txDate || ''))
      || String(a.counterparty || '').localeCompare(String(b.counterparty || '')));
  }

  const out: CashRow[] = [];
  for (const r of ledger) {
    out.push(r);
    if (r.nest !== 'cms-dep') continue;
    const sid = String(r.raw.settlementId || '');
    const items = sid ? (itemsBySid.get(sid) || []) : [];
    for (const it of items) {
      const child = rowFromBank(it, 'cms-item', r.id);
      child.source = 'CMS';
      child.category = 'CMS성공';
      out.push(child);
    }
  }
  return out;
}

export const CASH_SOURCES: CashSource[] = ['계좌', 'CMS', '카드매출', '법인카드'];

export type SubjectAgg = { label: string; kind: LedgerKind | '미분류'; inAmt: number; outAmt: number; count: number };
export function aggregateBySubject(rows: CashRow[]): SubjectAgg[] {
  const m = new Map<string, SubjectAgg>();
  for (const r of rows) {
    // 하위 성공분·미연결 CMS는 통장 입금과 이중계상 방지 — 집금(dep)·일반만
    if (r.nest === 'cms-item' || r.nest === 'cms-pending') continue;
    const label = isUnclassified(r.category) ? UNCLASSIFIED : r.category;
    const kind: LedgerKind | '미분류' = label === UNCLASSIFIED ? '미분류' : (kindOfLabel(label) || '미분류');
    const a = m.get(label) || { label, kind, inAmt: 0, outAmt: 0, count: 0 };
    a.inAmt += r.inAmt; a.outAmt += r.outAmt; a.count += 1;
    m.set(label, a);
  }
  const order: Record<string, number> = { 수입: 0, 지출: 1, 이체: 2, 미분류: 3 };
  return [...m.values()].sort((a, b) => (order[a.kind] - order[b.kind]) || ((b.inAmt + b.outAmt) - (a.inAmt + a.outAmt)));
}

export type PartyAgg = { party: string; inAmt: number; outAmt: number; count: number; lastDate: string };
export function aggregateByParty(rows: CashRow[]): PartyAgg[] {
  const m = new Map<string, PartyAgg>();
  for (const r of rows) {
    if (r.nest === 'cms-item' || r.nest === 'cms-pending') continue;
    const key = r.party || '(미상)';
    const a = m.get(key) || { party: key, inAmt: 0, outAmt: 0, count: 0, lastDate: '' };
    a.inAmt += r.inAmt; a.outAmt += r.outAmt; a.count += 1;
    if (r.date > a.lastDate) a.lastDate = r.date;
    m.set(key, a);
  }
  return [...m.values()].sort((a, b) => (b.inAmt + b.outAmt) - (a.inAmt + a.outAmt));
}
