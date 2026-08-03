'use client';
import type { CSSProperties } from 'react';
import { ActionMenu, Btn, C } from '@/components/ui';
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
  <Btn size="sm" variant="ghost" onClick={() => openIngest(type, plate)}>{label}</Btn>
);

export function PrintMenu({ items }: { items: { label: string; run: () => void }[] }) {
  if (!items.length) return null;
  if (items.length === 1) return <Btn size="sm" variant="ghost" onClick={items[0].run}>{items[0].label}</Btn>;
  return <ActionMenu label="출력" menuLabel="출력 문서 선택" items={items.map((item) => ({ key: item.label, label: item.label, onClick: item.run }))} />;
}

export function jumpTo(id: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jpk:vehicle-nav', { detail: { id } }));
  }
}
