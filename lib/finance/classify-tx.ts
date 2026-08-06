/**
 * 자금거래 계정과목 추천 — **실무 자금일보 1,793건에서 뽑은 신호**로 만든 규칙기.
 * (docs/UPLOAD-FORMATS.md §3-4 · lib/finance/account-categories.ts)
 *
 * ★이건 «추천»이지 «확정»이 아니다.
 *   - 사람이 이미 넣은 계정과목이 있으면 **그것이 이긴다**. 덮지 않는다.
 *   - 확신이 낮으면 아무것도 내지 않는다 — 틀린 분류가 빈칸보다 나쁘다(손익이 조용히 틀어진다).
 *
 * 실데이터에서 확인된 것:
 *   - 적요만으로는 «대여료»를 못 가린다(타행MB·타행IB·FB이체가 골고루 온다) → 입금 + 계약 매칭으로 간다.
 *   - 반대로 «자금이동»은 내용이 `6166에서868` 꼴로 **계좌↔계좌**를 적는다 → 이게 결정적 신호.
 *   - `BZ수수` 적요는 150/179 가 이체수수료 → 적요 하나로 거의 확정된다.
 */
import { accountCategory, type AccountCategory } from './account-categories';

export type TxInput = {
  jeokyo?: string;       // 적요 (BZ뱅크·BZ수수·FB이체·타행MB…)
  content?: string;      // 내용 (상대방·메모가 뭉쳐 오는 칸)
  amount?: number;       // 입금액
  withdraw?: number;     // 출금액
};

export type Suggestion = {
  category: string;
  /** 'high' 만 자동 적용 대상. 'low' 는 사람에게 보여만 준다. */
  confidence: 'high' | 'medium' | 'low';
  /** 왜 이렇게 봤는지 — 사람이 검증할 수 있어야 한다. */
  reason: string;
};

const has = (s: string, ...keys: string[]) => keys.some((k) => s.includes(k));

/** 계좌 간 이동 표기 — 실파일: `6166에서868` · `1868에서6616` · `616에서868` */
const TRANSFER_RE = /\d{3,4}\s*에서\s*\d{3,4}/;

export function suggestCategory(tx: TxInput): Suggestion | null {
  const j = String(tx.jeokyo ?? '').trim();
  const c = String(tx.content ?? '').trim();
  const isIn = Number(tx.amount) > 0;
  const isOut = Number(tx.withdraw) > 0;

  // ── high: 신호가 그 과목에만 나타나는 것들
  if (TRANSFER_RE.test(c)) {
    return { category: '자금이동', confidence: 'high', reason: `내용이 계좌↔계좌 표기(${c})` };
  }
  if (has(c, 'CMS집금')) {
    return { category: 'CMS집금', confidence: 'high', reason: '내용에 CMS집금' };
  }
  if (j === 'BZ수수') {
    return { category: '이체수수료', confidence: 'high', reason: '적요 BZ수수 (실데이터 150/179)' };
  }
  if (j === 'CM보험' || has(c, '손해보험', '손보')) {
    // 환급은 입금으로 온다 — 방향이 과목을 가른다.
    return isIn
      ? { category: '보험료 환급', confidence: 'high', reason: '보험사 + 입금' }
      : { category: '보험료', confidence: 'high', reason: '보험사 + 출금' };
  }
  if (has(j, '통신') || has(c, 'LGU+', 'SMS')) {
    return { category: '통신비', confidence: 'high', reason: '통신 적요·LGU+/SMS' };
  }
  if (has(c, '카드법인', '카드사용료', '법인결제') || has(j, '카드결', '카드대금')) {
    return { category: '카드사용료', confidence: 'high', reason: '카드사 결제 표기' };
  }

  // ── medium: 맞을 확률이 높지만 사람이 확인해야 하는 것들
  if (has(c, '원리금', '금융자산대', '캐피탈')) {
    return { category: '할부금', confidence: 'medium', reason: '금융사 원리금 표기' };
  }
  if (has(c, '정산') && isOut) {
    return { category: '정산금', confidence: 'medium', reason: '내용에 정산 + 출금' };
  }
  if (has(c, '관리비')) return { category: '차량관리비', confidence: 'medium', reason: '내용에 관리비' };
  if (has(c, '주유')) return { category: '차량관리비', confidence: 'medium', reason: '내용에 주유' };
  if (has(c, '과태료')) return { category: '차량관리비', confidence: 'medium', reason: '내용에 과태료' };
  if (has(c, '정비')) return { category: '차량관리비', confidence: 'medium', reason: '내용에 정비' };
  if (has(c, '수수료') || has(j, '서비스')) {
    return { category: '수수료', confidence: 'medium', reason: '내용·적요에 수수료' };
  }

  /* ★«대여료»는 여기서 내지 않는다.
     적요가 타행MB·타행IB·FB이체로 흩어져 있어(139/99/88) 적요만으로는 못 가린다.
     입금 + 계약(임차인·차량) 매칭이 붙어야 확정된다 — 그건 채널 해석기의 몫이다.
     여기서 섣불리 «대여료»를 내면 차입금·보증금 입금까지 매출로 잡힌다. */
  if (isIn && !isOut) {
    return { category: '', confidence: 'low', reason: '입금 — 계약 매칭 후 대여료 여부 판정 필요' };
  }
  return null;
}

/**
 * 사람이 넣은 값이 항상 이긴다.
 * 실무 일보의 `계정과목` 열은 손으로 분류한 값이라 자동추천으로 덮으면 안 된다(§5-6).
 */
export function resolveCategory(
  existing: unknown,
  tx: TxInput,
): { category: string; source: '사람' | '자동' | '미분류'; suggestion?: Suggestion } {
  const kept = String(existing ?? '').trim();
  if (kept) return { category: kept, source: '사람' };
  const s = suggestCategory(tx);
  if (s && s.category && s.confidence === 'high') return { category: s.category, source: '자동', suggestion: s };
  return { category: '', source: '미분류', suggestion: s ?? undefined };
}

/** 추천 과목이 실제 SSOT 에 있는지 — 오타로 없는 과목을 만들지 않게. */
export function suggestionCategoryDef(s: Suggestion | null | undefined): AccountCategory | undefined {
  return s?.category ? accountCategory(s.category) : undefined;
}
