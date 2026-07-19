// 자금일보 통합 원장 — 데이터센터로 수집된 계좌(bank_tx)·CMS·카드매출·법인카드(card_tx)를
// 단일 자금 스트림(CashRow)으로 합친다. 각 건은 계정과목(category)으로 분류. 분류 저장은 원본 엔티티로.
import { type EntityRecord } from '@/lib/intake/entities';
import { type LedgerKind, kindOfLabel, isUnclassified, UNCLASSIFIED } from '@/lib/payments/ledger-subjects';

export type CashSource = '계좌' | 'CMS' | '카드매출' | '법인카드';
export type CashRow = {
  id: string;                        // 렌더용 안정 키
  entity: 'bank_tx' | 'card_tx';     // 분류 저장 대상 엔티티
  recKey: string;                    // 원본 _key
  companyId: string;
  date: string;
  source: CashSource;
  account: string;                   // 계좌/카드 식별(별명 처리 전 원문)
  party: string;                     // 상대/적요/가맹점
  memo: string;
  inAmt: number;                     // 입금
  outAmt: number;                    // 출금
  category: string;                  // 계정과목 라벨('' 또는 (미분류) 가능)
  raw: EntityRecord;
};

// bank_tx.method 로 소스 판별: CMS→CMS, 카드→카드매출, 그 외→계좌
function bankSource(method: string): CashSource {
  return method === 'CMS' ? 'CMS' : method === '카드' ? '카드매출' : '계좌';
}

export function buildCashLedger(bank: EntityRecord[], card: EntityRecord[]): CashRow[] {
  const rows: CashRow[] = [];
  for (const b of bank) {
    // CMS 묶음 구성건(item)은 집금 deposit 이 대표 현금흐름 — 이중계상 방지 (v5 gl-entries 동일)
    if (String(b.settlementRole || '') === 'item') continue;
    rows.push({
      id: `bank:${String(b._key || b.txKey || '')}`, entity: 'bank_tx', recKey: String(b._key || ''),
      companyId: String(b.companyId || ''), date: String(b.txDate || ''), source: bankSource(String(b.method || '')),
      account: String(b.account || ''), party: String(b.counterparty || ''), memo: String(b.memo || ''),
      inAmt: Number(b.amount) || 0, outAmt: Number(b.withdraw) || 0, category: String(b.category || ''), raw: b,
    });
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

export const CASH_SOURCES: CashSource[] = ['계좌', 'CMS', '카드매출', '법인카드'];

// 계정과목별 집계(기간·필터 적용 후 rows를 넘긴다)
export type SubjectAgg = { label: string; kind: LedgerKind | '미분류'; inAmt: number; outAmt: number; count: number };
export function aggregateBySubject(rows: CashRow[]): SubjectAgg[] {
  const m = new Map<string, SubjectAgg>();
  for (const r of rows) {
    const label = isUnclassified(r.category) ? UNCLASSIFIED : r.category;
    const kind: LedgerKind | '미분류' = label === UNCLASSIFIED ? '미분류' : (kindOfLabel(label) || '미분류');
    const a = m.get(label) || { label, kind, inAmt: 0, outAmt: 0, count: 0 };
    a.inAmt += r.inAmt; a.outAmt += r.outAmt; a.count += 1;
    m.set(label, a);
  }
  // 수입 → 지출 → 이체 → 미분류 순, 그 안에서 금액 큰 순
  const order: Record<string, number> = { 수입: 0, 지출: 1, 이체: 2, 미분류: 3 };
  return [...m.values()].sort((a, b) => (order[a.kind] - order[b.kind]) || ((b.inAmt + b.outAmt) - (a.inAmt + a.outAmt)));
}

// 거래처별 집계 — 누가 얼마 주고받았나(공급사·정비소·손님 정산). party가 빈 건은 '(미상)'.
export type PartyAgg = { party: string; inAmt: number; outAmt: number; count: number; lastDate: string };
export function aggregateByParty(rows: CashRow[]): PartyAgg[] {
  const m = new Map<string, PartyAgg>();
  for (const r of rows) {
    const key = r.party || '(미상)';
    const a = m.get(key) || { party: key, inAmt: 0, outAmt: 0, count: 0, lastDate: '' };
    a.inAmt += r.inAmt; a.outAmt += r.outAmt; a.count += 1;
    if (r.date > a.lastDate) a.lastDate = r.date;
    m.set(key, a);
  }
  return [...m.values()].sort((a, b) => (b.inAmt + b.outAmt) - (a.inAmt + a.outAmt));
}
