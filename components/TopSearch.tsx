'use client';
/**
 * 상단바 전역 검색 — «찾기»(점프).
 *   · 차량·계약·업무 그룹 결과 → hrefFor 딥링크(openCar / /contract?open= / /work?open=).
 *   · Enter·「전체 결과」 → /search.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchContracts, matchVehicles, matchWorkItems } from '@/lib/search-match';
import { computeContractView } from '@/lib/contract-ops';
import { TODAY } from '@/lib/dashboard-consts';
import { openCar } from '@/lib/ui-bus';
import { Search as SearchIcon } from 'lucide-react';
import { C, won } from '@/components/ui';

type FlatHit =
  | { kind: 'vehicle'; key: string; label: string; sub: string; go: () => void; right?: string; rightTone?: 'danger' | 'mute' }
  | { kind: 'contract'; key: string; label: string; sub: string; go: () => void; right?: string; rightTone?: 'danger' | 'mute' }
  | { kind: 'work'; key: string; label: string; sub: string; go: () => void; right?: string; rightTone?: 'danger' | 'mute' };

const KIND_LABEL: Record<FlatHit['kind'], string> = {
  vehicle: '차량',
  contract: '계약',
  work: '업무',
};

export function TopSearch() {
  const { companyId } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(0);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const [workItems, setWorkItems] = useState<EntityRecord[]>([]);
  const loaded = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (loaded.current) return;
    loaded.current = true;
    const s = getStore();
    Promise.all([
      s.list('vehicle', companyId),
      s.list('contract', companyId),
      s.list('work_item', companyId),
    ]).then(([v, c, w]) => {
      setVehicles(v);
      setContracts(c);
      setWorkItems(w);
    });
  };

  const groups = useMemo(() => {
    const term = q.trim();
    if (!term) return { vehicle: [] as FlatHit[], contract: [] as FlatHit[], work: [] as FlatHit[] };

    const vehicle: FlatHit[] = matchVehicles(term, vehicles, contracts, 5).map((h) => {
      const c = contracts.find((x) => String(x.plate || '') === h.plate && !x.returnedDate)
        || contracts.find((x) => String(x.plate || '') === h.plate);
      const v = c ? computeContractView(c, TODAY) : null;
      const terms = v
        ? [v.monthlyRent ? `${won(v.monthlyRent)}/월` : '', v.endDate ? `~${String(v.endDate).slice(2, 10)}` : ''].filter(Boolean).join(' · ')
        : '';
      return {
        kind: 'vehicle' as const,
        key: `v:${h.plate}`,
        label: h.label,
        sub: [h.sub, terms].filter(Boolean).join(' · '),
        go: () => openCar(h.plate),
        right: v ? (v.net > 0 ? `미수 ${won(v.net)}` : String(v.status || '')) : undefined,
        rightTone: v && v.net > 0 ? 'danger' as const : 'mute' as const,
      };
    });

    const contract: FlatHit[] = matchContracts(term, contracts, 5).map((h) => ({
      kind: 'contract' as const,
      key: `c:${h.key}`,
      label: h.label,
      sub: h.sub,
      go: () => router.push(`/contract?open=${encodeURIComponent(h.key)}`),
    }));

    const work: FlatHit[] = matchWorkItems(term, workItems, 5).map((h) => ({
      kind: 'work' as const,
      key: `w:${h.key}`,
      label: h.label,
      sub: h.sub,
      go: () => router.push(h.href),
    }));

    return { vehicle, contract, work };
  }, [q, vehicles, contracts, workItems, router]);

  const flat = useMemo(
    () => [...groups.vehicle, ...groups.contract, ...groups.work],
    [groups],
  );
  const open = focused && q.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { if (sel >= flat.length) setSel(0); }, [flat.length, sel]);

  const goHit = (h: FlatHit) => { setQ(''); setFocused(false); h.go(); };
  const goAll = () => {
    const s = q.trim();
    if (!s) return;
    setFocused(false);
    router.push(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card }}>
        <SearchIcon size={14} color={C.mute} style={{ flexShrink: 0 }} />
        <input
          value={q}
          onFocus={() => { setFocused(true); load(); }}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (flat[sel]) goHit(flat[sel]); else goAll(); }
            else if (e.key === 'Escape') setFocused(false);
          }}
          placeholder="찾기 · 차량·계약·업무"
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: 12.5, color: C.ink }}
        />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: 460, maxWidth: 640, background: C.card, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden', maxHeight: 420, overflowY: 'auto' }}>
          {(['vehicle', 'contract', 'work'] as const).map((kind) => {
            const rows = groups[kind];
            if (!rows.length) return null;
            return (
              <div key={kind}>
                <div style={{ padding: '6px 14px 2px', fontSize: 10.5, fontWeight: 700, color: C.mute, letterSpacing: '0.02em' }}>
                  {KIND_LABEL[kind]}
                </div>
                {rows.map((h) => {
                  const i = flat.indexOf(h);
                  return (
                    <button
                      key={h.key}
                      type="button"
                      onMouseEnter={() => setSel(i)}
                      onClick={() => goHit(h)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: sel === i ? C.hover : 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
                    >
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</span>
                        {h.sub && <span style={{ fontSize: 11.5, color: C.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.sub}</span>}
                      </span>
                      {h.right ? (
                        <span style={{ flexShrink: 0, fontSize: h.rightTone === 'danger' ? 12 : 11, fontWeight: h.rightTone === 'danger' ? 700 : 400, color: h.rightTone === 'danger' ? C.danger : C.faint }}>
                          {h.right}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!flat.length && (
            <div style={{ padding: '12px 14px', fontSize: 12.5, color: C.mute }}>바로가기 없음 — 전체 결과에서 검색</div>
          )}
          <button
            type="button"
            onClick={goAll}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderTop: `1px solid ${C.line}`, background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: C.accent, fontWeight: 700 }}
          >
            “{q.trim()}” 전체 결과 →
          </button>
        </div>
      )}
    </div>
  );
}
