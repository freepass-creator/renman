'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchVehicles } from '@/lib/search-match';
import { openCar, openIngest } from '@/lib/ui-bus';
import { WORK_PAGES } from '@/lib/work-hub';
import { tierIncludes } from '@/lib/tier';
import { Car, LayoutGrid, Plus, Search, type LucideIcon } from 'lucide-react';
import { C, SCRIM } from '@/components/ui';

type Item = { Icon: LucideIcon; label: string; sub?: string; run: () => void };

// ⌘K 커맨드 팔레트 — 차량·손님 검색 → 360, 비즈니스 페이지 바로가기, 빠른 자료등록.
export function CommandPalette() {
  const { companyId } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') setOpen(false);
    }
    function onCmd() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('jpk:command', onCmd);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('jpk:command', onCmd); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(''); setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const store = getStore();
    Promise.all([store.list('vehicle', companyId), store.list('contract', companyId)]).then(([vs, cs]) => { setVehicles(vs); setContracts(cs); });
    return () => clearTimeout(t);
  }, [open, companyId]);

  const items: Item[] = useMemo(() => {
    const s = q.trim();
    const goBiz: Item[] = WORK_PAGES.filter((p) => tierIncludes(p.tier)).map((p) => ({
      Icon: LayoutGrid,
      label: p.label,
      sub: p.desc,
      run: () => { setOpen(false); router.push(p.href); },
    }));
    const cmds: Item[] = [
      { Icon: Plus, label: '차량 입력', sub: '자동차등록증', run: () => { setOpen(false); openIngest('vehicle'); } },
      { Icon: Plus, label: '계약 입력', sub: '렌탈·구독 계약서', run: () => { setOpen(false); openIngest('contract'); } },
      { Icon: Plus, label: '보험 입력', sub: '보험증권', run: () => { setOpen(false); openIngest('insurance'); } },
      ...goBiz,
    ];
    if (!s) return cmds;
    const veh: Item[] = matchVehicles(s, vehicles, contracts, 8).map((h) => ({
      Icon: Car, label: h.label, sub: h.sub, run: () => { setOpen(false); openCar(h.plate); },
    }));
    const globalSearch: Item = { Icon: Search, label: `“${s}” 전체 검색`, sub: '차량·계약·손님·보험·과태료·거래 전부', run: () => { setOpen(false); router.push(`/search?q=${encodeURIComponent(s)}`); } };
    const hit = cmds.filter((c) => c.label.includes(s) || (c.sub || '').includes(s));
    return [...veh, globalSearch, ...hit];
  }, [q, vehicles, contracts, router]);

  useEffect(() => { if (sel >= items.length) setSel(0); }, [items.length, sel]);
  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: SCRIM, zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '11vh' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: C.card, borderRadius: 10, boxShadow: '0 24px 64px rgba(0,0,0,0.32)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <input ref={inputRef} value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
          }}
          placeholder="차량번호 · 차명 · 손님 · 배차·미수·자금일보…"
          style={{ width: '100%', padding: '15px 18px', border: 'none', borderBottom: '1px solid var(--border)', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
        <div style={{ maxHeight: 356, overflowY: 'auto', padding: 6 }}>
          {items.length === 0 ? <div style={{ padding: 18, color: 'var(--text-weak)', fontSize: 13 }}>일치 없음 — 다른 차량번호나 이름으로</div>
            : items.map((it, i) => (
              <div key={i} onMouseEnter={() => setSel(i)} onClick={() => it.run()}
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 6, cursor: 'pointer', background: sel === i ? 'var(--bg-hover)' : 'transparent' }}>
                <it.Icon size={16} color="var(--text-sub)" strokeWidth={2} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-main)' }}>{it.label}</div>
                  {it.sub && <div style={{ fontSize: 11.5, color: 'var(--text-weak)', marginTop: 1 }}>{it.sub}</div>}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
