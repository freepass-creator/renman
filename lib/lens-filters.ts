// 렌즈별 퀵필터 — 두 축으로 카드를 잘게 거른다.
//   · 종류(secs): 어떤 문제냐 → 해당 섹션만 표시(섹션 show/hide)
//   · 기한(due):  언제까지 처리냐 → 카드의 마감 D-day로 거르기(overdue=지남, [a,b]=D-a~D-b)
//   같은 그룹 안 다중선택=OR, 그룹 간=AND. 아무것도 안 고르면 전체.
//   회사·기간·검색·탭은 WorkbenchBar 소유 — 레일에 중복 금지.
//
// 삭제된 facet 렌즈(섹션 레지스트리 슬림 후 orphan): 콕핏·리스크·자산·손님·운영·일정·마이·자산현황·계약현황·손님현황·재무현황·과태료·돈

export type FacetChip = {
  label: string;
  secs?: string[];
  due?: 'overdue' | [number, number];
  txFlow?: '입금' | '출금';
  txSource?: '계좌' | 'CMS' | '카드';
  txState?: 'unclassified';
  ledgerKind?: '수입' | '지출' | '이체';
};
export type FacetGroup = { dim: string; chips: FacetChip[] };

/** 공유 D-day 칩 — 기한 필터가 필요한 렌즈에서 재사용 */
export const DUE_CHIPS: FacetChip[] = [
  { label: '지남', due: 'overdue' },
  { label: '오늘', due: [0, 0] },
  { label: '내일', due: [1, 1] },
  { label: '이번주', due: [2, 7] },
  { label: '이번달', due: [8, 30] },
];

export const LENS_FILTERS: Record<string, FacetGroup[]> = {
  배차: [   // 차 기준 배치상태 — 페이지가 facets.has(상태)로 직접 매칭(dueMatcher 불필요)
    { dim: '상태', chips: [
      { label: '대여가능' }, { label: '운행중' }, { label: '반납임박' }, { label: '반납지남' }, { label: '정비' },
    ] },
  ],
  운영시트: [  // 차량 1대=1행 통합 마스터 사이드필터. 기본 '보유'=isVehicleHeld(매각·처분예정·구매예정 제외).
    { dim: '보유', chips: [{ label: '보유' }, { label: '전체' }, { label: '매각' }] },
    { dim: '가동', chips: [{ label: '운행' }, { label: '휴차' }, { label: '정비' }] },
    { dim: '계약', chips: [{ label: '만기임박' }, { label: '반납지남' }, { label: '계약없음' }] },
    { dim: '경고', chips: [{ label: '경고있음' }, { label: '위험만' }] },
    { dim: '미수', chips: [{ label: '미수있음' }, { label: '연체90일+' }] },
    { dim: '만기', chips: [{ label: '검사임박' }, { label: '보험임박' }] },
    { dim: '부채·보험', chips: [{ label: '할부있음' }, { label: '보험없음' }] },
  ],
  미수: [
    { dim: '연체단계', chips: [
      { label: '정상' }, { label: '경고' }, { label: '시동제어' }, { label: '내용증명' }, { label: '채권화' },
    ] },
    { dim: '연체기간', chips: [
      { label: '1~29일' }, { label: '30~89일' }, { label: '90일+' },
    ] },
    { dim: '조치', chips: [
      { label: '미조치' }, { label: '내용증명발송' }, { label: '시동제어중' },
    ] },
  ],
  // 업무 — FacetRail = 데이터 좁히기(secs show/hide 금지 · UIUX-SPEC).
  차량수선: [
    { dim: '구분', chips: [
      { label: '정비·사고' },
      { label: '기타상태' },
    ] },
  ],
  자금일보: [
    { dim: '구간', chips: [
      { label: 'CMS' },
      { label: '매칭제안' },
      { label: '매칭됨' },
      { label: '미매칭' },
    ] },
  ],
  지난계약: [
    { dim: '종료사유', chips: [
      { label: '만료' },
      { label: '중도해지' },
      { label: '기타' },
    ] },
  ],
  정합성: [
    { dim: '심각도', chips: [{ label: '위험' }, { label: '주의' }] },
    { dim: '종류', chips: [
      { label: '필수누락' }, { label: '만기' }, { label: '고아' }, { label: '날짜역전' }, { label: '미납' }, { label: '보험불일치' }, { label: '반납지남' },
    ] },
  ],
};

