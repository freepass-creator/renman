/**
 * 업무 SSOT — 이벤트 처리 목록. 메뉴·허브(/work)가 여기를 따른다.
 *   현황(원장 보기) ≠ 업무(손대기). 생각날 때 WORK_PAGES에 추가.
 *   메뉴 라벨 = 업무 말투(○○관리 · 일보 · 등록).
 *
 * Sec 파이프: WorkPipe to="…" — 손롤 <a href> 금지. PIPE SSOT.
 */
export const WORK_PAGES = [
  { href: '/dispatch', label: '배차관리', desc: '출고·반납·재고·이동', secs: '오늘 큐 · 출고 · 반납 · 재고', kind: 'work' as const, tier: '스탠다드' as const },
  { href: '/receivables', label: '미수관리', desc: '연체·독촉·시동·내용증명', secs: '현황 · 미수 목록 · 조치', kind: 'work' as const, tier: '스탠다드' as const },
  { href: '/payments', label: '자금일보', desc: '입금↔계약 매칭 · CMS · 재무현황 공급', secs: '미매칭 · 제안 · CMS', kind: 'work' as const, tier: '스탠다드' as const },
  { href: '/repair', label: '정비관리', desc: '정비·사고·복귀', secs: '정비·사고 · 그 밖의 상태', kind: 'work' as const, tier: '스탠다드' as const },
  { href: '/penalty', label: '과태료관리', desc: '고지·매칭·변경부과', secs: '미매칭 · 진행 · 종결', kind: 'work' as const, tier: '스탠다드' as const },
  { href: '/ingest', label: '자료등록', desc: 'OCR·엑셀·직접 입력', secs: '엔티티 선택 · 검토 · 저장', kind: 'input' as const, tier: '스탠다드' as const },
  { href: '/inbox', label: '증빙수집', desc: '현장 사진·서명 대기', secs: '업로드 · 대기 · 매칭', kind: 'input' as const, tier: '스탠다드' as const },
] as const;

export type WorkPageHref = (typeof WORK_PAGES)[number]['href'];

/** Sec·카드 → 메뉴 페이지. 업무 + 현황(원장 보기). */
export const PIPE = {
  dispatch: { href: '/dispatch', label: '배차관리' },
  receivables: { href: '/receivables', label: '미수관리' },
  payments: { href: '/payments', label: '자금일보' },
  repair: { href: '/repair', label: '정비관리' },
  penalty: { href: '/penalty', label: '과태료관리' },
  ingest: { href: '/ingest', label: '자료등록' },
  inbox: { href: '/inbox', label: '증빙수집' },
  work: { href: '/work', label: '업무현황' },
  finance: { href: '/finance', label: '재무현황' },
  asset: { href: '/asset', label: '자산현황' },
  contract: { href: '/contract', label: '계약현황' },
  sheet: { href: '/sheet', label: '운영시트' },
} as const;
export type PipeId = keyof typeof PIPE;

const WORK_HREFS: string[] = WORK_PAGES.map((p) => p.href);

/** 업무 허브·업무/입력 페이지 경로 여부 (모바일 탭 하이라이트). */
export function isWorkPath(pathname: string): boolean {
  if (pathname === '/work' || pathname.startsWith('/work/')) return true;
  if (pathname.startsWith('/field') || pathname === '/m') return true;
  return WORK_HREFS.some((h) => pathname === h || pathname.startsWith(h + '/'));
}

export function openWorkHub() {
  openPipe('work');
}

/** SPA 이동 — 풀리로드 금지. query 예: '?plate=12가3456' */
export function openPipe(id: PipeId, query?: string) {
  if (typeof window === 'undefined') return;
  const base = PIPE[id].href;
  const href = query
    ? `${base}${query.startsWith('?') || query.startsWith('#') ? query : `?${query}`}`
    : base;
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href } }));
}
