'use client';
/**
 * 앱 IA SSOT — 메뉴 → 페이지 → 잡기(입력) → 보기.
 * 데이터 층 = lib/domain/layers · 티어 = lib/tier.
 *
 * 라이트 = 홈·마이·현황(+설정·검색). 처리는 홈/마이 그자리(context).
 * 스탠다드+ = 메뉴「업무」(배차·미수·자금일보·정비…). 경영 지표 = 비즈니스 티어(상품 등급명).
 * `BUILD_TIER`=`lib/tier`.
 *
 * 입력 두 입구: 한곳(batch)=담기/수집함(허브 안) · 그자리(context)=360·위저드·QuickLog.
 */
import {
  Home, LayoutDashboard, Car, FileText, Wallet, Table2,
  ArrowLeftRight, ReceiptText, BookOpen, Wrench, TriangleAlert, Upload, Inbox,
  TrendingUp, Settings, Database, type LucideIcon,
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

/** 전 화면 역할 표 — 새 페이지 추가 시 여기 먼저. */
export const PAGE_IA: PageIA[] = [
  // 라이트 — 운영 허브
  { href: '/', label: '홈', role: 'hub', layer: 'mixed', tier: '라이트', view: '운영현황·일정·미결·리스크', grab: 'context', grabHow: '카드→360·위저드 / QuickLog·담기' },
  { href: '/ops', label: '마이페이지', role: 'hub', layer: 'mixed', tier: '라이트', view: '내 일정·내 업무', grab: 'context', grabHow: '섹션·일정에서 그자리 조치' },
  { href: '/search', label: '검색', role: 'hub', layer: 'mixed', tier: '라이트', view: '통합 검색→360·목록', grab: 'none', grabHow: '조회만' },

  // 라이트 — 현황(원장)
  { href: '/asset', label: '자산현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'physical', view: '현물 생애(구매예정·등록예정·보유중·처분예정·처분완료)', grab: 'both', grabHow: '한곳=담기(차량) · 그자리=360·기록' },
  { href: '/contract', label: '계약현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'contract', view: '계약 생애(예정·중·완료) · 손님', grab: 'both', grabHow: '한곳=담기(계약) · 그자리=인도/반납/입금' },
  { href: '/finance', label: '재무현황', role: 'view', layer: 'ledger', tier: '라이트', assetKind: 'cash', view: '자금 생애(미분류·분류·원장)', grab: 'batch', grabHow: '한곳=담기(계좌) · 분류는 그자리' },
  { href: '/sheet', label: '운영시트', role: 'view', layer: 'ledger', tier: '라이트', view: '함대·계약 엑셀형 한눈', grab: 'none', grabHow: '조회→360' },

  // 스탠다드 — 메뉴「업무」(현장 처리). 라벨은 업무 말투(관리·일보).
  { href: '/work', label: '업무현황', role: 'work', layer: 'event', tier: '스탠다드', view: '업무·입력 한눈', grab: 'none', grabHow: '배차·미수·자금일보·정비·과태료·데이터센터·증빙' },
  { href: '/dispatch', label: '배차관리', role: 'work', layer: 'event', tier: '스탠다드', view: '출고·반납·재고·이동', grab: 'context', grabHow: '위저드·메모·자료등록' },
  { href: '/receivables', label: '미수관리', role: 'work', layer: 'event', tier: '스탠다드', view: '연체 독촉·시동·내용증명', grab: 'context', grabHow: '연락기록·독촉·시동(그자리)' },
  { href: '/payments', label: '자금일보', role: 'work', layer: 'event', tier: '스탠다드', view: '입금매칭·CMS → 재무현황 공급', grab: 'none', grabHow: '원천=자료등록·계좌 · 여기는 매칭·분류 연결' },
  { href: '/repair', label: '차량수선', role: 'work', layer: 'event', tier: '스탠다드', view: '정비·사고수리·상품화·세차·복귀', grab: 'both', grabHow: '자료등록(history)·QuickLog' },
  { href: '/penalty', label: '과태료관리', role: 'work', layer: 'event', tier: '스탠다드', view: '미매칭·진행·종결', grab: 'both', grabHow: '한곳=업로드/자료등록 · 그자리=매칭' },
  { href: '/ingest', label: '데이터센터', role: 'input', layer: 'mixed', tier: '스탠다드', view: '모든 데이터 투입(원장+이벤트 · OCR·엑셀·직접)', grab: 'batch', grabHow: '메뉴 최상단 — 모든 업무의 입력 통로' },
  { href: '/inbox', label: '증빙수집', role: 'input', layer: 'event', tier: '스탠다드', view: '현장 사진·서명 대기함', grab: 'batch', grabHow: '업무 → 증빙수집' },

  // 경영 지표 (상품 티어명 = 비즈니스)
  { href: '/pnl', label: '손익현황', role: 'view', layer: 'metric', tier: '비즈니스', view: '현금 손익 집계', grab: 'none', grabHow: '조회만(원천=자금·담기)' },
  { href: '/vat', label: '부가세', role: 'view', layer: 'metric', tier: '비즈니스', view: '부가세 추정', grab: 'none', grabHow: '조회만' },
  { href: '/financials', label: '재무상태', role: 'view', layer: 'metric', tier: '비즈니스', view: '자산·부채 스냅샷', grab: 'none', grabHow: '조회만' },
  { href: '/manage', label: '경영지표', role: 'view', layer: 'metric', tier: '비즈니스', view: 'KPI·법인 비교', grab: 'none', grabHow: '조회만' },

  { href: '/integrity', label: '리스크', role: 'system', layer: 'system', tier: '스탠다드', view: '정합성·리스크 목록', grab: 'none', grabHow: '조회→해당 360으로 조치' },
  { href: '/settings', label: '설정', role: 'system', layer: 'system', tier: '라이트', view: '계정·탭·초기화면', grab: 'none', grabHow: '—' },
];

export const PAGE_BY_HREF: Record<string, PageIA> = Object.fromEntries(PAGE_IA.map((p) => [p.href, p]));

export function pageTier(href: string): Tier {
  return PAGE_BY_HREF[href]?.tier ?? '라이트';
}

export function pageLayer(role: PageRole): DataLayer | 'mixed' {
  return layerOfPageRole(role);
}

export type NavItem = { href: string; label: string; icon: LucideIcon; tier?: Tier; hqOnly?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

/**
 * 햄버거 메뉴 — PAGE_IA tier 와 동기.
 * 라이트: 홈·마이·자료등록·현황·설정. 스탠다드+: 「업무」그룹. 경영 티어: 손익 등.
 *
 * 그룹 기준:
 *   (최상단) 내가 있는 자리 + **데이터 투입구**(데이터센터). 데이터센터는 «업무»가 아니라
 *            모든 업무에 물리는 입력 통로라 특정 업무 밑이 아니라 여기 산다(role:'input').
 *   현황    = ① 원장 조회
 *   업무    = **고유 업무 5**만 — 배차관리·차량수선·미수관리·자금일보·과태료관리.
 *            허브 페이지(/work)는 메뉴에 안 넣는다 — 메뉴가 이미 같은 목록이라 한 겹 더 쌓일 뿐.
 *            증빙수집(/inbox)은 «남이 올린 걸 매칭하는 큐» — 입력 통로가 아니라 처리 대상이라
 *            업무 옆에 둔다.
 */
export const NAV_GROUPS: NavGroup[] = [
  { title: '', items: [
    { href: '/', label: '홈', icon: Home, tier: '라이트' },
    { href: '/ops', label: '마이페이지', icon: LayoutDashboard, tier: '라이트' },
    { href: '/ingest', label: '데이터센터', icon: Upload, tier: '스탠다드' },
  ] },
  { title: '현황', items: [
    { href: '/asset', label: '자산현황', icon: Car, tier: '라이트' },
    { href: '/contract', label: '계약현황', icon: FileText, tier: '라이트' },
    { href: '/finance', label: '재무현황', icon: Wallet, tier: '라이트' },
    { href: '/sheet', label: '운영시트', icon: Table2, tier: '라이트' },
  ] },
  { title: '업무', items: [
    { href: '/dispatch', label: '배차관리', icon: ArrowLeftRight, tier: '스탠다드' },
    { href: '/repair', label: '차량수선', icon: Wrench, tier: '스탠다드' },
    { href: '/receivables', label: '미수관리', icon: ReceiptText, tier: '스탠다드' },
    { href: '/payments', label: '자금일보', icon: BookOpen, tier: '스탠다드' },
    { href: '/penalty', label: '과태료관리', icon: TriangleAlert, tier: '스탠다드' },
    { href: '/inbox', label: '증빙수집', icon: Inbox, tier: '스탠다드' },
  ] },
  { title: '경영', items: [
    { href: '/pnl', label: '손익현황', icon: TrendingUp, tier: '비즈니스' },
  ] },
  { title: '시스템', items: [
    { href: '/dev/data', label: '개발도구', icon: Database, tier: '라이트', hqOnly: true },
    { href: '/settings', label: '설정', icon: Settings, tier: '라이트' },
  ] },
];
