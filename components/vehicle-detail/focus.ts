/** openCar(plate, focus) / ?do= → ERP 작업 영역(한 화면에서 처리) */

export type VehicleFocus =
  | 'unpaid'
  | 'return'
  | 'inspect'
  | 'deploy'
  | 'doc'
  | 'loan'
  | 'insurance'
  | '';

/** 한 번에 하나만 켜는 작업 영역 */
export type Workspace = 'now' | 'car' | 'settle' | 'log';

export const WORKSPACES: { key: Workspace; label: string; desc: string }[] = [
  { key: 'now', label: '한눈', desc: '필수정보 · 그 자리 입금/반납/수정' },
  { key: 'car', label: '이 차', desc: '스펙 · 등록증 · 보험 · 취득' },
  { key: 'settle', label: '수납·정산', desc: '회차 전체 · 보증금 · 손바꿈' },
  { key: 'log', label: '이력', desc: '과태료 · 수선 · 활동' },
];

export type PanelKey =
  | 'status'
  | 'info'
  | 'reg'
  | 'insurance'
  | 'purchase'
  | 'product'
  | 'econ'
  | 'schedule'
  | 'deposit'
  | 'handover'
  | 'penalty'
  | 'work'
  | 'history';

/** 작업 영역별 패널(그 화면에서만 보임) */
export const WORKSPACE_PANELS: Record<Workspace, PanelKey[]> = {
  now: ['status'],
  car: ['info', 'reg', 'insurance', 'purchase', 'product', 'econ'],
  settle: ['schedule', 'deposit', 'handover'],
  log: ['penalty', 'work', 'history'],
};

export function workspaceFromFocus(focus?: string): Workspace {
  switch (focus) {
    case 'unpaid':
      return 'now'; // 한눈에서 입금 입력
    case 'return':
    case 'deploy':
      return 'now';
    case 'inspect':
      return 'log';
    case 'doc':
    case 'loan':
    case 'insurance':
      return 'car';
    default:
      return 'now';
  }
}

/** Sec/InfoDoc id · panel key → 작업 영역 */
export function workspaceFromNav(id: string): Workspace | null {
  if (id === 'v-status' || id === 'v-contract' || id === 'v-gps' || id === 'status') return 'now';
  if (
    id === 'v-info' || id === 'v-reg' || id === 'v-insurance' || id === 'v-purchase' || id === 'v-loan'
    || id === 'v-product' || id === 'v-econ'
    || id === 'info' || id === 'reg' || id === 'insurance' || id === 'purchase' || id === 'product' || id === 'econ'
  ) return 'car';
  if (
    id === 'v-schedule' || id === 'v-deposit' || id === 'v-handover'
    || id === 'schedule' || id === 'deposit' || id === 'handover'
  ) return 'settle';
  if (
    id === 'v-penalty' || id === 'v-work' || id === 'v-history'
    || id === 'penalty' || id === 'work' || id === 'history'
  ) return 'log';
  return null;
}

/** 자산상세 작업영역 전환 버스 — goSec·미결칩이 스크롤 대신 워크스페이스를 연다 */
export const VEHICLE_NAV = 'jpk:vehicle-nav';

export function navVehicle(id: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(VEHICLE_NAV, { detail: { id } }));
}
