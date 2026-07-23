'use client';
/**
 * 상단바 전역 검색 — «검색 전용» 인라인 타입어헤드. 팝업 창 안 뜸(입력 검색창 밑에 결과 바로).
 *   · 차량·손님·계약을 찾아 클릭 → 차량360 이동(찾아가기). 담기·페이지이동 «명령»은 없음(그건 메뉴/데이터센터).
 *   · Enter·「전체 결과」 → /search 페이지(차량·계약·손님·보험·과태료·거래 전부).
 * 데스크톱: 상단바 가운데 입력 + 드롭다운. 모바일: 상단바 검색아이콘 → /search(좁은 헤더에 드롭다운 대신 페이지).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchVehicles } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { Search as SearchIcon } from 'lucide-react';
import { C } from '@/components/ui';

export function TopSearch() {
  const { companyId } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(0);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const loaded = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = () => {
    if (loaded.current) return;
    loaded.current = true;
    const s = getStore();
    Promise.all([s.list('vehicle', companyId), s.list('contract', companyId)]).then(([v, c]) => { setVehicles(v); setContracts(c); });
  };

  const results = useMemo(() => (q.trim() ? matchVehicles(q.trim(), vehicles, contracts, 8) : []), [q, vehicles, contracts]);
  const open = focused && q.trim().length > 0;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setFocused(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => { if (sel >= results.length) setSel(0); }, [results.length, sel]);

  const goCar = (plate: string) => { setQ(''); setFocused(false); openCar(plate); };
  const goAll = () => { const s = q.trim(); if (!s) return; setFocused(false); router.push(`/search?q=${encodeURIComponent(s)}`); };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0, maxWidth: 440, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card }}>
        <SearchIcon size={14} color={C.mute} style={{ flexShrink: 0 }} />
        <input
          value={q}
          onFocus={() => { setFocused(true); load(); }}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) goCar(results[sel].plate); else goAll(); }
            else if (e.key === 'Escape') setFocused(false);
          }}
          placeholder="차량·손님·계약 검색"
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'none', outline: 'none', fontSize: 12.5, color: C.ink }}
        />
      </div>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: C.card, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 50, overflow: 'hidden', maxHeight: 380, overflowY: 'auto' }}>
          {results.map((h, i) => (
            <button
              key={`${h.plate}-${i}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => goCar(h.plate)}
              style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: sel === i ? C.hover : 'transparent', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{h.label}</span>
              {h.sub && <span style={{ fontSize: 11.5, color: C.mute }}>{h.sub}</span>}
            </button>
          ))}
          <button
            onClick={goAll}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', borderTop: results.length ? `1px solid ${C.line}` : 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: C.accent, fontWeight: 700 }}
          >
            “{q.trim()}” 전체 결과 →
          </button>
        </div>
      )}
    </div>
  );
}
