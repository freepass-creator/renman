// 계정과목 SSOT — 자금일보의 모든 입출금이 여기로 분류된다(렌터카 표준 세트).
// 저장은 라벨 문자열(category 필드)로 — 기존 자유입력 데이터와 호환. kind는 라벨로 역참조.
export type LedgerKind = '수입' | '지출' | '이체';
export type LedgerSubject = { code: string; label: string; kind: LedgerKind; note?: string };

export const LEDGER_SUBJECTS: LedgerSubject[] = [
  // ── 수입(입금) ──
  { code: 'rev_rent', label: '대여료수입', kind: '수입', note: '월 렌트료' },
  { code: 'rev_card', label: '카드매출', kind: '수입', note: '카드결제 대여료' },
  { code: 'rev_cms', label: 'CMS집금', kind: '수입', note: '자동이체 집금' },
  { code: 'rev_deposit', label: '보증금(예수)', kind: '수입', note: '손님돈 · 부채성, 반환 대상' },
  { code: 'rev_collect', label: '미수금회수', kind: '수입', note: '연체·추심 회수' },
  { code: 'rev_sale', label: '매각대금', kind: '수입', note: '차량 매각' },
  { code: 'rev_etc', label: '기타수입', kind: '수입' },
  // ── 지출(출금) ──
  { code: 'exp_purchase', label: '차량매입', kind: '지출' },
  { code: 'exp_loan', label: '할부·리스료', kind: '지출' },
  { code: 'exp_insurance', label: '보험료', kind: '지출' },
  { code: 'exp_repair', label: '정비·수리비', kind: '지출' },
  { code: 'exp_penalty', label: '과태료·범칙금', kind: '지출' },
  { code: 'exp_payroll', label: '급여', kind: '지출' },
  { code: 'exp_fee', label: '지급수수료', kind: '지출', note: 'CMS·카드·PG 수수료' },
  { code: 'exp_office', label: '임차·관리비', kind: '지출' },
  { code: 'exp_tax', label: '세금·공과', kind: '지출' },
  { code: 'exp_etc', label: '기타지출', kind: '지출' },
  // ── 이체·중립(손익 아님) ──
  { code: 'trf_internal', label: '계좌간이체', kind: '이체', note: '내부 이동 · 상계' },
  { code: 'trf_deposit_return', label: '보증금반환', kind: '이체', note: '예수금 반환' },
];

export const LEDGER_KINDS: LedgerKind[] = ['수입', '지출', '이체'];
export const subjectsByKind = (kind: LedgerKind) => LEDGER_SUBJECTS.filter((s) => s.kind === kind);
const BY_LABEL = new Map(LEDGER_SUBJECTS.map((s) => [s.label, s]));
export const subjectByLabel = (label: string): LedgerSubject | undefined => BY_LABEL.get(label);
export const kindOfLabel = (label: string): LedgerKind | undefined => BY_LABEL.get(label)?.kind;
export const isLedgerSubject = (label: string): boolean => BY_LABEL.has(label);
export const LEDGER_LABELS = LEDGER_SUBJECTS.map((s) => s.label);
// 미분류 표기 통일
export const UNCLASSIFIED = '(미분류)';
export const isUnclassified = (label: unknown): boolean => !label || String(label) === UNCLASSIFIED;

// 손익 성격 — 계정과목을 영업/자본/금융/중립으로. 영업손익 = 영업수입 − 영업비용(자본·금융·중립 제외).
//   자본=자산 취득/처분(차량매입·매각), 금융=차입 상환(할부·리스, 원금+이자), 중립=부채성·이체(보증금·계좌이동).
export type LedgerGroup = '영업' | '자본' | '금융' | '중립';
const GROUP_OVERRIDE: Record<string, LedgerGroup> = {
  '차량매입': '자본',
  '매각대금': '자본',
  '할부·리스료': '금융',
  '보증금(예수)': '중립',
};
/** 계정과목 라벨 → 손익 성격. 이체는 중립, 지정 외 수입/지출은 영업. */
export function groupOfLabel(label: string): LedgerGroup {
  const s = BY_LABEL.get(label);
  if (!s || s.kind === '이체') return '중립';
  return GROUP_OVERRIDE[label] ?? '영업';
}

// 부가세 과세구분 — 과세(부가세 대상)/면세(보험·급여·인건비·세금·금융)/제외(보증금·이체 등 거래 아님).
//   현금기준 추정: 대여료·매각·차량매입·정비·수수료 등=과세(공급대가에 10/110 내포). 세금계산서 대사 전 참고치.
export type VatType = '과세' | '면세' | '제외';
const VAT_MAP: Record<string, VatType> = {
  '대여료수입': '과세', '카드매출': '과세', 'CMS집금': '과세', '미수금회수': '과세', '매각대금': '과세', '기타수입': '과세',
  '차량매입': '과세', '정비·수리비': '과세', '지급수수료': '과세', '임차·관리비': '과세', '기타지출': '과세',
  '보험료': '면세', '급여': '면세', '세금·공과': '면세', '과태료·범칙금': '면세', '할부·리스료': '면세',
  '보증금(예수)': '제외', '계좌간이체': '제외', '보증금반환': '제외',
};
/** 계정과목 → 부가세 과세구분. 미지정은 지출=과세/그 외=제외 보수적. */
export function vatOfLabel(label: string): VatType {
  return VAT_MAP[label] ?? '제외';
}
