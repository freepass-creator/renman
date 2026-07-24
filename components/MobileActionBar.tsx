'use client';
import { ChevronLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAppBarSlots } from '@/lib/appbar';
import { useIsMobile } from '@/lib/use-mobile';
import { haptic } from '@/lib/haptics';
import { C, SH } from '@/components/ui/tokens';
import { Btn } from '@/components/ui/controls';

/**
 * 모바일 하단 액션바 SSOT — 이전(back) + commit 주액션(저장·확정·삭제).
 * 버튼 배치 규칙: 이동=하단 탭바 / 이전·commit=여기 / 목록 등록·검색·필터·보기=페이지 툴바.
 * 뎁스면 바닥, 허브+액션이면 탭바 위(bottom:var(--fp-tabbar-h)). 웹(!mobile)은 SessionBar가 별도로 그림.
 * 제목은 SessionBar 뎁스 상단바(ERP4 TopBar) — 여기엔 넣지 않음.
 */
export function MobileActionBar() {
  const mobile = useIsMobile();
  const slots = useAppBarSlots();
  const router = useRouter();
  if (!mobile) return null;
  const showBack = !!(slots.back || slots.depth);
  if (!showBack && !slots.actions) return null;   // 허브(이동만)=탭바가 담당, 액션바 없음
  const goBack = () => { haptic.back(); if (slots.back) slots.back(); else router.back(); };
  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 'var(--fp-tabbar-h, 0px)', zIndex: 55,
      background: C.taupeBg, borderTop: `1px solid ${C.line}`, boxShadow: SH.rest,
      paddingBottom: 'var(--fp-dock-safe, env(safe-area-inset-bottom))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 'var(--fp-bar-h)', boxSizing: 'border-box', padding: '0 var(--fp-bar-pad-x, 14px)' }}>
        {showBack && <Btn variant="ghost" onClick={goBack}><ChevronLeft size={16} /> 이전</Btn>}
        <span style={{ flex: 1 }} />
        {slots.actions}
      </div>
    </div>
  );
}
