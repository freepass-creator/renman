'use client';
// 계좌 별명 관리 — 자금일보에서 계좌를 사람 말(별명)로 보이게. 회사 설정(일반관리)에 귀속.
import { useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { COMPANIES, companyLabel } from '@/lib/companies';
import { loadAliases, setAccountAlias, type AliasMap } from '@/lib/accounts';
import { Panel, Input, C } from '@/components/ui';

export function AccountAliases() {
  const { companyId, scopeAll } = useSession();
  const [accounts, setAccounts] = useState<{ account: string; companyId: string }[]>([]);
  const [aliases, setAliases] = useState<AliasMap>({});
  useEffect(() => {
    const store = getStore();
    const tgts = scopeAll ? COMPANIES : [companyId].filter(Boolean);
    Promise.all(tgts.map((c) => store.list('bank_tx', c))).then((lists) => {
      const seen = new Map<string, string>();
      for (const list of lists) for (const t of list) { const a = String(t.account || ''); if (a && !seen.has(a)) seen.set(a, String(t.companyId || '')); }
      setAccounts(Array.from(seen.entries()).map(([account, cid]) => ({ account, companyId: cid })));
    }).catch(() => {});
    setAliases(loadAliases());
  }, [companyId, scopeAll]);

  return (
    <Panel title="계좌 별명">
      <div style={{ padding: '10px 16px 14px' }}>
        <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 4px', lineHeight: 1.7 }}>
          재무현황에서 <b>어느 법인·어느 계좌</b>인지 사람 말로 보이도록 별명을 붙입니다. 각 거래 카드에 <b>회사 · 별명</b>으로 표시됩니다.
        </p>
        {accounts.length === 0 ? <div style={{ fontSize: 12.5, color: C.faint, padding: '6px 0' }}>계좌가 없습니다. 데이터센터에서 계좌 거래를 먼저 수집하세요.</div> :
          accounts.map(({ account, companyId: cid }) => (
            <div key={account} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: `1px solid var(--border-soft)`, flexWrap: 'wrap' }}>
              <span style={{ minWidth: 96, fontSize: 12, fontWeight: 700, color: C.ink }}>{companyLabel(cid)}</span>
              <span style={{ minWidth: 150, fontSize: 11.5, color: C.faint, fontFamily: 'var(--font-mono)' }}>{account}</span>
              <Input defaultValue={aliases[account] || ''} placeholder="별명 (예: 영업 집금계좌)" onBlur={(e) => setAccountAlias(account, e.target.value)} style={{ flex: 1, minWidth: 160 }} />
            </div>
          ))}
      </div>
    </Panel>
  );
}
