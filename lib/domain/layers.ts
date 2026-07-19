/**
 * 데이터 3층 SSOT — 원장 · 지표(파생) · 이벤트.
 *
 *   ① ledger  원장 = 유·무형 **자산이 생겼다**는 불변 존재.
 *              · 현물(physical)  차량구매 → 현물자산
 *              · 계약(contract)  계약성립 → 계약자산(무형). 사건 아님.
 *              · 자금(cash)      계좌·카드 → 자금자산
 *              현황 메뉴(자산/계약/재무) = 이 층 생애상태 보기.
 *   ② metric  지표 — 가동률·미수율·KPI. **저장 X.** ①(+③) 집계. 홈·경영.
 *   ③ event   이벤트 — 자산이 돌아간 뒤 쌓이는 사건(정비·사고·과태료·수집·연락).
 *   system    도구 — 설정·감사·검색 (도메인 3층 밖).
 *
 * 규칙:
 *   "계약이 생겼다" = 계약자산 생성(ledger) ≠ 이벤트.
 *   "이 숫자는 어디에 저장하나?" → 없으면 metric.
 *   "자산 존재인가, 가동 중 사건인가?" → 존재=ledger, 사건=event.
 */
export type DataLayer = 'ledger' | 'metric' | 'event' | 'system';

/** 원장 안의 자산 종류 — 현물 / 계약(무형) / 자금. */
export type AssetKind = 'physical' | 'contract' | 'cash' | 'party';

export const LAYER_LABEL: Record<DataLayer, string> = {
  ledger: '원장',
  metric: '지표',
  event: '이벤트',
  system: '시스템',
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  physical: '현물자산',
  contract: '계약자산',
  cash: '자금자산',
  party: '거래상대',
};

export const LAYER_RULE: Record<DataLayer, string> = {
  ledger: '유·무형 자산의 존재·생애. 성립=생성(불변 원장). 상태는 바뀌어도 존재는 남음. 현황=이 층.',
  metric: '저장 없음. 원장(+이벤트) 집계 결과. 홈·경영.',
  event: '자산 가동 중 쌓이는 사건·이력. 업무=이 층 처리.',
  system: '설정·감사·검색 등 도구.',
};

/** 저장 컬렉션 → 층. ENTITIES·내부 컬렉션 포함. */
export const ENTITY_LAYER: Record<string, DataLayer> = {
  // ① 원장 — 자산 생성
  vehicle: 'ledger',   // 현물
  contract: 'ledger',  // 계약(무형) — 성립=자산 생성, 이벤트 아님
  insurance: 'ledger', // 보험 권리·증권 = 계약성 자산
  bank_tx: 'ledger',   // 자금 원장 줄
  card_tx: 'ledger',
  customer: 'ledger',  // 계약에 묶인 거래상대(얇은 원장)
  // ③ 이벤트
  history: 'event',
  penalty: 'event',
  inbox: 'event',
  issued_doc: 'event',
  // 도구
  audit_logs: 'system',
};

/** 원장 엔티티 → 자산 종류. */
export const ENTITY_ASSET_KIND: Partial<Record<string, AssetKind>> = {
  vehicle: 'physical',
  contract: 'contract',
  insurance: 'contract',
  bank_tx: 'cash',
  card_tx: 'cash',
  customer: 'party',
};

/** 파생 엔진(②) — 엔티티 아님, 계산만. */
export const METRIC_ENGINES = [
  { key: 'operating-snapshot', label: '운영 D(가동·미수·미결)', module: 'lib/operating-snapshot' },
  { key: 'kpi', label: '경영 KPI', module: 'lib/kpi' },
  { key: 'cash-ledger', label: '자금 원장 뷰·집계', module: 'lib/finance/cash-ledger' },
] as const;

/**
 * 이벤트 행위(③) — 메뉴 업무별 바로가기. 원장 생애·이력 갱신 워크플로.
 * 주의: 배차관리·자금일보는 계약/자금 **자산의 상태·연결**을 바꾸는 것이지,
 *       계약·계좌 자체를 "사건으로 만드는" 것이 아님.
 */
export const EVENT_FLOWS = [
  { key: 'hub', label: '업무현황', writes: '—', href: '/work' },
  { key: 'dispatch', label: '배차관리', writes: 'contract 생애(+증빙)', href: '/dispatch' },
  { key: 'receivables', label: '미수관리', writes: 'history·contract 상태', href: '/receivables' },
  { key: 'cash-journal', label: '자금일보', writes: 'bank_tx↔contract 연결 → 재무현황', href: '/payments' },
  { key: 'repair', label: '정비관리', writes: 'history', href: '/repair' },
  { key: 'penalty', label: '과태료관리', writes: 'penalty', href: '/penalty' },
  { key: 'ingest', label: '자료등록', writes: '원장 엔티티', href: '/ingest' },
  { key: 'inbox', label: '증빙수집', writes: 'inbox→매칭', href: '/inbox' },
  { key: 'quicklog', label: 'QuickLog', writes: 'history', href: null },
] as const;

export function layerOfEntity(entityKey: string): DataLayer {
  return ENTITY_LAYER[entityKey] ?? 'system';
}

export function assetKindOfEntity(entityKey: string): AssetKind | null {
  return ENTITY_ASSET_KIND[entityKey] ?? null;
}

export function entitiesOfLayer(layer: DataLayer): string[] {
  return Object.entries(ENTITY_LAYER).filter(([, L]) => L === layer).map(([k]) => k);
}

export function entitiesOfAssetKind(kind: AssetKind): string[] {
  return Object.entries(ENTITY_ASSET_KIND).filter(([, k]) => k === kind).map(([e]) => e);
}

/** 페이지 role → 대략 층. 정확히는 PAGE_IA.layer (view가 ledger·metric 둘 다 가능). */
export function layerOfPageRole(role: 'hub' | 'view' | 'work' | 'input' | 'system'): DataLayer | 'mixed' {
  if (role === 'input') return 'ledger';
  if (role === 'work') return 'event';
  if (role === 'system') return 'system';
  if (role === 'hub') return 'mixed';
  return 'mixed'; // view = ledger 또는 metric → PAGE_IA 보라
}
