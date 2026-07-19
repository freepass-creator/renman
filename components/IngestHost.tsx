'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { notifySaved } from '@/lib/ui-bus';
import { type EntityRecord } from '@/lib/intake/entities';

// 담기 다이얼로그는 열릴 때만 로드 — 레이아웃 첫 페인트에서 OCR/폼 번들 제외.
const IngestDialog = dynamic(
  () => import('@/components/IngestDialog').then((m) => m.IngestDialog),
  { ssr: false },
);

// 전역 담기 — 'jpk:ingest' 오면 담기(신규) 또는 정정(editRec) 다이얼로그. 톱바·팔레트·목록 어디서든.
export function IngestHost() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>('');
  const [plate, setPlate] = useState<string>('');
  const [editRec, setEditRec] = useState<EntityRecord | null>(null);
  const [editType, setEditType] = useState<string>('');
  useEffect(() => {
    function on(e: Event) {
      const d = ((e as CustomEvent).detail || {}) as { type?: string; plate?: string; editType?: string; editRec?: EntityRecord };
      setType(String(d.type || '')); setPlate(String(d.plate || ''));
      setEditType(String(d.editType || '')); setEditRec(d.editRec || null);
      setOpen(true);
    }
    window.addEventListener('jpk:ingest', on);
    return () => window.removeEventListener('jpk:ingest', on);
  }, []);
  if (!open) return null;
  return <IngestDialog presetType={type || undefined} presetPlate={plate || undefined} editType={editType || undefined} editRec={editRec || undefined} onClose={() => setOpen(false)} onSaved={() => notifySaved()} />;
}
