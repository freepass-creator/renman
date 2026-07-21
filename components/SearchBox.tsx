'use client';
/**
 * 검색창 공용 — 진짜 입력 검색. 글자 치면 차량·차명·손님 매칭이 바로 뜸 → 클릭/↵ 시 360.
 *   매칭 = lib/search-match (normPlate·번호변경). Enter(복수·없음) = /search 전체검색.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchVehicles } from '@/lib/search-match';
import { openCar } from '@/lib/ui-bus';
import { useIsMobile } from '@/lib/use-mobile';
import { C, SH, ctrlH, ctrlInputFs } from '@/components/ui';
import { Search } from 'lucide-react';

/** 목록 인페이지 필터 입력 — 점프 검색(SearchBox)과 자리·크기 동일, 드롭다운 없음. */
export function FilterBox({
  value,
  onChange,
  placeholder = '목록 필터',
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder?: string;
}) {
  const mobile = useIsMobile();
  const h = ctrlH(mobile);
  return (
    <div style={{ width: mobile ? '100%' : 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: h, padding: mobile ? '0 14px' : '0 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card, boxSizing: 'border-box', width: '100%' }}>
        <Search size={mobile ? 16 : 14} color={C.faint} />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') onChange(''); }}
          placeholder={placeholder}
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: ctrlInputFs(mobile), background: 'transparent', color: C.ink, minWidth: 0, fontFamily: 'inherit' }}
        />
      </div>
    </div>
  );
}

export function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const { companyId } = useSession();
  const router = useRouter();
  const mobile = useIsMobile();
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    const store = getStore();
    Promise.all([store.list('vehicle', companyId), store.list('contract', companyId)]).then(([vs, cs]) => {
      setVehicles(vs); setContracts(cs);
    });
  };

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hits = useMemo(() => matchVehicles(q, vehicles, contracts, 8), [q, vehicles, contracts]);

  const goHit = (plate: string) => { setOpen(false); setQ(''); openCar(plate); };
  const goAll = () => {
    const s = q.trim();
    if (!s) return;
    setOpen(false); setQ('');
    router.push(`/search?q=${encodeURIComponent(s)}`);
  };

  const showDrop = open && q.trim().length > 0;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: mobile ? '100%' : 240 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: ctrlH(mobile), padding: mobile ? '0 14px' : '0 12px', border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card, boxSizing: 'border-box', width: '100%' }}>
        <Search size={mobile ? 16 : 14} color={C.faint} />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
          onFocus={() => { refresh(); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setOpen(false); return; }
            if (!showDrop) {
              if (e.key === 'Enter') { e.preventDefault(); goAll(); }
              return;
            }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, Math.max(hits.length - 1, 0))); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              if (hits.length === 1) goHit(hits[0].plate);
              else if (hits[sel]) goHit(hits[sel].plate);
              else goAll();
            }
          }}
          placeholder="차량번호·차명·손님 검색"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: ctrlInputFs(mobile), background: 'transparent', color: C.ink, minWidth: 0, fontFamily: 'inherit' }}
        />
      </div>
      {showDrop && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', minWidth: mobile ? '100%' : 320, background: C.taupeBg, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: SH.pop, zIndex: 50, overflow: 'hidden' }}>
          {hits.length === 0 ? (
            <div style={{ padding: mobile ? '14px 16px' : '12px 14px', fontSize: mobile ? 14 : 12.5, color: C.faint }}>일치 없음 · Enter로 전체 검색</div>
          ) : hits.map((h, i) => (
            <button key={`${h.plate}-${i}`} type="button" onMouseEnter={() => setSel(i)} onClick={() => goHit(h.plate)}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: mobile ? '14px 16px' : '9px 14px', minHeight: mobile ? 52 : undefined, border: 'none', background: sel === i ? 'var(--bg-hover)' : C.taupeBg, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
              <span style={{ fontSize: mobile ? 15 : 13, fontWeight: 700, color: C.ink, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{h.label}</span>
              {h.sub ? <span style={{ fontSize: mobile ? 12.5 : 11, color: C.faint }}>{h.sub}</span> : null}
            </button>
          ))}
          <button type="button" onClick={goAll}
            style={{ width: '100%', padding: mobile ? '14px 16px' : '8px 14px', minHeight: mobile ? 48 : undefined, border: 'none', borderTop: `1px solid ${C.line}`, background: 'var(--bg-header)', cursor: 'pointer', fontSize: mobile ? 14 : 12, fontWeight: 600, color: C.accent, textAlign: 'left', fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent' }}>
            “{q.trim()}” 전체 검색
          </button>
        </div>
      )}
    </div>
  );
}
