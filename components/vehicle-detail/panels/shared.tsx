'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Btn, C, SH } from '@/components/ui';
import { openIngest } from '@/lib/ui-bus';
import type { useVehicleDetail } from '../useVehicleDetail';

export type VD = ReturnType<typeof useVehicleDetail>;

export type PanelProps = {
  plate: string;
  focus?: string;
  vd: VD;
};

export const fLab: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3 };
export const fLl: CSSProperties = { fontSize: 11, color: C.mute };

export const Add = ({ type, plate, label }: { type: string; plate: string; label: string }) => (
  <Btn variant="ghost" onClick={() => openIngest(type, plate)}>{label}</Btn>
);

export function PrintMenu({ items }: { items: { label: string; run: () => void }[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  if (items.length === 1) return <Btn size="sm" variant="ghost" onClick={items[0].run}>{items[0].label}</Btn>;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <Btn size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>출력▾</Btn>
      {open && (
        <>
          <span style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
          <span style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 41, minWidth: 128,
            display: 'flex', flexDirection: 'column', gap: 2, padding: 6,
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', boxShadow: SH.pop,
          }}>
            {items.map((it) => (
              <Btn key={it.label} size="sm" variant="ghost" onClick={() => { setOpen(false); it.run(); }}>{it.label}</Btn>
            ))}
          </span>
        </>
      )}
    </span>
  );
}

export function jumpTo(id: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jpk:vehicle-nav', { detail: { id } }));
  }
}