const allChips = (lensKey: string): FacetChip[] => (LENS_FILTERS[lensKey] || []).flatMap((g) => g.chips);

// 종류(섹션) 필터 — 선택된 종류 칩들의 섹션 합집합. 종류 칩을 아무것도 안 고르면 null(=전체 섹션).
export function visibleSecs(lensKey: string, selected: Set<string> | undefined): Set<string> | null {
  if (!selected || selected.size === 0) return null;
  const secChips = allChips(lensKey).filter((c) => c.secs);
  const picked = secChips.filter((c) => selected.has(c.label));
  if (picked.length === 0) return null;
  const out = new Set<string>();
  picked.forEach((c) => c.secs!.forEach((s) => out.add(s)));
  return out;
}

// 자금 tx 필터 — 입출금·소스·미분류·계정성격. (재무현황/돈 렌즈 제거됨 — 칩 없으면 null)
export function txFacetMatch(selected: Set<string> | undefined): ((tx: Record<string, unknown>) => boolean) | null {
  if (!selected || selected.size === 0) return null;
  const chips = allChips('자금일보').filter((c) => selected.has(c.label) && (c.txFlow || c.txSource || c.txState || c.ledgerKind || c.label === '미분류'));
  const flows = chips.map((c) => c.txFlow).filter(Boolean) as ('입금' | '출금')[];
  const sources = chips.map((c) => c.txSource).filter(Boolean) as ('계좌' | 'CMS' | '카드')[];
  const kinds = chips.map((c) => c.ledgerKind).filter(Boolean) as ('수입' | '지출' | '이체')[];
  const onlyUnclassified = chips.some((c) => c.txState === 'unclassified' || c.label === '미분류');
  if (flows.length === 0 && sources.length === 0 && kinds.length === 0 && !onlyUnclassified) return null;
  return (tx) => {
    const isIn = Number(tx.amount) > 0;
    if (flows.length && !flows.includes(isIn ? '입금' : '출금')) return false;
    if (sources.length) {
      const m = String(tx.method || '');
      const src = m === 'CMS' ? 'CMS' : m === '카드' ? '카드' : '계좌';
      if (!sources.includes(src)) return false;
    }
    if (onlyUnclassified) {
      const cat = tx.category;
      if (cat && String(cat) !== '(미분류)') return false;
    }
    if (kinds.length) {
      const kind = String(tx.ledgerKind || '');
      if (!kinds.includes(kind as '수입' | '지출' | '이체')) return false;
    }
    return true;
  };
}

// 기한 필터 — 선택된 기한 칩들로 dday 매칭 함수 생성. 기한 칩 안 고르면 null(=기한 무관).
export function dueMatcher(lensKey: string, selected: Set<string> | undefined): ((dday: number | null | undefined) => boolean) | null {
  if (!selected || selected.size === 0) return null;
  const dueChips = allChips(lensKey).filter((c) => c.due && selected.has(c.label));
  if (dueChips.length === 0) return null;
  return (dday) => {
    if (dday == null) return false;
    return dueChips.some((c) => (c.due === 'overdue' ? dday < 0 : dday >= (c.due as [number, number])[0] && dday <= (c.due as [number, number])[1]));
  };
}

/** 그룹 dim의 선택 라벨만 추출(페이지 필터용). */
export function selectedInDim(lensKey: string, dim: string, selected: Set<string>): string[] {
  const g = (LENS_FILTERS[lensKey] || []).find((x) => x.dim === dim);
  if (!g) return [];
  return g.chips.map((c) => c.label).filter((l) => selected.has(l));
}

/** 정합성 종류 칩 → RiskItem.kind 매칭. */
export function riskKindMatch(selected: Set<string>, kind: string): boolean {
  const kinds = selectedInDim('정합성', '종류', selected);
  if (!kinds.length) return true;
  const map: Record<string, string[]> = {
    필수누락: ['필수누락'],
    만기: ['보험만료', '보험임박', '검사만료', '검사임박'],
    고아: ['plate고아'],
    날짜역전: ['날짜역전'],
    미납: ['미수'],
    보험불일치: ['보험불일치'],
    반납지남: ['반납지남'],
  };
  return kinds.some((lab) => (map[lab] || [lab]).includes(kind));
}
