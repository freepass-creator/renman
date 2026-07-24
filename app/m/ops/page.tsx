'use client';
/** /m 운영 — 운영시트(FLEET_DEF)의 모바일 렌더. 상태그룹 ObjRow 리스트. 행 탭 → 자산360. */
import { MobilePage } from '@/components/pagedef/MobilePage';
import { FLEET_DEF } from '@/lib/pagedef/defs/fleet';
import { C } from '@/components/ui';

export default function MOps() {
  return <MobilePage def={FLEET_DEF} tabColor={C.brand} />;
}
