// 전역 UI 이벤트 버스 — 어디서든 차 열기/담기/팔레트/새로고침. 사이드바 없는 단일화면의 접착제.
// focus = 온 이유(task): unpaid(수납)·return(반납)·inspect(검사)·deploy(투입)·doc(서류)·loan|insurance → 360이 해당 액션을 띄움
// 세계관: 차번·기간·계약자 축이 끊기지 않게 열기 — openCar / openCustomer / openPayments.
export const openCar = (plate: unknown, focus?: string, companyId?: unknown) => window.dispatchEvent(new CustomEvent('jpk:open-car', {
  detail: { plate: String(plate || ''), focus: focus || '', companyId: String(companyId || '') },
}));
/** 홈 렌즈 전환 — 전용 페이지로. */
export const openLens = (lens: string) => {
  if (typeof window === 'undefined') return;
  const map: Record<string, string> = {
    운영: '/status',
    일정: '/risk',
    콕핏: '/',
    미결: '/receivables',
    리스크: '/risk',
    휴차: '/status',
    요약: '/',
    돈: '/cash',
    자금: '/cash',
  };
  const href = map[lens] || '/';
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href } }));
};
export const openCustomer = (key: unknown) => window.dispatchEvent(new CustomEvent('jpk:open-customer', { detail: { key: String(key || '') } }));
/** 수납매칭 — 입금→계약 파이프 입구. SPA push(CarDrawer jpk:navigate). 풀리로드 금지. */
export const openPayments = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href: '/payments' } }));
};
/** 미수관리 — 회수 큐. */
export const openReceivables = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href: '/receivables' } }));
};
/** 재무/자금 — /cash (구 /finance 흡수). facet=미분류면 미분류 필터. */
export const openFinance = (opts?: { unclassified?: boolean }) => {
  if (typeof window === 'undefined') return;
  const href = opts?.unclassified ? '/cash?facet=미분류' : '/cash';
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href } }));
};
// 문서 인쇄 오버레이(내용증명 등) — 라우트 없이 전역 PrintHost로
// contractKeys = 내용증명 일괄(N건 한 오버레이·페이지브레이크)
export const openPrintDoc = (
  type: string,
  plate: string,
  extra?: { amount?: number; label?: string; contractKey?: string; contractKeys?: string[] },
) =>
  window.dispatchEvent(new CustomEvent('jpk:print-doc', { detail: { type, plate, ...(extra || {}) } }));
export const openCommand = () => window.dispatchEvent(new Event('jpk:command'));
// 신규 담기 = 팝업 아닌 «데이터센터 페이지»로 이동(규격 통일·SPA push). type=엔티티, plate=프리필.
export const openIngest = (type?: string, plate?: string) => {
  if (typeof window === 'undefined') return;
  const qs = new URLSearchParams();
  if (type) qs.set('type', type);
  if (plate) qs.set('plate', plate);
  const href = '/ingest' + (qs.toString() ? `?${qs.toString()}` : '');
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href } }));
};
// (기존 레코드 정정은 각 상세(360/계약 상세)에서 «그 자리 인라인 편집» — openEntityEdit 팝업 폐지)
// 빠른 기록(활동 로그) — 실무자가 차/고객 맥락에서 소소하게: 이동·통화·문자·방문·메모·정비. 마찰 0.
export const openLog = (ctx?: { plate?: string; customer?: string; contractNo?: string; companyId?: string }) => window.dispatchEvent(new CustomEvent('jpk:log', { detail: ctx || {} }));
// 저장 반영 브로드캐스트 — 쓰기 계층(store)이 자동 발신 + 페이지가 수동 발신해도 중복 코얼레스(50ms).
//   구독은 공용 useReloadOnSaved 훅(lib/use-reload-on-saved) 하나로. 페이지별 임기응변 금지.
let savedTimer: ReturnType<typeof setTimeout> | null = null;
export const notifySaved = () => {
  if (typeof window === 'undefined' || savedTimer) return;
  savedTimer = setTimeout(() => { savedTimer = null; window.dispatchEvent(new Event('jpk:saved')); }, 50);
};
// 세부 페이지 그 자리에서 인라인 수정 — 앱바 '수정' 버튼이 트리거(팝업 대신)
export const openEdit = (plate?: string) => window.dispatchEvent(new CustomEvent('jpk:edit-vehicle', { detail: { plate: plate || '' } }));
