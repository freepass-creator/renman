'use client';
/**
 * 앱 IA SSOT — 메뉴 → 페이지 → 잡기(입력) → 보기.
 * 데이터 층 = lib/domain/layers · 티어 = lib/tier.
 *
 * 2026-07 IA:
 *   허브 = 홈 · 운영현황 · 데이터센터
 *   원장 = 자산 · 계약 · 자금 · 업무
 *   홈 탭 = 요약·미결·리스크·휴차·일정 (일정관리 메뉴 흡수)
 *   원장 = 마스터 표 + 더블클릭 우측 상세패널 (별도 상세페이지 축소 수순)
 */
import {
  Table2, Wallet, Settings, Database, ListTodo, Home,
  CarFront, FileText, LayoutDashboard, Upload, type LucideIcon,
} from 'lucide-react';
import type { Tier } from './tier';
import type { AssetKind, DataLayer } from './domain/layers';
import { layerOfPageRole } from './domain/layers';

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
  // ── 허브 ──
  { href: '/', label: '홈', role: 'hub', layer: 'mixed', tier: '라이트', view: 'LedgerFrame · 요약/미결/리스크/휴차/일정', grab: 'none', grabHow: '—' },
  { href: '/status', label: '운영현황', role: 'view', layer: 'mixed', tier: '라이트', view: '차량 1대=1행 통합원장 · LedgerFrame', grab: 'none', grabHow: '—' },
  { href: '/desk', label: '일정→홈', role: 'view', layer: 'event', tier: '라이트', view: 'redirect /?tab=일정', grab: 'none', grabHow: '—' },
  { href: '/ingest', label: '데이터센터', role: 'input', layer: 'mixed', tier: '라이트', view: 'OCR·엑셀·직접 투입', grab: 'batch', grabHow: '담기' },

  // ── 원장 ──
  { href: '/asset', label: '자산관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '차량 1대=1행 · 더블클릭 상세패널', grab: 'both', grabHow: '생성·패널수정 · 마이그레이션' },
  { href: '/contract', label: '계약관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'contract', view: '계약 1건=1행 · 더블클릭 상세패널 · 리스크(불이행)', grab: 'both', grabHow: '생성·패널수정 · 리스크 CTA' },
  { href: '/cash', label: '자금관리', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'cash', view: '계좌+입출금 · CMS매칭', grab: 'batch', grabHow: '단건·대량 입력 · 담기' },
  { href: '/work', label: '업무관리', role: 'work', layer: 'event', tier: '라이트', view: '정비·일정·과태료·상담 통합', grab: 'context', grabHow: '행·생성' },

  // ── 시스템 ──
  { href: '/settings', label: '설정', role: 'system', layer: 'system', tier: '라이트', view: '계정·초기화면', grab: 'none', grabHow: '—' },
  { href: '/dev/data', label: '데이터 마이그레이션', role: 'system', layer: 'system', tier: '라이트', view: '스위치플랜 반영·백엔드', grab: 'none', grabHow: '본사 전용' },

  // ── 딥링크 (메뉴 비노출 · URL 유지) ──
  { href: '/payments', label: '자금일보(딥링크)', role: 'work', layer: 'event', tier: '라이트', view: '입금매칭 — /cash에서 진입', grab: 'none', grabHow: '매칭·분류' },
  { href: '/receivables', label: '미수관리(딥링크)', role: 'work', layer: 'event', tier: '라이트', view: '회수 큐 — 계약/자금 CTA', grab: 'context', grabHow: '연락' },
  { href: '/penalty', label: '과태료(딥링크)', role: 'work', layer: 'event', tier: '라이트', view: '업무원장·업로드', grab: 'both', grabHow: '매칭' },
  { href: '/dispatch', label: '배차(딥링크)', role: 'work', layer: 'event', tier: '스탠다드', view: '출고·반납', grab: 'context', grabHow: '위저드' },
  { href: '/vehicle/[plate]', label: '차량상세', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '자산 패널「차량 상세」→ 축소 수순', grab: 'context', grabHow: '그자리 편집' },
  { href: '/search', label: '찾기', role: 'hub', layer: 'mixed', tier: '라이트', view: '상단 검색 전체결과 · 점프용(상세 IA 아님)', grab: 'none', grabHow: '—' },

  // ── 레거시 리다이렉트 ──
  { href: '/sheet', label: '운영원장→자산', role: 'view', layer: 'ledger', tier: '라이트', view: 'redirect /asset', grab: 'none', grabHow: '—' },
  { href: '/finance', label: '재무현황→자금', role: 'view', layer: 'ledger', tier: '라이트', view: 'redirect /cash', grab: 'none', grabHow: '—' },
  { href: '/ops', label: '마이페이지→홈미결', role: 'hub', layer: 'mixed', tier: '라이트', view: 'redirect /?tab=미결', grab: 'none', grabHow: '—' },
];

export const PAGE_BY_HREF: Record<string, PageIA> = Object.fromEntries(PAGE_IA.map((p) => [p.href, p]));

export function pageTier(href: string): Tier {
  return PAGE_BY_HREF[href]?.tier ?? '라이트';
}

export function pageLayer(role: PageRole): DataLayer | 'mixed' {
  return layerOfPageRole(role);
}

export type NavItem = { href: string; label: string; icon: LucideIcon; tier?: Tier; hqOnly?: boolean; webOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

/**
 * ERP 메뉴 정보구조 SSOT.
 * 원장 = 확정 현재 상태 · 업무 = 사건/처리 · 상태·기간은 메뉴가 아니라 필터/views.
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
  children?: ErpMenuNode[];
  views?: MenuView[];
};

export const ERP_MENU_TREE: ErpMenuNode[] = [
  {
    id: 'hub',
    label: '허브',
    href: '/',
    icon: Home,
    children: [
      { id: 'home', label: '홈', href: '/', icon: Home },
      { id: 'status', label: '운영현황', href: '/status', icon: LayoutDashboard },
      { id: 'ingest', label: '데이터센터', href: '/ingest', icon: Upload },
    ],
  },
  {
    id: 'ledger',
    label: '원장',
    href: '/asset',
    icon: Table2,
    children: [
      { id: 'asset-ledger', label: '자산관리', href: '/asset', icon: CarFront, views: [{ id: 'asset-status', label: '소유·가동 상태' }] },
      { id: 'contract-ledger', label: '계약관리', href: '/contract', icon: FileText, views: [{ id: 'contract-status', label: '진행·만기·리스크' }] },
      { id: 'money-ledger', label: '자금관리', href: '/cash', icon: Wallet, views: [{ id: 'accounts-daily', label: '계좌+일보' }] },
      { id: 'work-ledger', label: '업무관리', href: '/work', icon: ListTodo, views: [{ id: 'all-work', label: '정비·일정·과태료' }] },
    ],
  },
  {
    id: 'system',
    label: '시스템',
    href: '/dev/data',
    icon: Settings,
    children: [
      { id: 'dev-tools', label: '데이터 마이그레이션', href: '/dev/data', icon: Database, hqOnly: true },
      { id: 'settings', label: '설정', href: '/settings', icon: Settings },
    ],
  },
];

/** 햄버거/사이드 렌더러용. ERP_MENU_TREE와 라벨·href 동기. */
export const NAV_GROUPS: NavGroup[] = [
  { title: '', items: [
    { href: '/', label: '홈', icon: Home, tier: '라이트' },
    { href: '/status', label: '운영현황', icon: LayoutDashboard, tier: '라이트' },
    { href: '/ingest', label: '데이터센터', icon: Upload, tier: '라이트' },
  ] },
  { title: '원장', items: [
    { href: '/asset', label: '자산관리', icon: CarFront, tier: '라이트' },
    { href: '/contract', label: '계약관리', icon: FileText, tier: '라이트' },
    { href: '/cash', label: '자금관리', icon: Wallet, tier: '라이트' },
    { href: '/work', label: '업무관리', icon: ListTodo, tier: '라이트' },
  ] },
  { title: '시스템', items: [
    { href: '/dev/data', label: '데이터 마이그레이션', icon: Database, tier: '라이트', hqOnly: true },
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
