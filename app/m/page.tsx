'use client';
/** /m 홈 — 웹과 동일 방향: 검색 + 원장 바로가기. 예외=/m/risk. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homeLedgerShortcuts } from '@/lib/risk-ledger';
import { C, ObjRow, Rows, Search, SPACE_GROUP_M } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

function mHref(href: string): string {
  if (href === '/risk') return '/m/risk';
  if (href === '/status') return '/m/ops';
  if (href === '/work') return '/m/work';
  return href;
}

export default function MHome() {
  const router = useRouter();
  const [q, setQ] = useState('');
  // 전용 모바일 화면이 있는 조회만 노출한다. 웹 원장을 좁혀 보여주는 우회 링크는 만들지 않는다.
  const shortcuts = useMemo(() => {
    const mobileReady = new Set(['/risk', '/status', '/work']);
    return homeLedgerShortcuts().filter((item) => mobileReady.has(item.href));
  }, []);

  const goSearch = () => {
    const t = q.trim();
    router.push(t ? `/m/search?q=${encodeURIComponent(t)}` : '/m/search');
  };

  return (
    <>
      <MHead title="홈" sub="검색 · 원장 바로가기" color={C.ok} />
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
        <Search
          size="sm"
          placeholder="차번 · 계약자 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') goSearch(); }}
          style={{ width: '100%' }}
        />
        <Rows title="원장 바로가기" tone="gray" n={shortcuts.length} id="m-home-shortcuts">
          {shortcuts.map((it) => {
            const Icon = it.icon;
            return (
              <ObjRow
                key={it.href}
                rail="brand"
                name={(
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={14} strokeWidth={2.2} aria-hidden />
                    {it.label}
                  </span>
                )}
                onClick={() => router.push(mHref(it.href))}
              />
            );
          })}
        </Rows>
      </div>
    </>
  );
}
