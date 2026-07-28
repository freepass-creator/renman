'use client';
/**
 * 홈 — 가벼운 랜딩. 예외 그리드=/risk.
 * 검색 + 원장 바로가기(homeLedgerShortcuts)만. 지표·예외표 없음.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud } from 'lucide-react';
import { homeLedgerShortcuts } from '@/lib/risk-ledger';
import { openIngest } from '@/lib/ui-bus';
import { Btn, Page, Search, Sec, SPACE_GROUP_M } from '@/components/ui';

export default function HomePage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const shortcuts = useMemo(() => homeLedgerShortcuts(), []);

  const goSearch = () => {
    const t = q.trim();
    router.push(t ? `/search?q=${encodeURIComponent(t)}` : '/search');
  };

  return (
    <Page
      title="홈"
      meta="검색 · 원장 바로가기"
      right={(
        <Btn size="sm" variant="solid" onClick={() => openIngest()}>
          <UploadCloud size={14} /> 데이터센터
        </Btn>
      )}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
        <Search
          placeholder="차번 · 계약자 · 회사 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') goSearch(); }}
          style={{ width: 'min(100%, 420px)' }}
        />
        <Sec title="원장 바로가기">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {shortcuts.map((it) => {
              const Icon = it.icon;
              return (
                <Btn key={it.href} size="sm" variant="ghost" onClick={() => router.push(it.href)}>
                  <Icon size={14} strokeWidth={2.2} aria-hidden /> {it.label}
                </Btn>
              );
            })}
          </div>
        </Sec>
      </div>
    </Page>
  );
}
