'use client';
/**
 * 앱 IA SSOT — 메뉴 → 페이지 → 잡기(입력) → 보기.
 * 데이터 층 = lib/domain/layers · 티어 = lib/tier.
 *
 * 2026-07 원장 리셋: 메뉴 = 운영원장 · 재무원장 · 담기 · 설정.
 *   세부(360)는 메뉴에 없음 — 원장 행·담기에서 진입. 구 현황/업무 라우트는 URL 유지(점진 폐기).
 *
 * 입력 두 입구: 한곳(batch)=담기/데이터센터 · 그자리(context)=360·위저드·QuickLog.
 */
import {
  Table2, Wallet, Upload, Settings, Database, FlaskConical, Banknote, HandCoins, FileWarning, type LucideIcon,
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

/** 전 화면 역할 표 — 새 페이지 추가 시 여기 먼저. (라우트 유지 · 메뉴는 NAV_GROUPS) */
export const PAGE_IA: PageIA[] = [
  { href: '/', label: '홈', role: 'hub', layer: 'mixed', tier: '라이트', view: '운영현황·일정·미결·리스크', grab: 'context', grabHow: '카드→360·위저드 / QuickLog·담기' },
  { href: '/ops', label: '마이페이지', role: 'hub', layer: 'mixed', tier: '라이트', view: '내 일정·내 업무', grab: 'context', grabHow: '섹션·일정에서 그자리 조치' },
  { href: '/search', label: '검색', role: 'hub', layer: 'mixed', tier: '라이트', view: '통합 검색→360·목록', grab: 'none', grabHow: '조회만' },

  // 원장 2축 (메뉴 본체)
  { href: '/sheet', label: '운영원장', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '자산+계약 1행 마스터 → 360', grab: 'both', grabHow: '담기·행클릭 360' },
  { href: '/cash', label: '재무원장', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'cash', view: '계좌+자금일보 마스터 → 차360/수납', grab: 'batch', grabHow: '거래 담기 · 행클릭' },

  // 레거시 현황(메뉴 아웃 · URL 유지)
  { href: '/asset', label: '자산현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '현물 생애', grab: 'both', grabHow: '담기 · 360' },
  { href: '/contract', label: '계약현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'contract', view: '계약 생애', grab: 'both', grabHow: '담기 · 360' },
  { href: '/finance', label: '재무현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'cash', view: '구 재무현황(카드/Sec)', grab: 'batch', grabHow: '담기 · 분류' },

  { href: '/work', label: '업무현황', role: 'work', layer: 'event', tier: '스탠다드', view: '업무 한눈', grab: 'none', grabHow: '—' },
  { href: '/dispatch', label: '배차관리', role: 'work', layer: 'event', tier: '스탠다드', view: '출고·반납', grab: 'context', grabHow: '위저드' },
  { href: '/receivables', label: '미수관리', role: 'work', layer: 'event', tier: '라이트', view: '회수 큐', grab: 'context', grabHow: '연락·360' },
  { href: '/payments', label: '자금일보', role: 'work', layer: 'event', tier: '라이트', view: '입금매칭', grab: 'none', grabHow: '매칭·분류' },
  { href: '/repair', label: '차량수선', role: 'work', layer: 'event', tier: '스탠다드', view: '정비·사고', grab: 'both', grabHow: '이력·360' },
  { href: '/penalty', label: '과태료관리', role: 'work', layer: 'event', tier: '라이트', view: '과태료 큐·변경부과', grab: 'both', grabHow: '매칭' },
  { href: '/ingest', label: '데이터센터', role: 'input', layer: 'mixed', tier: '라이트', view: '원장·이력 투입', grab: 'batch', grabHow: 'OCR·엑셀·직접 → 세부 채움' },
  { href: '/inbox', label: '증빙수집', role: 'input', layer: 'event', tier: '스탠다드', view: '현장 대기함', grab: 'batch', grabHow: '매칭' },

  { href: '/pnl', label: '손익현황', role: 'view', layer: 'metric', tier: '비즈니스', view: '현금 손익', grab: 'none', grabHow: '조회' },
  { href: '/vat', label: '부가세', role: 'view', layer: 'metric', tier: '비즈니스', view: '부가세 추정', grab: 'none', grabHow: '조회' },
  { href: '/financials', label: '재무상태', role: 'view', layer: 'metric', tier: '비즈니스', view: '스냅샷', grab: 'none', grabHow: '조회' },
  { href: '/manage', label: '경영지표', role: 'view', layer: 'metric', tier: '비즈니스', view: 'KPI', grab: 'none', grabHow: '조회' },

  { href: '/integrity', label: '리스크', role: 'system', layer: 'system', tier: '스탠다드', view: '정합성', grab: 'none', grabHow: '→360' },
  { href: '/settings', label: '설정', role: 'system', layer: 'system', tier: '라이트', view: '계정·초기화면', grab: 'none', grabHow: '—' },
  { href: '/dev/sample', label: '샘플', role: 'system', layer: 'system', tier: '라이트', view: 'ERP 3축 시안', grab: 'none', grabHow: '—' },
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
 * 햄버거 메뉴 — 원장 + 수납·미수 + 과태료(변경부과).
 *   360은 메뉴 항목 아님(원장 행·담기 진입).
 */
export const NAV_GROUPS: NavGroup[] = [
  { title: '원장', items: [
    { href: '/sheet', label: '운영원장', icon: Table2, tier: '라이트', webOnly: true },
    { href: '/cash', label: '재무원장', icon: Wallet, tier: '라이트', webOnly: true },
  ] },
  { title: '수납', items: [
    { href: '/payments', label: '자금일보', icon: Banknote, tier: '라이트' },
    { href: '/receivables', label: '미수관리', icon: HandCoins, tier: '라이트' },
  ] },
  { title: '업무', items: [
    { href: '/penalty', label: '과태료·변경부과', icon: FileWarning, tier: '라이트' },
  ] },
  { title: '', items: [
    { href: '/ingest', label: '데이터센터', icon: Upload, tier: '라이트' },
    { href: '/settings', label: '설정', icon: Settings, tier: '라이트' },
  ] },
  { title: '시스템', items: [
    { href: '/dev/sample', label: '샘플(시안)', icon: FlaskConical, tier: '라이트', hqOnly: true },
    { href: '/dev/data', label: '개발도구', icon: Database, tier: '라이트', hqOnly: true },
  ] },
];
