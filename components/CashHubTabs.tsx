/**
 * 재무·경영 허브 탭 SSOT — 원장(재무현황) + 지표(손익·부가·재무상태·경영).
 *   미수·자금일보는 이벤트 → /work 업무. 여기(경영 허브) 넣지 말 것.
 */
'use client';
import { usePathname, useRouter } from 'next/navigation';
import { PillTabs } from '@/components/ui';
import type { WorkbenchTab } from '@/components/WorkbenchBar';

export const CASH_TABS = [
  { key: '/finance', label: '재무현황' },
  { key: '/pnl', label: '손익' },
  { key: '/vat', label: '부가세' },
  { key: '/financials', label: '재무상태' },
  { key: '/manage', label: '경영지표' },
] as const;

export type CashTabHref = (typeof CASH_TABS)[number]['key'];

function resolveCashTab(pathname: string): CashTabHref {
  const hit = CASH_TABS.find((t) => pathname === t.key || pathname.startsWith(t.key + '/'));
  return (hit?.key || '/finance') as CashTabHref;
}

/** WorkbenchBar tabs/tab/onTab 에 그대로 스프레드. */
export function useCashHubNav(): {
  tabs: WorkbenchTab<CashTabHref>[];
  tab: CashTabHref;
  onTab: (k: CashTabHref) => void;
  tabSize: 'sm';
} {
  const pathname = usePathname();
  const router = useRouter();
  const tab = resolveCashTab(pathname);
  return {
    tabs: CASH_TABS.map((t) => ({ key: t.key, label: t.label })),
    tab,
    onTab: (href) => { if (href !== pathname) router.push(href); },
    tabSize: 'sm',
  };
}

/** WorkbenchBar 없는 페이지(Page/DetailShell)용 단독 탭. */
export function CashHubTabs({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { tabs, tab, onTab } = useCashHubNav();
  return <PillTabs size={size} tabs={tabs} value={tab} onChange={onTab} />;
}
