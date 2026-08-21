'use client';
/**
 * 앱 IA SSOT — 메뉴 → 페이지 → 잡기(입력) → 보기.
 * 데이터 층 = lib/domain/layers · 티어 = lib/tier.
 *
 * 2026-07 IA (사장님 확정 — 임의 변경·추가 금지):
 *   (상단) 대시보드 · 운영현황
 *   (처리) 리스크관리 · 업무관리 · 자금일보 · 데이터관리
 *   (원장) 자산관리 · 계약관리 · 자금관리
 *   (하단) 경영관리 · 개발도구 · 설정
 *   미수관리(/receivables) = 메뉴 비노출 · 페이지 존치(리스크 미납 액션으로 진입)
 *   PAGE_IA · ERP_MENU_TREE · NAV_GROUPS 동기.
 */
import {
  Table2, Wallet, Settings, Database, ListTodo,
  CarFront, FileText, LayoutDashboard, Upload, TriangleAlert, ArrowLeftRight,
  Building2, type LucideIcon,
} from 'lucide-react';
import type { Tier } from './tier';
import type { AssetKind, DataLayer } from './domain/layers';
import { layerOfPageRole } from './domain/layers';
import { DATA_CENTER_TITLE } from './data-center-terms';

/** 페이지 역할 — 메뉴 그룹·CTA 규칙에도 쓰임. */
export type PageRole = 'hub' | 'view' | 'work' | 'input' | 'system';

/** 입력 입구. */
export type GrabKind = 'batch' | 'context' | 'both' | 'none';

export type PageIA = {
  href: string;
  label: string;
  role: PageRole;
  layer: DataLayer | 'mixed';
  /** 최소 티어. 기본=라이트. */
  tier?: Tier;
  assetKind?: AssetKind;
  view: string;
  grab: GrabKind;
  grabHow: string;
};

/**
 * 전 화면 역할 표 — 새 페이지 추가 시 여기 먼저.
 * 메뉴 노출은 NAV_GROUPS / ERP_MENU_TREE. 레거시 href는 리다이렉트용으로만 남긴다.
 */
