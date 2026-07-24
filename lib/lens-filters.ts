// 렌즈별 퀵필터 — 두 축으로 카드를 잘게 거른다.
//   · 종류(secs): 어떤 문제냐 → 해당 섹션만 표시(섹션 show/hide)
//   · 기한(due):  언제까지 처리냐 → 카드의 마감 D-day로 거르기(overdue=지남, [a,b]=D-a~D-b)
//   같은 그룹 안 다중선택=OR, 그룹 간=AND. 아무것도 안 고르면 전체.
//   회사·기간·검색·탭은 WorkbenchBar 소유 — 레일에 중복 금지.
import { AGENDA_KINDS } from './agenda';

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

/** 공유 D-day 칩 — 콕핏·과태료·계약 만기 등에서 재사용 */
export const DUE_CHIPS: FacetChip[] = [
  { label: '지남', due: 'overdue' },
  { label: '오늘', due: [0, 0] },
  { label: '내일', due: [1, 1] },
  { label: '이번주', due: [2, 7] },
  { label: '이번달', due: [8, 30] },
];

export const LENS_FILTERS: Record<string, FacetGroup[]> = {
  일정: [   // 종류 필터 → ScheduleLens가 facets 라벨(=AgendaKind)로 어젠다 거름
    { dim: '종류', chips: AGENDA_KINDS.map((k) => ({ label: k })) },
  ],
  마이: [   // 영역 필터 → MyWorkLens가 섹션 group으로 거름
    { dim: '영역', chips: [{ label: '미결' }, { label: '리스크' }, { label: '자산' }, { label: '자금' }, { label: '고객' }] },
  ],
  배차: [   // 차 기준 배치상태 — 페이지가 facets.has(상태)로 직접 매칭(dueMatcher 불필요)
    { dim: '상태', chips: [
      { label: '대여가능' }, { label: '운행중' }, { label: '반납임박' }, { label: '반납지남' }, { label: '정비' },
    ] },
  ],
  // 현황 = FacetRail 상시 + 생애 Sec (탭 금지).
  자산현황: [
    { dim: '가동', chips: [{ label: '운행' }, { label: '휴차' }, { label: '정비' }] },
    { dim: '만기', chips: [
      { label: '검사지남' }, { label: '검사30일' }, { label: '보험지남' }, { label: '보험30일' },
    ] },
    { dim: '부채·보험', chips: [{ label: '할부있음' }, { label: '보험없음' }] },
  ],
  운영시트: [  // 차량 1대=1행 통합 마스터 사이드필터. 기본 '보유' 선택(매각/처분은 명시 선택 시 노출).
    { dim: '보유', chips: [{ label: '보유' }, { label: '매각' }] },
    { dim: '가동', chips: [{ label: '운행' }, { label: '휴차' }, { label: '정비' }] },
    { dim: '경고', chips: [{ label: '경고있음' }, { label: '위험만' }] },
    { dim: '미수', chips: [{ label: '미수있음' }, { label: '연체90일+' }] },
    { dim: '만기', chips: [{ label: '검사임박' }, { label: '보험임박' }] },
    { dim: '부채·보험', chips: [{ label: '할부있음' }, { label: '보험없음' }] },
  ],
  계약현황: [
    { dim: '채권', chips: [{ label: '채권잔존' }, { label: '청산' }] },
    { dim: '만기', chips: [
      { label: '만기경과', due: 'overdue' },
      { label: '30일이내', due: [0, 30] },
      { label: '60일이내', due: [0, 60] },
    ] },
    { dim: '손님', chips: [{ label: '운행중' }, { label: '미수있음' }] },
  ],
  손님현황: [
    { dim: '상태', chips: [{ label: '운행중' }, { label: '미수있음' }] },
  ],
  재무현황: [
    { dim: '분류', chips: [{ label: '미분류' }, { label: '분류됨' }] },
    { dim: '입출금', chips: [{ label: '입금', txFlow: '입금' }, { label: '출금', txFlow: '출금' }] },
    { dim: '소스', chips: [{ label: '계좌', txSource: '계좌' }, { label: 'CMS', txSource: 'CMS' }, { label: '카드', txSource: '카드' }] },
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
  과태료: [
    { dim: '실운전자', chips: [{ label: '매칭' }, { label: '미매칭' }] },
    { dim: '처리', chips: [
      { label: '접수' }, { label: '임차인확인' }, { label: '변경부과신청' }, { label: '변경부과완료' }, { label: '종결' },
    ] },
    { dim: '기한', chips: DUE_CHIPS },
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
  운영: [   // 홈 운영현황 — 「보유자산이 어떻게 굴러가나」. 요약 + 실체 목록.
    { dim: '보기', chips: [
      { label: '요약', secs: ['ops-summary'] },
      { label: '인도 대기', secs: ['ops-deliver'] },
      { label: '반납 지남', secs: ['ops-overdue'] },
      { label: '만기 임박', secs: ['ops-return'] },
      { label: '쉬는 차', secs: ['a-idle'] },
      { label: '운행중', secs: ['a-running'] },
      { label: '멈춘 차', secs: ['a-other'] },
    ] },
  ],
  콕핏: [
    { dim: '처리 기한', chips: DUE_CHIPS },
    { dim: '종류', chips: [
      // 미수 칩 없음 — 미수는 리스크관리(r-unpaid) 소관. 정비·사고(s-repair)는 자산 그룹으로 옮김.
      { label: '반납', secs: ['s-return-over', 's-return'] },
      { label: '과태료', secs: ['s-penalty'] },
      { label: '서류', secs: ['s-docwait'] },
      { label: '검사·보험', secs: ['s-expire'] },
      { label: '자금', secs: ['s-money'] },
      { label: '할일·충돌', secs: ['s-todo', 's-overlap'] },
    ] },
  ],
  리스크: [
    { dim: '처리 기한', chips: DUE_CHIPS },
    { dim: '종류', chips: [
      { label: '미수', secs: ['r-unpaid'] },
      { label: '컴플라이언스', secs: ['r-compliance'] },
      { label: '보증금', secs: ['r-deposit'] },
      { label: '정합성', secs: ['r-integrity'] },
    ] },
  ],
  자산: [
    { dim: '상태', chips: [
      { label: '미처리', secs: ['a-unreg'] },
      { label: '휴차', secs: ['a-idle'] },
      { label: '운행중', secs: ['a-running'] },
      { label: '관리·정비', secs: ['a-manage', 'a-other'] },
      { label: '매각', secs: ['a-out'] },
      { label: '이벤트', secs: ['a-events'] },
    ] },
  ],
  손님: [
    { dim: '유형', chips: [
      { label: '미수 고객', secs: ['c-unpaid'] },
      { label: '진행중', secs: ['c-active'] },
      { label: '재계약 대상', secs: ['c-past'] },
    ] },
  ],
  // 옛 키 — 재무현황과 동일
  돈: [
    { dim: '분류', chips: [{ label: '미분류' }, { label: '분류됨' }] },
    { dim: '입출금', chips: [{ label: '입금', txFlow: '입금' }, { label: '출금', txFlow: '출금' }] },
    { dim: '소스', chips: [{ label: '계좌', txSource: '계좌' }, { label: 'CMS', txSource: 'CMS' }, { label: '카드', txSource: '카드' }] },
  ],
};

const allChips = (lensKey: string): FacetChip[] => (LENS_FILTERS[lensKey] || []).flatMap((g) => g.chips);

// 종류(섹션) 필터 — 선택된 종류 칩들의 섹션 합집합. 종류 칩을 아무것도 안 고르면 null(=전체 섹션).
export function visibleSecs(lensKey: string, selected: Set<string> | undefined): Set<string> | null {
  if (!selected || selected.size === 0) return null;
  const secChips = allChips(lensKey).filter((c) => c.secs);
  const picked = secChips.filter((c) => selected.has(c.label));
  if (picked.length === 0) return null; // 종류는 안 고르고 기한만 골랐을 때 = 섹션 전체 유지
  const out = new Set<string>();
  picked.forEach((c) => c.secs!.forEach((s) => out.add(s)));
  return out;
}

// 자금 tx 필터 — 입출금·소스·미분류·계정성격. Finance 페이지·렌즈 공용.
export function txFacetMatch(selected: Set<string> | undefined): ((tx: Record<string, unknown>) => boolean) | null {
  if (!selected || selected.size === 0) return null;
  const chips = (LENS_FILTERS['재무현황'] || LENS_FILTERS['돈'] || []).flatMap((g) => g.chips).filter((c) => selected.has(c.label));
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
    if (dday == null) return false; // 마감 없는 건은 기한 필터 시 제외
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
