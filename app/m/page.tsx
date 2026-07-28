'use client';
/** /m 홈 — 가벼운 랜딩(검색·바로가기). 예외는 /m/risk. */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { homeLedgerShortcuts } from '@/lib/risk-ledger';
import { Btn, C, Search, SPACE_M, SPACE_GROUP_M } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MHome() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);

  const goSearch = () => {
    const t = q.trim();
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  return (
    <>
      <MHead title="홈" sub="검색 · 원장 바로가기" color={C.ok} />
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
        <Search
          placeholder="차번 · 계약자 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') goSearch(); }}
          style={{ width: '100%' }}
        />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: C.mute, marginBottom: SPACE_M }}>원장 바로가기</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {shortcuts.map((it) => {
              const Icon = it.icon;
              const target = it.href === '/risk' ? '/m/risk'
                : it.href === '/status' ? '/m/ops'
                : it.href;
              return (
                <Btn key={it.href} size="sm" variant="ghost" onClick={() => router.push(target)}>
                  <Icon size={14} strokeWidth={2.2} aria-hidden /> {it.label}
                </Btn>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
