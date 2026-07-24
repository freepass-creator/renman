'use client';
/**
 * 운영시트 — 차량 1대 = 1행 통합 마스터(엑셀 전용, 웹 데스크톱).
 * 화면 정의는 FLEET_DEF, 조립은 WebPage 렌더러(E-grid). 페이지는 위임 1줄.
 *   정의: lib/pagedef/defs/fleet.ts · 렌더러: components/pagedef/WebPage.tsx
 */
import { WebPage } from '@/components/pagedef/WebPage';
import { FLEET_DEF } from '@/lib/pagedef/defs/fleet';

export default function SheetPage() {
  return <WebPage def={FLEET_DEF} />;
}
