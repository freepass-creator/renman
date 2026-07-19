'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 전역 네비게이터 — openCar/openCustomer/jpk:navigate → App Router push(뎁스 스택).
export function CarDrawer() {
  const router = useRouter();
  useEffect(() => {
    function on(e: Event) { const d = ((e as CustomEvent).detail || {}) as { plate?: string; focus?: string }; const p = String(d.plate || ''); if (p) router.push('/vehicle/' + encodeURIComponent(p) + (d.focus ? '?do=' + d.focus : '')); }
    function onCust(e: Event) { const k = String(((e as CustomEvent).detail || {}).key || ''); if (k) router.push('/customer/' + encodeURIComponent(k)); }
    function onNav(e: Event) { const href = String(((e as CustomEvent).detail || {}).href || ''); if (href) router.push(href); }
    window.addEventListener('jpk:open-car', on);
    window.addEventListener('jpk:open-customer', onCust);
    window.addEventListener('jpk:navigate', onNav);
    return () => {
      window.removeEventListener('jpk:open-car', on);
      window.removeEventListener('jpk:open-customer', onCust);
      window.removeEventListener('jpk:navigate', onNav);
    };
  }, [router]);
  return null;
}
