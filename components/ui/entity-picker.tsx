'use client';
/**
 * 업무 대상 피커 — matchVehicles / matchContracts 재사용(검색 엔진 신설 X).
 * FormGrid의 vehicle-picker · contract-picker 위젯.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import type { EntityRecord } from '@/lib/intake/entities';
import {
  matchContracts, matchVehicles,
  type ContractSearchHit, type VehicleSearchHit,
} from '@/lib/search-match';
import { Input, C } from '@/components/ui';

type Patch = Record<string, string>;

function PickerShell({
  label, value, placeholder, open, hits, onQuery, onPick, onClear, renderHit,
}: {
  label: string;
  value: string;
  placeholder: string;
  open: boolean;
  hits: { key: string; label: string; sub: string }[];
  onQuery: (q: string) => void;
  onPick: (key: string) => void;
  onClear: () => void;
  renderHit?: (h: { key: string; label: string; sub: string }) => ReactNode;
}) {
  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onQuery(e.target.value)}
          style={{ flex: 1, minWidth: 0 }}
          aria-label={label}
        />
        {value ? (
          <button
            type="button"
            onClick={onClear}
            style={{ border: 'none', background: 'transparent', color: C.mute, cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
          >
            지우기
          </button>
        ) : null}
      </div>
      {open && hits.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4,
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)', maxHeight: 220, overflowY: 'auto',
        }}>
          {hits.map((h) => (
            <button
              key={h.key}
              type="button"
              onClick={() => onPick(h.key)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'transparent', padding: '8px 10px', cursor: 'pointer',
              }}
            >
              {renderHit ? renderHit(h) : (
                <>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink }}>{h.label}</div>
                  {h.sub ? <div style={{ fontSize: 11, color: C.mute, marginTop: 2 }}>{h.sub}</div> : null}
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function VehicleFieldPicker({
  value, onChange, onPatch,
}: {
  value: string;
  onChange: (plate: string) => void;
  onPatch?: (patch: Patch) => void;
}) {
  const { companyId } = useSession();
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const hits = useMemo(() => matchVehicles(q, vehicles, contracts, 8), [q, vehicles, contracts]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => { setQ(value || ''); }, [value]);
  useEffect(() => {
    const s = getStore();
    Promise.all([s.list('vehicle', companyId), s.list('contract', companyId)])
      .then(([v, c]) => { setVehicles(v); setContracts(c); })
      .catch(() => {});
  }, [companyId]);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(h: VehicleSearchHit) {
    onChange(h.plate);
    onPatch?.({ plate: h.plate, companyId: h.companyId });
    setQ(h.label);
    setOpen(false);
  }

  return (
    <div ref={wrap}>
      <PickerShell
        label="차량 선택"
        value={q}
        placeholder="차번·차명 검색"
        open={open && !!(q.trim())}
        hits={hits.map((h) => ({ key: h.plate, label: h.label, sub: h.sub }))}
        onQuery={(next) => { setQ(next); setOpen(true); if (!next) onChange(''); }}
        onPick={(key) => {
          const h = hits.find((x) => x.plate === key);
          if (h) pick(h);
        }}
        onClear={() => { setQ(''); onChange(''); onPatch?.({ plate: '' }); setOpen(false); }}
      />
    </div>
  );
}

export function ContractFieldPicker({
  value, onChange, onPatch,
}: {
  value: string;
  onChange: (contractKey: string) => void;
  onPatch?: (patch: Patch) => void;
}) {
  const { companyId } = useSession();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const hits = useMemo(() => matchContracts(q, contracts, 8), [q, contracts]);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getStore();
    s.list('contract', companyId).then(setContracts).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!value) { setLabel(''); return; }
    const hit = contracts.find((c) => String(c._key || '') === value);
    if (hit) {
      const no = String(hit.contractNo || '');
      const who = String(hit.contractorName || '');
      setLabel(`${no || value}${who ? ` · ${who}` : ''}`);
    }
  }, [value, contracts]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(h: ContractSearchHit) {
    onChange(h.key);
    onPatch?.({
      contractKey: h.key,
      contractNo: h.contractNo,
      plate: h.plate,
      customerName: h.customer,
      companyId: h.companyId,
    });
    setLabel(h.label);
    setQ('');
    setOpen(false);
  }

  return (
    <div ref={wrap}>
      <PickerShell
        label="계약 선택"
        value={open ? q : (label || q)}
        placeholder="계약번호·고객·차번 검색"
        open={open && !!(q.trim())}
        hits={hits.map((h) => ({ key: h.key, label: h.label, sub: h.sub }))}
        onQuery={(next) => { setQ(next); setOpen(true); }}
        onPick={(key) => {
          const h = hits.find((x) => x.key === key);
          if (h) pick(h);
        }}
        onClear={() => {
          setQ(''); setLabel(''); setOpen(false);
          onChange('');
          onPatch?.({ contractKey: '', contractNo: '', plate: '', customerName: '' });
        }}
      />
    </div>
  );
}
