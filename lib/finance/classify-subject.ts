// 입출금 계정과목 자동분류(추천) — v5 classify-subject 이식·확장(입금+출금, v6 ledger-subjects 라벨).
//   거래상대·적요·소스·금액 신호로 계정과목을 추론. confidence 함께 반환 → 낮으면 사람이 확인.
//   기본은 대여료수입/기타지출(하위호환) — 명확한 신호가 있을 때만 재분류. 저장은 강제 안 함(추천만).
import { type CashRow } from './cash-ledger';

export type SubjectSuggestion = { label: string; confidence: 'high' | 'medium' | 'low'; reason: string };
// 분류에 필요한 최소 필드만 — 자금일보(CashRow)·migration(bank_tx 매핑) 양쪽에서 재사용(SSOT).
export type SubjectInput = Pick<CashRow, 'party' | 'memo' | 'inAmt' | 'outAmt' | 'source'>;

const COMPANY_HINTS = ['제이피케이', 'jpk', '오토', '캐피탈', '리스', '렌터카', '모터스', '주식회사', '(주)', '유한회사'];
const INSURER_HINTS = ['삼성화재', '현대해상', 'db손보', 'db손해', 'kb손보', '메리츠', '한화손보', '흥국', '악사', '캐롯', '롯데손보', '보험'];
const REPAIR_HINTS = ['공업사', '정비', '카센타', '카센터', '바디', '판금', '도색', '타이어', '수리', '오토바디'];
const TAX_HINTS = ['세무서', '국세', '지방세', '자동차세', '부가세', '원천세', '공단', '건강보험', '국민연금', '고용보험', '산재'];
const FEE_HINTS = ['수수료', '효성', '나이스', '키움', 'pg', 'van', '밴사', '정산수수료', '펌뱅킹'];

export function suggestSubject(r: SubjectInput): SubjectSuggestion | null {
  const text = `${r.party} ${r.memo}`.toLowerCase();
  const amt = r.inAmt || r.outAmt;
  const has = (hints: string[]) => hints.some((h) => text.includes(h.toLowerCase()));

  if (r.inAmt > 0) {
    // ── 입금 = 수입 ──
    if (r.source === 'CMS') return { label: 'CMS집금', confidence: 'high', reason: 'CMS 소스' };
    if (r.source === '카드매출') return { label: '카드매출', confidence: 'high', reason: '카드 소스' };
    if (/보증금|디파짓|예치|deposit/i.test(text)) return { label: '보증금(예수)', confidence: 'high', reason: '보증금 키워드' };
    if (/매각|처분|중고|매매|매도/i.test(text)) return { label: '매각대금', confidence: 'medium', reason: '매각 키워드' };
    if (/추심|미수|연체|회수/i.test(text)) return { label: '미수금회수', confidence: 'medium', reason: '추심/미수 키워드' };
    if (/정산|반환|환급|환불|이자|리워드|캐시백/i.test(text)) return { label: '기타수입', confidence: 'medium', reason: '정산/환급/이자' };
    if (has(COMPANY_HINTS) && amt >= 5_000_000) return { label: '계좌간이체', confidence: 'medium', reason: '법인 상대+대액(대여료 아님 의심)' };
    return { label: '대여료수입', confidence: 'low', reason: '기본(입금)' };
  }
  if (r.outAmt > 0) {
    // ── 출금 = 지출 ──
    if (has(INSURER_HINTS)) return { label: '보험료', confidence: 'high', reason: '보험사' };
    if (has(REPAIR_HINTS)) return { label: '정비·수리비', confidence: 'medium', reason: '정비/공업사' };
    if (/과태료|범칙금|주정차|속도위반|통행료|하이패스/i.test(text)) return { label: '과태료·범칙금', confidence: 'medium', reason: '과태료/통행료' };
    if (/캐피탈|리스|할부|금융|저축은행/i.test(text)) return { label: '할부·리스료', confidence: 'medium', reason: '할부/리스' };
    if (/급여|월급|임금|상여|주급/i.test(text)) return { label: '급여', confidence: 'medium', reason: '급여' };
    if (has(TAX_HINTS)) return { label: '세금·공과', confidence: 'medium', reason: '세금/공과' };
    if (has(FEE_HINTS)) return { label: '지급수수료', confidence: 'medium', reason: '수수료' };
    if (/임대료|월세|관리비|임차/i.test(text)) return { label: '임차·관리비', confidence: 'medium', reason: '임차/관리비' };
    if (/매입|매매|차량구입/i.test(text)) return { label: '차량매입', confidence: 'low', reason: '매입 키워드' };
    if (has(COMPANY_HINTS) && amt >= 5_000_000) return { label: '계좌간이체', confidence: 'low', reason: '법인 상대+대액' };
    return { label: '기타지출', confidence: 'low', reason: '기본(출금)' };
  }
  return null;
}
