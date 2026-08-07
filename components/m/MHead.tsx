'use client';
/**
 * /m 탭·스택 페이지 상단 헤더 — sticky, 상단 3px 탭색 띠. (설계서 §7)
 *
 * ★검색 입구가 여기 있다. 하단탭이 4탭(운영·리스크·업무·업로드)으로 줄면서 검색을 품고 있던
 *   /m 홈이 /m/ops 리다이렉트가 됐고, `/m/search` 페이지는 살아 있는데 들어갈 길이
 *   사라졌다(2026-08-07 발견). 헤더에 두면 어느 화면에서나 한 번에 닿는다.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { C } from '@/components/ui';
import { haptic } from '@/lib/haptics';

export function MHead({ title, sub, color = C.brand, right, search = true }: {
  title: ReactNode;
  sub?: ReactNode;
  color?: string;
  right?: ReactNode;
  /** 검색 아이콘 노출. 검색 화면 자신처럼 필요 없는 곳만 false. */
  search?: boolean;
}) {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50, background: C.card,
      borderTop: `3px solid ${color}`, borderBottom: `1px solid ${C.line}`,
      padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: C.ink, lineHeight: 1.2 }}>{title}</div>
        {sub != null && <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
      {search && (
        <Link
          href="/m/search"
          aria-label="검색"
          onClick={() => haptic.tap()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 9, flex: '0 0 auto',
            color: C.mute, border: `1px solid ${C.line}`, background: C.bg,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Search size={17} />
        </Link>
      )}
    </header>
  );
}
