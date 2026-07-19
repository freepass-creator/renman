// 전역 UI 이벤트 버스 — 어디서든 차 열기/담기/팔레트/새로고침. 사이드바 없는 단일화면의 접착제.
// focus = 온 이유(task): unpaid(수납)·return(반납)·inspect(검사)·deploy(투입)·doc(서류)·loan|insurance → 360이 해당 액션을 띄움
// 세계관: 차번·기간·계약자 축이 끊기지 않게 열기 — openCar / openCustomer / openPayments.
export const openCar = (plate: unknown, focus?: string) => window.dispatchEvent(new CustomEvent('jpk:open-car', { detail: { plate: String(plate || ''), focus: focus || '' } }));
/** 홈 렌즈 전환 — 운영|일정|콕핏|리스크. 자금은 openFinance. */
export const openLens = (lens: string) => window.dispatchEvent(new CustomEvent('jpk:lens', { detail: lens }));
export const openCustomer = (key: unknown) => window.dispatchEvent(new CustomEvent('jpk:open-customer', { detail: { key: String(key || '') } }));
/** 수납매칭 — 입금→계약 파이프 입구. SPA push(CarDrawer jpk:navigate). 풀리로드 금지. */
export const openPayments = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('jpk:navigate', { detail: { href: '/payments' } }));
};
/** 재무현황 — 출금·미분류 등. facet=미분류면 미분류 탭·칩. */
export const openFinance = (opts?: { unclassified?: boolean }) => {
  if (typeof window === 'undefined') return;
  const href = opts?.unclassified ? '/finance?facet=미분류' : '/finance';
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
export const openIngest = (type?: string, plate?: string) => window.dispatchEvent(new CustomEvent('jpk:ingest', { detail: { type: type || '', plate: plate || '' } }));
// 기존 레코드 정정 — 공용 입력엔진(IngestDialog) 편집모드로. entityKey + 레코드 넘기면 prefill + update.
export const openEntityEdit = (entityKey: string, rec: unknown) => window.dispatchEvent(new CustomEvent('jpk:ingest', { detail: { editType: entityKey, editRec: rec } }));
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