export const PAGE_IA: PageIA[] = [
  // ── 상단 ──
  { href: '/', label: '대시보드', role: 'hub', layer: 'mixed', tier: '라이트', view: '관제 콕핏 · KPI 타일 + 오늘집중', grab: 'none', grabHow: '—' },
  { href: '/status', label: '운영현황', role: 'view', layer: 'mixed', tier: '라이트', view: '차량 1대=1행 통합원장 · LedgerFrame', grab: 'none', grabHow: '—' },

  // ── 처리 ──
  { href: '/risk', label: '리스크관리', role: 'hub', layer: 'mixed', tier: '라이트', view: 'risk-ledger · LedgerFrame · 미완료·미납·만기·휴차', grab: 'none', grabHow: '—' },
  { href: '/work', label: '업무관리', role: 'work', layer: 'event', tier: '라이트', view: '정비·일정·과태료·상담 통합', grab: 'context', grabHow: '행·생성' },
  { href: '/payments', label: '자금일보', role: 'work', layer: 'event', tier: '라이트', view: '원장 일별 가공 · 분류·증빙·계약매칭·일마감', grab: 'none', grabHow: '분류·연결·마감' },
  { href: '/ingest', label: DATA_CENTER_TITLE, role: 'input', layer: 'mixed', tier: '라이트', view: '원본 투입·분석·연결·반영', grab: 'batch', grabHow: '파일 먼저 · OCR·엑셀·직접' },

  // ── 원장 ──
  { href: '/asset', label: '자산관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '차량 1대=1행 · 더블클릭 상세패널', grab: 'both', grabHow: '생성·패널수정' },
  { href: '/contract', label: '계약관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'contract', view: '계약 1건=1행 · 더블클릭 상세패널', grab: 'both', grabHow: '생성·패널수정' },
  { href: '/cash', label: '자금관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'cash', view: '계좌·카드·자동이체 Cash-in/out · 묶음 1차 분류·대사', grab: 'batch', grabHow: '단건·대량 입력 · 담기' },

  // ── 하단 ──
  { href: '/management', label: '경영관리', role: 'system', layer: 'system', tier: '라이트', view: '법인·계좌·임대차 · LedgerFrame 탭', grab: 'none', grabHow: '—' },
  { href: '/dev/data', label: '개발도구', role: 'system', layer: 'system', tier: '라이트', view: '스위치플랜 반영·백엔드', grab: 'none', grabHow: '본사 전용' },
  { href: '/settings', label: '설정', role: 'system', layer: 'system', tier: '라이트', view: '계정·초기화면', grab: 'none', grabHow: '—' },

  // ── 딥링크 (메뉴 비노출 · URL 유지) ──
  { href: '/receivables', label: '미수관리(딥링크)', role: 'work', layer: 'event', tier: '라이트', view: '회수 큐 — 리스크 미납 액션으로 진입', grab: 'context', grabHow: '연락·독촉' },
  { href: '/integrity', label: '정합성(딥링크)', role: 'view', layer: 'mixed', tier: '라이트', view: '컴플라이언스·데이터 점검', grab: 'none', grabHow: '—' },
  { href: '/penalty', label: '과태료(딥링크)', role: 'work', layer: 'event', tier: '라이트', view: '→업무관리 과태료', grab: 'both', grabHow: '매칭' },
  { href: '/dispatch', label: '배차(딥링크)', role: 'work', layer: 'event', tier: '스탠다드', view: '출고·반납', grab: 'context', grabHow: '위저드' },
  { href: '/vehicle/[plate]', label: '차량상세', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '자산 패널「차량 상세」→ 축소 수순', grab: 'context', grabHow: '그자리 편집' },
  { href: '/search', label: '찾기', role: 'hub', layer: 'mixed', tier: '라이트', view: '상단 검색 전체결과 · 점프용(상세 IA 아님)', grab: 'none', grabHow: '—' },

  // ── 레거시 리다이렉트 ──
  { href: '/sheet', label: '구 운영원장→할 일 확인', role: 'view', layer: 'mixed', tier: '라이트', view: 'redirect /sheet/reborn', grab: 'none', grabHow: '—' },
  { href: '/finance', label: '재무현황→자금', role: 'view', layer: 'ledger', tier: '라이트', view: 'redirect /cash', grab: 'none', grabHow: '—' },
  { href: '/ops', label: '마이페이지→대시보드', role: 'hub', layer: 'mixed', tier: '라이트', view: 'redirect /', grab: 'none', grabHow: '—' },
  { href: '/desk', label: '일정관리→리스크', role: 'view', layer: 'event', tier: '라이트', view: 'redirect /risk', grab: 'none', grabHow: '—' },
];

export const PAGE_BY_HREF: Record<string, PageIA> = Object.fromEntries(PAGE_IA.map((p) => [p.href, p]));

export function pageTier(href: string): Tier {
  return PAGE_BY_HREF[href]?.tier ?? '라이트';
}

export function pageLayer(role: PageRole): DataLayer | 'mixed' {
  return layerOfPageRole(role);
}

export type NavItem = { href: string; label: string; icon: LucideIcon; tier?: Tier; hqOnly?: boolean; webOnly?: boolean; devOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

/**
 * ERP 메뉴 정보구조 SSOT.
 * 처리 = 예외·사건·투입 · 원장 = 확정 현재 상태 · 상태·기간은 메뉴가 아니라 필터/views.
 * ★메뉴·그룹 추가는 사장님 승인 필요.
 */
export type MenuView = {
  id: string;
  label: string;
  filter?: Record<string, string>;
};

export type ErpMenuNode = {
  id: string;
  label: string;
  href?: string;
  icon: LucideIcon;
  tier?: Tier;
  hqOnly?: boolean;
  devOnly?: boolean;
  children?: ErpMenuNode[];
  views?: MenuView[];
};

export const ERP_MENU_TREE: ErpMenuNode[] = [
  {
    id: 'top',
    label: '',
    href: '/',
    icon: LayoutDashboard,
    children: [
      { id: 'home', label: '대시보드', href: '/', icon: LayoutDashboard },
    ],
  },
  // ★2026-08-05 사장님 지시: «운영현황+리스크관리» 한 세트 · «업무관리+자금일보+데이터센터» 한 세트.
  {
    id: 'monitor',
    label: '현황',
    href: '/status',
    icon: LayoutDashboard,
    children: [
      { id: 'status', label: '운영현황', href: '/status', icon: LayoutDashboard },
      { id: 'risk', label: '리스크관리', href: '/risk', icon: TriangleAlert },
    ],
  },
  {
    id: 'process',
    label: '처리',
    href: '/work',
    icon: ListTodo,
    children: [
      { id: 'work', label: '업무관리', href: '/work', icon: ListTodo },
      { id: 'payments', label: '자금일보', href: '/payments', icon: ArrowLeftRight },
      { id: 'ingest', label: DATA_CENTER_TITLE, href: '/ingest', icon: Upload },
    ],
  },
  {
    id: 'ledger',
    label: '원장',
    href: '/asset',
    icon: Table2,
    children: [
      { id: 'asset-ledger', label: '자산관리', href: '/asset', icon: CarFront, views: [{ id: 'asset-status', label: '소유·가동 상태' }] },
      { id: 'contract-ledger', label: '계약관리', href: '/contract', icon: FileText, views: [{ id: 'contract-status', label: '진행·만기·리스크' }, { id: 'contract-schedule', label: '회차별 청구' }] },
      { id: 'money-ledger', label: '자금관리', href: '/cash', icon: Wallet, views: [{ id: 'accounts-daily', label: '계좌+일보' }] },
    ],
  },
  {
    id: 'bottom',
    label: '하단',
    href: '/management',
    icon: Building2,
    children: [
      { id: 'management', label: '경영관리', href: '/management', icon: Building2 },
      { id: 'dev-tools', label: '개발도구', href: '/dev/data', icon: Database, hqOnly: true },
      { id: 'settings', label: '설정', href: '/settings', icon: Settings },
    ],
  },
];

/** 햄버거/사이드 렌더러용. ERP_MENU_TREE와 라벨·href·그룹 순서 동기. */
/**
 * ★2026-08-09 사장님 확정 — 앱은 3개다(docs/DESIGN-2026-08 §1).
 *
 *   1) 업무조회   뭐가 문제고 뭘 해야 하나   — 들어오면 여기
 *   2) 데이터센터  정확히 어떤 건들인가      — 원장 모음
 *   3) 자료올리기  새 자료를 어떻게 넣나     — 문서·엑셀·수기 투입
 *
 * 근거: 「원장은 제대로만 돌면 볼 필요가 없다.」 그래서 입구는 원장이 아니라 할 일이고,
 *   원장은 «확인하러 갈 때» 가는 곳으로 내린다.
 * 360(차량·계약·손님 상세)은 탭이 아니다 — 어디서든 대상을 누르면 열리는 상세면.
 * 페이지는 그대로 두고 «묶는 방식»만 바꿨다. href 변경 없음.
 */
export const NAV_GROUPS: NavGroup[] = [
  { title: '업무조회', items: [
    { href: '/', label: '할 일', icon: LayoutDashboard, tier: '라이트' },
    { href: '/work', label: '업무관리', icon: ListTodo, tier: '라이트' },
    { href: '/risk', label: '리스크관리', icon: TriangleAlert, tier: '라이트' },
  ] },
  { title: DATA_CENTER_TITLE, items: [
    { href: '/status', label: '운영현황', icon: LayoutDashboard, tier: '라이트' },
    { href: '/asset', label: '자산관리', icon: CarFront, tier: '라이트' },
    { href: '/contract', label: '계약관리', icon: FileText, tier: '라이트' },
    { href: '/cash', label: '자금관리', icon: Wallet, tier: '라이트' },
    { href: '/payments', label: '자금일보', icon: ArrowLeftRight, tier: '라이트' },
  ] },
  { title: '자료올리기', items: [
    { href: '/ingest', label: '자료올리기', icon: Upload, tier: '라이트' },
  ] },
  { title: '하단', items: [
    { href: '/management', label: '경영관리', icon: Building2, tier: '라이트' },
    { href: '/dev/data', label: '개발도구', icon: Database, tier: '라이트', hqOnly: true },
    { href: '/settings', label: '설정', icon: Settings, tier: '라이트' },
  ] },
];

/** 경로 → nav 아이콘. 메뉴·Page/LedgerFrame 타이틀 SSOT. 최장 prefix 매칭. */
export function navIconForPath(pathname: string): LucideIcon | undefined {
  const path = pathname.split('?')[0] || '/';
  let best: NavItem | undefined;
  for (const g of NAV_GROUPS) {
    for (const it of g.items) {
      if (it.href === '/') {
        if (path === '/') best = it;
        continue;
      }
      if (path === it.href || path.startsWith(`${it.href}/`)) {
        if (!best || it.href.length > best.href.length) best = it;
      }
    }
  }
  return best?.icon;
}
