'use client';
/**
 * 개발 스위치 — 웹/모바일 레이아웃을 번갈아 본다. 우하단 고정, 개발 모드·본사 계정에서만.
 * 상태는 lib/use-dev-layout (localStorage). 자동 → 모바일 → 웹 → 자동.
 */
import { MonitorSmartphone } from 'lucide-react';
import { Btn, C, SP } from '@/components/ui';
import { useSession } from '@/lib/session';
import { nextDevLayout, setDevLayout, useDevLayout, type DevLayout } from '@/lib/use-dev-layout';

const LABEL: Record<DevLayout, string> = { auto: '자동', mobile: '모바일', web: '웹' };

export function DevLayoutToggle() {
  const v = useDevLayout();
  const { isOperator } = useSession();
  if (process.env.NODE_ENV === 'production' && !isOperator) return null;
  return (
    <div style={{ position: 'fixed', right: SP[3], bottom: SP[3], zIndex: 60, display: 'flex', alignItems: 'center', gap: SP[1], background: C.card, border: `1px solid ${C.line}`, borderRadius: 6, padding: 2, boxShadow: 'var(--shadow-md)' }}>
      <span style={{ fontSize: 10, color: C.faint, paddingLeft: 6, letterSpacing: '.04em', fontWeight: 600 }}>개발</span>
      <Btn size="sm" variant="ghost" onClick={() => setDevLayout(nextDevLayout(v))} tip="웹/모바일 번갈아 보기">
        <MonitorSmartphone size={13} /> {LABEL[v]}
      </Btn>
    </div>
  );
}
